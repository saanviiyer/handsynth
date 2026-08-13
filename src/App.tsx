import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandLandmarker } from "./lib/handLandmarker";
import { readHand, type Landmark, type HandPose } from "./lib/gestures";
import { mapHandsToSelection, type Selection } from "./lib/mapping";
import {
  NOTE_NAMES,
  midiToName,
  keyName,
  type ScaleName,
} from "./lib/music";
import { Synth, type Waveform } from "./lib/synth";
import { drawHand } from "./lib/draw";
import { Legend } from "./Legend";

type Phase =
  | "idle"
  | "loading-model"
  | "requesting-camera"
  | "running"
  | "camera-denied"
  | "error";

const HAND_COLORS = ["#38bdf8", "#f472b6"]; // play = cyan, modifier = pink

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const synthRef = useRef<Synth>(new Synth());
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Controls
  const [tonic, setTonic] = useState<number>(0); // C
  const [scale, setScale] = useState<ScaleName>("major");
  const [octave, setOctave] = useState<number>(3);
  const [waveform, setWaveform] = useState<Waveform>("sawtooth");
  const [volume, setVolume] = useState<number>(0.5);
  const [twoHand, setTwoHand] = useState<boolean>(false);
  const [seventh, setSeventh] = useState<boolean>(false);

  // Live readout
  const [selection, setSelection] = useState<Selection | null>(null);
  const [handCount, setHandCount] = useState<number>(0);

  // Keep the latest control values available to the rAF loop without
  // re-subscribing the loop on every change.
  const cfgRef = useRef({ tonic, scale, octave, twoHand, seventh });
  useEffect(() => {
    cfgRef.current = { tonic, scale, octave, twoHand, seventh };
  }, [tonic, scale, octave, twoHand, seventh]);

  useEffect(() => {
    synthRef.current.setWaveform(waveform);
  }, [waveform]);
  useEffect(() => {
    synthRef.current.setMasterVolume(volume);
  }, [volume]);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    const synth = synthRef.current;
    if (!video || !canvas || !landmarker) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (video.readyState >= 2 && ctx) {
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      let playHand: HandPose | null = null;
      let modHand: HandPose | null = null;

      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        const result = landmarker.detectForVideo(video, performance.now());

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const hands = result.landmarks ?? [];
        setHandCount(hands.length);

        for (let i = 0; i < hands.length; i++) {
          const lm = hands[i] as Landmark[];
          const handedness =
            result.handednesses?.[i]?.[0]?.categoryName ?? "Right";
          const isModifier =
            cfgRef.current.twoHand && handedness === "Left";
          drawHand(
            ctx,
            lm,
            canvas.width,
            canvas.height,
            HAND_COLORS[isModifier ? 1 : 0]
          );

          const pose = readHand(lm);
          // Mirror X so on-screen (mirrored) rightward motion increases x.
          pose.x = 1 - pose.x;
          if (isModifier) modHand = pose;
          else if (!playHand) playHand = pose;
        }

        const c = cfgRef.current;
        const sel = mapHandsToSelection(playHand, modHand, {
          key: { tonic: c.tonic, scale: c.scale, octave: c.octave },
          seventh: c.seventh,
          twoHand: c.twoHand,
        });

        // Drive audio.
        synth.setCutoff(sel.cutoffHz);
        synth.setExpression(sel.expression);
        if (sel.rest || !sel.chord) synth.playFreqs([]);
        else synth.playFreqs(sel.chord.freqs);

        setSelection(sel);
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(async () => {
    setErrorMsg("");
    try {
      // 1) Audio must be started from this user gesture.
      await synthRef.current.ensureStarted();
      synthRef.current.setWaveform(waveform);
      synthRef.current.setMasterVolume(volume);

      // 2) Load the hand model.
      setPhase("loading-model");
      landmarkerRef.current = await createHandLandmarker({
        numHands: 2,
        onStatus: setStatus,
      });

      // 3) Camera.
      setPhase("requesting-camera");
      setStatus("Requesting camera…");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: "user" },
          audio: false,
        });
      } catch (err) {
        setPhase("camera-denied");
        setErrorMsg(
          err instanceof Error ? err.message : "Camera permission denied."
        );
        return;
      }

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      setPhase("running");
      setStatus("Tracking. Show a hand to the camera.");
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [loop, volume, waveform]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const v = videoRef.current;
      if (v && v.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
      synthRef.current.close();
    };
  }, []);

  const running = phase === "running";

  return (
    <div className="min-h-full mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4">
        <h1 className="text-3xl font-bold tracking-tight">
          hand<span className="text-sky-400">synth</span>
        </h1>
        <p className="text-sm text-neutral-400">
          Play synth chords with your hands. Everything runs in your browser —
          no backend, no uploads.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Stage */}
        <div className="relative">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-neutral-800 bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
            />

            {/* Overlays for non-running states */}
            {phase !== "running" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-6 text-center">
                {phase === "idle" && (
                  <>
                    <p className="max-w-sm text-neutral-300">
                      Grant camera access and enable sound to start. The camera
                      feed never leaves your device.
                    </p>
                    <button
                      onClick={start}
                      className="rounded-xl bg-sky-500 px-6 py-3 text-lg font-semibold text-black transition hover:bg-sky-400"
                    >
                      Enable camera &amp; sound
                    </button>
                  </>
                )}
                {(phase === "loading-model" ||
                  phase === "requesting-camera") && (
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-sky-400" />
                    <p className="text-neutral-300">{status}</p>
                  </div>
                )}
                {phase === "camera-denied" && (
                  <div className="flex max-w-sm flex-col items-center gap-3">
                    <p className="font-semibold text-rose-400">
                      Camera unavailable
                    </p>
                    <p className="text-sm text-neutral-400">{errorMsg}</p>
                    <p className="text-xs text-neutral-500">
                      Check the browser camera permission (and that a webcam is
                      connected), then try again.
                    </p>
                    <button
                      onClick={start}
                      className="rounded-lg bg-neutral-700 px-4 py-2 text-sm hover:bg-neutral-600"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {phase === "error" && (
                  <div className="flex max-w-sm flex-col items-center gap-3">
                    <p className="font-semibold text-rose-400">
                      Something went wrong
                    </p>
                    <p className="text-sm text-neutral-400">{errorMsg}</p>
                    <button
                      onClick={start}
                      className="rounded-lg bg-neutral-700 px-4 py-2 text-sm hover:bg-neutral-600"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* No-hand hint */}
            {running && handCount === 0 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-sm text-neutral-300">
                No hand detected — hold your hand up to the camera.
              </div>
            )}
          </div>

          {/* Now playing */}
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500">
                  Now playing
                </div>
                <div className="text-2xl font-semibold">
                  {selection?.chord ? (
                    <>
                      {selection.chord.name}{" "}
                      <span className="text-sky-400">
                        ({selection.chord.label})
                      </span>
                    </>
                  ) : (
                    <span className="text-neutral-500">— rest —</span>
                  )}
                </div>
              </div>
              <div className="text-right text-sm text-neutral-400">
                <div>Key: {keyName({ tonic, scale, octave })}</div>
                {selection && (
                  <div>
                    inv {selection.inversion} · oct{" "}
                    {octave + (selection.octaveShift ?? 0)}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2 font-mono text-sm text-neutral-300">
              {selection?.chord
                ? selection.chord.notes.map(midiToName).join("  ·  ")
                : " "}
            </div>
          </div>
        </div>

        {/* Controls + legend */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Controls
            </h2>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-neutral-400">Key</span>
              <div className="flex gap-2">
                <select
                  value={tonic}
                  onChange={(e) => setTonic(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5"
                >
                  {NOTE_NAMES.map((n, i) => (
                    <option key={n} value={i}>
                      {n}
                    </option>
                  ))}
                </select>
                <select
                  value={scale}
                  onChange={(e) => setScale(e.target.value as ScaleName)}
                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5"
                >
                  <option value="major">major</option>
                  <option value="minor">minor</option>
                </select>
              </div>
            </label>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-neutral-400">
                Base octave: {octave}
              </span>
              <input
                type="range"
                min={2}
                max={5}
                step={1}
                value={octave}
                onChange={(e) => setOctave(Number(e.target.value))}
                className="w-full"
              />
            </label>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-neutral-400">Waveform</span>
              <select
                value={waveform}
                onChange={(e) => setWaveform(e.target.value as Waveform)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5"
              >
                <option value="sine">sine</option>
                <option value="sawtooth">sawtooth</option>
                <option value="square">square</option>
                <option value="triangle">triangle</option>
              </select>
            </label>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-neutral-400">
                Master volume: {(volume * 100).toFixed(0)}%
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full"
              />
            </label>

            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={seventh}
                  onChange={(e) => setSeventh(e.target.checked)}
                />
                Sevenths
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={twoHand}
                  onChange={(e) => setTwoHand(e.target.checked)}
                />
                Two-hand mode
              </label>
            </div>

            {!running && phase !== "idle" && (
              <p className="mt-3 text-xs text-neutral-500">{status}</p>
            )}
          </section>

          <Legend twoHand={twoHand} />
        </aside>
      </div>

      <footer className="mt-8 text-xs text-neutral-600">
        Best in Chrome/Edge. Camera requires HTTPS or localhost. Hand tracking:
        MediaPipe Tasks Vision · Audio: Web Audio API.
      </footer>
    </div>
  );
}
