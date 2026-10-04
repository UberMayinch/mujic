import { useState } from "react";
import { diffDocs, head, log, mergeBase, type History } from "../model/history";
import type { ProjectDoc } from "../model/project";

type Props = {
  history: History;
  /** The working document — may be ahead of the branch head. */
  doc: ProjectDoc;
  onCommit: (message: string) => void;
  onBranch: (name: string) => void;
  onSwitch: (name: string) => void;
  onRestore: (commitId: string) => void;
};

const when = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function HistoryPanel({ history, doc, onCommit, onBranch, onSwitch, onRestore }: Props) {
  const [message, setMessage] = useState("");
  const [branchName, setBranchName] = useState("");
  const [comparing, setComparing] = useState<string | null>(null);

  const commits = log(history);
  const current = head(history);
  const uncommitted = diffDocs(current.doc, doc);
  const branches = Object.keys(history.branches);

  return (
    <div className="history">
      <section>
        <h2>branch</h2>
        <div className="row">
          <select value={history.current} onChange={(e) => onSwitch(e.target.value)}>
            {branches.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <input
            value={branchName}
            placeholder="new branch, e.g. halftime"
            onChange={(e) => setBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !branchName.trim()) return;
              onBranch(branchName.trim());
              setBranchName("");
            }}
          />
          <button
            disabled={!branchName.trim()}
            onClick={() => {
              onBranch(branchName.trim());
              setBranchName("");
            }}
          >
            branch from here
          </button>
        </div>
        {branches
          .filter((name) => name !== history.current)
          .map((name) => {
            const base = mergeBase(history, history.current, name);
            return (
              <p key={name} className="hint">
                <strong>{name}</strong>{" "}
                {base ? `diverged at “${base.message}”` : "shares no history"} —{" "}
                {diffDocs(history.commits[history.branches[name]].doc, doc).length} difference(s) from
                what you're hearing
              </p>
            );
          })}
      </section>

      <section>
        <h2>uncommitted</h2>
        {uncommitted.length === 0 ? (
          <p className="hint">Nothing changed since “{current.message}”.</p>
        ) : (
          <>
            <ul className="diff">
              {uncommitted.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <div className="row">
              <input
                value={message}
                placeholder={uncommitted[0]}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  onCommit(message.trim() || uncommitted[0]);
                  setMessage("");
                }}
              />
              {/* Empty message falls back to the first diff line — the reducer
                  already describes every edit in the user's own terms. */}
              <button
                className="primary"
                onClick={() => {
                  onCommit(message.trim() || uncommitted[0]);
                  setMessage("");
                }}
              >
                save version
              </button>
            </div>
          </>
        )}
      </section>

      <section>
        <h2>versions on {history.current}</h2>
        <ol className="commits">
          {commits.map((entry) => {
            const open = comparing === entry.id;
            const against = open ? diffDocs(entry.doc, doc) : [];
            return (
              <li key={entry.id} className={entry.id === current.id ? "commit current" : "commit"}>
                <div className="commit-head">
                  <span className="commit-msg">{entry.message}</span>
                  <span className="commit-at">{when(entry.at)}</span>
                  <button onClick={() => setComparing(open ? null : entry.id)}>
                    {open ? "hide" : "compare"}
                  </button>
                  <button onClick={() => onRestore(entry.id)} disabled={entry.id === current.id}>
                    restore
                  </button>
                </div>
                {open && (
                  <ul className="diff">
                    {against.length === 0 ? (
                      <li className="hint">identical to what you're hearing</li>
                    ) : (
                      against.map((line, i) => <li key={i}>{line}</li>)
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
