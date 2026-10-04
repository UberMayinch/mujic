/**
 * Cell inheritance resolution.
 *
 * A cell that inherits carries over whatever the section to its *left*
 * resolved to — transitively, so a pattern set in the intro still plays in the
 * chorus if nothing overrode it in between. This is the one extra concept the
 * grid model adds, so it lives in one file with its own tests.
 */

import type { ProjectDoc, Section, Track } from "./project";

export type Resolved = {
  /** The pattern actually playing, or null when the track is silent here. */
  pattern: string | null;
  /**
   * Which section the pattern came from. Equal to the section itself when the
   * cell is explicit; an earlier section when inherited. The UI uses this to
   * show "inherited from verse" rather than pretending the cell is empty.
   */
  from: Section | null;
};

/** What `track` plays during the section at `sectionIndex`. */
export function resolveCell(doc: ProjectDoc, sectionIndex: number, track: Track): Resolved {
  for (let i = sectionIndex; i >= 0; i -= 1) {
    const section = doc.sections[i];
    const cell = section?.cells[track.id];
    if (!cell || cell.kind === "inherit") continue;
    if (cell.kind === "silent") return { pattern: null, from: section };
    return { pattern: cell.pattern, from: section };
  }
  // Nothing to the left ever defined this track — it simply hasn't started yet.
  return { pattern: null, from: null };
}

/** Every track's resolved state for one section, in track order. */
export function resolveSection(
  doc: ProjectDoc,
  sectionIndex: number,
): { track: Track; resolved: Resolved }[] {
  return doc.tracks.map((track) => ({ track, resolved: resolveCell(doc, sectionIndex, track) }));
}

/** Bar number (1-based) on which a section starts. */
export function sectionStartBar(doc: ProjectDoc, sectionIndex: number): number {
  return doc.sections.slice(0, sectionIndex).reduce((sum, s) => sum + s.bars, 1);
}

export function totalBars(doc: ProjectDoc): number {
  return doc.sections.reduce((sum, s) => sum + s.bars, 0);
}
