import { describe, it, expect } from "vitest";
import {
  midiToFreq,
  midiToName,
  pitchToMidi,
  buildChord,
  type KeyConfig,
} from "./music";

describe("equal-temperament frequency", () => {
  it("A4 (MIDI 69) = 440 Hz", () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
  });

  it("A5 is an octave (2x) above A4", () => {
    expect(midiToFreq(81)).toBeCloseTo(880, 4);
  });

  it("Middle C (MIDI 60) ≈ 261.63 Hz", () => {
    expect(midiToFreq(60)).toBeCloseTo(261.6256, 3);
  });

  it("a semitone up multiplies frequency by 2^(1/12)", () => {
    expect(midiToFreq(70) / midiToFreq(69)).toBeCloseTo(Math.pow(2, 1 / 12), 8);
  });
});

describe("pitch/name conversion", () => {
  it("C4 is MIDI 60", () => {
    expect(pitchToMidi(0, 4)).toBe(60);
  });
  it("names round-trip", () => {
    expect(midiToName(60)).toBe("C4");
    expect(midiToName(69)).toBe("A4");
    expect(midiToName(61)).toBe("C#4");
  });
});

describe("diatonic chord construction — C major", () => {
  const key: KeyConfig = { tonic: 0, scale: "major", octave: 4 };

  it("I is C major triad C4 E4 G4 with correct intervals", () => {
    const c = buildChord(key, 0);
    expect(c.notes).toEqual([60, 64, 67]);
    expect(c.label).toBe("I");
    expect(c.name).toBe("C major");
    // intervals from root: major third (4) + minor third (3)
    expect(c.notes[1] - c.notes[0]).toBe(4);
    expect(c.notes[2] - c.notes[1]).toBe(3);
  });

  it("ii is D minor triad D4 F4 A4", () => {
    const c = buildChord(key, 1);
    expect(c.notes).toEqual([62, 65, 69]);
    expect(c.label).toBe("ii");
    expect(c.notes[1] - c.notes[0]).toBe(3); // minor third first
    expect(c.notes[2] - c.notes[1]).toBe(4);
  });

  it("V is G major triad G4 B4 D5", () => {
    const c = buildChord(key, 4);
    expect(c.notes).toEqual([67, 71, 74]);
    expect(c.label).toBe("V");
  });

  it("V7 adds the minor seventh (F5)", () => {
    const c = buildChord(key, 4, true);
    expect(c.notes).toEqual([67, 71, 74, 77]);
    expect(c.label).toBe("V7");
    // G dominant 7th: root->b7 is 10 semitones
    expect(c.notes[3] - c.notes[0]).toBe(10);
  });

  it("chord frequencies match the MIDI notes", () => {
    const c = buildChord(key, 0);
    expect(c.freqs[0]).toBeCloseTo(midiToFreq(60), 6);
    expect(c.freqs[2]).toBeCloseTo(midiToFreq(67), 6);
  });
});

describe("diatonic chord construction — A minor", () => {
  const key: KeyConfig = { tonic: 9, scale: "minor", octave: 4 };

  it("i is A minor triad A4 C5 E5", () => {
    const c = buildChord(key, 0);
    expect(c.notes).toEqual([69, 72, 76]);
    expect(c.label).toBe("i");
    expect(c.name).toBe("A minor");
  });

  it("III is C major triad C5 E5 G5", () => {
    const c = buildChord(key, 2);
    expect(c.notes).toEqual([72, 76, 79]);
    expect(c.label).toBe("III");
  });
});

describe("inversions", () => {
  const key: KeyConfig = { tonic: 0, scale: "major", octave: 4 };
  it("1st inversion lifts the root an octave: E4 G4 C5", () => {
    const c = buildChord(key, 0, false, 1);
    expect(c.notes).toEqual([64, 67, 72]);
  });
  it("2nd inversion: G4 C5 E5", () => {
    const c = buildChord(key, 0, false, 2);
    expect(c.notes).toEqual([67, 72, 76]);
  });
});
