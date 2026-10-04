/**
 * The one server route: normalized transcript + current document → edit ops.
 *
 * This process exists so the Anthropic API key never reaches the browser.
 */

import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { EDIT_OPS_SCHEMA } from "./opSchema";
import { addStem, readStems, sanitize } from "./stems";
import { resolveCell } from "../src/model/arrange";
import type { ProjectDoc } from "../src/model/project";

const app = express();
app.use(express.json({ limit: "1mb" }));

const client = new Anthropic();

const SYSTEM = `You translate a musician's spoken instruction into edit operations on a music project.

The project is a grid. Tracks are rows; song sections (intro, verse, chorus) are columns laid
out in order along a timeline. A cell says what one track plays during one section, and a cell
can *inherit* — carrying over whatever the section to its left played — so an unchanged track
is not repeated in every section.

You never write JavaScript. You only emit the structured ops in the response schema; a
deterministic renderer turns the document into Strudel code.

Tracks are one of two kinds, and a track's patterns must match its kind:
- drum tracks ("sample") carry sample names — "bd*4", "~ sd ~ sd"
- melodic tracks ("note") carry pitches — "c4 e4 g4", "c4 _ _ ~ e4 _ ~ ~"

Mini-notation you should use:
- "bd*4"       four kicks per bar (one bar = one cycle)
- "hh*16"      sixteenths
- "~ sd ~ sd"  rests on 1 and 3, snare on 2 and 4
- "bd(3,8)"    euclidean: 3 hits spread evenly over 8 steps
- "[bd sd]*2"  grouping
- "<bd sd>"    alternate one per bar
- "c4 e4 g4"   pitches, for melodic tracks. "~" is a rest, "_" holds the
               previous note. Sharps are written "cs4", never "c#4".

Rules:
- Address tracks and sections by the names listed below. If the instruction names neither an
  existing track nor a clear new one, return no ops and say what you'd need clarified.
- Only set "section" when the user actually names one ("in the chorus, ..."). Otherwise omit it
  and the edit lands on the section they're looking at.
- To drop a track for one section ("no hats in the breakdown") use set_cell with mode "silent",
  not a muted toggle — muting silences the track across the entire timeline.
- Keep a track's existing sound name in its pattern unless asked to change the sound.
- Never write pitches into a drum track or sample names into a melodic one.
- When adding anything pitched (bassline, melody, chords, pad), set kind to "note".
- Transposition ("take the melody up a fifth") means rewriting that track's pitches.
- "sixteenths" means *16, "eighths" means *8, "quarters" means *4.
- Prefer the smallest set of ops that satisfies the instruction.
- The user is a strong musician with little production experience: speak in musical terms,
  not production jargon, and keep the reply to one sentence.`;

/**
 * Render the grid the way the user sees it, so the model addresses the same
 * cells they do — inheritance shown as "↳ from <section>" rather than silently
 * flattened, which is what stops it rewriting a cell that was never explicit.
 */
function describeGrid(doc: ProjectDoc, currentSectionId?: string): string {
  return doc.sections
    .map((section, i) => {
      const marker = section.id === currentSectionId ? "  ← currently editing" : "";
      const rows = doc.tracks.map((track) => {
        const { pattern, from } = resolveCell(doc, i, track);
        const origin = from && from.id !== section.id ? ` ↳ inherited from ${from.name}` : "";
        const state = pattern === null ? "silent" : `"${pattern}"`;
        const flags =
          (track.muted ? " [muted everywhere]" : "") +
          (track.codeOwned ? " [CODE-OWNED — cannot be edited structurally]" : "");
        return `    ${track.name}: ${state}${origin}${flags}`;
      });
      return [`  ${section.name} (${section.bars} bars)${marker}`, ...rows].join("\n");
    })
    .join("\n");
}

app.post("/api/interpret", async (req, res) => {
  const { transcript, doc, sectionId } = req.body ?? {};
  if (typeof transcript !== "string" || !transcript.trim()) {
    return res.status(400).json({ error: "transcript is required" });
  }
  if (!doc || !Array.isArray(doc.tracks) || !Array.isArray(doc.sections)) {
    return res.status(400).json({ error: "doc with tracks and sections arrays is required" });
  }

  const grid = describeGrid(doc as ProjectDoc, sectionId);

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      system: SYSTEM,
      // Structured outputs: the model is constrained to EDIT_OPS_SCHEMA, so the
      // response is always a parseable op list rather than free text we'd have
      // to coax.
      output_config: { format: { type: "json_schema", schema: EDIT_OPS_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `Current project — ${doc.bpm} bpm.\n\nTimeline (sections in order):\n${grid}\n\nInstruction: "${transcript}"`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "request was declined", ops: [], reply: "I can't act on that one." });
    }

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      return res.status(502).json({ error: "no text block in response" });
    }

    return res.json(JSON.parse(text.text));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "rate limited — try again in a moment" });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is missing or invalid" });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[interpret]", message);
    return res.status(500).json({ error: message });
  }
});

/* ------------------------------------------------------------- the shelf */

app.get("/api/stems", (_req, res) => res.json({ stems: readStems() }));

app.post("/api/stems", (req, res) => {
  const stem = sanitize(req.body);
  if (!stem) return res.status(400).json({ error: "a stem needs at least one track with a pattern" });
  return res.json({ stems: addStem(stem), stem });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`mujic api listening on http://localhost:${port}`));
