/**
 * The stem shelf: a shared catalogue of pattern JSON.
 *
 * Backed by one JSON file on disk. That is genuinely enough here — a stem is a
 * couple of kilobytes of patterns, not audio, so the entire shop fits in memory
 * and there is no object storage, transcoding, or CDN behind any of it. Swap in
 * a real database when there are sellers to justify one; the shape won't change.
 *
 * Payments are deliberately absent. Prices are recorded and displayed, nothing
 * is charged, and no payment details are collected anywhere in this app.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Stem } from "../src/model/stem";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "stems.json");

/** Seeded so the shop is never an empty room on first run. */
const SEED: Stem[] = [
  {
    id: "MJ-014",
    title: "Dilla-adjacent drums",
    seller: "hovercraft",
    priceCents: 400,
    bpm: 92,
    bars: 8,
    key: "—",
    tag: "DRUMS",
    tracks: [
      { name: "kick", kind: "sample", defaultSound: "bd", gain: 0.9, fx: {}, pattern: "bd ~ ~ bd ~ ~ bd ~" },
      { name: "snare", kind: "sample", defaultSound: "sd", gain: 0.8, fx: { room: 0.2 }, pattern: "~ ~ sd ~" },
      { name: "hats", kind: "sample", defaultSound: "hh", gain: 0.45, fx: {}, pattern: "hh*8" },
    ],
  },
  {
    id: "MJ-027",
    title: "Halftime chorus kit",
    seller: "ninth street",
    priceCents: 600,
    bpm: 140,
    bars: 8,
    key: "F min",
    tag: "KIT",
    tracks: [
      { name: "kick", kind: "sample", defaultSound: "bd", gain: 1, fx: {}, pattern: "bd ~ ~ ~" },
      { name: "snare", kind: "sample", defaultSound: "sd", gain: 0.9, fx: { room: 0.35 }, pattern: "~ ~ sd ~" },
      { name: "hats", kind: "sample", defaultSound: "hh", gain: 0.4, fx: {}, pattern: "hh*16" },
      { name: "sub", kind: "note", defaultSound: "sine", gain: 0.8, fx: { lpf: 200 }, pattern: "f1 ~ ~ c2" },
    ],
  },
  {
    id: "MJ-031",
    title: "Rhodes progression",
    seller: "mor.",
    priceCents: 300,
    bpm: 120,
    bars: 4,
    key: "C maj",
    tag: "KEYS",
    tracks: [
      { name: "rhodes", kind: "note", defaultSound: "triangle", gain: 0.7, fx: { room: 0.5 }, pattern: "c4 e4 g4 b4" },
      { name: "pad", kind: "note", defaultSound: "sawtooth", gain: 0.35, fx: { lpf: 900 }, pattern: "c3 ~ a3 ~" },
    ],
  },
  {
    id: "MJ-042",
    title: "Two-step skeleton",
    seller: "hovercraft",
    priceCents: 0,
    bpm: 132,
    bars: 16,
    key: "G min",
    tag: "FULL",
    tracks: [
      { name: "kick", kind: "sample", defaultSound: "bd", gain: 1, fx: {}, pattern: "bd ~ ~ bd ~ bd ~ ~" },
      { name: "snare", kind: "sample", defaultSound: "sd", gain: 0.85, fx: {}, pattern: "~ ~ sd ~" },
      { name: "hats", kind: "sample", defaultSound: "hh", gain: 0.4, fx: {}, pattern: "hh(5,8)" },
      { name: "rim", kind: "sample", defaultSound: "cp", gain: 0.3, fx: {}, pattern: "~ cp ~ ~" },
      { name: "bass", kind: "note", defaultSound: "sine", gain: 0.8, fx: { lpf: 300 }, pattern: "g1 ~ bb1 c2" },
      { name: "lead", kind: "note", defaultSound: "triangle", gain: 0.55, fx: { room: 0.4 }, pattern: "g4 ~ bb4 d5" },
    ],
  },
];

export function readStems(): Stem[] {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : SEED;
  } catch {
    // No file yet, or it's unreadable — the seeded shelf is the right fallback.
    return SEED;
  }
}

/**
 * Put a stem on the shelf under a fresh catalogue number.
 *
 * The id is assigned here, from the catalogue, rather than by `sanitize` — a
 * random number in a 900-wide space collides within dozens of publishes, and
 * because `addStem` filters by id a collision would *replace* another seller's
 * stem rather than being rejected.
 */
export function addStem(stem: Stem): Stem[] {
  const current = readStems();
  const highest = current.reduce((max, s) => {
    const n = Number(String(s.id).replace(/^MJ-/, ""));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  const next = [{ ...stem, id: `MJ-${String(highest + 1).padStart(3, "0")}` }, ...current];
  writeFileSync(FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/**
 * Validate a stem posted by a client.
 *
 * The shelf is shared, so nothing from a request is trusted: fields are
 * rebuilt one by one rather than spread, which keeps anything extra a client
 * sends — an `audio` blob especially — out of the catalogue entirely.
 */
export function sanitize(input: unknown): Stem | null {
  const raw = input as Partial<Stem>;
  if (!raw || typeof raw !== "object") return null;
  if (!Array.isArray(raw.tracks) || raw.tracks.length === 0) return null;

  const text = (value: unknown, fallback: string, max = 60): string =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;

  const tracks = raw.tracks.slice(0, 24).flatMap((track) => {
    if (!track || typeof track.pattern !== "string" || !track.pattern.trim()) return [];
    const kind = track.kind === "note" ? "note" : "sample";
    return [
      {
        name: text(track.name, "track", 24),
        kind: kind as "note" | "sample",
        defaultSound: text(track.defaultSound, "bd", 24),
        gain: Number.isFinite(track.gain) ? Math.min(2, Math.max(0, Number(track.gain))) : 0.8,
        fx: {},
        pattern: track.pattern.trim().slice(0, 200),
      },
    ];
  });
  if (tracks.length === 0) return null;

  return {
    // Placeholder — addStem assigns the real catalogue number from the shelf.
    id: "MJ-000",
    title: text(raw.title, "untitled stem"),
    seller: text(raw.seller, "anonymous", 40),
    priceCents: Number.isFinite(raw.priceCents)
      ? Math.min(100_000, Math.max(0, Math.round(Number(raw.priceCents))))
      : 0,
    bpm: Number.isFinite(raw.bpm) ? Math.min(300, Math.max(20, Math.round(Number(raw.bpm)))) : 120,
    bars: Number.isFinite(raw.bars) ? Math.min(64, Math.max(1, Math.round(Number(raw.bars)))) : 8,
    key: text(raw.key, "—", 12),
    tag: text(raw.tag, "STEM", 12).toUpperCase(),
    tracks,
  };
}
