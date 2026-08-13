# handsynth

Play synth chords with your hands. Your webcam feeds a computer-vision hand
tracker; the shape and position of your hand pick and play chords through a
Web Audio synth. **Everything runs in the browser** — no backend, no API keys,
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
npm test           # vitest unit tests (music + gesture logic)
```

## Gesture → chord mapping

The **right hand plays**. Chords are diatonic to the selected key/scale.

| Gesture | Effect |
| --- | --- |
| 1 finger extended | Chord **I** (scale degree 1) |
| 2 fingers | Chord **ii** (degree 2) |
| 3 fingers | Chord **iii** (degree 3) |
| 4 fingers | Chord **IV** (degree 4) |
| 5 fingers | Chord **V** (degree 5) |
| Closed fist | **Rest / mute** |
| Hand left → right | Chord **inversion** (root → 1st → 2nd) |
| Hand up → down | **Low-pass filter** cutoff (top = bright, bottom = dark) |
| Pinch thumb + index | **Expression / volume** (open = loud, pinched = quiet) |

**Two-hand mode** (toggle in controls): the **left hand** shifts the octave —
open hand (≥4 fingers) = **+1 octave**, fist/one finger = **−1 octave** — while
the right hand plays as above.

Scale degrees are stacked as diatonic thirds, so triad quality follows the key
automatically (e.g. in C major, `V` → G major, `V7` → G dominant seventh). Turn
on **Sevenths** in the controls to add the diatonic 7th to every chord.

The exact degree/inversion/filter/expression math lives in pure, tested modules:

- `src/lib/music.ts` — equal-temperament note→frequency, scales, diatonic chords
- `src/lib/gestures.ts` — finger-extended detection, pinch, normalized hand X/Y
- `src/lib/mapping.ts` — hand pose(s) → chord selection
- `src/lib/synth.ts` — polyphonic Web Audio engine (ADSR, filter, master gain)
- `src/lib/handLandmarker.ts` — MediaPipe init with local-then-CDN asset loading

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

- **Vercel:** import the repo — `vercel.json` sets the SPA rewrite. Build
  command `npm run build`, output directory `dist`. HTTPS is automatic, so the
  camera works.
- **Any static host:** serve `dist/` over HTTPS. Because `postinstall` fetches
  the model, the host's build step needs outbound network access — or commit
  the model yourself and remove it from `.gitignore`.

## Browser support

Works best in **Chrome / Edge** (desktop). Requires WebGL/WASM for MediaPipe,
`getUserMedia`, and the Web Audio API. Safari and Firefox generally work but
hand-tracking performance varies. A real **webcam is required** for live
tracking — there is no demo/video fallback.

## Notes / honesty

- Live hand-tracking genuinely needs a physical camera; on a machine without
  one the app shows the camera-permission / unavailable state gracefully
  instead of crashing.
- Finger-extension is a geometric heuristic (tip farther from the wrist than
  the mid-joint); it is robust to hand rotation but not perfect at extreme
  angles. Tune thresholds in `src/lib/gestures.ts`.
- No data leaves the browser. There is no server and no analytics.
