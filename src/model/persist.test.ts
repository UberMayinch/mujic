import { describe, expect, it } from "vitest";
import { fileName, initProject, migrate, parse, serialize } from "./persist";
import { makeTrack, type ProjectDoc } from "./project";
import { commit, log } from "./history";
import { generateCode, takeSampleName } from "./codegen";
import type { Take } from "./project";

describe("initProject", () => {
  it("starts with a root commit, so there is always something to diff against", () => {
    const file = initProject("Ninth Street");

    expect(file.doc.name).toBe("Ninth Street");
    expect(Object.keys(file.history.commits)).toHaveLength(1);
    expect(file.history.current).toBe("main");
  });

  it("falls back to a name rather than an empty title bar", () => {
    expect(initProject("   ").doc.name).toBe("untitled");
  });
});

describe("round trip", () => {
  it("carries the whole commit graph, not just the current arrangement", () => {
    const file = initProject("demo");
    const edited = { ...file.doc, bpm: 140 };
    const withHistory = { ...file, doc: edited, history: commit(file.history, edited, "faster") };

    const back = parse(serialize(withHistory));

    expect(back.doc.bpm).toBe(140);
    expect(Object.keys(back.history.commits)).toHaveLength(2);
    expect(back.history.commits[back.history.branches.main].message).toBe("faster");
  });

  it("keeps recorded audio through a save and load", () => {
    const file = initProject("demo");
    const take: Take = {
      id: "take1",
      audio: "data:audio/wav;base64,AAAA",
      bars: 2,
      recordedBpm: 120,
      peaks: [0.1, 0.9],
      lead: 0,
      createdAt: 0,
    };
    file.doc.takes[take.id] = take;

    expect(parse(serialize(file)).doc.takes.take1.audio).toBe("data:audio/wav;base64,AAAA");
  });
});

describe("migrate", () => {
  it("brings a v2 document forward without losing its arrangement", () => {
    const legacy = {
      id: "p1",
      name: "old",
      savedAt: 1,
      doc: {
        version: 2,
        bpm: 100,
        tracks: [{ id: "t1", name: "kick", kind: "sample", defaultSound: "bd", gain: 1, muted: false, soloed: false, fx: {}, codeOwned: false }],
        sections: [{ id: "s1", name: "intro", bars: 4, cells: { t1: { kind: "pattern", pattern: "bd*4" } } }],
      },
    };

    const file = migrate(legacy);

    expect(file.doc.version).toBe(3);
    expect(file.doc.takes).toEqual({});
    expect(file.doc.name).toBe("old");
    expect(generateCode(file.doc)).toContain('s("bd*4")');
  });

  it("gives a file with no history a root commit rather than an empty graph", () => {
    const file = migrate({ doc: initProject("x").doc });
    expect(Object.keys(file.history.commits)).toHaveLength(1);
  });

  it("rejects anything that isn't a project", () => {
    expect(() => migrate({ hello: "world" })).toThrow(/not a mujic project/);
  });
});

describe("reserving ids on load", () => {
  it("mints track ids past everything the loaded document already uses", () => {
    // The id counter restarts at zero on every page load. Without reserving,
    // the next track minted is `t1` — an id the loaded document already uses —
    // and the new track silently inherits the old one's cells.
    //
    // Asserting "the new id is above the loaded high-water mark" rather than
    // "the new id isn't in this list": the weaker form passes even with
    // reserveIds stubbed out, because the counter happens to be elsewhere.
    parse(
      serialize({
        ...initProject("demo"),
        doc: {
          version: 3,
          name: "demo",
          bpm: 120,
          takes: {},
          tracks: [{ ...makeTrack({ name: "kick", defaultSound: "bd" }), id: "t9000" }],
          sections: [{ id: "s9001", name: "intro", bars: 4, cells: {} }],
        } as ProjectDoc,
      }),
    );

    const fresh = makeTrack({ name: "new", defaultSound: "bd" });
    expect(Number(fresh.id.slice(1))).toBeGreaterThan(9001);
  });

  it("mints commit ids past the loaded history, so saving cannot overwrite the root", () => {
    // Left unreserved, the first "save version" after opening a project mints
    // an id the graph already holds. The new commit replaces the root and
    // becomes its own parent, and log() then walks that cycle forever.
    const file = initProject("demo");
    const loaded = parse(
      serialize({
        ...file,
        history: {
          commits: {
            c8000: { id: "c8000", parent: null, branch: "main", message: "root", at: 1, doc: file.doc },
          },
          branches: { main: "c8000" },
          current: "main",
        },
      }),
    );

    const next = commit(loaded.history, loaded.doc, "second");
    const headId = next.branches.main;

    // The invariant, not an accident: the minted id is above the loaded
    // high-water mark. Merely asserting `headId !== "c8000"` would pass with
    // reserveCommitIds stubbed out, since the counter sits low mid-file.
    expect(Number(headId.slice(1))).toBeGreaterThan(8000);
    expect(next.commits[headId].parent).toBe("c8000");
    expect(Object.keys(next.commits)).toHaveLength(2);
    // The root survived, so walking parents terminates instead of cycling.
    expect(log(next).map((c) => c.message)).toEqual(["second", "root"]);
  });
});

describe("fileName", () => {
  it("slugs the project name", () => {
    const doc = { ...initProject("Ninth Street Pressing!").doc };
    expect(fileName(doc)).toBe("ninth-street-pressing.mujic.json");
  });
});

describe("take sample names", () => {
  it("namespaces takes so they cannot collide with the dirt-samples pack", () => {
    // A take called "bd" that shadowed the kick sample would be very hard to debug.
    expect(takeSampleName("take1")).toBe("mujic_take1");
  });
});
