// vocoder.ts - a real Web Audio channel vocoder.
//
// The MICROPHONE is the modulator; the synth master output is the carrier.
// For each of N log-spaced bands:
//   carrier -> bandpass -> VCA(gain) --------------------\
//   mic     -> bandpass -> rectify(WaveShaper) -> lowpass -> envScale -> VCA.gain
//   (the envelope of the mic in that band opens the carrier's gain in that band)
// All bands sum -> wet gain -> output (destination).
//
// A dry/wet crossfade (Synth.setDryGain + this.wet) makes enabling/disabling
// click-free. Without a mic the envelopes stay at 0, so the wet path is silent.

/** Full-wave rectifier curve for a WaveShaper: input x -> |x|. */
function rectifierCurve(n = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.abs(x);
  }
  return curve;
}

interface Band {
  carrierBP: BiquadFilterNode;
  vca: GainNode;
  modBP: BiquadFilterNode;
  shaper: WaveShaperNode;
  follower: BiquadFilterNode;
  envScale: GainNode;
}

export interface VocoderOptions {
  bands?: number;
  minHz?: number;
  maxHz?: number;
  /** Envelope smoothing cutoff (Hz). Lower = smoother/slower. */
  followerHz?: number;
  sensitivity?: number;
}

export class Vocoder {
  private ctx: AudioContext;
  private carrier: AudioNode;
  private out: AudioNode;

  private modInput: GainNode; // mic gain / sensitivity input
  private sum: GainNode;
  private wet: GainNode;
  private bands: Band[] = [];
  private micSource: MediaStreamAudioSourceNode | null = null;
  private sensitivity: number;

  constructor(ctx: AudioContext, carrier: AudioNode, out: AudioNode, opts: VocoderOptions = {}) {
    this.ctx = ctx;
    this.carrier = carrier;
    this.out = out;
    this.sensitivity = opts.sensitivity ?? 6;

    const n = opts.bands ?? 16;
    const minHz = opts.minHz ?? 120;
    const maxHz = opts.maxHz ?? 7000;
    const followerHz = opts.followerHz ?? 18;
    const curve = rectifierCurve();

    this.modInput = ctx.createGain();
    this.modInput.gain.value = 1;

    this.sum = ctx.createGain();
    this.sum.gain.value = 1.2; // makeup gain

    this.wet = ctx.createGain();
    this.wet.gain.value = 0; // start silent; start() ramps up

    this.sum.connect(this.wet);
    this.wet.connect(this.out);

    // Log-spaced band center frequencies.
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const freq = minHz * Math.pow(maxHz / minHz, t);
      const q = 6; // narrowish bands

      const carrierBP = ctx.createBiquadFilter();
      carrierBP.type = "bandpass";
      carrierBP.frequency.value = freq;
      carrierBP.Q.value = q;

      const vca = ctx.createGain();
      vca.gain.value = 0; // opened by the mic envelope

      this.carrier.connect(carrierBP);
      carrierBP.connect(vca);
      vca.connect(this.sum);

      const modBP = ctx.createBiquadFilter();
      modBP.type = "bandpass";
      modBP.frequency.value = freq;
      modBP.Q.value = q;

      const shaper = ctx.createWaveShaper();
      shaper.curve = curve;
      shaper.oversample = "4x";

      const follower = ctx.createBiquadFilter();
      follower.type = "lowpass";
      follower.frequency.value = followerHz;
      follower.Q.value = 0.7;

      const envScale = ctx.createGain();
      envScale.gain.value = this.sensitivity;

      this.modInput.connect(modBP);
      modBP.connect(shaper);
      shaper.connect(follower);
      follower.connect(envScale);
      // Drive the carrier band gain with the mic-band envelope.
      envScale.connect(vca.gain);

      this.bands.push({ carrierBP, vca, modBP, shaper, follower, envScale });
    }
  }

  /** Attach the microphone MediaStream as the modulator. */
  setModulatorStream(stream: MediaStream): void {
    this.micSource = this.ctx.createMediaStreamSource(stream);
    this.micSource.connect(this.modInput);
  }

  /** Mic input gain (voice sensitivity). */
  setMicGain(v: number): void {
    const now = this.ctx.currentTime;
    this.modInput.gain.setTargetAtTime(Math.max(0, v), now, 0.03);
  }

  /** Ramp the wet path up and fade the dry path (via the provided setter). */
  start(setDry: (v: number) => void): void {
    const now = this.ctx.currentTime;
    this.wet.gain.cancelScheduledValues(now);
    this.wet.gain.setTargetAtTime(1, now, 0.05);
    setDry(0);
  }

  /** Ramp the wet path down and restore the dry path. */
  stop(setDry: (v: number) => void): void {
    const now = this.ctx.currentTime;
    this.wet.gain.cancelScheduledValues(now);
    this.wet.gain.setTargetAtTime(0, now, 0.05);
    setDry(1);
  }

  /** Tear down the graph. Call after stop()'s fade. */
  dispose(): void {
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        /* ignore */
      }
    }
    for (const b of this.bands) {
      // Disconnect ONLY this band's carrier tap, not the carrier's other
      // consumers (e.g. master -> dry -> destination).
      try {
        this.carrier.disconnect(b.carrierBP);
      } catch {
        /* ignore */
      }
      b.carrierBP.disconnect();
      b.vca.disconnect();
      b.modBP.disconnect();
      b.shaper.disconnect();
      b.follower.disconnect();
      b.envScale.disconnect();
    }
    this.modInput.disconnect();
    this.sum.disconnect();
    this.wet.disconnect();
    this.bands = [];
  }
}
