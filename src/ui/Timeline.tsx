import { resolveCell, sectionStartBar, totalBars } from "../model/arrange";
import type { Cell, ProjectDoc } from "../model/project";

type Props = {
  doc: ProjectDoc;
  selectedId: string | null;
  onSelect: (sectionId: string) => void;
  onSetCell: (sectionId: string, trackId: string, cell: Cell) => void;
  onSetBars: (sectionId: string, bars: number) => void;
  onAddSection: () => void;
};

/**
 * The arrangement grid: tracks are rows, sections are columns in playback order.
 *
 * Column widths are proportional to bar count, so the timeline reads as time
 * rather than as an even table. Each cell shows whether it's explicit,
 * inherited, or a deliberate drop — inheritance is invisible otherwise, and
 * invisible inheritance is how you lose track of what's actually playing.
 */
export function Timeline({ doc, selectedId, onSelect, onSetCell, onSetBars, onAddSection }: Props) {
  const total = totalBars(doc) || 1;

  /** Explicit → inherit → silent → explicit. Clicking cycles a cell's state. */
  const cycle = (current: Cell | undefined, fallback: string): Cell => {
    if (!current || current.kind === "inherit") return { kind: "silent" };
    if (current.kind === "silent") return { kind: "pattern", pattern: fallback };
    return { kind: "inherit" };
  };

  return (
    <div className="timeline">
      <div className="tl-row tl-header">
        <div className="tl-label" />
        {doc.sections.map((section, i) => (
          <div
            key={section.id}
            className={`tl-col tl-head${section.id === selectedId ? " selected" : ""}`}
            style={{ flexGrow: section.bars / total }}
            onClick={() => onSelect(section.id)}
          >
            <span className="tl-name">{section.name}</span>
            <span className="tl-bars">
              bar {sectionStartBar(doc, i)} · {section.bars}
              <button
                title="one bar shorter"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetBars(section.id, Math.max(1, section.bars - 1));
                }}
              >
                −
              </button>
              <button
                title="one bar longer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetBars(section.id, section.bars + 1);
                }}
              >
                +
              </button>
            </span>
          </div>
        ))}
        <button className="tl-add" title="add a section to the end" onClick={onAddSection}>
          +
        </button>
      </div>

      {doc.tracks.map((track) => (
        <div className="tl-row" key={track.id}>
          <div className="tl-label">{track.name}</div>
          {doc.sections.map((section, i) => {
            const explicit = section.cells[track.id];
            const { pattern, from } = resolveCell(doc, i, track);
            const inherited = pattern !== null && from !== null && from.id !== section.id;
            const kind = pattern === null ? "silent" : inherited ? "inherited" : "explicit";
            return (
              <div
                key={section.id}
                className={`tl-col tl-cell ${kind}${section.id === selectedId ? " selected" : ""}`}
                style={{ flexGrow: section.bars / total }}
                title={
                  track.codeOwned
                    ? "code-owned: plays as written in every section"
                    : inherited
                      ? `inherited from ${from!.name} — click to drop`
                      : pattern === null
                        ? "silent here — click to play"
                        : "click to inherit from the left"
                }
                onClick={() => {
                  if (track.codeOwned) return;
                  onSelect(section.id);
                  onSetCell(
                    section.id,
                    track.id,
                    cycle(explicit, pattern ?? `${track.defaultSound}*4`),
                  );
                }}
              >
                {track.codeOwned ? (
                  <span className="tl-code">code</span>
                ) : pattern === null ? (
                  <span className="tl-silent">—</span>
                ) : (
                  <code>{pattern}</code>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
