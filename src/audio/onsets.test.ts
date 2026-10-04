import { describe, expect, it } from "vitest";
import { barSeconds, classify, detectOnsets, quantize } from "./onsets";

const SR = 44100;

/** A short percussive burst: low sine reads as a kick, noise reads as a hat. */
function burst(target: Float32Array, atSeconds: number, kind: "low" | "mid" | "noise") {
  const start = Math.round(atSeconds * SR);
  const length = Math.round(SR * 0.06);
  let seed = 12345;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

  for (let i = 0; i < length && start + i < target.length; i += 1) {
    const decay = Math.exp(-8 * (i / length));
    const t = i / SR;
    const value =
      kind === "low"
        ? Math.sin(2 * Math.PI * 60 * t)
        : kind === "mid"
          ? Math.sin(2 * Math.PI * 220 * t) * 0.6 + random() * 0.4
          : random();
    target[start + i] += value * decay * 0.8;
  }
}

function buffer(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * SR));
}

describe("classify", () => {
  it("maps brightness onto drum voices", () => {
    expect(classify(0.005)).toBe("bd");
    expect(classify(0.1)).toBe("sd");
    expect(classify(0.4)).toBe("hh");
  });
});

describe("detectOnsets", () => {
  it("finds four evenly spaced hits and ignores silence", () => {
    const audio = buffer(2);
    [0, 0.5, 1.0, 1.5].forEach((t) => burst(audio, t, "low"));

    const onsets = detectOnsets(audio, SR);
    expect(onsets).toHaveLength(4);
    onsets.forEach((onset, i) => expect(onset.time).toBeCloseTo(i * 0.5, 1));
  });

  it("returns nothing for silence", () => {
    expect(detectOnsets(buffer(1), SR)).toEqual([]);
  });

  it("separates a low thump from a bright hiss", () => {
    const audio = buffer(1);
    burst(audio, 0.1, "low");
    burst(audio, 0.5, "noise");

    const [kick, hat] = detectOnsets(audio, SR);
    expect(kick.drum).toBe("bd");
    expect(hat.drum).toBe("hh");
    expect(hat.brightness).toBeGreaterThan(kick.brightness);
  });

  it("debounces one thump into a single onset", () => {
    const audio = buffer(1);
    burst(audio, 0.2, "low");
    expect(detectOnsets(audio, SR)).toHaveLength(1);
  });
});

describe("quantize", () => {
  it("snaps a four-on-the-floor take to bd*4", () => {
    const bpm = 120;
    const audio = buffer(barSeconds(bpm));
    // One bar at 120bpm is 2s; four beats land every 0.5s.
    [0, 0.5, 1.0, 1.5].forEach((t) => burst(audio, t, "low"));

    const patterns = quantize(detectOnsets(audio, SR), { bpm, bars: 1 });
    expect(patterns.bd).toBe("bd*4");
  });

  it("keeps an off-grid backbeat as an explicit sequence", () => {
    const bpm = 120;
    const audio = buffer(barSeconds(bpm));
    // Snare on 2 and 4 only — not evenly spaced from the downbeat.
    [0.5, 1.5].forEach((t) => burst(audio, t, "mid"));

    const patterns = quantize(detectOnsets(audio, SR), { bpm, bars: 1 });
    const slots = patterns.sd!.split(" ");
    expect(slots).toHaveLength(16);
    expect(slots.flatMap((s, i) => (s !== "~" ? [i] : []))).toEqual([4, 12]);
  });

  it("splits a mixed groove into one pattern per voice", () => {
    const bpm = 120;
    const audio = buffer(barSeconds(bpm));
    [0, 1.0].forEach((t) => burst(audio, t, "low"));
    [0.5, 1.5].forEach((t) => burst(audio, t, "mid"));

    const patterns = quantize(detectOnsets(audio, SR), { bpm, bars: 1 });
    expect(patterns.bd).toBe("bd*2");
    expect(patterns.sd).toBeDefined();
    expect(patterns.hh).toBeUndefined();
  });

  it("folds a hit landing on the final boundary onto the downbeat", () => {
    // A hit a hair before the loop point belongs to step 0, not step 16.
    const patterns = quantize(
      [{ time: 1.999, energy: 1, brightness: 0.01, drum: "bd" }],
      { bpm: 120, bars: 1 },
    );
    expect(patterns.bd).toBe("bd*1");
  });
});
