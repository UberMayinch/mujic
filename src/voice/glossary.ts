/**
 * ASR transcript normalization.
 *
 * Speech recognition mangles domain vocabulary — this project's own name for
 * its IR came back from ASR as "student" instead of "Strudel". Normalizing
 * against a term list before the LLM sees the transcript is cheap,
 * deterministic, and fixes the failure mode that otherwise reads to the user
 * as "the AI didn't understand me".
 */

type Rule = { pattern: RegExp; replace: string };

const RULES: Rule[] = [
  // The IR's own name.
  { pattern: /\b(student|strudle|strudle|streudel|struedel)\b/gi, replace: "strudel" },

  // Spoken-form → the short handle a track is likely to be named.
  //
  // These collapse *multi-word* spoken forms only. Deliberately no rule maps a
  // single word to a sample code (no "clap" → "cp"): the glossary's job is
  // repairing ASR, not translating vocabulary, and a word→code rule would break
  // track addressing the moment a track is actually named "clap".
  { pattern: /\bbass drum\b|\bkick drum\b/gi, replace: "kick" },
  { pattern: /\bhi[- ]?hats?\b|\bhigh hats?\b/gi, replace: "hats" },
  { pattern: /\bsnare drum\b/gi, replace: "snare" },

  // Function names Strudel actually exposes.
  { pattern: /\byou[- ]?clid\b|\beuclidean\b|\byou clid\b/gi, replace: "euclid" },
  { pattern: /\bjukes?\b|\bjuke's\b/gi, replace: "jux" },
  { pattern: /\breverse\b/gi, replace: "rev" },
  { pattern: /\blow pass( filter)?\b/gi, replace: "lpf" },
  { pattern: /\breverb\b/gi, replace: "room" },
  { pattern: /\bvolume\b|\bloudness\b/gi, replace: "gain" },

  // Rhythmic vocabulary — spoken forms that must survive to the LLM intact.
  { pattern: /\bsixteenth?s?\b|\b16th?s?\b/gi, replace: "sixteenths" },
  { pattern: /\beighth?s?\b|\b8th?s?\b/gi, replace: "eighths" },
  { pattern: /\bquarters?\b|\b4th?s?\b/gi, replace: "quarters" },

  // Tempo.
  { pattern: /\bbeats per minute\b|\bb\.?p\.?m\.?\b/gi, replace: "bpm" },
  { pattern: /\btempo\b/gi, replace: "bpm" },
];

/**
 * @param trackNames the user's own track names — the addressable vocabulary,
 *   normalized case-insensitively so "the HATS" resolves like "hats".
 */
export function normalizeTranscript(raw: string, trackNames: string[] = []): string {
  let text = raw.trim().replace(/\s+/g, " ");

  for (const { pattern, replace } of RULES) {
    text = text.replace(pattern, replace);
  }

  // Snap near-matches of the user's own track names back to their exact form.
  for (const name of trackNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), name);
  }

  return text;
}
