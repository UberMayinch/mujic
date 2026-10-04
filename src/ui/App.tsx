import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateCode } from "../model/codegen";
import { applyOps, type EditOp } from "../model/ops";
import { type Cell, type ProjectDoc } from "../model/project";
import { normalizeTranscript } from "../voice/glossary";
import { forgetTakes, play, stop } from "../audio/engine";
import { VoiceBar } from "./VoiceBar";
import { ReplView } from "./ReplView";
import { StemView } from "./StemView";
import { Timeline } from "./Timeline";
import { TapIn } from "./TapIn";
import { SingIn } from "./SingIn";
import { HistoryPanel } from "./HistoryPanel";
import { ShopView } from "./ShopView";
import { ProjectsView } from "./ProjectsView";
import { insertStem, type Stem } from "../model/stem";
import {
  initProject,
  listProjects,
  load as loadProject,
  remove as removeProject,
  save as saveProject,
  type ProjectFile,
} from "../model/persist";
import {
  commit as commitVersion,
  createBranch,
  head,
  restore,
  switchBranch,
} from "../model/history";

type View = "stems" | "repl" | "history" | "shop" | "projects";

/** Reopen the last project, or start a fresh one. Runs once, before first paint. */
function boot(): ProjectFile {
  const [latest] = listProjects();
  return (latest && loadProject(latest.id)) || initProject("untitled");
}

export function App() {
  const [file, setFile] = useState<ProjectFile>(boot);
  const { doc, history: versions } = file;

  // Two distinct notions of "back": `undoStack` is per-edit and cheap (for
  // typos); `versions` is the commit graph you deliberately save into.
  const [undoStack, setUndoStack] = useState<ProjectDoc[]>([]);
  const [view, setView] = useState<View>("stems");
  const [log, setLog] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bpmDraft, setBpmDraft] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<Stem[]>([]);

  const code = useMemo(() => generateCode(doc), [doc]);

  const note = useCallback((line: string) => setLog((prev) => [line, ...prev].slice(0, 40)), []);

  /* ------------------------------------------------------------ autosave */

  // Debounced so a slider drag doesn't serialize the document per frame.
  const warnedRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      const result = saveProject(file);
      if (!result.ok) return note(`✗ could not save: ${result.error}`);
      // Warn once per session: repeating it on every edit would be noise, but
      // never saying it would leave the user believing their vocal is stored.
      if (!result.complete && !warnedRef.current) {
        warnedRef.current = true;
        note("⚠ recorded audio is too large for browser storage — export to keep your takes");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [file, note]);

  /* ------------------------------------------------------------ the shelf */

  useEffect(() => {
    let live = true;
    fetch("/api/stems")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((payload) => live && setCatalogue(payload.stems ?? []))
      .catch(() => live && note("✗ the shop is offline — is the api running?"));
    return () => {
      live = false;
    };
  }, [note]);

  /* --------------------------------------------------------------- edits */

  // The selected section, falling back to the first — so a removed section
  // never leaves the editor pointing at nothing.
  const sectionIndex = useMemo(() => {
    const i = doc.sections.findIndex((s) => s.id === selectedId);
    return i >= 0 ? i : 0;
  }, [doc.sections, selectedId]);
  const currentSectionId = doc.sections[sectionIndex]?.id;

  const setDoc = useCallback(
    (next: ProjectDoc) => setFile((prev) => ({ ...prev, doc: next, name: next.name })),
    [],
  );

  /** Commit a new document and, if we're playing, re-evaluate immediately. */
  const commit = useCallback(
    async (next: ProjectDoc) => {
      setUndoStack((prev) => [doc, ...prev].slice(0, 50));
      setDoc(next);
      if (playing) {
        try {
          await play(generateCode(next), next);
        } catch (error) {
          note(`audio error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    },
    [doc, playing, note, setDoc],
  );

  /** Run ops through the reducer, targeting the section being edited by default. */
  const runOps = useCallback(
    async (ops: EditOp[]) => {
      const result = applyOps(doc, ops, currentSectionId);
      result.changes.forEach((change) => note(`  ${change}`));
      result.rejected.forEach(({ reason }) => note(`  ✗ ${reason}`));
      if (result.changes.length > 0) await commit(result.doc);
    },
    [doc, currentSectionId, commit, note],
  );

  const commitBpm = useCallback(() => {
    if (bpmDraft === null || bpmDraft === doc.bpm) {
      setBpmDraft(null);
      return;
    }
    const bpm = bpmDraft;
    setBpmDraft(null);
    void commit({ ...doc, bpm });
  }, [bpmDraft, doc, commit]);

  const undo = useCallback(async () => {
    const [previous, ...rest] = undoStack;
    if (!previous) return;
    setUndoStack(rest);
    setDoc(previous);
    if (playing) await play(generateCode(previous), previous);
    note("undo");
  }, [undoStack, playing, note, setDoc]);

  /** Swap in a document from the version graph, keeping playback in sync. */
  const loadDoc = useCallback(
    async (next: ProjectDoc, label: string) => {
      setUndoStack((prev) => [doc, ...prev].slice(0, 50));
      setDoc(next);
      if (playing) await play(generateCode(next), next);
      note(label);
    },
    [doc, playing, note, setDoc],
  );

  const togglePlay = useCallback(async () => {
    try {
      if (playing) {
        await stop();
        setPlaying(false);
      } else {
        await play(code, doc);
        setPlaying(true);
      }
    } catch (error) {
      note(`audio error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [playing, code, doc, note]);

  /** The vertical slice: transcript → normalize → ops → document → audio. */
  const handleTranscript = useCallback(
    async (raw: string) => {
      const transcript = normalizeTranscript(raw, [
        ...doc.tracks.map((t) => t.name),
        ...doc.sections.map((s) => s.name),
      ]);
      note(`🎙 "${transcript}"`);
      setBusy(true);
      try {
        const response = await fetch("/api/interpret", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, doc, sectionId: currentSectionId }),
        });
        const payload = await response.json();
        if (!response.ok) {
          note(`✗ ${payload.error ?? response.statusText}`);
          return;
        }
        if (payload.reply) note(`↪ ${payload.reply}`);
        if (payload.ops?.length) await runOps(payload.ops);
      } catch (error) {
        note(`✗ ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [doc, currentSectionId, runOps, note],
  );

  const setCell = useCallback(
    (sectionId: string, trackId: string, cell: Cell) =>
      void commit({
        ...doc,
        sections: doc.sections.map((s) =>
          s.id === sectionId ? { ...s, cells: { ...s.cells, [trackId]: cell } } : s,
        ),
      }),
    [doc, commit],
  );

  /* ------------------------------------------------------------ projects */

  const openFile = useCallback(
    (next: ProjectFile, label: string) => {
      // Two projects can each hold a take called `take1`; without forgetting,
      // this project's vocal would play the previous project's audio.
      forgetTakes();
      setFile(next);
      setUndoStack([]);
      setSelectedId(null);
      setView("stems");
      note(label);
      if (playing) void play(generateCode(next.doc), next.doc);
    },
    [playing, note],
  );

  /* ---------------------------------------------------------------- shop */

  const buy = useCallback(
    (stem: Stem) => {
      if (!currentSectionId) return note("✗ no section to add it to");
      void commit(insertStem(doc, stem, currentSectionId));
      note(`🛒 added “${stem.title}” to ${doc.sections[sectionIndex].name}`);
    },
    [doc, currentSectionId, sectionIndex, commit, note],
  );

  const publish = useCallback(
    async (stem: Stem) => {
      try {
        const response = await fetch("/api/stems", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stem),
        });
        const payload = await response.json();
        if (!response.ok) return note(`✗ ${payload.error ?? response.statusText}`);
        setCatalogue(payload.stems ?? []);
        note(`✓ “${stem.title}” is on the shelf`);
      } catch (error) {
        note(`✗ ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [note],
  );

  return (
    <div className="app">
      <header className="bar">
        <span className="brand">mujic</span>
        <input
          className="project-name"
          value={doc.name}
          aria-label="project name"
          onChange={(e) => setDoc({ ...doc, name: e.target.value })}
        />
        <button className={playing ? "primary on" : "primary"} onClick={() => void togglePlay()}>
          {playing ? "◼ stop" : "▶ play"}
        </button>
        <label className="bpm">
          {bpmDraft ?? doc.bpm} bpm
          {/* Dragging is local; only the release commits — otherwise one drag
              becomes dozens of undo entries and dozens of re-evaluations. */}
          <input
            type="range"
            min={60}
            max={200}
            value={bpmDraft ?? doc.bpm}
            onChange={(e) => setBpmDraft(Number(e.target.value))}
            onPointerUp={commitBpm}
            onKeyUp={commitBpm}
            onBlur={commitBpm}
          />
        </label>
        <button onClick={() => void undo()} disabled={undoStack.length === 0}>
          ↶ undo
        </button>
        <span className="chip signal" title="current version branch">
          ⑂ {versions.current}
        </span>
        <div className="views">
          {(
            [
              ["stems", "stems"],
              ["repl", "code"],
              ["history", "versions"],
              ["shop", "shop"],
              ["projects", "projects"],
            ] as [View, string][]
          ).map(([id, label]) => (
            <button key={id} className={view === id ? "on" : ""} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <Timeline
        doc={doc}
        selectedId={currentSectionId ?? null}
        onSelect={setSelectedId}
        onSetCell={setCell}
        onSetBars={(section, bars) => void runOps([{ op: "set_section_bars", section, bars }])}
        onAddSection={() =>
          void runOps([{ op: "add_section", name: `section ${doc.sections.length + 1}`, bars: 8 }])
        }
      />

      <main>
        {view === "stems" && (
          <StemView doc={doc} sectionIndex={sectionIndex} onChange={(next) => void commit(next)} />
        )}
        {view === "repl" && (
          <ReplView
            doc={doc}
            sectionIndex={sectionIndex}
            code={code}
            onChange={(next) => void commit(next)}
          />
        )}
        {view === "history" && (
          <HistoryPanel
            history={versions}
            doc={doc}
            onCommit={(message) => {
              setFile((prev) => ({ ...prev, history: commitVersion(prev.history, prev.doc, message) }));
              note(`✓ saved version “${message}”`);
            }}
            onBranch={(name) => {
              const result = createBranch(versions, name);
              if ("error" in result) return note(`✗ ${result.error}`);
              // Branch from what you're hearing, not from the last save.
              setFile((prev) => ({ ...prev, history: commitVersion(result, prev.doc, `branched “${name}”`) }));
              note(`⑂ branched “${name}”`);
            }}
            onSwitch={(name) => {
              const result = switchBranch(versions, name);
              if ("error" in result) return note(`✗ ${result.error}`);
              setFile((prev) => ({ ...prev, history: result }));
              void loadDoc(head(result).doc, `⑂ switched to “${name}”`);
            }}
            onRestore={(commitId) => {
              const result = restore(versions, commitId);
              if ("error" in result) return note(`✗ ${result.error}`);
              setFile((prev) => ({ ...prev, history: result }));
              void loadDoc(head(result).doc, `↩ ${head(result).message}`);
            }}
          />
        )}
        {view === "shop" && (
          <ShopView
            doc={doc}
            sectionIndex={sectionIndex}
            catalogue={catalogue}
            busy={busy}
            onBuy={buy}
            onPublish={(stem) => void publish(stem)}
          />
        )}
        {view === "projects" && (
          <ProjectsView
            file={file}
            onNew={(name) => openFile(initProject(name), `✓ started “${name || "untitled"}”`)}
            onOpen={(id) => {
              const next = loadProject(id);
              if (!next) return note("✗ could not open that project");
              openFile(next, `✓ opened “${next.doc.name}”`);
            }}
            onDelete={(id) => {
              removeProject(id);
              note("✓ deleted");
              setFile((prev) => ({ ...prev }));
            }}
            onImport={(next) => openFile(next, `✓ imported “${next.doc.name}”`)}
            onNote={note}
          />
        )}
      </main>

      <div className="input-row">
        <VoiceBar busy={busy} onTranscript={handleTranscript} onNote={note} />
        <div className="capture">
          <TapIn
            doc={doc}
            bars={1}
            disabled={busy}
            onApply={(ops) => void runOps(ops)}
            onNote={note}
          />
          <SingIn
            doc={doc}
            sectionId={currentSectionId}
            bars={2}
            disabled={busy}
            onChange={(next, label) => {
              void commit(next);
              note(label);
            }}
            onNote={note}
          />
        </div>
      </div>

      <section className="log">
        {log.length === 0 ? (
          <p className="hint">
            Hit play, then say something like “make the hats sixteenths” — or “in the chorus, drop the kick”.
          </p>
        ) : (
          log.map((line, i) => (
            <div key={i} className="log-line">
              {line}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
