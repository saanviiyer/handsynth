# handsynth

Play synth chords with your hands. A webcam hand tracker reads the shape and position of your hand, and a Web Audio synth plays the matching chord.

Everything runs in the browser. There is no backend, no API key and no analytics. The camera and microphone streams stay on your device.

> This project is now part of Trackstar, which includes this gesture instrument as its Simple mode. This repo keeps the original version as a reference.

Stack: Vite, React, TypeScript (strict) and Tailwind. Hand tracking uses MediaPipe `HandLandmarker` from `@mediapipe/tasks-vision` (video mode, up to 2 hands). Audio uses the native Web Audio API.

## Features

- Key mode. The right hand plays chords in the selected key. One to five fingers play degrees I to V. In two-hand mode, an open left hand (3 or more fingers) adds 5 to the degree, so you reach vi and vii. A closed fist mutes. Moving the hand left to right picks the inversion. Hand height sets the low-pass filter cutoff. A thumb and index pinch sets the volume.
- Scales. Major, Natural Minor, Dorian, Phrygian, Lydian, Mixolydian, Harmonic Minor, and the major and minor pentatonic scales. Chords stack thirds inside the scale, so chord quality follows the key. You can add a 6th or 7th.
- Progression mode. Type a chord sequence such as `Am E F C` or `G7 Cmaj7 Dm7 F6`. Finger counts play slots 1 to 5, and an open left hand reaches slots 6 to 10. The chord parser in `src/lib/music.ts` reads major, minor, dim, aug, sus2, sus4, 6, m6, 7, maj7, m7, m7b5 and dim7 symbols. It marks an unknown token in red and plays the rest.
- Arpeggiator. Up, down, up-down or random patterns at 1/4 to 1/16 rates, 60 to 200 BPM, over 1 to 3 octaves. A lookahead scheduler plans notes about 100 ms ahead.
- Drums and metronome. A synthesized kick, snare and hi-hat with four patterns, on the same tempo as the arpeggiator.
- Recording. Saves everything you hear to a `.webm` file.
- Playability. A One-Euro filter smooths hand jitter. Chord latch keeps the last chord playing after your hand drops.
- Vocoder. Your microphone shapes the synth through 24 bandpass bands (about 110 Hz to 7.5 kHz). In two-hand mode, left-hand openness sets the wet amount.
- Looper. Record takes from the mic, the synth, or both, and stack overdubs. Loops lock to the tempo in 1, 2, 4 or 8 bars, or to a free length. Each track has mute, solo, volume and download controls. Export the mix as a `.wav`.
- Sound design. Nine presets (Basic, Warm Pad, Pluck, Chiptune, Supersaw Lead, Bell, Organ, Sub Bass, Dream) and controls for oscillators, envelope, filter, LFO, reverb, delay, drive and chorus. Settings save to `localStorage`.

Signal path:

```
shared filter -> distortion -> chorus -> delay -> reverb -> tremolo (amp LFO)
             -> master gain -> dry gain -> destination
```

The vocoder takes the master node as its carrier and crossfades against the dry gain.

## Run it

```bash
git clone https://github.com/saanviiyer/handsynth
cd handsynth
npm install        # also copies the MediaPipe WASM and downloads the hand model
npm run dev        # http://localhost:5173
```

Open the page, click "Enable camera & sound", allow the camera, and hold a hand up to the webcam.

The camera needs a secure context. Browsers give camera access only over HTTPS or on localhost. A plain `http://<lan-ip>` address does not work.

Other commands:

```bash
npm run build          # tsc + vite build to dist/
npm run preview        # serve the build on 0.0.0.0:4173
npm test               # vitest unit tests
npm run fetch:model    # download the hand model again
npm run copy:wasm      # copy the MediaPipe WASM again
```

### Model and WASM

MediaPipe needs a WASM fileset and the `hand_landmarker.task` model (about 7.8 MB). The `postinstall` step puts them in `public/wasm/` and `public/models/`. They are gitignored. If they are missing at runtime, `src/lib/handLandmarker.ts` loads them from the jsDelivr and Google CDNs.

### Deploy

- Vercel or Netlify: import the repo. `vercel.json` and `netlify.toml` build `dist/` and serve it as a single-page app over HTTPS.
- Any static host: serve `dist/` over HTTPS. The build step needs network access to download the model.
- Replit: import from GitHub and press Run. `.replit` runs install, build and preview on port 4173 (mapped to port 80). The Vite preview allows Replit hosts.

## Environment variables

None. The app has no server and needs no keys.

## Browser support and limits

Chrome and Edge on desktop work best. Safari and Firefox usually work, but tracking speed varies. You need a real webcam. There is no demo video fallback. Without a camera, the app shows the unavailable state. The vocoder and looper need a microphone. If you deny the mic, the synth still plays directly.

Finger detection is a geometric check (the fingertip is farther from the wrist than the middle joint). It handles hand rotation but can fail at extreme angles. Tune the thresholds in `src/lib/gestures.ts`.

## Layout

```
src/App.tsx, src/Legend.tsx   UI and on-screen gesture legend
src/lib/music.ts              notes, scales, chords, chord-symbol parser
src/lib/gestures.ts           finger detection, pinch, hand position
src/lib/mapping.ts            hand pose to chord
src/lib/arp.ts                arpeggiator and scheduler
src/lib/drums.ts              drum patterns and scheduler
src/lib/smoothing.ts          One-Euro filter
src/lib/presets.ts            sound presets
src/lib/synth.ts              Web Audio engine
src/lib/vocoder.ts            channel vocoder
src/lib/vocalLooper.ts        looper and WAV export
src/lib/handLandmarker.ts     MediaPipe setup (local assets, then CDN)
scripts/                      postinstall asset scripts
```

Unit tests sit next to the files in `src/lib/`.
