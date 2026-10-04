import { describe, expect, it } from "vitest";
import { applyOps } from "./ops";
import { generateCode } from "./codegen";
import { resolveCell, sectionStartBar, totalBars } from "./arrange";
import { makeSection, makeTrack, starterProject, type ProjectDoc } from "./project";
import { bjorklund, stepsFor } from "./steps";
import { normalizeTranscript } from "../voice/glossary";

/** intro(4) → verse(8) → chorus(8); kick set once in the intro and never again. */
function grid(): ProjectDoc {
  const kick = makeTrack({ name: "kick", defaultSound: "bd" });
  const hats = makeTrack({ name: "hats", defaultSound: "hh" });
  return {
    version: 3,
    name: "test",
    takes: {},
    bpm: 120,
    tracks: [kick, hats],
    sections: [
      makeSection({
        name: "intro",
        bars: 4,
        cells: { [kick.id]: { kind: "pattern", pattern: "bd*4" }, [hats.id]: { kind: "silent" } },
      }),
      makeSection({ name: "verse", bars: 8, cells: { [hats.id]: { kind: "pattern", pattern: "hh*8" } } }),
      makeSection({ name: "chorus", bars: 8, cells: {} }),
    ],
  };
}

/**
 * Pull one section's generated block out of the code. Section markers are
 * `// <name> — <n> bars`; per-track comments are bare `// <name>`, so the
 * bar suffix is what distinguishes them.
 */
function sectionBlock(code: string, name: string): string {
  const isMarker = (line: string) => /^\s*\/\/ .+ — \d+ bars$/.test(line);
  const lines = code.split("\n");
  const start = lines.findIndex((l) => l.trim().startsWith(`// ${name} —`));
  if (start < 0) throw new Error(`no section "${name}" in generated code:\n${code}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(isMarker);
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

describe("resolveCell", () => {
  it("carries a pattern forward across sections that never mention it", () => {
    const doc = grid();
    const kick = doc.tracks[0];

    expect(resolveCell(doc, 0, kick)).toMatchObject({ pattern: "bd*4" });
    // Set in the intro, still playing two sections later.
    expect(resolveCell(doc, 2, kick).pattern).toBe("bd*4");
    expect(resolveCell(doc, 2, kick).from!.name).toBe("intro");
  });

  it("reports the section a pattern was inherited from", () => {
    const doc = grid();
    const hats = doc.tracks[1];
    expect(resolveCell(doc, 2, hats)).toMatchObject({ pattern: "hh*8" });
    expect(resolveCell(doc, 2, hats).from!.name).toBe("verse");
  });

  it("treats an explicit drop as silence, and stops inheritance there", () => {
    const doc = grid();
    const hats = doc.tracks[1];
    expect(resolveCell(doc, 0, hats).pattern).toBeNull();
  });

  it("is silent when nothing to the left ever defined the track", () => {
    const doc = grid();
    const late = makeTrack({ name: "bass", defaultSound: "sawtooth" });
    doc.tracks.push(late);
    doc.sections[2].cells[late.id] = { kind: "pattern", pattern: "bass(3,8)" };

    expect(resolveCell(doc, 0, late).pattern).toBeNull();
    expect(resolveCell(doc, 2, late).pattern).toBe("bass(3,8)");
  });
});

describe("timeline geometry", () => {
  it("computes bar offsets and total length", () => {
    const doc = grid();
    expect(sectionStartBar(doc, 0)).toBe(1);
    expect(sectionStartBar(doc, 1)).toBe(5);
    expect(sectionStartBar(doc, 2)).toBe(13);
    expect(totalBars(doc)).toBe(20);
  });
});

describe("applyOps", () => {
  it("edits the section the user is looking at when none is named", () => {
    const doc = grid();
    const verse = doc.sections[1];
    const result = applyOps(doc, [{ op: "set_pattern", track: "hats", pattern: "hh*16" }], verse.id);

    expect(result.doc.sections[1].cells[doc.tracks[1].id]).toEqual({ kind: "pattern", pattern: "hh*16" });
    // The intro is untouched.
    expect(result.doc.sections[0].cells[doc.tracks[1].id]).toEqual({ kind: "silent" });
  });

  it("edits a named section regardless of what's selected", () => {
    const doc = grid();
    const result = applyOps(
      doc,
      [{ op: "set_pattern", track: "hats", pattern: "hh*16", section: "chorus" }],
      doc.sections[0].id,
    );

    expect(result.doc.sections[2].cells[doc.tracks[1].id]).toEqual({ kind: "pattern", pattern: "hh*16" });
    expect(result.doc.sections[0].cells[doc.tracks[1].id]).toEqual({ kind: "silent" });
  });

  it("drops a track for one section without muting it everywhere", () => {
    const doc = grid();
    const result = applyOps(doc, [{ op: "set_cell", track: "kick", mode: "silent", section: "chorus" }]);
    const kick = doc.tracks[0];

    expect(resolveCell(result.doc, 2, kick).pattern).toBeNull();
    expect(resolveCell(result.doc, 1, kick).pattern).toBe("bd*4");
    expect(result.doc.tracks[0].muted).toBe(false);
  });

  it("does not mutate the input document", () => {
    const doc = grid();
    applyOps(doc, [{ op: "set_pattern", track: "hats", pattern: "hh*16" }], doc.sections[1].id);
    expect(doc.sections[1].cells[doc.tracks[1].id]).toEqual({ kind: "pattern", pattern: "hh*8" });
  });

  it("inserts a section after a named one", () => {
    const doc = grid();
    const result = applyOps(doc, [{ op: "add_section", name: "bridge", bars: 4, after: "verse" }]);
    expect(result.doc.sections.map((s) => s.name)).toEqual(["intro", "verse", "bridge", "chorus"]);
  });

  it("refuses to remove the last remaining section", () => {
    const doc: ProjectDoc = { ...grid(), sections: [makeSection({ name: "only" })] };
    const result = applyOps(doc, [{ op: "remove_section", section: "only" }]);
    expect(result.rejected[0].reason).toMatch(/only section/);
  });

  it("removing a track clears its cells everywhere", () => {
    const doc = grid();
    const kickId = doc.tracks[0].id;
    const result = applyOps(doc, [{ op: "remove_track", track: "kick" }]);
    expect(result.doc.tracks).toHaveLength(1);
    expect(result.doc.sections.every((s) => !(kickId in s.cells))).toBe(true);
  });

  it("refuses structured edits to a code-owned track", () => {
    const doc = grid();
    doc.tracks[1] = { ...doc.tracks[1], codeOwned: true, code: 's("hh*3")' };
    const result = applyOps(doc, [{ op: "set_pattern", track: "hats", pattern: "hh*16" }]);
    expect(result.rejected[0].reason).toMatch(/code-owned/);
  });

  it("clamps params and rejects unknown tracks and sections", () => {
    const doc = grid();
    const result = applyOps(doc, [
      { op: "set_param", track: "kick", param: "gain", value: 99 },
      { op: "set_pattern", track: "trombone", pattern: "x*4" },
      { op: "set_pattern", track: "kick", pattern: "bd*2", section: "outro" },
    ]);

    expect(result.doc.tracks[0].gain).toBe(1.5);
    expect(result.rejected.map((r) => r.reason)).toEqual([
      expect.stringMatching(/no track matching/),
      expect.stringMatching(/no section matching/),
    ]);
  });
});

describe("generateCode", () => {
  it("emits arrange() with one entry per section, weighted by bars", () => {
    const code = generateCode(grid());

    expect(code).toContain("setcps(0.5)"); // 120 bpm
    expect(code).toContain("arrange(");
    expect(code).toContain("[4, stack(");
    expect(code).toContain("[8, stack(");
    expect(code).toContain("// intro — 4 bars");
  });

  it("carries inherited patterns into later sections' stacks", () => {
    // The chorus never mentions the kick, but the kick is still playing there.
    const chorus = sectionBlock(generateCode(grid()), "chorus");
    expect(chorus).toContain('s("bd*4")');
    expect(chorus).toContain('s("hh*8")');
  });

  it("omits a track from the sections where it is silent", () => {
    const intro = sectionBlock(generateCode(grid()), "intro");
    expect(intro).toContain('s("bd*4")');
    expect(intro).not.toContain('s("hh');
  });

  it("skips arrange() for a single-section project", () => {
    const doc = starterProject();
    const single: ProjectDoc = { ...doc, sections: [doc.sections[0]] };
    const code = generateCode(single);
    expect(code).not.toContain("arrange(");
    expect(code).toContain("stack(");
  });

  it("is deterministic", () => {
    const doc = grid();
    expect(generateCode(doc)).toBe(generateCode(doc));
  });

  it("solo wins over unsoloed tracks", () => {
    const doc = grid();
    const soloed = applyOps(doc, [{ op: "toggle", track: "kick", field: "soloed", value: true }]).doc;
    const code = generateCode(soloed);
    expect(code).toContain("// kick");
    expect(code).not.toContain("// hats");
  });

  it("emits code-owned tracks verbatim in every section", () => {
    const doc = grid();
    doc.tracks[0] = { ...doc.tracks[0], codeOwned: true, code: 's("hh*3").jux(rev)' };
    const code = generateCode(doc);
    expect(code.match(/jux\(rev\)/g)).toHaveLength(doc.sections.length);
  });
});

describe("melodic tracks", () => {
  it("emits note() with the track's instrument, not s()", () => {
    const doc = starterProject();
    const withMelody = applyOps(doc, [
      { op: "add_track", name: "lead", kind: "note", sound: "triangle", pattern: "c4 e4 g4 ~" },
    ]).doc;

    const code = generateCode(withMelody);
    expect(code).toContain('note("c4 e4 g4 ~").sound("triangle")');
    expect(code).not.toContain('s("c4');
  });

  it("defaults to a drum track when kind is omitted", () => {
    const doc = applyOps(starterProject(), [
      { op: "add_track", name: "clap", sound: "cp", pattern: "~ cp" },
    ]).doc;
    expect(doc.tracks.at(-1)!.kind).toBe("sample");
    expect(generateCode(doc)).toContain('s("~ cp")');
  });

  it("carries a melody through inheritance like any other cell", () => {
    let doc = applyOps(starterProject(), [
      { op: "add_section", name: "chorus", bars: 8 },
      {
        op: "add_track",
        name: "lead",
        kind: "note",
        sound: "triangle",
        pattern: "c4 _ e4 _",
        section: "verse",
      },
    ]).doc;

    const lead = doc.tracks.find((t) => t.name === "lead")!;
    // Hummed into the verse, still singing in the chorus.
    expect(resolveCell(doc, 2, lead).pattern).toBe("c4 _ e4 _");

    doc = applyOps(doc, [{ op: "set_cell", track: "lead", mode: "silent", section: "chorus" }]).doc;
    expect(resolveCell(doc, 2, lead).pattern).toBeNull();
  });
});

describe("stepsFor", () => {
  it("treats a sustain as a held note, not a new hit", () => {
    // "c4 _ _ _" is one note across four steps — the grid must show one onset.
    const grid = stepsFor("c4 _ _ _ e4 _ ~ ~")!;
    expect(grid.flatMap((on, i) => (on ? [i] : []))).toEqual([0, 8]);
  });

  it("places euclidean hits where Strudel actually plays them", () => {
    // E(3,8) is `x..x..x.` — hits at slots 0, 3, 6. An evenly-spaced
    // approximation gets the count right and the positions wrong.
    expect(bjorklund(3, 8)).toEqual([true, false, false, true, false, false, true, false]);
    expect(bjorklund(5, 8)).toEqual([true, false, true, true, false, true, true, false]);

    const g = stepsFor("bd(3,8)")!;
    expect(g.flatMap((on, i) => (on ? [i] : []))).toEqual([0, 6, 12]);
  });

  it("reads the patterns codegen emits", () => {
    expect(stepsFor("bd*4")!.filter(Boolean)).toHaveLength(4);
    expect(stepsFor("hh*16")!.every(Boolean)).toBe(true);
    expect(stepsFor("~ sd ~ sd")!.flatMap((on, i) => (on ? [i] : []))).toEqual([4, 12]);
  });

  it("returns null rather than drawing a rhythm it can't read", () => {
    expect(stepsFor("[bd sd]*2 <hh oh>")).toBeNull();
    expect(stepsFor("bd*99")).toBeNull();
  });
});

describe("normalizeTranscript", () => {
  it("fixes the ASR mangling that named this project", () => {
    expect(normalizeTranscript("show me the student repl")).toBe("show me the strudel repl");
  });

  it("normalizes musical vocabulary before the LLM sees it", () => {
    expect(normalizeTranscript("make the hi-hats 16ths")).toBe("make the hats sixteenths");
    expect(normalizeTranscript("add some reverb to the snare drum")).toBe("add some room to the snare");
  });

  it("leaves single-word sound names alone so track addressing survives", () => {
    // A rule mapping "clap" → "cp" would break "the clap" once a track is named clap.
    expect(normalizeTranscript("drop the clap in the chorus", ["clap", "chorus"])).toBe(
      "drop the clap in the chorus",
    );
  });

  it("snaps loose casing back to the user's own names", () => {
    expect(normalizeTranscript("mute the BASS in the CHORUS", ["bass", "chorus"])).toBe(
      "mute the bass in the chorus",
    );
  });
});
