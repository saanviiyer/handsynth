// Legend.tsx — on-screen gesture → chord mapping reference.

const ROWS: { gesture: string; effect: string }[] = [
  { gesture: "1 finger", effect: "Chord I (degree 1)" },
  { gesture: "2 fingers", effect: "Chord ii (degree 2)" },
  { gesture: "3 fingers", effect: "Chord iii (degree 3)" },
  { gesture: "4 fingers", effect: "Chord IV (degree 4)" },
  { gesture: "5 fingers", effect: "Chord V (degree 5)" },
  { gesture: "Closed fist", effect: "Rest / mute" },
  { gesture: "Hand left→right", effect: "Inversion (root / 1st / 2nd)" },
  { gesture: "Hand up→down", effect: "Low-pass filter (bright → dark)" },
  { gesture: "Pinch thumb+index", effect: "Expression / volume (open = loud)" },
];

export function Legend({ twoHand }: { twoHand: boolean }) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Gesture map
      </h2>
      <ul className="flex flex-col divide-y divide-neutral-800 text-sm">
        {ROWS.map((r) => (
          <li key={r.gesture} className="flex justify-between gap-3 py-1.5">
            <span className="text-neutral-300">{r.gesture}</span>
            <span className="text-right text-neutral-500">{r.effect}</span>
          </li>
        ))}
        {twoHand && (
          <li className="flex justify-between gap-3 py-1.5">
            <span className="text-pink-400">Left hand (open/fist)</span>
            <span className="text-right text-neutral-500">
              Octave shift (+1 / −1)
            </span>
          </li>
        )}
      </ul>
      <p className="mt-3 text-xs text-neutral-600">
        Right hand plays. In two-hand mode the left hand shifts the octave.
      </p>
    </section>
  );
}
