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
and 1/8 · 1/16 triplets), **Tempo** (60-200 BPM), **Octave range** (1-3), and a
**Gate** (note length). Timing uses a proper Web Audio *lookahead scheduler*
("A Tale of Two Clocks"): a 25 ms timer schedules notes ~100 ms ahead against
`AudioContext.currentTime`, so it stays tight. Arpeggiated notes run through the
same voice path (ADSR → filter → master), so the hand-Y filter and the vocoder
still apply. The pure sequence generator (`arpSequence` in `src/lib/arp.ts`) is
unit tested.

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
- `src/lib/presets.ts`: sound-preset tables + param helpers (pure, tested)
- `src/lib/synth.ts`: polyphonic Web Audio engine (unison, sub, ADSR, filter,
  LFO, effects chain, master + dry bus)
- `src/lib/vocoder.ts`: channel vocoder audio graph
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
