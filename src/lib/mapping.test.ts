import { describe, it, expect } from "vitest";
import {
  countToDegree,
  xToInversion,
  yToCutoff,
  mapHandsToSelection,
  type MappingConfig,
} from "./mapping";
import type { HandPose } from "./gestures";

function pose(p: Partial<HandPose>): HandPose {
  return {
    x: 0.1,
    y: 0.5,
    fingers: [false, true, false, false, false],
    extendedCount: 1,
    pinch: 0.8,
    fist: false,
    ...p,
  };
}

const cfg: MappingConfig = {
  key: { tonic: 0, scale: "major", octave: 4 },
  seventh: false,
  twoHand: false,
};

describe("control curves", () => {
  it("finger count 1..5 maps to degree 0..4", () => {
    expect(countToDegree(1)).toBe(0);
    expect(countToDegree(3)).toBe(2);
    expect(countToDegree(5)).toBe(4);
  });
  it("x thirds select inversion", () => {
    expect(xToInversion(0.1)).toBe(0);
    expect(xToInversion(0.5)).toBe(1);
    expect(xToInversion(0.9)).toBe(2);
  });
  it("top of frame is brighter than bottom", () => {
    expect(yToCutoff(0)).toBeGreaterThan(yToCutoff(1));
  });
});

describe("mapHandsToSelection", () => {
  it("one finger at left => I chord, root position", () => {
    const sel = mapHandsToSelection(pose({ extendedCount: 1, x: 0.1 }), null, cfg);
    expect(sel.rest).toBe(false);
    expect(sel.chord?.label).toBe("I");
    expect(sel.inversion).toBe(0);
    expect(sel.chord?.notes).toEqual([60, 64, 67]);
  });

  it("fist => rest / muted", () => {
    const sel = mapHandsToSelection(pose({ fist: true, extendedCount: 0 }), null, cfg);
    expect(sel.rest).toBe(true);
    expect(sel.chord).toBeNull();
  });

  it("no hand => rest", () => {
    const sel = mapHandsToSelection(null, null, cfg);
    expect(sel.rest).toBe(true);
  });

  it("two-hand: open modifier hand raises octave", () => {
    const sel = mapHandsToSelection(
      pose({ extendedCount: 5, x: 0.1 }),
      pose({ extendedCount: 5 }),
      { ...cfg, twoHand: true }
    );
    expect(sel.octaveShift).toBe(1);
    // V chord an octave up from base 4: G5 B5 D6 = 79,83,86
    expect(sel.chord?.notes).toEqual([79, 83, 86]);
  });
});
