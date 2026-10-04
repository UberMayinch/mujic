import { useEffect, useState } from "react";
import { resolveCell } from "../model/arrange";
import type { ProjectDoc } from "../model/project";

type Props = {
  doc: ProjectDoc;
  /** Which section seeds the per-track editors. */
  sectionIndex: number;
  code: string;
  onChange: (next: ProjectDoc) => void;
};

/**
 * The generated Strudel code, plus per-track hand-editing.
 *
 * Editing a track's code flips it to code-owned: codegen then emits that text
 * verbatim **in every section** — hand-written code opts out of the arrangement
 * grid — and the track's GUI controls go read-only. The MVP deliberately does
 * not parse code back into the document; "revert" is the way back.
 */
export function ReplView({ doc, sectionIndex, code, onChange }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Drop drafts for tracks that no longer exist.
  useEffect(() => {
    setDrafts((prev) => {
      const ids = new Set(doc.tracks.map((t) => t.id));
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => ids.has(id)));
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [doc.tracks]);

  const takeOver = (id: string, text: string) =>
    onChange({
      ...doc,
      tracks: doc.tracks.map((t) => (t.id === id ? { ...t, codeOwned: true, code: text } : t)),
    });

  const revert = (id: string) => {
    setDrafts(({ [id]: _dropped, ...rest }) => rest);
    onChange({
      ...doc,
      tracks: doc.tracks.map((t) => (t.id === id ? { ...t, codeOwned: false, code: undefined } : t)),
    });
  };

  return (
    <div className="repl">
      <section className="generated">
        <h2>generated</h2>
        <pre>{code}</pre>
      </section>

      <section className="tracks">
        <h2>per-track</h2>
        {doc.tracks.map((track) => {
          const { pattern } = resolveCell(doc, sectionIndex, track);
          const seed = pattern === null ? "silence" : `s("${pattern}").gain(${track.gain})`;
          const shown = drafts[track.id] ?? track.code ?? seed;
          const dirty = drafts[track.id] !== undefined && drafts[track.id] !== track.code;
          return (
            <div key={track.id} className="track-code">
              <div className="track-code-head">
                <span>{track.name}</span>
                {track.codeOwned && <span className="tag">code-owned</span>}
              </div>
              <textarea
                value={shown}
                spellCheck={false}
                rows={2}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [track.id]: e.target.value }))}
              />
              <div className="track-code-actions">
                <button disabled={!dirty} onClick={() => takeOver(track.id, drafts[track.id]!)}>
                  apply as code
                </button>
                {track.codeOwned && <button onClick={() => revert(track.id)}>revert to controls</button>}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
