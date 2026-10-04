/**
 * The canonical project document — the single source of truth.
 *
 * v2 shape: tracks are rows, sections are columns, and a **cell** holds what a
 * track plays during a section. A cell can inherit from the section to its
 * left, which is what keeps "the kick is the same all the way through" from
 * being copied into every column.
 *
 * Strudel code is generated from this, never parsed back into it.
 * See docs/ARCHITECTURE.md.
 */

export type TrackParam = "gain" | "room" | "lpf" | "speed";

/**
 * What a track plays during one section.
 * - absent / `inherit` — carry over whatever the previous section resolved to
 * - `pattern`          — an explicit pattern for this section
 * - `silent`           — deliberately not playing here (a drop)
 */
export type Cell = { kind: "inherit" } | { kind: "silent" } | { kind: "pattern"; pattern: string };

/**
 * How a track's patterns are read.
 * - `sample` — the pattern names drum samples: `"bd*4"` → `s("bd*4")`
 * - `note`   — the pattern names pitches: `"c4 e4 g4"` → `note("c4 e4 g4").sound(…)`
 * - `take`   — a recorded audio take, played back as the user's own voice
 */
export type TrackKind = "sample" | "note" | "take";

/**
 * A recorded vocal take: the actual audio, kept *beside* the symbolic notes
 * rather than replacing them.
 *
 * This is the one opaque blob in an otherwise fully structured document, and it
 * is deliberately not canonical — see docs/ARCHITECTURE.md § Melody. Notes stay
 * diffable and voice-editable; the take is a reference layer you can hear.
 * A diff can only ever say "take 3 → take 4", which is why nothing but audio is
 * allowed to live here.
 */
export type Take = {
  id: string;
  /**
   * The audio itself, as a data URL. Data rather than an object URL because a
   * take has to survive save/reload, and an object URL dies with the page.
   */
  audio: string;
  /** Length in bars, at the tempo it was recorded at. */
  bars: number;
  /**
   * The tempo the performance was captured at. When the document's bpm moves
   * away from this, the take no longer lines up — the UI says so rather than
   * silently re-pitching or smearing it.
   */
  recordedBpm: number;
  /** Downsampled amplitude envelope, for drawing the waveform without decoding. */
  peaks: number[];
  /**
   * Leading silence, as a fraction of the whole take.
   *
   * Stored rather than trimmed so that snapping stays reversible: `snapStart`
   * offsets *playback* into the audio instead of cutting the file, which means
   * turning it off gives you back exactly what the microphone heard.
   */
  lead: number;
  createdAt: number;
};

/** Per-track playback options for a recorded take. Both refinements ship off. */
export type TakeSettings = {
  takeId: string;
  /** Align the take's start to the bar line. On by default; the only "quantize" that leaves the performance alone. */
  snapStart: boolean;
  /**
   * Resample the take so its length matches the current tempo. This **re-pitches**
   * it — the way speeding up a turntable does — because true time-stretching needs
   * a phase vocoder mujic does not ship. Off by default, and labelled honestly.
   */
  fitTempo: boolean;
};

export type Track = {
  id: string;
  /** Voice-addressable handle: "kick", "hats", "bass". */
  name: string;
  kind: TrackKind;
  /**
   * For `sample` tracks: the drum this track reaches for when a *new* pattern
   * is written for it (patterns carry their own sound name, so codegen doesn't
   * read it). For `note` tracks: the instrument the melody is played on, which
   * codegen *does* read.
   */
  defaultSound: string;
  /** Mix state is track-level and spans the whole timeline — it's a performance control, not arrangement. */
  gain: number;
  muted: boolean;
  soloed: boolean;
  fx: { room?: number; lpf?: number; speed?: number };
  /**
   * True once the user hand-edits this track's code in the REPL. Its GUI
   * controls go read-only and codegen emits `code` verbatim **in every
   * section** — hand-written code opts out of the arrangement grid. Reverting
   * clears the flag.
   */
  codeOwned: boolean;
  code?: string;
  /** Set only on `take` tracks: which recording plays, and how faithfully. */
  take?: TakeSettings;
};

export type Section = {
  id: string;
  /** Voice-addressable handle: "intro", "verse", "chorus". */
  name: string;
  /** Length in bars. One bar == one Strudel cycle. */
  bars: number;
  /** Keyed by track id. A missing entry means inherit. */
  cells: Record<string, Cell>;
};

export type ProjectDoc = {
  version: 3;
  /** Shown in the title bar and used as the default export filename. */
  name: string;
  bpm: number;
  tracks: Track[];
  /** Ordered — this *is* the timeline. */
  sections: Section[];
  /** Recorded audio, keyed by take id. Referenced by `take` tracks. */
  takes: Record<string, Take>;
};

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}${(idCounter += 1)}`;

export function newTrackId(): string {
  return nextId("t");
}

export function newTakeId(): string {
  return nextId("take");
}

/**
 * Push the id counter past every id in a loaded document.
 *
 * Ids are generated from a module-level counter that restarts at zero on every
 * page load. Without this, opening a saved project and adding one track mints
 * `t1` — an id the document is already using — and the new track silently
 * inherits the old one's cells.
 */
export function reserveIds(doc: ProjectDoc): void {
  const ids = [
    ...doc.tracks.map((t) => t.id),
    ...doc.sections.map((s) => s.id),
    ...Object.keys(doc.takes ?? {}),
  ];
  for (const id of ids) {
    const n = Number(id.replace(/^[a-z]+/, ""));
    if (Number.isFinite(n) && n > idCounter) idCounter = n;
  }
}

export function makeTrack(
  partial: Partial<Track> & Pick<Track, "name" | "defaultSound">,
): Track {
  return {
    id: newTrackId(),
    kind: "sample",
    gain: 0.8,
    muted: false,
    soloed: false,
    fx: {},
    codeOwned: false,
    ...partial,
  };
}

export function makeSection(
  partial: Partial<Section> & Pick<Section, "name">,
): Section {
  return { id: nextId("s"), bars: 8, cells: {}, ...partial };
}

/** A starting arrangement, so the first voice command has something to act on. */
export function starterProject(name = "untitled"): ProjectDoc {
  const kick = makeTrack({ name: "kick", defaultSound: "bd" });
  const hats = makeTrack({ name: "hats", defaultSound: "hh", gain: 0.5 });
  const snare = makeTrack({ name: "snare", defaultSound: "sd" });

  return {
    version: 3,
    name,
    bpm: 120,
    takes: {},
    tracks: [kick, hats, snare],
    sections: [
      makeSection({
        name: "intro",
        bars: 4,
        cells: {
          [kick.id]: { kind: "pattern", pattern: "bd*4" },
          [hats.id]: { kind: "silent" },
          [snare.id]: { kind: "silent" },
        },
      }),
      makeSection({
        name: "verse",
        bars: 8,
        cells: {
          // kick inherits from intro
          [hats.id]: { kind: "pattern", pattern: "hh*8" },
          [snare.id]: { kind: "pattern", pattern: "~ sd ~ sd" },
        },
      }),
    ],
  };
}

/** Resolve a spoken track reference ("the hats") to a track. */
export function findTrack(doc: ProjectDoc, ref: string): Track | undefined {
  const needle = ref.trim().toLowerCase();
  return (
    doc.tracks.find((t) => t.id === ref) ??
    doc.tracks.find((t) => t.name.toLowerCase() === needle) ??
    doc.tracks.find((t) => needle.includes(t.name.toLowerCase()))
  );
}

/** Resolve a spoken section reference ("the chorus") to a section. */
export function findSection(doc: ProjectDoc, ref: string): Section | undefined {
  const needle = ref.trim().toLowerCase();
  return (
    doc.sections.find((s) => s.id === ref) ??
    doc.sections.find((s) => s.name.toLowerCase() === needle) ??
    doc.sections.find((s) => needle.includes(s.name.toLowerCase()))
  );
}
