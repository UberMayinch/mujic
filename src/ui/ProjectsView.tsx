/**
 * Project management: init, open, export, import.
 *
 * Export writes the whole repository — the document *and* its commit graph — so
 * a project you hand someone carries every version you kept, not just where you
 * happened to stop. That is the difference between sharing a song and sharing
 * the work, and it is only affordable because the whole thing is JSON.
 */

import { useRef, useState } from "react";
import {
  fileName,
  listProjects,
  parse,
  serialize,
  type ProjectFile,
  type ProjectSummary,
} from "../model/persist";

type Props = {
  file: ProjectFile;
  onNew: (name: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onImport: (file: ProjectFile) => void;
  onNote: (line: string) => void;
};

const when = (at: number): string =>
  new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function ProjectsView({ file, onNew, onOpen, onDelete, onImport, onNote }: Props) {
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Re-read on every render: saving happens outside this component, and a stale
  // list showing the wrong "last saved" is worse than a cheap synchronous read.
  const projects: ProjectSummary[] = listProjects();

  const exportFile = () => {
    const blob = new Blob([serialize(file)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName(file.doc);
    anchor.click();
    URL.revokeObjectURL(url);
    onNote(`↓ exported ${fileName(file.doc)}`);
  };

  const importFile = async (picked: File) => {
    try {
      onImport(parse(await picked.text()));
    } catch (error) {
      onNote(`✗ ${error instanceof Error ? error.message : "could not read that file"}`);
    }
  };

  return (
    <div className="history">
      <div>
        <h2>New project</h2>
        <div className="row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name it — “ninth street”"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onNew(name);
                setName("");
              }
            }}
          />
          <button
            className="on"
            onClick={() => {
              onNew(name);
              setName("");
            }}
          >
            Start
          </button>
        </div>
      </div>

      <div>
        <h2>This project</h2>
        <div className="row">
          <button onClick={exportFile}>↓ Export — arrangement, audio and history</button>
          <button onClick={() => input.current?.click()}>↑ Import a .mujic.json</button>
          <input
            ref={input}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void importFile(picked);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div>
        <h2>Saved on this browser</h2>
        {projects.length === 0 ? (
          <p className="hint">Nothing saved yet — projects autosave as you work.</p>
        ) : (
          <div className="projects">
            {projects.map((project) => (
              <div key={project.id} className="project-row">
                <b>{project.name}</b>
                {!project.complete && (
                  <span className="chip warn" title="Recorded audio was too large for browser storage">
                    audio not saved
                  </span>
                )}
                {project.id === file.id && <span className="chip signal">open</span>}
                <span className="when">{when(project.savedAt)}</span>
                <button
                  className="small"
                  disabled={project.id === file.id}
                  onClick={() => onOpen(project.id)}
                >
                  Open
                </button>
                <button
                  className="small danger"
                  disabled={project.id === file.id}
                  onClick={() => onDelete(project.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="hint" style={{ marginTop: "var(--s3)" }}>
          Autosave uses browser storage, which is limited and can be cleared by the browser
          without warning. Export is the copy that keeps your recorded takes — treat it as the
          real save.
        </p>
      </div>
    </div>
  );
}
