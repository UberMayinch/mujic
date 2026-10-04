/**
 * Project initialization, saving, and loading.
 *
 * A mujic project is a *repository*: the document plus its whole commit graph,
 * carried together. That's the point of the version model — a project you can
 * hand someone is not "the current arrangement", it's every take you kept and
 * the branches you tried. Export writes exactly that, in one JSON file.
 *
 * Autosave goes to localStorage because it must be synchronous and instant on
 * every edit. Recorded audio is the one thing that doesn't reliably fit there —
 * see `save()` for what happens when it doesn't.
 */

import { initHistory, reserveCommitIds, type History } from "./history";
import { reserveIds, starterProject, type ProjectDoc } from "./project";

/** Bumped when the on-disk shape changes in a way `migrate` has to handle. */
export const FILE_VERSION = 1;

export type ProjectFile = {
  fileVersion: number;
  id: string;
  name: string;
  savedAt: number;
  doc: ProjectDoc;
  history: History;
};

export type ProjectSummary = {
  id: string;
  name: string;
  savedAt: number;
  /** False when the saved copy had to drop its audio to fit — see `save()`. */
  complete: boolean;
};

const INDEX_KEY = "mujic.projects";
const projectKey = (id: string) => `mujic.project.${id}`;

/* --------------------------------------------------------------------- init */

/**
 * Start a new project — the `git init` of the app.
 *
 * The initial commit is made here rather than on first edit, so a project's
 * history always has a root to diff against and to restore back to.
 */
export function initProject(name: string): ProjectFile {
  const doc = starterProject(name.trim() || "untitled");
  return {
    fileVersion: FILE_VERSION,
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: doc.name,
    savedAt: Date.now(),
    doc,
    history: initHistory(doc, "initial"),
  };
}

/* ------------------------------------------------------------------ storage */

function readIndex(): ProjectSummary[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: ProjectSummary[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    /* index is a convenience; losing it must not break saving the project */
  }
}

export function listProjects(): ProjectSummary[] {
  return readIndex().sort((a, b) => b.savedAt - a.savedAt);
}

/** Strip recorded audio, keeping every take's metadata so the UI can explain the gap. */
function withoutAudio(doc: ProjectDoc): ProjectDoc {
  const takes = Object.fromEntries(
    Object.entries(doc.takes ?? {}).map(([id, take]) => [id, { ...take, audio: "" }]),
  );
  return { ...doc, takes };
}

export type SaveResult = { ok: true; complete: boolean } | { ok: false; error: string };

/**
 * Save a project to local storage.
 *
 * Recorded takes are data URLs, and a couple of bars of audio can be larger
 * than the whole localStorage quota. Rather than failing the save — which
 * would lose the arrangement as well as the audio — we retry without the audio
 * and report it, so the UI can tell the user their takes live only in an
 * exported file. Silently dropping a vocal would be much worse than saying so.
 */
export function save(file: ProjectFile): SaveResult {
  const store = (doc: ProjectDoc) =>
    localStorage.setItem(
      projectKey(file.id),
      JSON.stringify({ ...file, doc, savedAt: Date.now(), name: doc.name }),
    );

  let complete = true;
  try {
    store(file.doc);
  } catch {
    try {
      store(withoutAudio(file.doc));
      complete = false;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "could not save" };
    }
  }

  const entry: ProjectSummary = {
    id: file.id,
    name: file.doc.name,
    savedAt: Date.now(),
    complete,
  };
  writeIndex([entry, ...readIndex().filter((p) => p.id !== file.id)]);
  return { ok: true, complete };
}

export function load(id: string): ProjectFile | null {
  try {
    const raw = localStorage.getItem(projectKey(id));
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function remove(id: string): void {
  try {
    localStorage.removeItem(projectKey(id));
  } catch {
    /* nothing to do — the index entry goes either way */
  }
  writeIndex(readIndex().filter((p) => p.id !== id));
}

/* --------------------------------------------------------- files and import */

/**
 * Bring a parsed file up to the current shape.
 *
 * v2 documents predate takes and project names, and their tracks and sections
 * were minted from the same id counter this session will reuse — so `reserveIds`
 * runs on everything that comes in from outside, not just old files.
 */
export function migrate(input: unknown): ProjectFile {
  const file = input as ProjectFile;
  if (!file?.doc) throw new Error("not a mujic project file");

  const doc: ProjectDoc = {
    ...file.doc,
    version: 3,
    name: file.doc.name ?? file.name ?? "untitled",
    takes: file.doc.takes ?? {},
  };

  // Both id counters have to be reserved: tracks/sections/takes live on the
  // document, commits live on the history, and each has its own counter that
  // restarts at zero on page load.
  reserveIds(doc);
  const history = file.history ?? initHistory(doc, "imported");
  reserveCommitIds(history);

  return {
    fileVersion: FILE_VERSION,
    id: file.id ?? `p${Date.now().toString(36)}`,
    name: doc.name,
    savedAt: file.savedAt ?? Date.now(),
    doc,
    history,
  };
}

export function serialize(file: ProjectFile): string {
  return JSON.stringify({ ...file, fileVersion: FILE_VERSION }, null, 2);
}

export function parse(text: string): ProjectFile {
  return migrate(JSON.parse(text));
}

/** A filename that won't fight the OS: lowercase, no spaces or punctuation. */
export function fileName(doc: ProjectDoc): string {
  const slug = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "project"}.mujic.json`;
}
