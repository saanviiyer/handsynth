import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandLandmarker } from "./lib/handLandmarker";
import { readHand, type Landmark, type HandPose } from "./lib/gestures";
import {
  mapHandsToSelection,
  type Selection,
  type PlayMode,
} from "./lib/mapping";
import {
  NOTE_NAMES,
  midiToName,
  keyName,
  parseProgression,
  type ScaleName,
  type ChordExtension,
} from "./lib/music";
import { Synth, type Waveform } from "./lib/synth";
import {
  Arpeggiator,
  type ArpPattern,
  type ArpDivision,
} from "./lib/arp";
import { Vocoder } from "./lib/vocoder";
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
  const arpRef = useRef<Arpeggiator | null>(null);
  const vocoderRef = useRef<Vocoder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Musical controls
  const [mode, setMode] = useState<PlayMode>("diatonic");
  const [tonic, setTonic] = useState<number>(0); // C
  const [scale, setScale] = useState<ScaleName>("major");
  const [octave, setOctave] = useState<number>(3);
  const [extension, setExtension] = useState<ChordExtension>("triad");
  const [progressionText, setProgressionText] = useState<string>("Am E F C");

  // Synth controls
  const [waveform, setWaveform] = useState<Waveform>("sawtooth");
  const [volume, setVolume] = useState<number>(0.5);
  const [twoHand, setTwoHand] = useState<boolean>(false);

  // Arpeggiator controls
  const [arpOn, setArpOn] = useState<boolean>(false);
  const [arpPattern, setArpPattern] = useState<ArpPattern>("up");
  const [arpDivision, setArpDivision] = useState<ArpDivision>("1/8");
  const [arpBpm, setArpBpm] = useState<number>(120);
  const [arpOctaves, setArpOctaves] = useState<number>(1);
  const [arpGate, setArpGate] = useState<number>(0.6);

  // Vocoder controls
  const [vocoderOn, setVocoderOn] = useState<boolean>(false);
  const [micGain, setMicGain] = useState<number>(1);
  const [micError, setMicError] = useState<string>("");

  // Live readout
  const [selection, setSelection] = useState<Selection | null>(null);
  const [handCount, setHandCount] = useState<number>(0);

  // Parse the progression text into slots (labels + validity + parsed chords).
  const progressionSlots = useMemo(
    () => parseProgression(progressionText, octave),
    [progressionText, octave]
  );

  // Latest values for the rAF loop without re-subscribing every render.
  const cfgRef = useRef({
    mode,
    tonic,
    scale,
    octave,
    extension,
    twoHand,
    arpOn,
    progression: progressionSlots.map((s) => s.chord),
  });
  useEffect(() => {
    cfgRef.current = {
      mode,
      tonic,
      scale,
      octave,
      extension,
      twoHand,
      arpOn,
      progression: progressionSlots.map((s) => s.chord),
    };
  }, [mode, tonic, scale, octave, extension, twoHand, arpOn, progressionSlots]);

  useEffect(() => {
    synthRef.current.setWaveform(waveform);
  }, [waveform]);
  useEffect(() => {
    synthRef.current.setMasterVolume(volume);
  }, [volume]);

  // Keep arpeggiator params in sync.
  useEffect(() => {
    arpRef.current?.setParams({
      pattern: arpPattern,
      division: arpDivision,
      bpm: arpBpm,
      octaveRange: arpOctaves,
      gate: arpGate,
    });
  }, [arpPattern, arpDivision, arpBpm, arpOctaves, arpGate]);

  // On enabling the arp, clear any sustained block chord so it doesn't linger.
  useEffect(() => {
    if (arpOn) synthRef.current.releaseAll();
  }, [arpOn]);

  useEffect(() => {
    vocoderRef.current?.setMicGain(micGain);
  }, [micGain]);

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
          pose.x = 1 - pose.x; // mirror X to match the mirrored display
          if (isModifier) modHand = pose;
          else if (!playHand) playHand = pose;
        }

        const c = cfgRef.current;
        const sel = mapHandsToSelection(playHand, modHand, {
          mode: c.mode,
          key: { tonic: c.tonic, scale: c.scale, octave: c.octave },
          extension: c.extension,
          twoHand: c.twoHand,
          progression: c.progression,
        });

        synth.setCutoff(sel.cutoffHz);
        synth.setExpression(sel.expression);

        const notes = sel.rest || !sel.chord ? [] : sel.chord.notes;
        if (c.arpOn) {
          arpRef.current?.setChord(notes);
        } else {
          arpRef.current?.setChord([]); // ensure arp is idle
          synth.playFreqs(
            sel.rest || !sel.chord ? [] : sel.chord.freqs
          );
        }

        setSelection(sel);
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(async () => {
    setErrorMsg("");
    try {
      await synthRef.current.ensureStarted();
      synthRef.current.setWaveform(waveform);
      synthRef.current.setMasterVolume(volume);

      // Build the arpeggiator now that the AudioContext exists.
      const audioCtx = synthRef.current.getContext();
      if (audioCtx && !arpRef.current) {
        arpRef.current = new Arpeggiator(audioCtx, (f, t, g) =>
          synthRef.current.triggerNote(f, t, g)
        );
        arpRef.current.setParams({
          pattern: arpPattern,
          division: arpDivision,
          bpm: arpBpm,
          octaveRange: arpOctaves,
          gate: arpGate,
        });
      }

      setPhase("loading-model");
      landmarkerRef.current = await createHandLandmarker({
        numHands: 2,
        onStatus: setStatus,
      });

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
  }, [loop, volume, waveform, arpPattern, arpDivision, arpBpm, arpOctaves, arpGate]);

  // Toggle the vocoder: request mic on enable, crossfade the wet/dry path.
  const toggleVocoder = useCallback(
    async (enable: boolean) => {
      setMicError("");
      const synth = synthRef.current;
      const audioCtx = synth.getContext();
      const carrier = synth.getCarrierNode();

      if (!enable) {
        setVocoderOn(false);
        const v = vocoderRef.current;
        if (v && audioCtx) {
          v.stop((val) => synth.setDryGain(val));
          setTimeout(() => {
            v.dispose();
            micStreamRef.current?.getTracks().forEach((t) => t.stop());
            micStreamRef.current = null;
            vocoderRef.current = null;
          }, 200);
        }
        return;
      }

      if (!audioCtx || !carrier) {
        setMicError("Start the app (Enable camera & sound) first.");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        setVocoderOn(false);
        setMicError(
          err instanceof Error
            ? `Microphone unavailable: ${err.message}`
            : "Microphone permission denied."
        );
        return;
      }

      micStreamRef.current = stream;
      const voc = new Vocoder(audioCtx, carrier, audioCtx.destination, {
        bands: 16,
      });
      voc.setModulatorStream(stream);
      voc.setMicGain(micGain);
      voc.start((val) => synth.setDryGain(val));
      vocoderRef.current = voc;
      setVocoderOn(true);
    },
    [micGain]
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      arpRef.current?.stop();
      vocoderRef.current?.dispose();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      const v = videoRef.current;
      if (v && v.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
      synthRef.current.close();
    };
  }, []);

  const running = phase === "running";
  const started = running || phase === "camera-denied";

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
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
                  Now playing{" "}
                  {arpOn && (
                    <span className="text-emerald-400">· arp</span>
                  )}
                  {vocoderOn && (
                    <span className="text-violet-400"> · vocoder</span>
                  )}
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
                {mode === "diatonic" ? (
                  <div>Key: {keyName({ tonic, scale, octave })}</div>
                ) : (
                  <div>Progression mode</div>
                )}
                {selection && !selection.rest && (
                  <div>
                    {mode === "progression"
                      ? `slot ${selection.degree + 1}`
                      : `inv ${selection.inversion}`}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2 font-mono text-sm text-neutral-300">
              {selection?.chord
                ? selection.chord.notes.map(midiToName).join("  ·  ")
                : " "}
            </div>
          </div>
        </div>

        {/* Controls + legend */}
        <aside className="flex flex-col gap-4">
          {/* Mode switch */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Mode
            </h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {(
                [
                  ["diatonic", "Key (diatonic)"],
                  ["progression", "Progression (custom)"],
                ] as [PlayMode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-3 py-2 font-medium transition ${
                    mode === m
                      ? "bg-sky-500 text-black"
                      : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "progression" && (
              <div className="mt-3">
                <label className="mb-1 block text-sm text-neutral-400">
                  Chord sequence (space/comma separated)
                </label>
                <input
                  type="text"
                  value={progressionText}
                  onChange={(e) => setProgressionText(e.target.value)}
                  placeholder="Am E F C"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5 font-mono"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {progressionSlots.map((s, i) => (
                    <span
                      key={`${s.symbol}-${i}`}
                      title={
                        s.chord
                          ? s.chord.name
                          : `"${s.symbol}" is not a recognized chord`
                      }
                      className={`rounded-md px-2 py-1 text-xs font-mono ${
                        s.chord
                          ? "bg-neutral-800 text-neutral-200"
                          : "bg-rose-900/50 text-rose-300 line-through"
                      }`}
                    >
                      {i + 1}. {s.symbol}
                    </span>
                  ))}
                  {progressionSlots.length === 0 && (
                    <span className="text-xs text-neutral-500">
                      Type chords like <code>Am E F C</code>.
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Fingers 1–5 pick slots 1–5. Enable two-hand mode and hold your
                  left hand open to reach slots 6–10. Quality comes from the
                  typed symbol, so the Triad/6th/7th control is disabled here.
                </p>
              </div>
            )}
          </section>

          {/* Musical controls */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Sound
            </h2>

            {mode === "diatonic" && (
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
            )}

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

            {/* Chord extension (diatonic only) */}
            <div className="mb-3 text-sm">
              <span className="mb-1 block text-neutral-400">
                Chord extension
                {mode === "progression" && (
                  <span className="ml-1 text-xs text-neutral-600">
                    (from symbols)
                  </span>
                )}
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["triad", "Triad"],
                    ["6th", "6th"],
                    ["7th", "7th"],
                  ] as [ChordExtension, string][]
                ).map(([ext, label]) => (
                  <button
                    key={ext}
                    disabled={mode === "progression"}
                    onClick={() => setExtension(ext)}
                    className={`rounded-lg px-2 py-1.5 font-medium transition ${
                      mode === "progression"
                        ? "cursor-not-allowed bg-neutral-800/50 text-neutral-600"
                        : extension === ext
                          ? "bg-sky-500 text-black"
                          : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

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

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={twoHand}
                onChange={(e) => setTwoHand(e.target.checked)}
              />
              Two-hand mode{" "}
              <span className="text-xs text-neutral-500">
                {mode === "diatonic" ? "(left = octave)" : "(left = slots 6–10)"}
              </span>
            </label>
          </section>

          {/* Arpeggiator */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Arpeggiator
              </h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={arpOn}
                  onChange={(e) => setArpOn(e.target.checked)}
                />
                On
              </label>
            </div>

            <div className={arpOn ? "" : "opacity-50"}>
              <div className="mb-3 text-sm">
                <span className="mb-1 block text-neutral-400">Pattern</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      ["up", "Up"],
                      ["down", "Down"],
                      ["updown", "Up-Dn"],
                      ["random", "Rand"],
                    ] as [ArpPattern, string][]
                  ).map(([p, label]) => (
                    <button
                      key={p}
                      disabled={!arpOn}
                      onClick={() => setArpPattern(p)}
                      className={`rounded-md px-1.5 py-1 text-xs font-medium transition ${
                        arpPattern === p
                          ? "bg-emerald-500 text-black"
                          : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="mb-3 block text-sm">
                <span className="mb-1 block text-neutral-400">Rate</span>
                <select
                  disabled={!arpOn}
                  value={arpDivision}
                  onChange={(e) =>
                    setArpDivision(e.target.value as ArpDivision)
                  }
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1.5"
                >
                  <option value="1/4">1/4</option>
                  <option value="1/8">1/8</option>
                  <option value="1/16">1/16</option>
                  <option value="1/8T">1/8 triplet</option>
                  <option value="1/16T">1/16 triplet</option>
                </select>
              </label>

              <label className="mb-3 block text-sm">
                <span className="mb-1 block text-neutral-400">
                  Tempo: {arpBpm} BPM
                </span>
                <input
                  type="range"
                  min={60}
                  max={200}
                  step={1}
                  disabled={!arpOn}
                  value={arpBpm}
                  onChange={(e) => setArpBpm(Number(e.target.value))}
                  className="w-full"
                />
              </label>

              <label className="mb-3 block text-sm">
                <span className="mb-1 block text-neutral-400">
                  Octave range: {arpOctaves}
                </span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={1}
                  disabled={!arpOn}
                  value={arpOctaves}
                  onChange={(e) => setArpOctaves(Number(e.target.value))}
                  className="w-full"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-neutral-400">
                  Gate (note length): {(arpGate * 100).toFixed(0)}%
                </span>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  disabled={!arpOn}
                  value={arpGate}
                  onChange={(e) => setArpGate(Number(e.target.value))}
                  className="w-full"
                />
              </label>
            </div>
          </section>

          {/* Vocoder */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                Vocoder
              </h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={vocoderOn}
                  disabled={!started}
                  onChange={(e) => toggleVocoder(e.target.checked)}
                />
                On
              </label>
            </div>
            <p className="text-xs text-neutral-500">
              Uses your microphone as the modulator and the synth as the
              carrier — talk or sing to shape the chords.
            </p>
            {!started && (
              <p className="mt-2 text-xs text-neutral-600">
                Enable camera &amp; sound first.
              </p>
            )}
            {micError && (
              <p className="mt-2 text-xs text-rose-400">{micError}</p>
            )}
            <label className={`mt-3 block text-sm ${vocoderOn ? "" : "opacity-50"}`}>
              <span className="mb-1 block text-neutral-400">
                Voice sensitivity: {micGain.toFixed(1)}×
              </span>
              <input
                type="range"
                min={0}
                max={4}
                step={0.1}
                disabled={!vocoderOn}
                value={micGain}
                onChange={(e) => setMicGain(Number(e.target.value))}
                className="w-full"
              />
            </label>
          </section>

          <Legend mode={mode} twoHand={twoHand} />
        </aside>
      </div>

      <footer className="mt-8 text-xs text-neutral-600">
        Best in Chrome/Edge. Camera requires HTTPS or localhost. Hand tracking:
        MediaPipe Tasks Vision · Audio: Web Audio API.
      </footer>
    </div>
  );
}
