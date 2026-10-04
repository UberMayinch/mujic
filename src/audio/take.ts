/**
 * Recorded vocal takes: capture, encode, and describe.
 *
 * Unlike `pitch.ts`, nothing here analyses the performance away. The samples
 * the microphone produced are the samples that get stored and played back —
 * this module only wraps them in a container Strudel can load, and measures two
 * things the UI needs (a waveform to draw, and where the singing starts).
 *
 * The pure half — `encodeWav`, `peaksOf`, `leadOf` — is separately tested
 * against synthesized audio, which is why none of it touches a microphone.
 */

import { recordBars, type Recording } from "./tapin";
import { newTakeId, type Take } from "../model/project";

/** Amplitude below which a frame counts as room tone rather than a voice. */
const SILENCE_FLOOR = 0.02;

/**
 * Encode mono float samples as a 16-bit PCM WAV data URL.
 *
 * WAV because it is lossless and every browser decodes it without a codec
 * negotiation — a take is the user's own performance, and re-compressing it to
 * save bytes would be the wrong trade in the one place fidelity is the point.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): string {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header length
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i += 1) {
    // Clamp before scaling: a sample above 1 would wrap to a loud click.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  let binary = "";
  const raw = new Uint8Array(bytes);
  // Chunked because String.fromCharCode(...millions) overflows the call stack.
  for (let i = 0; i < raw.length; i += 8192) {
    binary += String.fromCharCode(...raw.subarray(i, i + 8192));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** Peak amplitude per bucket, for drawing a waveform without decoding audio. */
export function peaksOf(samples: Float32Array, buckets = 64): number[] {
  if (samples.length === 0) return [];
  const size = Math.max(1, Math.floor(samples.length / buckets));
  const out: number[] = [];

  for (let b = 0; b < buckets; b += 1) {
    let peak = 0;
    const start = b * size;
    for (let i = start; i < Math.min(start + size, samples.length); i += 1) {
      const value = Math.abs(samples[i]);
      if (value > peak) peak = value;
    }
    out.push(+peak.toFixed(3));
  }
  return out;
}

/**
 * Where the performance actually starts, as a fraction of the whole take.
 *
 * A singer coming in a beat late is the normal case, not an error — this is
 * what `snapStart` skips past. Returns 0 when the take opens loud, and 0 when
 * it is silent throughout, because offsetting into silence would be worse than
 * playing it.
 */
export function leadOf(samples: Float32Array, floor = SILENCE_FLOOR): number {
  for (let i = 0; i < samples.length; i += 1) {
    if (Math.abs(samples[i]) >= floor) return i / samples.length;
  }
  return 0;
}

/** Build a stored take from raw captured audio. Pure, so it is testable. */
export function makeTake(recording: Recording, bars: number, bpm: number): Take {
  const { samples, sampleRate } = recording;
  return {
    id: newTakeId(),
    audio: encodeWav(samples, sampleRate),
    bars,
    recordedBpm: bpm,
    peaks: peaksOf(samples),
    lead: leadOf(samples),
    createdAt: Date.now(),
  };
}

/** Count in, record `bars` bars of voice, and store it as a take. */
export async function recordTake(
  bpm: number,
  bars: number,
  onTick?: (barsRemaining: number) => void,
): Promise<Take> {
  return makeTake(await recordBars(bpm, bars, onTick), bars, bpm);
}
