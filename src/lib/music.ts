// music.ts — pure music theory helpers: equal-temperament note→frequency,
// scale + chord construction (major/minor triads + sevenths), key selection.
//
// Conventions:
//  - A MIDI note number is used as the canonical pitch handle (A4 = 69 = 440 Hz).
//  - Note names use sharps, octave in scientific pitch notation ("C4", "F#3").

export const A4_MIDI = 69;
export const A4_FREQ = 440;

export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export type NoteName = (typeof NOTE_NAMES)[number];

/** Equal-temperament frequency (Hz) for a MIDI note number. */
export function midiToFreq(midi: number): number {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** MIDI note number for a pitch class (0=C..11=B) at a given octave. */
export function pitchToMidi(pitchClass: number, octave: number): number {
  // MIDI: C-1 = 0, so C{oct} = (oct + 1) * 12.
  return (octave + 1) * 12 + ((pitchClass % 12) + 12) % 12;
}

/** Human-readable note name for a MIDI number, e.g. 60 -> "C4". */
export function midiToName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

/** Frequency for a pitch class + octave (convenience). */
export function noteToFreq(pitchClass: number, octave: number): number {
  return midiToFreq(pitchToMidi(pitchClass, octave));
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

export type ScaleName = "major" | "minor";

// Semitone offsets from the tonic.
export const SCALE_INTERVALS: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  // natural minor
  minor: [0, 2, 3, 5, 7, 8, 10],
};

// Diatonic triad quality per scale degree (0-indexed degree).
// Major: I ii iii IV V vi vii°
// Minor: i ii° III iv v VI VII
export const DIATONIC_QUALITY: Record<ScaleName, ChordQuality[]> = {
  major: ["maj", "min", "min", "maj", "maj", "min", "dim"],
  minor: ["min", "dim", "maj", "min", "min", "maj", "maj"],
};

export const ROMAN_NUMERALS: Record<ScaleName, string[]> = {
  major: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  minor: ["i", "ii°", "III", "iv", "v", "VI", "VII"],
};

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

export type ChordQuality = "maj" | "min" | "dim" | "aug";

// Intervals (semitones) from the chord root, by triad quality.
export const TRIAD_INTERVALS: Record<ChordQuality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
};

/** Semitone offset of the i-th scale degree above the tonic (i may exceed 6). */
function scaleDegreeSemitone(scale: ScaleName, i: number): number {
  const steps = SCALE_INTERVALS[scale];
  const n = steps.length; // 7
  const octaves = Math.floor(i / n);
  const idx = ((i % n) + n) % n;
  return steps[idx] + 12 * octaves;
}

export interface Chord {
  /** Roman-numeral label including quality, e.g. "IV" or "V7". */
  label: string;
  /** Root MIDI note. */
  rootMidi: number;
  /** MIDI notes of all chord tones (sorted ascending). */
  notes: number[];
  /** Frequencies (Hz) of all chord tones. */
  freqs: number[];
  /** Human-readable, e.g. "F major" / "G7". */
  name: string;
}

export interface KeyConfig {
  /** Tonic pitch class, 0=C..11=B. */
  tonic: number;
  scale: ScaleName;
  /** Octave of the tonic for degree 0 chords, e.g. 3 or 4. */
  octave: number;
}

const QUALITY_WORD: Record<ChordQuality, string> = {
  maj: "major",
  min: "minor",
  dim: "dim",
  aug: "aug",
};

/**
 * Build a diatonic chord on the given scale degree (0-indexed) of a key.
 *
 * @param key      tonic / scale / octave
 * @param degree   0..6 scale degree (I..vii)
 * @param seventh  add the diatonic seventh
 * @param inversion number of chord tones to raise by an octave (voicing)
 */
export function buildChord(
  key: KeyConfig,
  degree: number,
  seventh = false,
  inversion = 0
): Chord {
  const deg = ((degree % 7) + 7) % 7;
  const quality = DIATONIC_QUALITY[key.scale][deg];
  const base = pitchToMidi(key.tonic, key.octave);

  const rootMidi = base + scaleDegreeSemitone(key.scale, deg);

  // Stack diatonic thirds: root, +2, +4 (and +6 for the seventh). This yields
  // the correct diatonic seventh per degree (e.g. a dominant V7 in major).
  const stack = seventh ? [0, 2, 4, 6] : [0, 2, 4];
  let notes = stack.map(
    (k) => base + scaleDegreeSemitone(key.scale, deg + k)
  );

  // Apply inversion: lift the lowest `inversion` tones up an octave.
  const inv = ((inversion % notes.length) + notes.length) % notes.length;
  for (let i = 0; i < inv; i++) {
    notes[i] += 12;
  }
  notes = [...notes].sort((a, b) => a - b);

  const roman = ROMAN_NUMERALS[key.scale][deg] + (seventh ? "7" : "");
  const rootName = NOTE_NAMES[((rootMidi % 12) + 12) % 12];
  const name = `${rootName} ${QUALITY_WORD[quality]}${seventh ? " 7" : ""}`;

  return {
    label: roman,
    rootMidi,
    notes,
    freqs: notes.map(midiToFreq),
    name,
  };
}

/** Convenience: display name for a key, e.g. "C major". */
export function keyName(key: KeyConfig): string {
  return `${NOTE_NAMES[((key.tonic % 12) + 12) % 12]} ${key.scale}`;
}

export const ALL_KEYS: NoteName[] = [...NOTE_NAMES];
