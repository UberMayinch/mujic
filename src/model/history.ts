/**
 * Git-like version control over the project document.
 *
 * This is close to free for us, and it's the thing DAW version control has
 * always failed at. Git-for-DAWs breaks because a project is opaque binary and
 * the payload is huge undiffable audio. Our document is small structured JSON
 * and the audio is *generated* from it — so commits are tiny, diffs are
 * meaningful, and branching a section is just copying an object.
 *
 * Deliberately simpler than git: no detached HEAD, no merge, no rebase.
 * Restoring an old version appends a new commit rather than rewriting history,
 * so nothing a musician does here can ever lose work.
 */

import { resolveCell } from "./arrange";
import type { ProjectDoc } from "./project";

export type Commit = {
  id: string;
  parent: string | null;
  branch: string;
  message: string;
  at: number;
  doc: ProjectDoc;
};

export type History = {
  commits: Record<string, Commit>;
  /** Branch name → id of its head commit. */
  branches: Record<string, string>;
  current: string;
};

let counter = 0;
const nextId = () => `c${(counter += 1)}`;

export const MAIN = "main";

/**
 * Push the commit counter past every id in a loaded history.
 *
 * Same hazard as `reserveIds` in project.ts, and reachable the moment projects
 * became loadable: the counter restarts at zero on every page load, so opening
 * a saved project and saving one version mints `c1` — an id the graph already
 * uses. The new commit overwrites the root *and* lists itself as its own
 * parent, and `log()` then walks that cycle forever.
 */
export function reserveCommitIds(history: History): void {
  for (const id of Object.keys(history.commits ?? {})) {
    const n = Number(id.replace(/^c/, ""));
    if (Number.isFinite(n) && n > counter) counter = n;
  }
}

export function initHistory(doc: ProjectDoc, message = "initial"): History {
  const id = nextId();
  const commit: Commit = { id, parent: null, branch: MAIN, message, at: Date.now(), doc };
  return { commits: { [id]: commit }, branches: { [MAIN]: id }, current: MAIN };
}

export function head(history: History): Commit {
  return history.commits[history.branches[history.current]];
}

export function commit(history: History, doc: ProjectDoc, message: string): History {
  const id = nextId();
  const entry: Commit = {
    id,
    parent: history.branches[history.current] ?? null,
    branch: history.current,
    message,
    at: Date.now(),
    doc,
  };
  return {
    ...history,
    commits: { ...history.commits, [id]: entry },
    branches: { ...history.branches, [history.current]: id },
  };
}

/** Fork the current head into a new branch and switch to it. */
export function createBranch(history: History, name: string): History | { error: string } {
  const clean = name.trim();
  if (!clean) return { error: "a branch needs a name" };
  if (history.branches[clean]) return { error: `branch "${clean}" already exists` };
  return {
    ...history,
    branches: { ...history.branches, [clean]: history.branches[history.current] },
    current: clean,
  };
}

export function switchBranch(history: History, name: string): History | { error: string } {
  if (!history.branches[name]) return { error: `no branch "${name}"` };
  return { ...history, current: name };
}

/**
 * Bring an old version back as a *new* commit on the current branch.
 * History is append-only — the version you left is still reachable.
 */
export function restore(history: History, commitId: string): History | { error: string } {
  const target = history.commits[commitId];
  if (!target) return { error: "no such version" };
  return commit(history, target.doc, `restore “${target.message}”`);
}

/** Commits on the current branch, newest first, walking parents from the head. */
export function log(history: History): Commit[] {
  const out: Commit[] = [];
  let cursor: Commit | undefined = head(history);
  while (cursor) {
    out.push(cursor);
    cursor = cursor.parent ? history.commits[cursor.parent] : undefined;
  }
  return out;
}

/** Where two branches last shared a commit — what a diff should compare against. */
export function mergeBase(history: History, a: string, b: string): Commit | null {
  const ancestry = new Set<string>();
  let cursor: Commit | undefined = history.commits[history.branches[a]];
  while (cursor) {
    ancestry.add(cursor.id);
    cursor = cursor.parent ? history.commits[cursor.parent] : undefined;
  }
  cursor = history.commits[history.branches[b]];
  while (cursor) {
    if (ancestry.has(cursor.id)) return cursor;
    cursor = cursor.parent ? history.commits[cursor.parent] : undefined;
  }
  return null;
}

/**
 * Readable structural diff between two documents.
 *
 * Compares *explicit* cells rather than resolved ones: changing the verse would
 * otherwise cascade a change line into every section that inherits from it,
 * which reads as noise rather than as what you actually did.
 */
export function diffDocs(before: ProjectDoc, after: ProjectDoc): string[] {
  const lines: string[] = [];

  if (before.bpm !== after.bpm) lines.push(`bpm ${before.bpm} → ${after.bpm}`);

  const beforeTracks = new Map(before.tracks.map((t) => [t.id, t]));
  const afterTracks = new Map(after.tracks.map((t) => [t.id, t]));

  for (const track of after.tracks) {
    if (!beforeTracks.has(track.id)) lines.push(`+ track “${track.name}”`);
  }
  for (const track of before.tracks) {
    if (!afterTracks.has(track.id)) lines.push(`− track “${track.name}”`);
  }
  for (const track of after.tracks) {
    const old = beforeTracks.get(track.id);
    if (!old) continue;
    if (old.name !== track.name) lines.push(`track “${old.name}” renamed to “${track.name}”`);
    if (old.gain !== track.gain) lines.push(`${track.name} gain ${old.gain} → ${track.gain}`);
    if (old.muted !== track.muted) lines.push(`${track.name} ${track.muted ? "muted" : "unmuted"}`);
    if (old.soloed !== track.soloed) lines.push(`${track.name} solo ${track.soloed ? "on" : "off"}`);
    if (old.codeOwned !== track.codeOwned) {
      lines.push(`${track.name} ${track.codeOwned ? "became code-owned" : "reverted to controls"}`);
    }
  }

  const beforeSections = new Map(before.sections.map((s) => [s.id, s]));
  const afterSections = new Map(after.sections.map((s) => [s.id, s]));

  for (const section of after.sections) {
    if (!beforeSections.has(section.id)) lines.push(`+ section “${section.name}” (${section.bars} bars)`);
  }
  for (const section of before.sections) {
    if (!afterSections.has(section.id)) lines.push(`− section “${section.name}”`);
  }

  /**
   * The cell's own state, ignoring what it resolves to. Two cells that both
   * inherit are unchanged *here* even if the pattern upstream moved — that
   * edit is attributed to the section where it was actually made.
   */
  const explicitKind = (doc: ProjectDoc, sectionIndex: number, trackId: string): string => {
    const cell = doc.sections[sectionIndex]?.cells[trackId];
    if (!cell || cell.kind === "inherit") return "inherit";
    return cell.kind === "silent" ? "silent" : `pattern:${cell.pattern}`;
  };

  const describe = (doc: ProjectDoc, sectionIndex: number, trackId: string): string => {
    const section = doc.sections[sectionIndex];
    const cell = section?.cells[trackId];
    if (!cell || cell.kind === "inherit") {
      const track = doc.tracks.find((t) => t.id === trackId);
      const resolved = track ? resolveCell(doc, sectionIndex, track) : null;
      return resolved?.pattern ? `inherited (${resolved.pattern})` : "inherited (silent)";
    }
    return cell.kind === "silent" ? "silent" : cell.pattern;
  };

  after.sections.forEach((section, index) => {
    const old = beforeSections.get(section.id);
    if (!old) return;
    if (old.bars !== section.bars) lines.push(`${section.name}: ${old.bars} → ${section.bars} bars`);

    const oldIndex = before.sections.findIndex((s) => s.id === section.id);
    for (const track of after.tracks) {
      if (!beforeTracks.has(track.id)) continue;
      if (explicitKind(before, oldIndex, track.id) === explicitKind(after, index, track.id)) continue;
      const from = describe(before, oldIndex, track.id);
      const to = describe(after, index, track.id);
      if (from !== to) lines.push(`${section.name}/${track.name}: ${from} → ${to}`);
    }
  });

  return lines;
}
