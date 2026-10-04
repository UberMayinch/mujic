/**
 * Stems: slices of a project that can be shared, priced, and dropped into
 * someone else's arrangement.
 *
 * A stem is **pattern JSON, not audio** — a few tracks and what they play over
 * one section. That's the whole reason this can exist as a marketplace at all:
 * a stem is a couple of kilobytes, it diffs, it stays editable by voice after
 * you buy it, and there is no storage, transcoding, or licensing tail behind it.
 * You are buying the schematic, not the pressing.
 *
 * Recorded takes are deliberately excluded. Selling someone's voice is a
 * different product with different consent questions, and it would drag opaque
 * audio into the one part of the system that is entirely structured.
 */

import { resolveCell } from "./arrange";
import { makeTrack, type ProjectDoc, type Track, type TrackKind } from "./project";

export type StemTrack = {
  name: string;
  kind: TrackKind;
  defaultSound: string;
  gain: number;
  fx: Track["fx"];
  /** What this track actually plays in the captured section. */
  pattern: string;
};

export type Stem = {
  id: string;
  title: string;
  seller: string;
  /** Integer cents. Zero means free, which the shelf shows as "Free". */
  priceCents: number;
  bpm: number;
  bars: number;
  /** Musical key, or "—" for drums and anything unpitched. */
  key: string;
  /** Shelf category, drawn on the disc label: DRUMS, KEYS, BASS, KIT, FULL. */
  tag: string;
  tracks: StemTrack[];
};

export const formatPrice = (cents: number): string =>
  cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)}`;

/** Tracks a stem may contain: anything structured, which is everything but a take. */
export function sellableTracks(doc: ProjectDoc): Track[] {
  return doc.tracks.filter((t) => t.kind !== "take");
}

/**
 * Capture the given tracks, as they play in one section, as a sellable stem.
 *
 * Cells are resolved rather than copied: a track inheriting its pattern from an
 * earlier section would otherwise export as empty, which is the single most
 * confusing thing a stem could do.
 */
export function extractStem(
  doc: ProjectDoc,
  sectionIndex: number,
  trackIds: string[],
  meta: Pick<Stem, "title" | "seller" | "priceCents" | "key" | "tag"> & { id?: string },
): Stem {
  const section = doc.sections[sectionIndex];
  const wanted = new Set(trackIds);

  const tracks = sellableTracks(doc)
    .filter((t) => wanted.has(t.id))
    .flatMap<StemTrack>((track) => {
      const { pattern } = resolveCell(doc, sectionIndex, track);
      if (!pattern) return [];
      return [
        {
          name: track.name,
          kind: track.kind,
          defaultSound: track.defaultSound,
          gain: track.gain,
          fx: { ...track.fx },
          pattern,
        },
      ];
    });

  return {
    id: meta.id ?? `MJ-${Math.floor(Math.random() * 900 + 100)}`,
    title: meta.title.trim() || "untitled stem",
    seller: meta.seller.trim() || "anonymous",
    priceCents: Math.max(0, Math.round(meta.priceCents)),
    bpm: doc.bpm,
    bars: section?.bars ?? 8,
    key: meta.key.trim() || "—",
    tag: meta.tag.trim().toUpperCase() || "STEM",
    tracks,
  };
}

/**
 * Drop a stem's tracks into a section of this document.
 *
 * The tracks arrive as ordinary tracks with ordinary cells — explicit in the
 * target section and silent everywhere else, so a bought stem lands where you
 * were looking instead of bleeding across the whole song. After this it is
 * indistinguishable from something you made, which is the point: it stays
 * voice-editable, diffable, and yours.
 *
 * Names are de-duplicated because they are how voice addresses a track: two
 * tracks called "kick" would make "drop the kick" ambiguous.
 */
export function insertStem(doc: ProjectDoc, stem: Stem, sectionId: string): ProjectDoc {
  const taken = new Set(doc.tracks.map((t) => t.name.toLowerCase()));
  const uniqueName = (name: string): string => {
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n += 1) {
      const candidate = `${name} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  };

  const added = stem.tracks.map((source) => {
    const name = uniqueName(source.name);
    taken.add(name.toLowerCase());
    return {
      track: makeTrack({
        name,
        kind: source.kind,
        defaultSound: source.defaultSound,
        gain: source.gain,
        fx: { ...source.fx },
      }),
      pattern: source.pattern,
    };
  });

  return {
    ...doc,
    tracks: [...doc.tracks, ...added.map((a) => a.track)],
    sections: doc.sections.map((section) => {
      const cells = { ...section.cells };
      for (const { track, pattern } of added) {
        cells[track.id] =
          section.id === sectionId ? { kind: "pattern", pattern } : { kind: "silent" };
      }
      return { ...section, cells };
    }),
  };
}
