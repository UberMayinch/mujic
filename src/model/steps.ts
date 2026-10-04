/**
 * Mini-notation → step grid, for the stem view's preview.
 *
 * This is a *preview* of the document's pattern, not an independent editor —
 * the document stays the source of truth. It handles the subset codegen itself
 * emits; anything richer returns null so the UI can say "no preview" rather
 * than draw a rhythm that isn't what you're hearing.
 */

/** 16 steps per bar — enough resolution for the common patterns. */
export const STEPS = 16;

/**
 * Bjorklund's algorithm — the real one, matching what Tidal/Strudel play.
 * E(3,8) is `x..x..x.` (hits at 0, 3, 6). Evenly-spaced approximations get the
 * hit *count* right and the *positions* wrong, which is exactly the kind of
 * quiet lie this grid must not tell.
 */
export function bjorklund(hits: number, slots: number): boolean[] {
  if (slots <= 0) return [];
  if (hits <= 0) return new Array(slots).fill(false);
  if (hits >= slots) return new Array(slots).fill(true);

  let a: boolean[][] = Array.from({ length: hits }, () => [true]);
  let b: boolean[][] = Array.from({ length: slots - hits }, () => [false]);

  while (b.length > 1) {
    const pairs = Math.min(a.length, b.length);
    const merged = a.slice(0, pairs).map((group, i) => [...group, ...b[i]]);
    const remainderA = a.slice(pairs);
    b = remainderA.length > 0 ? remainderA : b.slice(pairs);
    a = merged;
  }

  return [...a.flat(), ...b.flat()];
}

/** Spread `slots` positions across the 16-step grid. */
function toGrid(onsets: boolean[]): boolean[] {
  const grid = new Array(STEPS).fill(false);
  onsets.forEach((on, i) => {
    if (on) grid[Math.round((i * STEPS) / onsets.length) % STEPS] = true;
  });
  return grid;
}

/** @returns the grid, or null when the pattern is outside the previewable subset. */
export function stepsFor(pattern: string): boolean[] | null {
  const source = pattern.trim();

  const repeat = source.match(/^([\w:.-]+)\*(\d+)$/);
  if (repeat) {
    const count = Number(repeat[2]);
    if (count < 1 || count > STEPS) return null;
    return toGrid(new Array(count).fill(true));
  }

  const euclid = source.match(/^([\w:.-]+)\((\d+),\s*(\d+)\)$/);
  if (euclid) {
    const hits = Number(euclid[2]);
    const slots = Number(euclid[3]);
    if (slots < 1 || slots > STEPS) return null;
    return toGrid(bjorklund(hits, slots));
  }

  // A flat sequence of sounds, rests and sustains: "~ sd ~ sd", "c4 _ _ ~".
  const tokens = source.split(/\s+/);
  if (tokens.length > 1 && tokens.length <= STEPS && tokens.every((t) => /^[\w:.~-]+$/.test(t))) {
    // `_` holds the previous note — it's the same event continuing, not a new
    // onset, so the grid must not light it up as another hit.
    return toGrid(tokens.map((t) => t !== "~" && t !== "_"));
  }

  // A single sound is one hit on the downbeat.
  if (/^[\w:.-]+$/.test(source)) return toGrid([true]);

  return null;
}
