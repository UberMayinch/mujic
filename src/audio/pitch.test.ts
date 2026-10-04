import { describe, expect, it } from "vitest";
import {
  detectF0,
  hzToMidi,
  midiToHz,
  midiToNoteName,
  quantizeMelody,
  segmentNotes,
  trackPitch,
} from "./pitch";

const SR = 44100;

/**
 * A sung vowel is not a sine — it has harmonics, which is exactly what trips up
 * naive autocorrelation into octave errors. Synthesize a few partials so the
 * tests exercise the case YIN exists to solve.
 */
function tone(target: Float32Array, midi: number, from: number, to: number) {
  const hz = midiToHz(midi);
  const start = Math.round(from * SR);
  const end = Math.min(Math.round(to * SR), target.length);
  for (let i = start; i < end; i += 1) {
    const t = i / SR;
    target[i] +=
      0.5 * Math.sin(2 * Math.PI * hz * t) +
      0.25 * Math.sin(2 * Math.PI * hz * 2 * t) +
      0.12 * Math.sin(2 * Math.PI * hz * 3 * t);
  }
}

const buffer = (seconds: number) => new Float32Array(Math.round(seconds * SR));

const C4 = 60;
const E4 = 64;
const G4 = 67;

describe("note names", () => {
  it("uses spellings Strudel's parser accepts", () => {
    expect(midiToNoteName(60)).toBe("c4");
    expect(midiToNoteName(61)).toBe("cs4"); // `s` for sharp — [#bsf] are all valid
    expect(midiToNoteName(69)).toBe("a4");
    expect(midiToNoteName(67)).toBe("g4");
    // Every emitted name must satisfy Strudel's own note regex.
    for (let midi = 36; midi <= 96; midi += 1) {
      expect(midiToNoteName(midi)).toMatch(/^([a-gA-G])([#bsf]*)(-?[0-9]*)$/);
    }
  });

  it("round-trips through hz", () => {
    expect(hzToMidi(440)).toBeCloseTo(69, 6);
    expect(midiToHz(69)).toBeCloseTo(440, 6);
  });
});

describe("detectF0", () => {
  it("finds concert A within a cent or so", () => {
    const audio = buffer(0.2);
    tone(audio, 69, 0, 0.2);
    const hz = detectF0(audio.subarray(0, 2048), SR)!;
    expect(hz).toBeCloseTo(440, 0);
  });

  it("does not fall an octave on a harmonic-rich tone", () => {
    const audio = buffer(0.2);
    tone(audio, C4, 0, 0.2); // ~261.6 Hz with 2nd and 3rd partials
    const midi = hzToMidi(detectF0(audio.subarray(0, 2048), SR)!);
    expect(midi).toBeCloseTo(C4, 0);
    expect(midi).toBeGreaterThan(C4 - 6); // not the octave below
  });

  it("reports silence as unvoiced rather than guessing", () => {
    expect(detectF0(buffer(0.05), SR)).toBeNull();
  });
});

describe("segmentNotes", () => {
  it("splits a three-note phrase at the right pitches", () => {
    const audio = buffer(1.2);
    tone(audio, C4, 0.0, 0.35);
    tone(audio, E4, 0.4, 0.75);
    tone(audio, G4, 0.8, 1.15);

    const notes = segmentNotes(trackPitch(audio, SR), SR);
    expect(notes.map((n) => n.midi)).toEqual([C4, E4, G4]);
    expect(notes[0].start).toBeCloseTo(0, 1);
    expect(notes[1].start).toBeCloseTo(0.4, 1);
  });

  it("discards blips too short to be notes", () => {
    const audio = buffer(0.6);
    tone(audio, C4, 0.0, 0.4);
    tone(audio, G4, 0.42, 0.45); // 30ms — a glide, not a note

    // Uses the default minimum: the 46ms analysis window smears a 30ms blip
    // into ~80ms of frames, so anything below ~2× the window can't be rejected.
    const notes = segmentNotes(trackPitch(audio, SR), SR);
    expect(notes.map((n) => n.midi)).toEqual([C4]);
  });

  it("returns nothing for silence", () => {
    expect(segmentNotes(trackPitch(buffer(0.5), SR), SR)).toEqual([]);
  });
});

describe("quantizeMelody", () => {
  it("emits rests and sustains as mini-notation", () => {
    // One bar at 120bpm = 2s. A note over the first beat, then a rest.
    const pattern = quantizeMelody([{ midi: C4, start: 0, end: 0.5 }], { bpm: 120, bars: 1 });
    const slots = pattern.split(" ");

    expect(slots).toHaveLength(16);
    expect(slots[0]).toBe("c4");
    expect(slots.slice(1, 4)).toEqual(["_", "_", "_"]); // held across the beat
    expect(slots[4]).toBe("~"); // then silence
  });

  it("transcribes a sung phrase end to end", () => {
    const bpm = 120;
    const audio = buffer(2);
    tone(audio, C4, 0.0, 0.45);
    tone(audio, E4, 0.5, 0.95);
    tone(audio, G4, 1.0, 1.95);

    const pattern = quantizeMelody(segmentNotes(trackPitch(audio, SR), SR), { bpm, bars: 1 });
    const sounded = pattern.split(" ").filter((slot) => slot !== "~" && slot !== "_");

    expect(sounded).toEqual(["c4", "e4", "g4"]);
    expect(pattern).toMatch(/^c4 /); // phrase starts on the downbeat
  });

  it("ignores notes that land past the end of the take", () => {
    const pattern = quantizeMelody([{ midi: C4, start: 9, end: 9.5 }], { bpm: 120, bars: 1 });
    expect(pattern.split(" ").every((slot) => slot === "~")).toBe(true);
  });
});
