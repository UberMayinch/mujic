import { useState } from "react";
import { detectOnsets, quantize, type DrumClass } from "../audio/onsets";
import { quantizeMelody, segmentNotes, trackPitch } from "../audio/pitch";
import { isMicSupported, recordBars } from "../audio/tapin";
import { stepsFor, STEPS } from "../model/steps";
import type { ProjectDoc } from "../model/project";
import type { EditOp } from "../model/ops";

type Props = {
  doc: ProjectDoc;
  bars: number;
  disabled: boolean;
  onApply: (ops: EditOp[]) => void;
  onNote: (line: string) => void;
};

const DRUM_NAMES: Record<DrumClass, string> = { bd: "kick", sd: "snare", hh: "hats" };

/** What was heard, ready to confirm. Rows are voice → pattern. */
type Heard = { mode: "rhythm" | "melody"; rows: { key: string; label: string; pattern: string }[] };

/**
 * Beatbox a bar; see what was heard; then decide.
 *
 * Onset detection on a laptop mic is genuinely fiddly, so this never commits
 * on its own — the detected pattern is shown on the same step grid the stem
 * view uses, and nothing reaches the document until it's confirmed.
 */
export function TapIn({ doc, bars, disabled, onApply, onNote }: Props) {
  const [state, setState] = useState<"idle" | "counting" | "analysing">("idle");
  const [countdown, setCountdown] = useState(0);
  const [heard, setHeard] = useState<Heard | null>(null);

  const run = async (mode: "rhythm" | "melody") => {
    setHeard(null);
    setState("counting");
    try {
      const { samples, sampleRate } = await recordBars(doc.bpm, bars, setCountdown);
      setState("analysing");

      if (mode === "rhythm") {
        const onsets = detectOnsets(samples, sampleRate);
        if (onsets.length === 0) {
          onNote("✗ heard no hits — try louder, closer to the mic");
          return;
        }
        const patterns = quantize(onsets, { bpm: doc.bpm, bars });
        setHeard({
          mode,
          rows: Object.entries(patterns).map(([drum, pattern]) => ({
            key: drum,
            label: DRUM_NAMES[drum as DrumClass],
            pattern,
          })),
        });
        onNote(`🥁 heard ${onsets.length} hits`);
        return;
      }

      const notes = segmentNotes(trackPitch(samples, sampleRate), sampleRate);
      if (notes.length === 0) {
        onNote("✗ heard no pitch — hum a steady “aah” rather than whispering");
        return;
      }
      setHeard({
        mode,
        rows: [
          { key: "melody", label: "melody", pattern: quantizeMelody(notes, { bpm: doc.bpm, bars }) },
        ],
      });
      onNote(`🎤 heard ${notes.length} notes`);
    } catch (error) {
      onNote(`✗ mic: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setState("idle");
    }
  };

  /** Route what was heard onto existing tracks where possible, else make one. */
  const apply = () => {
    if (!heard) return;

    const ops: EditOp[] = heard.rows.map(({ key, label, pattern }) => {
      if (heard.mode === "melody") {
        // Reuse the melodic track being edited if there is one, so humming a
        // second phrase revises the melody rather than stacking a new track.
        const existing = doc.tracks.find((t) => t.kind === "note");
        return existing
          ? { op: "set_pattern", track: existing.name, pattern }
          : { op: "add_track", name: label, kind: "note", sound: "triangle", pattern };
      }
      const existing = doc.tracks.find((t) => t.kind === "sample" && t.defaultSound === key);
      return existing
        ? { op: "set_pattern", track: existing.name, pattern }
        : { op: "add_track", name: label, kind: "sample", sound: key, pattern };
    });

    onApply(ops);
    setHeard(null);
  };

  if (!isMicSupported()) return null;

  return (
    <div className="tapin">
      <button
        type="button"
        className={state === "idle" ? "tap" : "tap on"}
        onClick={() => void run("rhythm")}
        disabled={disabled || state !== "idle"}
        title={`beatbox ${bars} bar at ${doc.bpm} bpm`}
      >
        {state === "counting" ? `● ${countdown}` : state === "analysing" ? "…" : "🥁 tap in"}
      </button>
      <button
        type="button"
        className={state === "idle" ? "tap" : "tap on"}
        onClick={() => void run("melody")}
        disabled={disabled || state !== "idle"}
        title={`hum a melody for ${bars} bar at ${doc.bpm} bpm`}
      >
        🎤 hum in
      </button>

      {heard && (
        <div className="heard">
          <span className="heard-title">heard:</span>
          {heard.rows.map(({ key, label, pattern }) => {
            const steps = stepsFor(pattern);
            return (
              <div key={key} className="heard-row">
                <span className="heard-name">{label}</span>
                <code>{pattern}</code>
                <div className="grid mini">
                  {(steps ?? new Array(STEPS).fill(false)).map((on: boolean, i: number) => (
                    <span key={i} className={`cell${on ? " on" : ""}${i % 4 === 0 ? " beat" : ""}`} />
                  ))}
                </div>
              </div>
            );
          })}
          <div className="heard-actions">
            <button type="button" className="primary" onClick={apply}>
              use it
            </button>
            <button type="button" onClick={() => setHeard(null)}>
              discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
