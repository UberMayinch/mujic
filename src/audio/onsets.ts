/**
 * Beatbox → pattern. Pure DSP, no browser APIs.
 *
 * This is the *other* front-end onto the same edit ops: describing a groove in
 * words is the thing our user is worst at, and performing it is the thing
 * they're best at. Nothing here calls a model — it's deterministic signal
 * processing, which is why it can be unit-tested against synthesized audio.
 *
 * Detection is peak-picking on an RMS envelope rather than spectral flux: no
 * FFT needed, and percussive input is exactly the case where energy peaks are
 * unambiguous. Timbre is classified by zero-crossing rate, a cheap proxy for
 * brightness — a kick crosses zero rarely, a hi-hat constantly.
 */

export type DrumClass = "bd" | "sd" | "hh";

export type Onset = {
  /** Seconds from the start of the buffer. */
  time: number;
  /** Peak loudness, 0..1 — used to break ties when two hits quantize together. */
  energy: number;
  /** Zero crossings per sample, 0..1. Higher is brighter. */
  brightness: number;
  drum: DrumClass;
};

const FRAME = 512;
const HOP = 256;

/** Brightness cut-points, tuned so a low thump reads as kick and a hiss as hat. */
const BRIGHT_HAT = 0.18;
const BRIGHT_SNARE = 0.06;

export function classify(brightness: number): DrumClass {
  if (brightness >= BRIGHT_HAT) return "hh";
  if (brightness >= BRIGHT_SNARE) return "sd";
  return "bd";
}

function rmsOf(samples: Float32Array, start: number, length: number): number {
  let sum = 0;
  const end = Math.min(start + length, samples.length);
  for (let i = start; i < end; i += 1) sum += samples[i] * samples[i];
  const n = Math.max(1, end - start);
  return Math.sqrt(sum / n);
}

function zcrOf(samples: Float32Array, start: number, length: number): number {
  let crossings = 0;
  const end = Math.min(start + length, samples.length);
  for (let i = start + 1; i < end; i += 1) {
    if (samples[i - 1] === 0) continue;
    if (samples[i] >= 0 !== samples[i - 1] >= 0) crossings += 1;
  }
  return crossings / Math.max(1, end - start);
}

export type DetectOptions = {
  /** Peaks below this fraction of the loudest peak are ignored. */
  relativeThreshold?: number;
  /** Minimum seconds between hits — debounces one thump into one onset. */
  minGapSeconds?: number;
};

export function detectOnsets(
  samples: Float32Array,
  sampleRate: number,
  { relativeThreshold = 0.22, minGapSeconds = 0.05 }: DetectOptions = {},
): Onset[] {
  const frameCount = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  if (frameCount < 3) return [];

  const rms = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i += 1) rms[i] = rmsOf(samples, i * HOP, FRAME);

  const loudest = rms.reduce((max, v) => Math.max(max, v), 0);
  if (loudest <= 1e-6) return [];
  const floor = loudest * relativeThreshold;

  const minGapFrames = Math.max(1, Math.round((minGapSeconds * sampleRate) / HOP));
  const onsets: Onset[] = [];
  let lastPeak = -Infinity;

  for (let i = 0; i < frameCount; i += 1) {
    if (rms[i] < floor) continue;
    // A local maximum: strictly rising into it, not falling out of it.
    // Treat the edges as surrounded by silence — otherwise a take that starts
    // on the downbeat (which is most takes) loses its first hit, because
    // frame 0 has no predecessor to rise above.
    const before = i > 0 ? rms[i - 1] : 0;
    const after = i < frameCount - 1 ? rms[i + 1] : 0;
    if (!(rms[i] > before && rms[i] >= after)) continue;
    if (i - lastPeak < minGapFrames) continue;
    lastPeak = i;

    const start = i * HOP;
    // Measure brightness over the attack — that's where timbre lives, before
    // the tail decays into whatever the room is doing.
    const brightness = zcrOf(samples, start, Math.round(sampleRate * 0.03));
    onsets.push({
      time: start / sampleRate,
      energy: rms[i] / loudest,
      brightness,
      drum: classify(brightness),
    });
  }

  return onsets;
}

export type QuantizeOptions = {
  bpm: number;
  bars: number;
  /** Grid resolution per bar. 16 = sixteenth notes. */
  stepsPerBar?: number;
};

/** Seconds of audio one bar occupies at this tempo (4 beats to the bar). */
export function barSeconds(bpm: number): number {
  return (60 / bpm) * 4;
}

/**
 * Snap onsets to a grid and emit one mini-notation pattern per drum class.
 * @returns e.g. `{ bd: "bd ~ ~ ~ bd ~ ~ ~", hh: "hh*8" }`
 */
export function quantize(
  onsets: Onset[],
  { bpm, bars, stepsPerBar = 16 }: QuantizeOptions,
): Partial<Record<DrumClass, string>> {
  const totalSteps = Math.max(1, Math.round(bars * stepsPerBar));
  const duration = barSeconds(bpm) * bars;

  const grids = new Map<DrumClass, (Onset | null)[]>();
  for (const onset of onsets) {
    const step = Math.round((onset.time / duration) * totalSteps);
    // A hit landing past the final step belongs to the downbeat of the next
    // loop, which is the same slot as step 0.
    const slot = ((step % totalSteps) + totalSteps) % totalSteps;

    if (!grids.has(onset.drum)) grids.set(onset.drum, new Array(totalSteps).fill(null));
    const grid = grids.get(onset.drum)!;
    // Two hits in one slot: the louder one wins.
    if (!grid[slot] || onset.energy > grid[slot]!.energy) grid[slot] = onset;
  }

  const out: Partial<Record<DrumClass, string>> = {};
  for (const [drum, grid] of grids) out[drum] = toMiniNotation(drum, grid.map(Boolean), totalSteps);
  return out;
}

/** `[true,false,false,false,…]` → `"bd*4"` when regular, else `"bd ~ ~ ~ …"`. */
function toMiniNotation(drum: DrumClass, hits: boolean[], totalSteps: number): string {
  const indices = hits.flatMap((on, i) => (on ? [i] : []));
  if (indices.length === 0) return "~";

  // Evenly spaced and starting on the downbeat compresses to `s*n`, which is
  // both what a musician would write and what the step preview understands.
  if (indices[0] === 0 && totalSteps % indices.length === 0) {
    const stride = totalSteps / indices.length;
    if (indices.every((v, i) => v === i * stride)) return `${drum}*${indices.length}`;
  }

  return hits.map((on) => (on ? drum : "~")).join(" ");
}
