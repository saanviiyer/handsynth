// mapping.ts — pure translation from hand pose(s) to a musical selection.
// Kept separate from gesture geometry (gestures.ts) and audio (synth.ts) so the
// full gesture→chord mapping can be unit tested without a DOM or AudioContext.

import { buildChord, type Chord, type KeyConfig } from "./music";
import type { HandPose } from "./gestures";

export interface MappingConfig {
  key: KeyConfig;
  seventh: boolean;
  twoHand: boolean;
  filterMinHz?: number;
  filterMaxHz?: number;
}

export interface Selection {
  /** null when resting/muted (fist or no hand). */
  chord: Chord | null;
  rest: boolean;
  /** Low-pass cutoff in Hz derived from hand Y. */
  cutoffHz: number;
  /** Expression / gain 0..1 derived from pinch. */
  expression: number;
  /** Octave shift applied (from the modifier hand in two-hand mode). */
  octaveShift: number;
  /** Chord voicing inversion (from hand X). */
  inversion: number;
  /** Degree index chosen (0..4), -1 when resting. */
  degree: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Extended-finger count 1..5 → scale degree 0..4 (I, ii, iii, IV, V). */
export function countToDegree(count: number): number {
  return clamp(count, 1, 5) - 1;
}

/** Hand X in [0,1] → inversion 0,1,2 (root, 1st, 2nd). */
export function xToInversion(x: number): number {
  if (x < 1 / 3) return 0;
  if (x < 2 / 3) return 1;
  return 2;
}

/** Hand Y in [0,1] (y down) → exponential low-pass cutoff. Top = bright. */
export function yToCutoff(y: number, minHz = 220, maxHz = 6000): number {
  const t = clamp(1 - y, 0, 1); // top of frame -> 1 -> bright
  return minHz * Math.pow(maxHz / minHz, t);
}

/** Pinch distance → expression 0..1 (open hand loud, pinched quiet). */
export function pinchToExpression(pinch: number): number {
  return clamp(pinch / 1.2, 0, 1);
}

/**
 * Modifier hand (two-hand mode) → octave shift in {-1, 0, +1}.
 * Fist / few fingers lower the octave, an open hand raises it.
 */
export function modifierToOctaveShift(mod: HandPose): number {
  if (mod.extendedCount <= 1) return -1;
  if (mod.extendedCount >= 4) return 1;
  return 0;
}

/**
 * Translate the playing hand (and optional modifier hand) into a Selection.
 *
 * @param play  the primary/right hand, or null when no hand is detected
 * @param mod   the modifier/left hand in two-hand mode (else null)
 */
export function mapHandsToSelection(
  play: HandPose | null,
  mod: HandPose | null,
  cfg: MappingConfig
): Selection {
  const minHz = cfg.filterMinHz ?? 220;
  const maxHz = cfg.filterMaxHz ?? 6000;

  const octaveShift =
    cfg.twoHand && mod ? modifierToOctaveShift(mod) : 0;

  // No hand, or a closed fist -> rest / mute.
  if (!play || play.fist) {
    return {
      chord: null,
      rest: true,
      cutoffHz: play ? yToCutoff(play.y, minHz, maxHz) : minHz,
      expression: play ? pinchToExpression(play.pinch) : 0,
      octaveShift,
      inversion: 0,
      degree: -1,
    };
  }

  const degree = countToDegree(play.extendedCount);
  const inversion = xToInversion(play.x);

  const key: KeyConfig = {
    ...cfg.key,
    octave: cfg.key.octave + octaveShift,
  };
  const chord = buildChord(key, degree, cfg.seventh, inversion);

  return {
    chord,
    rest: false,
    cutoffHz: yToCutoff(play.y, minHz, maxHz),
    expression: pinchToExpression(play.pinch),
    octaveShift,
    inversion,
    degree,
  };
}
