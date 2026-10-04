import { useState } from "react";
import { resolveCell } from "../model/arrange";
import type { ProjectDoc, Track } from "../model/project";
import { stepsFor, STEPS } from "../model/steps";
import { TakeStem } from "./TakeStem";

type Props = {
  doc: ProjectDoc;
  /** Index of the section being edited — the stem view is always a view *of a section*. */
  sectionIndex: number;
  onChange: (next: ProjectDoc) => void;
};

function GainSlider({ track, onCommit }: { track: Track; onCommit: (gain: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);

  // Dragging is local; only the release commits. Committing per pixel would
  // push dozens of undo entries and re-evaluate the audio graph on every frame.
  const release = () => {
    if (draft !== null && draft !== track.gain) onCommit(draft);
    setDraft(null);
  };

  return (
    <input
      type="range"
      min={0}
      max={1.5}
      step={0.05}
      value={draft ?? track.gain}
      disabled={track.codeOwned}
      onChange={(e) => setDraft(Number(e.target.value))}
      onPointerUp={release}
      onKeyUp={release}
      onBlur={release}
      title={track.codeOwned ? "read-only: this track is code-owned" : `gain ${draft ?? track.gain}`}
    />
  );
}

export function StemView({ doc, sectionIndex, onChange }: Props) {
  const section = doc.sections[sectionIndex];

  const update = (id: string, patch: Partial<Track>) =>
    onChange({ ...doc, tracks: doc.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  if (!section) return <p className="hint">No section selected.</p>;

  return (
    <div className="stems">
      <h2>
        {section.name} · {section.bars} bars
      </h2>

      {doc.tracks.map((track) => {
        const { pattern, from } = resolveCell(doc, sectionIndex, track);
        const inherited = pattern !== null && from !== null && from.id !== section.id;
        const steps = pattern === null ? null : stepsFor(pattern);

        return (
          <div key={track.id} className={track.muted || pattern === null ? "stem muted" : "stem"}>
            <div className="stem-head">
              <span className="stem-name">{track.name}</span>
              {track.kind === "take" ? (
                <span className="tag">your voice</span>
              ) : (
                <code className="stem-pattern">{pattern ?? "silent here"}</code>
              )}
              {inherited && <span className="tag dim">from {from!.name}</span>}
              {track.codeOwned && <span className="tag">code-owned</span>}
              {track.kind !== "take" && pattern !== null && steps === null && (
                <span className="tag dim">no preview</span>
              )}
            </div>

            <div className="stem-controls">
              {/* Mute/solo are mix controls and span the whole timeline. To drop
                  a track for just this section, use its timeline cell. */}
              <button
                className={track.muted ? "on" : ""}
                title="mute across the whole timeline"
                onClick={() => update(track.id, { muted: !track.muted })}
              >
                M
              </button>
              <button
                className={track.soloed ? "on" : ""}
                title="solo across the whole timeline"
                onClick={() => update(track.id, { soloed: !track.soloed })}
              >
                S
              </button>
              <GainSlider track={track} onCommit={(gain) => update(track.id, { gain })} />
            </div>

            {track.kind === "take" ? (
              <TakeStem doc={doc} track={track} onChange={onChange} />
            ) : (
              <div className="grid">
                {(steps ?? new Array(STEPS).fill(false)).map((on: boolean, i: number) => (
                  <span key={i} className={`cell${on ? " on" : ""}${i % 4 === 0 ? " beat" : ""}`} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
