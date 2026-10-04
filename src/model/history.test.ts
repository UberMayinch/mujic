import { describe, expect, it } from "vitest";
import {
  MAIN,
  commit,
  createBranch,
  diffDocs,
  head,
  initHistory,
  log,
  mergeBase,
  restore,
  switchBranch,
  type History,
} from "./history";
import { applyOps } from "./ops";
import { starterProject, type ProjectDoc } from "./project";

const ok = <T>(value: T | { error: string }): T => {
  if (value && typeof value === "object" && "error" in (value as object)) {
    throw new Error((value as { error: string }).error);
  }
  return value as T;
};

const edit = (doc: ProjectDoc, pattern: string) =>
  applyOps(doc, [{ op: "set_pattern", track: "hats", pattern }], doc.sections[1].id).doc;

describe("history", () => {
  it("starts on main with one commit", () => {
    const history = initHistory(starterProject());
    expect(history.current).toBe(MAIN);
    expect(log(history)).toHaveLength(1);
  });

  it("records commits newest-first on the current branch", () => {
    const doc = starterProject();
    let history = initHistory(doc);
    history = commit(history, edit(doc, "hh*16"), "hats to sixteenths");

    expect(log(history).map((c) => c.message)).toEqual(["hats to sixteenths", "initial"]);
    expect(head(history).doc).not.toBe(doc);
  });

  it("branches fork from the current head and diverge independently", () => {
    const doc = starterProject();
    let history = initHistory(doc);
    history = commit(history, edit(doc, "hh*16"), "sixteenths");

    const mainHead = head(history).id;
    history = ok(createBranch(history, "halftime"));
    expect(history.current).toBe("halftime");

    history = commit(history, edit(doc, "hh*4"), "quarters instead");

    // The branch moved; main did not.
    expect(history.branches.halftime).not.toBe(mainHead);
    expect(history.branches[MAIN]).toBe(mainHead);
  });

  it("switching branches brings back that branch's document", () => {
    const doc = starterProject();
    let history = initHistory(doc);
    history = commit(history, edit(doc, "hh*16"), "sixteenths");
    history = ok(createBranch(history, "sparse"));
    history = commit(history, edit(doc, "hh*2"), "sparse hats");

    history = ok(switchBranch(history, MAIN));
    expect(head(history).message).toBe("sixteenths");
    history = ok(switchBranch(history, "sparse"));
    expect(head(history).message).toBe("sparse hats");
  });

  it("refuses duplicate branch names and unknown branches", () => {
    const history = initHistory(starterProject());
    expect(createBranch(history, MAIN)).toEqual({ error: 'branch "main" already exists' });
    expect(createBranch(history, "  ")).toEqual({ error: "a branch needs a name" });
    expect(switchBranch(history, "nope")).toEqual({ error: 'no branch "nope"' });
  });

  it("restore appends rather than rewriting, so nothing is lost", () => {
    const doc = starterProject();
    let history = initHistory(doc, "the good take");
    const original = head(history).id;
    history = commit(history, edit(doc, "hh*32"), "too busy");

    history = ok(restore(history, original));

    expect(head(history).doc).toBe(doc);
    // The version we walked away from is still in the log.
    expect(log(history).map((c) => c.message)).toEqual([
      "restore “the good take”",
      "too busy",
      "the good take",
    ]);
  });

  it("finds where two branches diverged", () => {
    const doc = starterProject();
    let history: History = initHistory(doc);
    history = commit(history, edit(doc, "hh*16"), "shared");
    const forkPoint = head(history).id;
    history = ok(createBranch(history, "alt"));
    history = commit(history, edit(doc, "hh*4"), "alt only");

    expect(mergeBase(history, MAIN, "alt")?.id).toBe(forkPoint);
  });
});

describe("diffDocs", () => {
  it("is empty for an unchanged document", () => {
    const doc = starterProject();
    expect(diffDocs(doc, doc)).toEqual([]);
  });

  it("reports tempo, cells, tracks and sections in musician's terms", () => {
    const before = starterProject();
    const after = applyOps(
      before,
      [
        { op: "set_bpm", bpm: 140 },
        { op: "set_pattern", track: "hats", pattern: "hh*16", section: "verse" },
        { op: "add_section", name: "chorus", bars: 8 },
        { op: "add_track", name: "bass", sound: "sawtooth", pattern: "bass(3,8)", section: "verse" },
      ],
      before.sections[1].id,
    ).doc;

    const lines = diffDocs(before, after);
    expect(lines).toContain("bpm 120 → 140");
    expect(lines).toContain("verse/hats: hh*8 → hh*16");
    expect(lines).toContain("+ section “chorus” (8 bars)");
    expect(lines).toContain("+ track “bass”");
  });

  it("names a drop as a drop", () => {
    const before = starterProject();
    const after = applyOps(
      before,
      [{ op: "set_cell", track: "kick", mode: "silent", section: "verse" }],
      before.sections[1].id,
    ).doc;

    expect(diffDocs(before, after)).toContain("verse/kick: inherited (bd*4) → silent");
  });

  it("does not cascade one edit into every inheriting section", () => {
    const before = applyOps(starterProject(), [{ op: "add_section", name: "chorus", bars: 8 }]).doc;
    const after = applyOps(
      before,
      [{ op: "set_pattern", track: "hats", pattern: "hh*16", section: "verse" }],
      before.sections[1].id,
    ).doc;

    // The chorus inherits from the verse, but the edit happened in the verse —
    // reporting it twice would read as noise.
    const lines = diffDocs(before, after);
    expect(lines).toEqual(["verse/hats: hh*8 → hh*16"]);
  });

  it("reports mix changes separately from arrangement", () => {
    const before = starterProject();
    const after = applyOps(before, [
      { op: "set_param", track: "kick", param: "gain", value: 0.4 },
      { op: "toggle", track: "snare", field: "muted", value: true },
    ]).doc;

    const lines = diffDocs(before, after);
    expect(lines).toContain("kick gain 0.8 → 0.4");
    expect(lines).toContain("snare muted");
  });
});
