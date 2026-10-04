/**
 * A stem drawn as a technical drawing rather than cover art.
 *
 * What is on sale is the *schematic* — structure you can read, edit and diff —
 * so the artwork is the structure. Every mark carries data: groove bands count
 * the stem's tracks, the dimension line reads bars, tempo and key, and the
 * label is the catalogue number. Nothing here is decoration, which is what
 * keeps a wall of them scannable instead of noisy.
 */

import type { Stem } from "../model/stem";

export function Disc({ stem }: { stem: Stem }) {
  const tracks = Math.max(1, stem.tracks.length);
  const grooves = Array.from({ length: Math.min(tracks, 6) }, (_, i) => 66 - i * 8);

  return (
    <svg
      className="disc"
      viewBox="0 0 220 208"
      role="img"
      aria-label={`${stem.title} — ${tracks} tracks, ${stem.bars} bars, ${stem.bpm} bpm`}
    >
      {/* crop marks: this is a drawing, and drawings have a sheet */}
      <path
        className="crop"
        d="M6 6 h14 M6 6 v14 M214 6 h-14 M214 6 v14 M6 202 h14 M6 202 v-14 M214 202 h-14 M214 202 v-14"
      />

      <circle className="edge" cx="110" cy="98" r="74" />
      {grooves.map((r) => (
        <circle key={r} className="groove" cx="110" cy="98" r={r} />
      ))}
      <circle className="label-disc" cx="110" cy="98" r="22" />
      <circle className="spindle" cx="110" cy="98" r="3.5" />

      <path className="lead" d="M110 18 v6" />
      <text className="call" x="110" y="14" textAnchor="middle">
        {tracks} {tracks === 1 ? "TRACK" : "TRACKS"}
      </text>

      {/* the dimension sits clear of the disc, as a drafting dimension does */}
      <path className="dim" d="M24 186 h172 M24 182 v8 M196 182 v8" />
      <text className="dim-t" x="110" y="202" textAnchor="middle">
        {stem.bars} BARS · {stem.bpm} BPM · {stem.key}
      </text>

      <text className="sig" x="110" y="95" textAnchor="middle">
        {stem.id}
      </text>
      <text className="sig dim-t" x="110" y="106" textAnchor="middle">
        {stem.tag}
      </text>
    </svg>
  );
}
