// synth.ts — polyphonic Web Audio synth.
//
// Signal path:  oscillator -> per-voice ADSR gain -> shared low-pass filter
//               -> master gain -> destination
//
// One voice per chord tone. Chord changes retrigger; a rest releases all
// voices. All gain changes are ramped to avoid clicks. The AudioContext must
// be created/resumed from a user gesture (see ensureStarted()).

export type Waveform = "sine" | "sawtooth" | "square" | "triangle";

export interface Envelope {
  attack: number;
  decay: number;
  sustain: number; // 0..1 level
  release: number;
}

const DEFAULT_ENV: Envelope = {
  attack: 0.02,
  decay: 0.12,
  sustain: 0.7,
  release: 0.25,
};

interface Voice {
  osc: OscillatorState[];
  gain: GainNode;
  freq: number;
}

interface OscillatorState {
  osc: OscillatorNode;
}

function nearlyEqualFreqs(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 0.5) return false;
  }
  return true;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  // Final dry bus: master -> dry -> destination. The vocoder crossfades this
  // against its own wet path (both tap `master` as the carrier).
  private dry: GainNode | null = null;
  private voices: Voice[] = [];

  waveform: Waveform = "sawtooth";
  env: Envelope = { ...DEFAULT_ENV };
  private masterVolume = 0.5;
  private expression = 1;
  private detune = 6; // cents of subtle detune between stacked oscillators

  private currentFreqs: number[] = [];

  get isStarted(): boolean {
    return this.ctx !== null;
  }

  get contextState(): AudioContextState | "closed" {
    return this.ctx ? this.ctx.state : "closed";
  }

  /** The AudioContext, or null if not started. */
  getContext(): AudioContext | null {
    return this.ctx;
  }

  /**
   * The carrier node for the vocoder: the master output (post volume /
   * expression, pre-destination). Null if not started.
   */
  getCarrierNode(): GainNode | null {
    return this.master;
  }

  /** Create/resume the AudioContext. Must be called from a user gesture. */
  async ensureStarted(): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();

      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 4000;
      this.filter.Q.value = 0.9;

      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;

      this.dry = this.ctx.createGain();
      this.dry.gain.value = 1;

      this.filter.connect(this.master);
      this.master.connect(this.dry);
      this.dry.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  /**
   * Crossfade the direct (dry) output. The vocoder ramps this to 0 while it
   * ramps its own wet path up, so toggling does not click.
   */
  setDryGain(v: number, timeConstant = 0.04): void {
    if (!this.ctx || !this.dry) return;
    const now = this.ctx.currentTime;
    this.dry.gain.cancelScheduledValues(now);
    this.dry.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), now, timeConstant);
  }

  setWaveform(w: Waveform): void {
    this.waveform = w;
    for (const v of this.voices) {
      for (const o of v.osc) o.osc.type = w;
    }
  }

  setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    this.applyMasterGain();
  }

  /** Expression 0..1 (e.g. from pinch) multiplies master volume. */
  setExpression(e: number): void {
    this.expression = Math.max(0, Math.min(1, e));
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    if (!this.ctx || !this.master) return;
    const target = this.masterVolume * this.expression;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(target, now, 0.03);
  }

  /** Ramp the low-pass cutoff (Hz). */
  setCutoff(hz: number): void {
    if (!this.ctx || !this.filter) return;
    const now = this.ctx.currentTime;
    const clamped = Math.max(60, Math.min(18000, hz));
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setTargetAtTime(clamped, now, 0.05);
  }

  /**
   * Play a chord defined by its tone frequencies. If the chord is unchanged
   * from the current one, this is a no-op (no retrigger). An empty array or
   * releaseAll() stops the sound.
   */
  playFreqs(freqs: number[]): void {
    if (!this.ctx || !this.filter) return;
    if (freqs.length === 0) {
      this.releaseAll();
      return;
    }
    if (nearlyEqualFreqs(freqs, this.currentFreqs)) return;

    this.releaseAll();
    this.currentFreqs = [...freqs];

    const now = this.ctx.currentTime;
    const { attack, decay, sustain } = this.env;
    // Per-voice peak scaled down so stacked tones don't clip.
    const peak = 0.9 / Math.max(1, freqs.length);

    for (const f of freqs) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + attack);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, peak * sustain),
        now + attack + decay
      );
      gain.connect(this.filter);

      // Two slightly detuned oscillators per tone for a richer voice.
      const oscStates: OscillatorState[] = [];
      for (const sign of [-1, 1]) {
        const osc = this.ctx.createOscillator();
        osc.type = this.waveform;
        osc.frequency.setValueAtTime(f, now);
        osc.detune.setValueAtTime(sign * this.detune, now);
        osc.connect(gain);
        osc.start(now);
        oscStates.push({ osc });
      }

      this.voices.push({ osc: oscStates, gain, freq: f });
    }
  }

  /**
   * Fire a single note at an absolute AudioContext time, held for `gate`
   * seconds, through the same voice path (ADSR → filter → master). Used by the
   * arpeggiator scheduler. Fire-and-forget: oscillators stop themselves.
   */
  triggerNote(freq: number, atTime: number, gate: number): void {
    if (!this.ctx || !this.filter) return;
    const t0 = Math.max(atTime, this.ctx.currentTime);
    const { attack, decay, sustain, release } = this.env;
    const peak = 0.6;
    const gain = this.ctx.createGain();
    // Keep the whole envelope inside the gate so notes don't overlap-clip.
    const atk = Math.min(attack, gate * 0.5);
    const dec = Math.min(decay, gate * 0.5);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peak * sustain),
      t0 + atk + dec
    );
    const relStart = t0 + gate;
    gain.gain.setValueAtTime(Math.max(0.0001, peak * sustain), relStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, relStart + release);
    gain.connect(this.filter);

    for (const sign of [-1, 1]) {
      const osc = this.ctx.createOscillator();
      osc.type = this.waveform;
      osc.frequency.setValueAtTime(freq, t0);
      osc.detune.setValueAtTime(sign * this.detune, t0);
      osc.connect(gain);
      osc.start(t0);
      osc.stop(relStart + release + 0.02);
    }
  }

  /** Release all active voices with an envelope release tail. */
  releaseAll(): void {
    if (!this.ctx) {
      this.voices = [];
      this.currentFreqs = [];
      return;
    }
    const now = this.ctx.currentTime;
    const rel = this.env.release;
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(now);
      const current = Math.max(0.0001, v.gain.gain.value);
      v.gain.gain.setValueAtTime(current, now);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, now + rel);
      for (const o of v.osc) {
        o.osc.stop(now + rel + 0.02);
      }
    }
    this.voices = [];
    this.currentFreqs = [];
  }

  /** Fully tear down the audio graph. */
  async close(): Promise<void> {
    this.releaseAll();
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
      this.master = null;
      this.filter = null;
      this.dry = null;
    }
  }
}
