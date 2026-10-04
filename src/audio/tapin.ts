/**
 * Microphone capture for tap-in. Everything browser-specific lives here; the
 * analysis it feeds (onsets.ts) is pure and separately tested.
 */

import { barSeconds } from "./onsets";

export type Recording = { samples: Float32Array; sampleRate: number };

export function isMicSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Record `bars` bars at `bpm`, then decode to mono samples.
 *
 * A short tail is captured past the final bar so a hit landing fractionally
 * late still gets picked up — `quantize` folds it back onto the downbeat.
 */
export async function recordBars(
  bpm: number,
  bars: number,
  onTick?: (barsRemaining: number) => void,
): Promise<Recording> {
  if (!isMicSupported()) throw new Error("this browser exposes no microphone API");

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });

  try {
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => chunks.push(event.data);

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();

    const barMs = barSeconds(bpm) * 1000;
    for (let remaining = bars; remaining > 0; remaining -= 1) {
      onTick?.(remaining);
      await new Promise((r) => setTimeout(r, barMs));
    }
    await new Promise((r) => setTimeout(r, 120)); // tail

    recorder.stop();
    await stopped;

    const audioContext = new AudioContext();
    try {
      const decoded = await audioContext.decodeAudioData(
        await new Blob(chunks).arrayBuffer(),
      );
      return { samples: decoded.getChannelData(0), sampleRate: decoded.sampleRate };
    } finally {
      void audioContext.close();
    }
  } finally {
    // Always release the mic, including on error — a hot mic light that never
    // goes out is the fastest way to lose a user's trust.
    stream.getTracks().forEach((track) => track.stop());
  }
}
