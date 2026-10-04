/**
 * Edit ops — the entire output surface of the LLM, and the unit of undo.
 *
 * Voice does not produce code. It produces ops against the document, which a
 * pure reducer applies. That gives us undo, showable diffs, and testability.
 *
 * Ops that touch a cell take an optional `section`. Omitted means "the section
 * being edited", so "make the hats sixteenths" keeps working while "in the
 * chorus, make the hats sixteenths" addresses a specific column.
 */

import {
  findSection,
  findTrack,
  makeSection,
  makeTrack,
  type Cell,
  type ProjectDoc,
  type Section,
  type TrackKind,
  type TrackParam,
} from "./project";

export type EditOp =
  // cell-level (arrangement)
  | { op: "set_pattern"; track: string; pattern: string; section?: string }
  | { op: "set_cell"; track: string; mode: "inherit" | "silent"; section?: string }
  // track-level (mix, spans the whole timeline)
  | { op: "set_param"; track: string; param: TrackParam; value: number }
  | { op: "toggle"; track: string; field: "muted" | "soloed"; value: boolean }
  | {
      op: "add_track";
      name: string;
      sound: string;
      pattern: string;
      section?: string;
      /** `note` for a melodic track ("c4 e4 g4"); defaults to a drum track. */
      kind?: TrackKind;
    }
  | { op: "remove_track"; track: string }
  // timeline-level
  | { op: "add_section"; name: string; bars: number; after?: string }
  | { op: "remove_section"; section: string }
  | { op: "set_section_bars"; section: string; bars: number }
  | { op: "set_bpm"; bpm: number };

export type ApplyResult = {
  doc: ProjectDoc;
  /** Human-readable diff lines, shown to the user instead of a code blob. */
  changes: string[];
  /** Ops that could not be applied, with the reason. */
  rejected: { op: EditOp; reason: string }[];
};

const PARAM_RANGES: Record<TrackParam, [number, number]> = {
  gain: [0, 1.5],
  room: [0, 1],
  lpf: [50, 20000],
  speed: [0.25, 4],
};

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

/** Pure reducer. Never mutates `doc`. */
export function applyOps(
  doc: ProjectDoc,
  ops: EditOp[],
  /** The section the user is looking at — the default target for cell edits. */
  defaultSectionId?: string,
): ApplyResult {
  let next: ProjectDoc = {
    ...doc,
    tracks: doc.tracks.map((t) => ({ ...t, fx: { ...t.fx } })),
    sections: doc.sections.map((s) => ({ ...s, cells: { ...s.cells } })),
  };
  const changes: string[] = [];
  const rejected: { op: EditOp; reason: string }[] = [];

  /** Which column a cell op targets: the named one, else the one being edited, else the last. */
  const targetSection = (ref?: string): Section | undefined => {
    if (ref) return findSection(next, ref);
    if (defaultSectionId) {
      const current = next.sections.find((s) => s.id === defaultSectionId);
      if (current) return current;
    }
    return next.sections[next.sections.length - 1];
  };

  const writeCell = (section: Section, trackId: string, cell: Cell) => {
    next = {
      ...next,
      sections: next.sections.map((s) =>
        s.id === section.id ? { ...s, cells: { ...s.cells, [trackId]: cell } } : s,
      ),
    };
  };

  for (const op of ops) {
    switch (op.op) {
      case "set_bpm": {
        if (!Number.isFinite(op.bpm) || op.bpm < 20 || op.bpm > 300) {
          rejected.push({ op, reason: `bpm ${op.bpm} out of range (20-300)` });
          break;
        }
        changes.push(`bpm: ${next.bpm} → ${op.bpm}`);
        next = { ...next, bpm: op.bpm };
        break;
      }

      case "add_section": {
        if (!Number.isFinite(op.bars) || op.bars < 1 || op.bars > 256) {
          rejected.push({ op, reason: `bars ${op.bars} out of range (1-256)` });
          break;
        }
        const section = makeSection({ name: op.name, bars: op.bars });
        const afterIndex = op.after ? next.sections.findIndex((s) => s.id === findSection(next, op.after!)?.id) : -1;
        const at = afterIndex >= 0 ? afterIndex + 1 : next.sections.length;
        const sections = [...next.sections];
        sections.splice(at, 0, section);
        next = { ...next, sections };
        changes.push(`+ section "${op.name}" (${op.bars} bars)`);
        break;
      }

      case "remove_section": {
        const section = findSection(next, op.section);
        if (!section) {
          rejected.push({ op, reason: `no section matching "${op.section}"` });
          break;
        }
        if (next.sections.length === 1) {
          rejected.push({ op, reason: "can't remove the only section" });
          break;
        }
        next = { ...next, sections: next.sections.filter((s) => s.id !== section.id) };
        changes.push(`- section "${section.name}"`);
        break;
      }

      case "set_section_bars": {
        const section = findSection(next, op.section);
        if (!section) {
          rejected.push({ op, reason: `no section matching "${op.section}"` });
          break;
        }
        if (!Number.isFinite(op.bars) || op.bars < 1 || op.bars > 256) {
          rejected.push({ op, reason: `bars ${op.bars} out of range (1-256)` });
          break;
        }
        changes.push(`${section.name}: ${section.bars} → ${op.bars} bars`);
        next = {
          ...next,
          sections: next.sections.map((s) => (s.id === section.id ? { ...s, bars: op.bars } : s)),
        };
        break;
      }

      case "add_track": {
        const section = targetSection(op.section);
        if (!section) {
          rejected.push({ op, reason: "the project has no sections to add a track to" });
          break;
        }
        const track = makeTrack({
          name: op.name,
          defaultSound: op.sound,
          kind: op.kind ?? "sample",
        });
        next = { ...next, tracks: [...next.tracks, track] };
        writeCell(section, track.id, { kind: "pattern", pattern: op.pattern });
        changes.push(`+ track "${op.name}" in ${section.name}: ${op.pattern}`);
        break;
      }

      case "remove_track": {
        const track = findTrack(next, op.track);
        if (!track) {
          rejected.push({ op, reason: `no track matching "${op.track}"` });
          break;
        }
        next = {
          ...next,
          tracks: next.tracks.filter((t) => t.id !== track.id),
          sections: next.sections.map((s) => {
            const { [track.id]: _dropped, ...cells } = s.cells;
            return { ...s, cells };
          }),
        };
        changes.push(`- track "${track.name}"`);
        break;
      }

      case "set_pattern":
      case "set_cell": {
        const track = findTrack(next, op.track);
        if (!track) {
          rejected.push({ op, reason: `no track matching "${op.track}"` });
          break;
        }
        if (track.codeOwned) {
          rejected.push({ op, reason: `"${track.name}" is code-owned — revert it or edit the code` });
          break;
        }
        const section = targetSection(op.section);
        if (!section) {
          rejected.push({ op, reason: op.section ? `no section matching "${op.section}"` : "no section to edit" });
          break;
        }
        if (op.op === "set_pattern") {
          writeCell(section, track.id, { kind: "pattern", pattern: op.pattern });
          changes.push(`${section.name}/${track.name}: \`${op.pattern}\``);
        } else {
          writeCell(section, track.id, { kind: op.mode });
          changes.push(
            `${section.name}/${track.name}: ${op.mode === "silent" ? "silent (drop)" : "inherits from the left"}`,
          );
        }
        break;
      }

      case "set_param":
      case "toggle": {
        const track = findTrack(next, op.track);
        if (!track) {
          rejected.push({ op, reason: `no track matching "${op.track}"` });
          break;
        }
        if (track.codeOwned) {
          rejected.push({ op, reason: `"${track.name}" is code-owned — revert it or edit the code` });
          break;
        }
        const updated = { ...track, fx: { ...track.fx } };
        if (op.op === "set_param") {
          const range = PARAM_RANGES[op.param];
          if (!range) {
            rejected.push({ op, reason: `unknown param "${op.param}"` });
            break;
          }
          const value = clamp(op.value, range);
          const before = op.param === "gain" ? track.gain : track.fx[op.param];
          changes.push(`${track.name}.${op.param}: ${before ?? "—"} → ${value}`);
          if (op.param === "gain") updated.gain = value;
          else updated.fx[op.param] = value;
        } else {
          if (op.field !== "muted" && op.field !== "soloed") {
            rejected.push({ op, reason: `unknown toggle field "${(op as { field: string }).field}"` });
            break;
          }
          changes.push(`${track.name}.${op.field}: ${track[op.field]} → ${op.value}`);
          updated[op.field] = op.value;
        }
        next = { ...next, tracks: next.tracks.map((t) => (t.id === track.id ? updated : t)) };
        break;
      }

      default:
        // Closed set: anything outside it is rejected rather than written blindly.
        rejected.push({ op, reason: `unknown op "${(op as { op: string }).op}"` });
    }
  }

  return { doc: next, changes, rejected };
}
