/**
 * Deterministic ProjectDoc → Strudel code.
 *
 * One direction only. The same document always produces the same code, which
 * keeps codegen bugs reproducible and separate from LLM bugs.
 *
 * The timeline maps onto Strudel's native `arrange([cycles, pattern], ...)` —
 * one cycle is one bar — so we run no clock of our own.
 */

import { resolveCell } from "./arrange";
import type { ProjectDoc, Track } from "./project";

/** The Strudel sample name a recorded take is registered under. */
export function takeSampleName(takeId: string): string {
  return `mujic_${takeId}`;
}

/**
 * A recorded take plays as a one-shot sample, stretched across the bars it was
 * recorded over so it retriggers on its own boundary rather than every cycle.
 *
 * The audio is emitted untouched by default. `fitTempo` resamples it to match
 * the current tempo, which re-pitches it — there is no phase vocoder here, and
 * pretending otherwise would be the exact "too refined" failure the take layer
 * exists to avoid.
 */
function takeCode(track: Track, doc: ProjectDoc): string {
  const settings = track.take;
  const take = settings && doc.takes[settings.takeId];
  if (!settings || !take) return "silence";

  const parts = [`s("${takeSampleName(take.id)}")`];
  // Skip the run-up rather than cutting it: begin() is an offset into the
  // sample, so turning snapping off gives back exactly what the mic heard.
  if (settings.snapStart && take.lead > 0) parts.push(`.begin(${+take.lead.toFixed(4)})`);
  // One cycle is one bar, so a 2-bar take must span 2 cycles.
  if (take.bars !== 1) parts.push(`.slow(${take.bars})`);
  if (settings.fitTempo && take.recordedBpm > 0) {
    const ratio = +(doc.bpm / take.recordedBpm).toFixed(4);
    if (ratio !== 1) parts.push(`.speed(${ratio})`);
  }
  return parts.join("");
}

function trackCode(track: Track, pattern: string, doc: ProjectDoc): string {
  // Hand-written code opts out of the arrangement grid: it plays as written in
  // every section it appears in.
  if (track.codeOwned) return track.code ?? "silence";

  const parts = [
    track.kind === "take"
      ? takeCode(track, doc)
      : track.kind === "note"
        ? // Melodic tracks carry pitches, so the pattern goes to note() and the
          // instrument comes from the track rather than from the pattern text.
          `note("${pattern}").sound("${track.defaultSound}")`
        : `s("${pattern}")`,
  ];
  if (track.gain !== 1) parts.push(`.gain(${track.gain})`);
  if (track.fx.lpf !== undefined) parts.push(`.lpf(${track.fx.lpf})`);
  if (track.fx.room !== undefined) parts.push(`.room(${track.fx.room})`);
  if (track.fx.speed !== undefined) parts.push(`.speed(${track.fx.speed})`);
  return parts.join("");
}

/** The tracks audible in one section, honouring mute/solo and the resolver. */
function sectionLines(doc: ProjectDoc, sectionIndex: number): string[] {
  const soloed = doc.tracks.filter((t) => t.soloed);
  const eligible = (soloed.length > 0 ? soloed : doc.tracks).filter((t) => !t.muted);

  return eligible.flatMap((track) => {
    const { pattern } = resolveCell(doc, sectionIndex, track);
    // codeOwned tracks bypass the grid, so they play wherever they're not muted.
    if (pattern === null && !track.codeOwned) return [];
    return [`${trackCode(track, pattern ?? "", doc)}, // ${track.name}`];
  });
}

function stackOf(lines: string[], indent: string): string {
  if (lines.length === 0) return "silence";
  return [`stack(`, ...lines.map((l) => `${indent}  ${l}`), `${indent})`].join("\n");
}

export function generateCode(doc: ProjectDoc): string {
  // Strudel counts cycles per second; one cycle == one bar of 4 beats.
  const cps = +(doc.bpm / 60 / 4).toFixed(4);
  const out = [`setcps(${cps}) // ${doc.bpm} bpm`, ""];

  if (doc.sections.length === 0) {
    out.push("silence");
    return out.join("\n");
  }

  // A single section is just a loop — no need to wrap it in arrange().
  if (doc.sections.length === 1) {
    out.push(stackOf(sectionLines(doc, 0), ""));
    return out.join("\n");
  }

  out.push("arrange(");
  doc.sections.forEach((section, i) => {
    out.push(`  // ${section.name} — ${section.bars} bars`);
    out.push(`  [${section.bars}, ${stackOf(sectionLines(doc, i), "  ")}],`);
  });
  out.push(")");
  return out.join("\n");
}
