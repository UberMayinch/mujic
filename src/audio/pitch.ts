/**
 * Humming → melody. Pure DSP, no browser APIs, no model call.
 *
 * Pitch is estimated with YIN (autocorrelation via a cumulative mean normalized
 * difference function), which is the standard choice for monophonic voice: it's
 * robust to the octave errors plain autocorrelation makes, and cheap enough to
 * run on a whole take in one pass.
 *
 * We deliberately extract a **symbolic melody** — notes, not an f0 curve. A raw
 * pitch envelope would recreate your performance more faithfully, but it is
 * undiffable, unbranchable, and uneditable by voice: exactly the opaque-blob
 * problem that makes version control fail for every DAW. See docs/ARCHITECTURE.md.
 */

/** Human singing range, generously bounded — outside this is noise or error. */
export const MIN_HZ = 70;
export const MAX_HZ = 1200;

const FRAME = 2048;
const HOP = 512;

export type PitchFrame = {
  time: number;
  /** Fractional MIDI number, or null when unvoiced (breath, silence, consonants). */
  midi: number | null;
  energy: number;
};

export type Note = { midi: number; start: number; end: number };

export const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);
export const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// `s` for sharp rather than `#`: Strudel accepts [#bsf], and `s` keeps note
// names word-characters so the step-grid preview can read them.
const NAMES = ["c", "cs", "d", "ds", "e", "f", "fs", "g", "gs", "a", "as", "b"];

export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  return `${NAMES[((rounded % 12) + 12) % 12]}${octave}`;
}

/**
 * YIN fundamental-frequency estimate for one frame.
 * @returns hertz, or null if the frame is unvoiced.
 */
export function detectF0(
  frame: Float32Array,
  sampleRate: number,
  { threshold = 0.15, energyFloor = 0.005 } = {},
): number | null {
  const window = Math.floor(frame.length / 2);
  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_HZ));
  const tauMax = Math.min(window, Math.ceil(sampleRate / MIN_HZ));
  if (tauMax <= tauMin) return null;

  let energy = 0;
  for (let i = 0; i < frame.length; i += 1) energy += frame[i] * frame[i];
  if (Math.sqrt(energy / frame.length) < energyFloor) return null;

  // Squared-difference function.
  const diff = new Float64Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    let sum = 0;
    for (let i = 0; i < window; i += 1) {
      const delta = frame[i] - frame[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Cumulative mean normalized difference — this is what suppresses the
  // octave-below errors that plain autocorrelation is prone to.
  const cmnd = new Float64Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    running += diff[tau];
    cmnd[tau] = running === 0 ? 1 : (diff[tau] * (tau - tauMin + 1)) / running;
  }

  // First dip below threshold, then descend to the bottom of that dip.
  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    if (cmnd[tau] >= threshold) continue;
    while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau += 1;
    best = tau;
    break;
  }
  if (best < 0) return null; // nothing periodic enough — treat as unvoiced

  // Parabolic interpolation for sub-sample period accuracy.
  const prev = cmnd[Math.max(tauMin, best - 1)];
  const next = cmnd[Math.min(tauMax, best + 1)];
  const denominator = 2 * (2 * cmnd[best] - prev - next);
  const shift = denominator === 0 ? 0 : (next - prev) / denominator;
  const period = best + shift;

  const hz = sampleRate / period;
  return hz >= MIN_HZ && hz <= MAX_HZ ? hz : null;
}

export function trackPitch(samples: Float32Array, sampleRate: number): PitchFrame[] {
  const frames: PitchFrame[] = [];
  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    const frame = samples.subarray(start, start + FRAME);
    let energy = 0;
    for (let i = 0; i < frame.length; i += 1) energy += frame[i] * frame[i];
    const hz = detectF0(frame, sampleRate);
    frames.push({
      time: start / sampleRate,
      midi: hz === null ? null : hzToMidi(hz),
      energy: Math.sqrt(energy / frame.length),
    });
  }
  return frames;
}

/** Median of the rounded pitches in a window — kills single-frame jitter. */
function smooth(frames: PitchFrame[], index: number, radius: number): number | null {
  const values: number[] = [];
  for (let i = index - radius; i <= index + radius; i += 1) {
    const midi = frames[i]?.midi;
    if (midi != null) values.push(Math.round(midi));
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

/**
 * Group consecutive frames of the same pitch into notes.
 * Anything shorter than `minDurationSec` is a glide or a wobble, not a note.
 *
 * The default is bounded from below by the analysis window: each frame covers
 * FRAME/sampleRate (~46ms at 44.1kHz), so a 30ms blip still smears across
 * several frames and *measures* as ~80ms. Asking for a shorter minimum than
 * ~2× the window silently does nothing. At 120bpm a sixteenth is 125ms, so
 * 100ms keeps every note a person can hum while discarding ornaments.
 */
export function segmentNotes(
  frames: PitchFrame[],
  sampleRate: number,
  { minDurationSec = 0.1, smoothRadius = 2 } = {},
): Note[] {
  const hop = HOP / sampleRate;
  const notes: Note[] = [];
  let current: Note | null = null;

  frames.forEach((frame, i) => {
    const midi = smooth(frames, i, smoothRadius);
    if (midi === null) {
      if (current) notes.push(current);
      current = null;
      return;
    }
    if (current && current.midi === midi) {
      current.end = frame.time + hop;
      return;
    }
    if (current) notes.push(current);
    current = { midi, start: frame.time, end: frame.time + hop };
  });
  if (current) notes.push(current);

  return notes.filter((note) => note.end - note.start >= minDurationSec);
}

export type MelodyOptions = { bpm: number; bars: number; stepsPerBar?: number };

/**
 * Snap notes to the grid and emit Strudel mini-notation.
 * `~` is a rest, `_` sustains the previous note — e.g. `"c4 _ _ _ e4 _ ~ ~"`.
 */
export function quantizeMelody(
  notes: Note[],
  { bpm, bars, stepsPerBar = 16 }: MelodyOptions,
): string {
  const totalSteps = Math.max(1, Math.round(bars * stepsPerBar));
  const duration = (60 / bpm) * 4 * bars;
  const slots: string[] = new Array(totalSteps).fill("~");

  for (const note of notes) {
    const startStep = Math.round((note.start / duration) * totalSteps);
    const endStep = Math.round((note.end / duration) * totalSteps);
    if (startStep >= totalSteps) continue;

    slots[Math.max(0, startStep)] = midiToNoteName(note.midi);
    // Hold the note across the steps it actually spans.
    for (let step = startStep + 1; step < Math.min(endStep, totalSteps); step += 1) {
      slots[step] = "_";
    }
  }

  return slots.join(" ");
}
