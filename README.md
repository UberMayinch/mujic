# mujic

Edit music by voice. Speech becomes a structured edit, the edit becomes Strudel code,
the code makes sound — and you can read and hand-edit every step.

Built for a musician with little production experience: you know what you want to hear,
you just don't know which knob it lives behind.

## Run it

```bash
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY
npm run dev               # web on :5173, api on :8787
```

Open http://localhost:5173, press **play** (browsers need a click before audio), then
hold **speak** and say something like:

- "make the hats sixteenths" — edits the section you're looking at
- "in the chorus, drop the kick"
- "add a bridge after the verse"
- "make the chorus sixteen bars"
- "take it to 140"

Speech uses the browser's Web Speech API (Chrome). There's a text box next to the mic
that drives the identical pipeline — useful for testing without talking.

## How it works

```
voice ──ASR──▶ transcript ──glossary──▶ Claude ──▶ EditOp[] ──▶ ProjectDoc ──codegen──▶ Strudel ──▶ audio
                                                                    ▲
                                              timeline / stems / repl
```

One canonical JSON document is the source of truth. Every view edits it; Strudel code is
generated from it. Voice produces **edit ops**, not code — which is what makes undo,
readable diffs, and tests possible. The glossary layer runs before the model because ASR
reliably mangles domain vocabulary (it turned "Strudel" into "student", which is how this
project got its spec).

The document is a **grid** — tracks are rows, song sections are columns along the timeline:

```
          intro    verse    chorus
          (4 bars) (8 bars) (8 bars)
kick      bd*4  ─▶  ·        —          · inherits from the left
hats      —        hh*8  ─▶  hh*16      — silent here (a drop)
bass      —        —        bass(3,8)
```

A cell that inherits carries over whatever the section to its left played, so an unchanged
track isn't copied into every column. That compiles to Strudel's own
`arrange([bars, stack(…)], …)` — meaning **we run no clock or scheduler of our own**.

Click a cell to cycle it: explicit → silent → inherit. Mute (`M`) is a different thing from
a silent cell — mute kills a track across the whole timeline; a silent cell is a drop in one
section.

## Your actual voice: 🎙 sing

`🎤 hum in` captures your *idea* — notes, played back by a synth. **`🎙 sing` captures your
voice**: the recording is stored as audio, registered as a Strudel sample, and plays back as an
ordinary track in the grid. It is the one thing in mujic that is not a symbolic reconstruction.

The audio is left raw on purpose:

| Dial | Default | What the other setting costs |
|---|---|---|
| Snap start to bar | **on** | Off plays your run-up too. Non-destructive either way — it offsets playback, never cuts the file |
| Fit to tempo | **off** | On resamples the take, which **re-pitches** it — mujic ships no phase vocoder, so this is a turntable, not a time-stretch |

Change the tempo after recording and the take will drift, because the audio is left exactly as
you sang it. The track says so — `recorded at 120 bpm, playing at 140` — rather than quietly
re-pitching or smearing it.

Takes stay *beside* the notes rather than replacing them, which is what keeps version control
working: a diff can say `verse/lead: c4 e4 g4 → c4 e4 a4`, but of audio it can only ever say
`take 3 → take 4`. See `docs/ARCHITECTURE.md` § Melody.

## The record shop

A **stem** is pattern JSON — a few tracks and what they play over one section. Not audio. That
is what makes a marketplace possible at all: a stem is a couple of kilobytes, it diffs, and once
you add it to your arrangement it is indistinguishable from something you made — voice-editable,
version-controlled, yours.

Packs are drawn as **schematic discs**: technical drawings where every mark carries data. Groove
bands count the stem's tracks, the dimension line reads bars, tempo and key, and the label is the
catalogue number. You are buying the schematic, not the pressing, so the artwork is the structure.

Recorded takes are never sold — selling someone's voice is a different product with different
consent questions. Prices are recorded and displayed; **nothing is charged and no payment details
are collected anywhere in this app.**

## Projects: init, save, open, export

Projects autosave to browser storage and reopen where you left them. A project is a *repository*:
export writes the document **and its whole commit graph** to one `.mujic.json`, so what you hand
someone carries every version you kept, not just where you stopped.

Browser storage is limited and a couple of bars of audio can exceed it. When that happens mujic
saves the arrangement, drops the audio, and **tells you** — export is the copy that keeps your
takes.

## Three ways in: describe it, beatbox it, or hum it

**Voice describes.** "In the chorus, drop the kick." Words → intent → edit ops.

**🥁 tap in performs rhythm.** Beatbox a bar; onset detection turns it into patterns — low
thump → kick, bright hiss → hats — routed to the tracks already using those sounds.

**🎤 hum in performs melody.** Sing or hum a phrase; YIN pitch tracking turns it into notes:

```
"daaa — da-da — daaaa"   →   c4 _ _ _ ~ ~ e4 _ f4 _ g4 _ _ _ _ _
```

which becomes `note("c4 _ _ _ ~ ~ e4 _ f4 _ g4 _ _ _ _ _").sound("triangle")`.
`~` is a rest, `_` holds the previous note.

Both show you what they heard on the step grid and wait for **use it** before touching the
document — mic detection is fiddly, and silently guessing wrong is worse than asking.

**No model call is involved in either**: deterministic DSP (`src/audio/onsets.ts`,
`src/audio/pitch.ts`), unit-tested against synthesized audio. All three front-ends emit the
same `EditOp[]`, which is why adding one costs a single module.

> **mujic transcribes your idea, not your voice.** Melody is captured *symbolically* —
> notes, not a pitch envelope — so vibrato, timing feel, and timbre are discarded. That's a
> deliberate trade: a raw f0 curve can't be diffed, branched, or edited by voice. See
> `docs/ARCHITECTURE.md` § Melody.

## Versions: git for the arrangement

The **versions** tab gives you commits, branches, restore, and real diffs:

```
verse/hats: hh*8 → hh*16
+ section "chorus" (8 bars)
kick gain 0.8 → 0.4
```

Branch to try a halftime chorus, switch back if it's worse, restore any earlier take.
**Restore appends rather than rewrites** — nothing you do here can lose work.

Melodies are version-controlled on exactly the same terms as the drums, because they're the
same kind of thing in the document: `verse/lead: c4 e4 g4 → c4 e4 a4` is a diff. That only
works because melody is stored symbolically — see the note above.

This is close to free for us and famously hard for DAWs: their projects are opaque binary
with gigabytes of undiffable audio, while ours is small JSON that *generates* its audio.
Commit messages default to the reducer's own description of what changed.

`↶ undo` and versions are deliberately different tools: undo is per-edit for typos, versions
are the takes you deliberately save.

**Picking this up cold? Start with [docs/init.md](docs/init.md)** — handoff note covering
current state, what's verified vs. not, and which decisions not to relitigate.

Full reasoning, including the pattern-model-vs-timeline-model problem and the code-owned
track escape hatch: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.
Competitive landscape and where the whitespace is: **[docs/LANDSCAPE.md](docs/LANDSCAPE.md)**.

## Layout

| Path | What |
|---|---|
| `src/model/project.ts` | The canonical document — tracks × sections |
| `src/model/arrange.ts` | Cell inheritance resolution (what's actually playing where) |
| `src/model/ops.ts` | Edit ops + the pure reducer (undo lives here) |
| `src/model/codegen.ts` | Document → Strudel `arrange()`, deterministic, one direction |
| `src/model/history.ts` | Commits, branches, restore, musical diffs |
| `src/voice/glossary.ts` | ASR normalization before the model sees anything |
| `src/voice/asr.ts` | Speech recognition, swappable in one file |
| `src/audio/onsets.ts` | Beatbox → drum pattern: onset detection + quantize (pure, no model) |
| `src/audio/pitch.ts` | Hum → melody: YIN pitch tracking + note segmentation (pure, no model) |
| `src/audio/tapin.ts` | Microphone capture for tap-in and hum-in |
| `src/audio/take.ts` | Vocal takes: WAV encoding, waveform peaks, lead detection (pure) |
| `src/audio/engine.ts` | The only module that touches Strudel |
| `src/model/persist.ts` | Project init, autosave, export/import, v2→v3 migration |
| `src/model/stem.ts` | Stems: capture a slice of the document, drop one into another |
| `src/ui/ShopView.tsx` | The record shop — shelf, search, publish |
| `src/ui/Disc.tsx` | The schematic disc |
| `design/build.mjs` | Design-system previews — `node design/build.mjs` |
| `src/ui/Timeline.tsx` | The arrangement grid: tracks × sections |
| `src/ui/StemView.tsx` | Stem/step detail for the selected section |
| `src/ui/ReplView.tsx` | Generated code + per-track hand-editing |
| `server/index.ts` | One route: transcript + doc → ops (keeps the API key off the client) |

## Tests

```bash
npm test          # 100 tests: reducer, codegen, glossary, stems, persistence, takes
npm run typecheck
```

The deterministic core is tested; the model call is not mocked — that's the seam where
evals go next.

## Known limits (deliberate, for now)

- **Hand-edited code doesn't flow back into the document.** A track you edit in the REPL
  becomes "code-owned": its GUI controls go read-only and voice commands targeting it are
  refused rather than silently overwriting your code. "Revert to controls" is the way back.
- **The stem grid previews patterns, it isn't a step sequencer yet.** It renders the
  mini-notation the generator emits (`s*n`, sequences, `s(3,8)` euclid — real Bjorklund, so
  the hits land where Strudel actually plays them). Anything richer is labelled "no preview"
  rather than drawing a rhythm you aren't hearing.
- **The model call is the one untested seam.** The reducer, codegen, glossary, and step grid
  have tests; `/api/interpret` has been exercised only for routing and error paths, because
  no API key was available here. Your first `npm run dev` is its first real run.
- **Sections, not free-floating clips.** Everything is section-aligned, so a fill starting at
  bar 3.5 needs its own short section. Cells could grow a start offset later — additive, not
  a rewrite.
- **Mix is track-level.** "Quieter in the intro" isn't expressible yet; gain and fx span the
  whole timeline. The natural home is optional gain on a cell.
- **Code-owned tracks ignore the grid.** Hand-written code plays verbatim in every section.
- **No pitch correction on takes.** "Tune to notes" is not shipped — it needs pitch-shifting DSP
  mujic doesn't have. "Fit to tempo" is resampling, which re-pitches, and is labelled as such.
- **Take playback is verified, take capture isn't.** Registering a WAV data URL as a Strudel
  sample and evaluating the chains codegen emits was run in the browser and works. The
  microphone path (`getUserMedia` → `MediaRecorder` → `makeTake`) has never met a real mic.
- **The shop has no accounts and no payments.** Prices display; nothing is charged. Anyone with
  access to the API can publish, and published stems are trusted only after server-side
  sanitizing (`server/stems.ts`).
