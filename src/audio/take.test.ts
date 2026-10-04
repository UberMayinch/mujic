import { describe, expect, it } from "vitest";
import { encodeWav, leadOf, makeTake, peaksOf } from "./take";

const SR = 44100;

/** A sine burst between two times, so tests describe audio rather than arrays. */
function buffer(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * SR));
}

function tone(target: Float32Array, from: number, to: number, amp = 0.8): void {
  for (let i = Math.round(from * SR); i < Math.round(to * SR) && i < target.length; i += 1) {
    target[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * amp;
  }
}

describe("encodeWav", () => {
  it("writes a RIFF/WAVE header a browser will decode", () => {
    const url = encodeWav(buffer(0.01), SR);
    expect(url.startsWith("data:audio/wav;base64,")).toBe(true);

    const bytes = Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0));
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.subarray(8, 12))).toBe("WAVE");

    const view = new DataView(bytes.buffer);
    expect(view.getUint32(24, true)).toBe(SR); // sample rate survives
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint16(34, true)).toBe(16); // 16-bit
  });

  it("is 44 bytes of header plus two bytes per sample", () => {
    const samples = buffer(0.01);
    const bytes = atob(encodeWav(samples, SR).split(",")[1]);
    expect(bytes.length).toBe(44 + samples.length * 2);
  });

  it("clamps rather than wrapping, so a hot take does not click", () => {
    // Without the clamp, 1.5 wraps through Int16 and becomes a loud negative spike.
    const hot = Float32Array.from([1.5, -1.5]);
    const bytes = Uint8Array.from(atob(encodeWav(hot, SR).split(",")[1]), (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);

    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32767);
  });

  it("survives a take long enough to overflow a spread call", () => {
    // String.fromCharCode(...raw) blows the stack past ~100k args; this is 2s.
    expect(() => encodeWav(buffer(2), SR)).not.toThrow();
  });
});

describe("peaksOf", () => {
  it("returns one value per bucket, tracking where the sound is", () => {
    const audio = buffer(1);
    tone(audio, 0.5, 1.0);

    const peaks = peaksOf(audio, 10);

    expect(peaks).toHaveLength(10);
    expect(peaks[0]).toBe(0);
    expect(peaks[9]).toBeGreaterThan(0.5);
  });

  it("handles an empty recording without dividing by zero", () => {
    expect(peaksOf(new Float32Array(0))).toEqual([]);
  });
});

describe("leadOf", () => {
  it("measures a late entry as a fraction of the take", () => {
    const audio = buffer(2);
    tone(audio, 1.0, 2.0); // singer comes in halfway

    expect(leadOf(audio)).toBeCloseTo(0.5, 2);
  });

  it("is negligible when the take opens on the downbeat", () => {
    const audio = buffer(1);
    tone(audio, 0, 1);

    // Not exactly 0: a sine crosses zero at its first sample, so the first
    // sample above the floor is one or two in. A sub-millisecond offset is
    // inaudible, which is the property that actually matters.
    expect(leadOf(audio)).toBeCloseTo(0, 3);
  });

  it("is zero for a silent take, rather than offsetting into nothing", () => {
    expect(leadOf(buffer(1))).toBe(0);
  });
});

describe("makeTake", () => {
  it("records the tempo it was captured at, which is what the drift warning needs", () => {
    const audio = buffer(1);
    tone(audio, 0, 1);

    const take = makeTake({ samples: audio, sampleRate: SR }, 2, 92);

    expect(take.recordedBpm).toBe(92);
    expect(take.bars).toBe(2);
    expect(take.peaks.length).toBeGreaterThan(0);
    expect(take.audio.startsWith("data:audio/wav")).toBe(true);
  });
});
