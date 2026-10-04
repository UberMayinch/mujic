import { describe, expect, it } from "vitest";
import { generateCode } from "./codegen";
import { makeSection, makeTrack, type ProjectDoc, type Take } from "./project";

const take = (over: Partial<Take> = {}): Take => ({
  id: "take1",
  audio: "data:audio/wav;base64,AAAA",
  bars: 2,
  recordedBpm: 120,
  peaks: [],
  lead: 0,
  createdAt: 0,
  ...over,
});

/** A one-section document with a single vocal take track. */
function withTake(over: Partial<Take> = {}, fitTempo = false, bpm = 120): ProjectDoc {
  const t = take(over);
  const vox = makeTrack({
    name: "vox",
    kind: "take",
    defaultSound: "take",
    gain: 1,
    take: { takeId: t.id, snapStart: true, fitTempo },
  });
  return {
    version: 3,
    name: "test",
    bpm,
    takes: { [t.id]: t },
    tracks: [vox],
    sections: [makeSection({ name: "verse", bars: 8, cells: { [vox.id]: { kind: "pattern", pattern: "vox" } } })],
  };
}

describe("take codegen", () => {
  it("plays the registered sample, namespaced away from the drum pack", () => {
    expect(generateCode(withTake())).toContain('s("mujic_take1")');
  });

  it("spans the bars it was recorded over, so it retriggers on its own boundary", () => {
    // One cycle is one bar; without slow() a 2-bar take restarts every bar.
    expect(generateCode(withTake({ bars: 2 }))).toContain(".slow(2)");
    expect(generateCode(withTake({ bars: 1 }))).not.toContain(".slow(");
  });

  it("leaves the audio untouched when the tempo moves and fitTempo is off", () => {
    // The default. Drifting against the grid is the honest outcome; the UI warns.
    const code = generateCode(withTake({ recordedBpm: 120 }, false, 140));
    expect(code).not.toContain(".speed(");
  });

  it("resamples only when fitTempo is explicitly on", () => {
    const code = generateCode(withTake({ recordedBpm: 120 }, true, 140));
    expect(code).toContain(".speed(1.1667)");
  });

  it("does not resample when the tempo has not actually moved", () => {
    expect(generateCode(withTake({ recordedBpm: 120 }, true, 120))).not.toContain(".speed(");
  });

  it("falls back to silence rather than a broken sample name when the take is gone", () => {
    const doc = withTake();
    doc.takes = {};
    expect(generateCode(doc)).toContain("silence");
    expect(generateCode(doc)).not.toContain("mujic_take1");
  });

  it("honours a silent cell, so a take can be dropped from one section", () => {
    const doc = withTake();
    doc.sections[0].cells[doc.tracks[0].id] = { kind: "silent" };
    expect(generateCode(doc)).not.toContain("mujic_take1");
  });

  it("honours mute, which kills the take across the whole timeline", () => {
    const doc = withTake();
    doc.tracks[0].muted = true;
    expect(generateCode(doc)).not.toContain("mujic_take1");
  });
});
