# handsynth

Play synth chords with your hands. Your webcam feeds a computer-vision hand
tracker; the shape and position of your hand pick and play chords through a
Web Audio synth. **Everything runs in the browser**: no backend, no API keys,
no uploads. The camera stream never leaves your device.

- **Hand tracking:** [`@mediapipe/tasks-vision`](https://developers.google.com/mediapipe) `HandLandmarker` (VIDEO mode, up to 2 hands)
- **Audio:** native Web Audio API (polyphonic oscillators + ADSR + low-pass filter)
- **Stack:** Vite + React + TypeScript (strict) + Tailwind, deployed as a static SPA

## Run locally

```bash
npm install       # also vendors the MediaPipe WASM + downloads the hand model
npm run dev        # http://localhost:5173
```

Open the page, click **Enable camera & sound**, allow the camera, and hold a
hand up to the webcam.

> **The camera needs a secure context.** Browsers only expose `getUserMedia`
> over **HTTPS** or on **localhost**. `npm run dev` (localhost) and any HTTPS
> deploy work; a plain `http://<lan-ip>` will not.

Other commands:

```bash
npm run build      # tsc + vite build -> dist/ (zero TS errors)
npm run preview    # serve the production build locally
npm test           # vitest unit tests (music, parser, gestures, arp, mapping)
```

## Two play modes

Switch between them with the **Mode** control.

### 1. Key (diatonic) mode

The **right hand plays**. Chords are diatonic to the selected key/scale.

| Gesture | Effect |
| --- | --- |
| 1 finger extended | Chord **I** (scale degree 1) |
| 2 fingers | Chord **ii** (degree 2) |
| 3 fingers | Chord **iii** (degree 3) |
| 4 fingers | Chord **IV** (degree 4) |
| 5 fingers | Chord **V** (degree 5) |
| Left hand open + 1 finger | Chord **vi** (degree 6, two-hand) |
| Left hand open + 2 fingers | Chord **vii** (degree 7, two-hand) |
| Closed fist | **Rest / mute** |
| Hand left → right | Chord **inversion** (root → 1st → 2nd) |
| Hand up → down | **Low-pass filter** cutoff (top = bright, bottom = dark) |
| Pinch thumb + index | **Expression / volume** (open = loud, pinched = quiet) |

**All seven diatonic degrees are reachable.** A single right hand plays **I-V**
with 1-5 fingers. To reach **vi** and **vii**, enable **two-hand mode** and hold
your **left hand open** (≥3 fingers): that adds **+5** to the degree index, so
right-hand 1 finger → vi and 2 fingers → vii. Higher counts clamp to vii (you
can't overshoot the scale). `vii` uses the correct diatonic stacking: in a
major key that's the **diminished** triad (C major `vii` = `Bdim`), and with the
7th extension it's the **half-diminished** `vii7` = `Bm7b5` (`B D F A`).

> **Reconciliation note:** the two-hand modifier used to shift the octave in
> diatonic mode. It now adds the +5 degree offset instead (the same mechanism
> progression mode uses for slots 6-10), prioritizing access to all seven
> degrees. Octave is still set by the **Base octave** control.

**Chord extension** control (Triad / 6th / 7th): scale degrees are stacked as
diatonic thirds, so quality follows the key automatically. The 6th/7th are also
diatonic, e.g. in C major, `I6` adds A (`C E G A`) and `V7` adds F, giving a
dominant seventh (`G B D F`); in A minor, `i7` is `A C E G`.

**Scale** selector (next to Key): choose the scale the degrees are built from.
Available scales:

- Major (Ionian), Natural Minor (Aeolian)
- Dorian, Phrygian, Lydian, Mixolydian
- Harmonic Minor
- Major Pentatonic, Minor Pentatonic

For the 7-note modes the degree chords stack diatonic thirds within that scale,
so quality adapts automatically: e.g. Dorian's `IV` is major, Harmonic Minor's
`III` is augmented and its `V` is major. The two pentatonic scales have **5
degrees** (fingers 1 to 5 map straight to them); their chords stack alternate
scale tones (degree, +2, +4 within the 5-note scale), producing open,
sixth/quartal-flavored voicings (e.g. C major pentatonic degree 1 is `C E A`).

### 2. Progression (custom) mode

Type an arbitrary, possibly non-diatonic, named chord sequence, something the
key/diatonic model can't express (e.g. **E major is non-diatonic to C major**,
and `vi` isn't even reachable from finger counts). Example:

```
Am E F C
```

or `G7 Cmaj7 Dm7 F6`. Tokens are space/comma separated. Each token becomes a
numbered **slot**; an unrecognized token is flagged in red but the rest still
play.

| Gesture | Effect |
| --- | --- |
| 1-5 fingers | Play **slot 1-5** of your sequence |
| Closed fist | **Rest / mute** |
| Left hand open (two-hand mode) | **+5 slot offset** → reach slots 6-10 |
| Hand left → right | Inversion (still works on parsed chords) |
| Hand up → down | Low-pass filter |
| Pinch | Expression / volume |

In progression mode the chord **quality comes from the typed symbol**, so the
Triad/6th/7th extension control is **disabled** (it would be ambiguous on an
arbitrary quality).

**Supported chord qualities** (via `parseChord` in `src/lib/music.ts`), roots
`A`-`G` with `#`/`b`:

| Symbol(s) | Quality | Example notes |
| --- | --- | --- |
| `""`, `maj`, `M` | major | `C` → C E G |
| `m`, `min`, `-` | minor | `Am` → A C E |
| `dim`, `°` | diminished | `Bdim` → B D F |
| `aug`, `+` | augmented | `Caug` → C E G# |
| `sus2` | sus2 | `Dsus2` → D E A |
| `sus4`, `sus` | sus4 | `Csus4` → C F G |
| `6` | major 6 | `F6` → F A C D |
| `m6`, `min6` | minor 6 | `Am6` → A C E F# |
| `7`, `dom7` | dominant 7 | `G7` → G B D F |
| `maj7`, `M7`, `Δ` | major 7 | `Cmaj7` → C E G B |
| `m7`, `min7` | minor 7 | `Dm7` → D F A C |
| `m7b5`, `ø` | half-diminished 7 | `Bm7b5` → B D F A |
| `dim7`, `°7` | diminished 7 | `Bdim7` → B D F Ab |

## Arpeggiator

Toggle **Arpeggiator** to play the currently-held chord one note at a time in a
repeating pattern instead of as a block. It works in **both** modes and follows
whatever chord your gesture is selecting, switching cleanly when the chord
changes and stopping on fist/rest.

Controls: **Pattern** (Up / Down / Up-Down / Random), **Rate** (1/4, 1/8, 1/16,
and 1/8 · 1/16 triplets), **Tempo** (60-200 BPM, the shared transport tempo),
**Octave range** (1-3), and a **Gate** (note length). Timing uses a proper Web
Audio *lookahead scheduler* ("A Tale of Two Clocks"): a 25 ms timer schedules
notes ~100 ms ahead against `AudioContext.currentTime`, so it stays tight.
Arpeggiated notes run through the same voice path (ADSR, filter, master), so the
hand-Y filter and the vocoder still apply. The pure sequence generator
(`arpSequence` in `src/lib/arp.ts`) is unit tested.

## Drums and metronome

The **Drums & metronome** panel adds a small synthesized drum machine (no
samples): **kick** (pitch-swept sine), **snare** (filtered noise burst plus a
tonal snap), and **hi-hat** (short high-passed noise). Toggle **Drums on**, pick
a **Pattern**, and enable/disable each **instrument** independently.

Patterns (one bar of 16 steps each): **Off**, **Four-on-floor** (kick every
quarter, snare on 2 and 4, hats on 8ths), **Boom-bap** (kick on 1 and the "and"
of 3, snare on 2 and 4), and **Hi-hat 8ths**. A **Metronome** toggle clicks on
every quarter and **accents beat 1**.

The drums and metronome run on the same lookahead scheduler as the arpeggiator
and **share its Tempo (BPM)**, so everything stays locked to one transport. Drum
voices route to a dedicated bus (dry, so the synth filter/effects do not color
them) and are included in recordings. Pattern data and step logic are pure and
unit tested in `src/lib/drums.ts`.

## Recording

Press **Record** to capture the live output and **Stop & download** to save a
timestamped `handsynth-YYYY-MM-DDTHH-MM-SS.webm` file. Recording taps a
`MediaStreamAudioDestinationNode` off the synth output bus and uses
`MediaRecorder` (`audio/webm; codecs=opus` when supported). Because the output
bus carries the **full chain** (synth + effects + vocoder + drums), the take
captures everything you hear, and normal playback continues while recording. A
red indicator shows the elapsed time.

## Playability

The **Playability** panel has two aids:

- **Smoothing / sensitivity**: a One-Euro filter on the hand landmarks that
  kills jitter when the hand is still but stays responsive when it moves. Higher
  is smoother, lower is snappier, `0` is off. The pure filter math lives in
  `src/lib/smoothing.ts` and is unit tested.
- **Chord latch**: when on, the last chord keeps sounding after your hand drops,
  opens, or makes a fist, so you can adjust controls hands-free. It holds until
  you play a **new** chord or turn latch off. The arpeggiator keeps running on
  the latched chord.

## Vocoder

Toggle **Vocoder** to run the synth through a real Web Audio **channel
vocoder**: your **microphone is the modulator** and the **synth is the
carrier**: talk or sing and the chords take on the shape of your voice.

Implementation (`src/lib/vocoder.ts`): a bank of **16 bandpass filters**
log-spaced ~120 Hz → ~7 kHz. For each band, the mic signal is band-passed →
**rectified** (a `WaveShaper` with an `x → |x|` curve) → smoothed by a low-pass
**envelope follower** (~18 Hz); that envelope drives the **gain of the carrier**
passed through the matching band. All bands sum to the output. A **dry/wet
crossfade** (`Synth.setDryGain` ↔ the vocoder's wet gain, both ramped) makes
enabling/disabling click-free. A **Voice sensitivity** slider scales the mic
gain. If mic permission is denied it falls back to direct play and shows a clear
message (mirroring the camera-denied handling).

## Looper (vocal + instrument, with harmony stacking)

The **Looper** panel records short loops and overdubs more takes on top so you
can stack vocal harmonies (or layer synth parts) into one arrangement.

- **Source per take**: **Mic** (your voice), **Instrument** (the gesture-played
  synth output chain), or **Mix** (both). The looper shares the single
  microphone stream with the vocoder, so only one `getUserMedia` prompt is used.
- **Loop length**: beat-locked to the shared transport BPM in **bars** (1, 2, 4,
  or 8), or **Free** mode where the first take sets the length. An optional
  **count-in** plays one bar of metronome clicks before capture.
- **Overdub / stacking**: each take becomes its own loop track that plays while
  you record the next one, so you can build harmonies. Per-track **mute**,
  **solo**, **volume**, **Save** (download that take), and **Del**; plus a
  **Clear all** and a live **track count**.
- **Play all / Stop all**: master transport for the finished stack; all
  non-muted tracks (respecting solo) start phase-locked and loop as one.
- **Export mix**: one click bounces the summed non-muted tracks for a selectable
  number of loop **cycles** (default 1) to a timestamped `.wav` download.

**Capture** uses a `ScriptProcessorNode` (reliable and simple to wire through
Vite, no extra AudioWorklet build) that copies the chosen source's Float32
samples into a fixed-length loop buffer.

**No feedback**: an Instrument take taps the synth **instrument bus** (synth +
effects + vocoder + drums) which does *not* include the loop tracks, so a loop
never records itself. Loop tracks route to the **record bus**, so the master
**Record** still captures the full mix (synth + effects + vocoder + drums +
loops).

**Phase-lock**: the first take sets the loop length and start anchor; every
later take and every Play-all starts on the next loop boundary
(`nextLoopBoundary`), so all tracks stay aligned. **Export** renders through an
`OfflineAudioContext` (fast, click-free) summing each track at its effective
gain. The pure math (loop length from BPM x bars, mute/solo/volume mix, boundary
alignment, export duration, source selection, WAV encoding) lives in
`src/lib/vocalLooper.ts` and is unit tested.

The looper needs a **real microphone** for Mic and Mix takes; mic-permission
denial is handled gracefully with an on-panel message.

## Sound design

Open the **Sound design** panel to reshape the synth. Everything is param-ramped
so changes stay click-free, and the full config plus the selected mode are saved
to `localStorage`, so your sound survives a reload.

### Preset modes

Pick a **Mode** to load a full bundle of synth params (you can then tweak from
there, which switches the selector to "custom"):

- **Basic**: the original plain two-saw voice (default).
- **Warm Pad**: soft attack, long release, mild filter, chorus and reverb.
- **Pluck**: fast attack, short decay, snappy, filter envelope.
- **Chiptune**: square wave, tight envelope, no effects (8-bit feel).
- **Supersaw Lead**: 7 detuned saw voices, bright, delay and drive.
- **Bell**: sine with fast attack and long release, detune shimmer, reverb.
- **Organ**: stacked sines plus a sub, sustained, tremolo, chorus.
- **Sub Bass**: low sine with a strong sub oscillator, a little drive.
- **Dream**: ambient, slow attack, big reverb and delay.

### Controls

- **Oscillator**: waveform, unison voice count (1 to 7) plus detune spread, and a
  sub-oscillator (one octave down) level.
- **Amp envelope**: attack, decay, sustain, release (wired into the per-note ADSR).
- **Filter**: resonance (Q) and a per-note envelope amount. The cutoff itself
  stays under live hand-height control.
- **LFO**: rate and depth with a target of pitch (vibrato), filter (wobble), or
  amp (tremolo).
- **Effects**, each with on/off and amount, in the master chain: Reverb,
  Delay/echo (time, feedback, mix), Distortion/drive (a `WaveShaper`), and
  Chorus (a modulated delay).

### Signal path (and where the vocoder sits)

Per note: oscillators (unison + sub), then a per-note filter (envelope), then the
per-note ADSR gain. All voices feed the shared low-pass filter (this is the
hand-height cutoff plus resonance). Then the master chain:

```
shared filter -> distortion -> chorus -> delay -> reverb -> tremolo (amp LFO)
             -> master gain -> dry gain -> destination
```

The effects sit **before** the master, and the **vocoder taps the master node**
as its carrier and crossfades against the dry gain. So the effects, the
hand-height filter, and the vocoder all coexist: enabling the vocoder still routes
the (now effected) synth through the bandpass bank.

## Code layout

The pure, testable logic lives under `src/lib/`:

- `src/lib/music.ts`: note to frequency, scales, diatonic chords + 6th/7th
  extensions, and the `parseChord` / `parseProgression` chord-symbol parser
- `src/lib/gestures.ts`: finger-extended detection, pinch, normalized hand X/Y
- `src/lib/mapping.ts`: hand pose(s) to chord selection (diatonic + progression)
- `src/lib/arp.ts`: arpeggiator sequence generator + lookahead scheduler
- `src/lib/drums.ts`: drum patterns/step logic + drum-machine scheduler (pure
  data tested)
- `src/lib/smoothing.ts`: One-Euro filter + EMA landmark smoothing (pure, tested)
- `src/lib/presets.ts`: sound-preset tables + param helpers (pure, tested)
- `src/lib/synth.ts`: polyphonic Web Audio engine (unison, sub, ADSR, filter,
  LFO, effects chain, drum voices, instrument bus + record bus)
- `src/lib/vocoder.ts`: channel vocoder audio graph
- `src/lib/vocalLooper.ts`: loop capture, overdub stacking, phase-lock, and
  OfflineAudioContext export (pure helpers tested)
- `src/lib/handLandmarker.ts`: MediaPipe init with local-then-CDN asset loading

## How the model / WASM are wired for deploy

MediaPipe needs two things at runtime: a WASM fileset (the vision runtime) and
the `hand_landmarker.task` model. Both are **vendored locally** so a static
deploy has no third-party runtime dependency:

- `scripts/copy-wasm.mjs` (runs on `postinstall`) copies the WASM fileset from
  the installed `@mediapipe/tasks-vision` package into `public/wasm/`.
- `scripts/fetch-model.mjs` (runs on `postinstall`) downloads
  `hand_landmarker.task` (~7.8 MB) into `public/models/`.

`vite build` copies `public/` into `dist/`, so the assets ship with the build.
At runtime `src/lib/handLandmarker.ts` checks for the local assets and, if they
are missing (e.g. a bare clone with no `postinstall`), **falls back to the
jsDelivr / Google CDN** so the app still runs. You can re-fetch manually with
`npm run copy:wasm` and `npm run fetch:model`.

The vendored assets are git-ignored (they are build inputs, not source); the
`postinstall` step regenerates them on a fresh `npm install`.

## Deploy (Vercel or any static host)

```bash
npm install
npm run build     # outputs dist/
```

- **Vercel:** import the repo: `vercel.json` sets the SPA rewrite. Build
  command `npm run build`, output directory `dist`. HTTPS is automatic, so the
  camera works.
- **Any static host:** serve `dist/` over HTTPS. Because `postinstall` fetches
  the model, the host's build step needs outbound network access, or commit
  the model yourself and remove it from `.gitignore`.

## Browser support

Works best in **Chrome / Edge** (desktop). Requires WebGL/WASM for MediaPipe,
`getUserMedia`, and the Web Audio API. Safari and Firefox generally work but
hand-tracking performance varies. A real **webcam is required** for live
tracking: there is no demo/video fallback.

## Notes / honesty

- Live hand-tracking genuinely needs a physical camera; on a machine without
  one the app shows the camera-permission / unavailable state gracefully
  instead of crashing.
- Finger-extension is a geometric heuristic (tip farther from the wrist than
  the mid-joint); it is robust to hand rotation but not perfect at extreme
  angles. Tune thresholds in `src/lib/gestures.ts`.
- No data leaves the browser. There is no server and no analytics.
