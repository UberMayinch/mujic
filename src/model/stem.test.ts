import { describe, expect, it } from "vitest";
import { extractStem, formatPrice, insertStem, sellableTracks } from "./stem";
import { generateCode } from "./codegen";
import { makeSection, makeTrack, type ProjectDoc } from "./project";

/** intro(4) → chorus(8). The kick is set in the intro and inherits into the chorus. */
function doc(): ProjectDoc {
  const kick = makeTrack({ name: "kick", defaultSound: "bd" });
  const hats = makeTrack({ name: "hats", defaultSound: "hh", gain: 0.5 });
  return {
    version: 3,
    name: "test",
    takes: {},
    bpm: 92,
    tracks: [kick, hats],
    sections: [
      makeSection({
        name: "intro",
        bars: 4,
        cells: {
          [kick.id]: { kind: "pattern", pattern: "bd*4" },
          [hats.id]: { kind: "silent" },
        },
      }),
      makeSection({
        name: "chorus",
        bars: 8,
        cells: { [hats.id]: { kind: "pattern", pattern: "hh*16" } },
      }),
    ],
  };
}

const meta = { title: "kit", seller: "me", priceCents: 400, key: "C min", tag: "drums" };

describe("extractStem", () => {
  it("captures what a track actually plays, not what its cell literally holds", () => {
    const d = doc();
    // In the chorus the kick inherits from the intro; a naive copy would export
    // an empty pattern here, which is the most confusing thing a stem could do.
    const stem = extractStem(d, 1, d.tracks.map((t) => t.id), meta);

    expect(stem.tracks.find((t) => t.name === "kick")?.pattern).toBe("bd*4");
    expect(stem.tracks.find((t) => t.name === "hats")?.pattern).toBe("hh*16");
  });

  it("takes bpm and bars from the document and section it came from", () => {
    const d = doc();
    const stem = extractStem(d, 1, [d.tracks[0].id], meta);

    expect(stem.bpm).toBe(92);
    expect(stem.bars).toBe(8);
    expect(stem.tag).toBe("DRUMS");
    expect(stem.priceCents).toBe(400);
  });

  it("drops tracks that are silent in the captured section", () => {
    const d = doc();
    const stem = extractStem(d, 0, d.tracks.map((t) => t.id), meta);

    expect(stem.tracks.map((t) => t.name)).toEqual(["kick"]);
  });

  it("refuses to put a recorded take on sale", () => {
    const d = doc();
    const vox = makeTrack({ name: "vox", kind: "take", defaultSound: "take" });
    d.tracks.push(vox);
    d.sections[1].cells[vox.id] = { kind: "pattern", pattern: "vox" };

    expect(sellableTracks(d).map((t) => t.name)).toEqual(["kick", "hats"]);
    const stem = extractStem(d, 1, d.tracks.map((t) => t.id), meta);
    expect(stem.tracks.map((t) => t.name)).not.toContain("vox");
  });
});

describe("insertStem", () => {
  it("lands the stem in the target section and stays silent elsewhere", () => {
    const source = doc();
    const stem = extractStem(source, 1, source.tracks.map((t) => t.id), meta);

    const target = doc();
    const next = insertStem(target, stem, target.sections[0].id);
    const added = next.tracks.slice(target.tracks.length);

    expect(added).toHaveLength(2);
    expect(next.sections[0].cells[added[0].id]).toEqual({ kind: "pattern", pattern: "bd*4" });
    expect(next.sections[1].cells[added[0].id]).toEqual({ kind: "silent" });
  });

  it("de-duplicates names so voice can still address a track unambiguously", () => {
    const source = doc();
    const stem = extractStem(source, 1, source.tracks.map((t) => t.id), meta);

    const next = insertStem(doc(), stem, doc().sections[0].id);
    const names = next.tracks.map((t) => t.name);

    expect(names).toEqual(["kick", "hats", "kick 2", "hats 2"]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("produces a document that still generates playable code", () => {
    const source = doc();
    const stem = extractStem(source, 1, source.tracks.map((t) => t.id), meta);

    const target = doc();
    const code = generateCode(insertStem(target, stem, target.sections[0].id));

    expect(code).toContain('s("bd*4")');
    expect(code).toContain('s("hh*16")');
  });
});

describe("formatPrice", () => {
  it("shows free rather than $0.00", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(400)).toBe("$4.00");
    expect(formatPrice(1250)).toBe("$12.50");
  });
});
