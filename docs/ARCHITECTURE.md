# Architecture — mujic

## The one decision everything else follows from

**Pattern model ≠ timeline model.** Strudel is *cyclic pattern code*: infinite loop,
relative time, `s("bd*4")`. An FL-Studio-style stem view is *absolute-time clips on a
grid*. These are different data models. "Flip between the two views" is only tractable
if exactly one of them is the source of truth.

**Decision: a single canonical JSON document is the source of truth. Strudel code is
generated from it. Both views edit the same document.**

```
   voice  ──ASR──▶ transcript ──normalize──▶ LLM ──▶ EditOp[]  ─┐
                                                                 ▼
   timeline grid ───────────────────────────────────────▶  ProjectDoc  (source of truth)
   stem view    ───────────────────────────────────────▶   tracks × sections
                                                                 │
                                                    codegen ─────┤
                                                                 ▼
                                                     arrange([bars, stack(…)], …)
                                                                 │
                                                                 ├──▶ superdough (audio)
                                                                 ▼
                                                          REPL view (editable)
```

## Explicit MVP non-goal

**We do not parse hand-edited Strudel JS back into the document.** Round-tripping
arbitrary JS into a structured model is a parser project, not an MVP.

Instead: when the user hand-edits a track's code in the REPL, that track flips to
`codeOwned: true`. Its GUI parameter controls go read-only, and codegen emits the
user's code verbatim for that track. Voice commands targeting a code-owned track are
refused with a clear message ("that track is code-owned — revert it or edit the code").
`revert` clears the flag and regenerates from the document.

This is the single most important thing to get right up front — retrofitting it is a
rewrite.

## Voice pipeline — never one LLM hop

```
audio ──▶ ASR ──▶ glossary normalization ──▶ LLM ──▶ EditOp[] (JSON) ──▶ reducer ──▶ ProjectDoc
```

Four reasons not to go voice → code directly:

1. **Undo/redo** is free when the unit of change is a diff op, impossible when it's a
   regenerated code blob.
2. **Diffs are showable** — the user sees "hats: `8` → `16`" instead of a wall of
   re-emitted code.
3. **Testable** — an op list is assertable in a unit test; generated JS is not.
4. **Deterministic rendering** — the same document always produces the same code, so
   codegen bugs are reproducible and separate from LLM bugs.

### The glossary layer is not optional

This project's own origin is the argument: ASR transcribed **"Strudel"** as
**"student"**. Before the LLM sees a transcript, we normalize against a term list:
`strudel`, sound names (`bd`, `sd`, `hh`, `oh`, `cp`), function names (`euclid`, `jux`,
`rev`, `gain`, `room`), and the user's own track names. Cheap, deterministic, and it
fixes the failure mode that would otherwise look like "the AI didn't understand me".

## Reconciling cyclic time with a timeline

The document is a **grid**: tracks are rows, sections are columns in playback order.
A **cell** says what one track plays during one section, and a cell may *inherit* —
carrying over whatever the section to its left resolved to.

```
          intro    verse    chorus
          (4 bars) (8 bars) (8 bars)
kick      bd*4  ─▶  ·        —          · inherits from the left
hats      —        hh*8  ─▶  hh*16      — silent here (a drop)
bass      —        —        bass(3,8)
```

Inheritance is what stops "the kick is the same all the way through" from being copied
into every column and drifting out of sync as the song grows.

This reads as an FL playlist *and* as Ableton scenes, and it subsumes both alternatives
we considered: scene-rows are this grid with every cell explicit; per-track clip lanes are
this grid with arbitrary start bars. What it deliberately gives up is clips at arbitrary
offsets — a fill starting at bar 3.5 needs its own section for now.

**Cyclic time survives inside a cell; absolute time lives only in section order and bar
counts.** Nothing has to reconcile the two, because Strudel's own `arrange()` takes exactly
that shape.

## Document shape

```ts
type ProjectDoc = {
  version: 2
  bpm: number            // rendered as cps = bpm/60/4
  tracks: Track[]        // rows
  sections: Section[]    // columns, in playback order — this IS the timeline
}

type Section = {
  id: string
  name: string           // "intro", "chorus" — the voice-addressable handle
  bars: number           // one bar == one Strudel cycle
  cells: Record<TrackId, Cell>   // missing entry == inherit
}

type Cell =
  | { kind: "inherit" }                    // carry over from the left
  | { kind: "silent" }                     // deliberately not playing here
  | { kind: "pattern"; pattern: string }   // explicit mini-notation

type Track = {
  id: string
  name: string           // "kick", "hats" — the voice-addressable handle
  defaultSound: string   // sample used when a NEW pattern is written for this track;
                         // codegen never reads it — patterns carry their own sound
  gain: number           // 0..1.5   ┐
  muted: boolean         //          │ mix state is track-level and spans the whole
  soloed: boolean        //          │ timeline — it's a performance control, not
  fx: { … }              //          ┘ arrangement. To drop a track for one section,
                         //            set that cell to `silent`.
  codeOwned: boolean     // true = hand-edited; emits verbatim in EVERY section
  code?: string
}
```

Mute vs. a silent cell is the distinction most likely to be gotten wrong, so the prompt
names it explicitly: **mute silences a track everywhere; a silent cell is a drop.**

## Codegen targets Strudel's own `arrange()`

```js
setcps(0.5) // 120 bpm

arrange(
  // intro — 4 bars
  [4, stack( s("bd*4").gain(0.8), )],
  // verse — 8 bars
  [8, stack( s("bd*4").gain(0.8), s("hh*8").gain(0.5), )],
  // chorus — 8 bars
  [8, stack( s("hh*16").gain(0.5), s("bass(3,8)").gain(0.8), )],
)
```

`arrange([cycles, pattern], …)` is native to Strudel, so **we run no clock, no scheduler,
and no section-switching logic of our own.** A single-section project skips `arrange()` and
emits a bare `stack()` — the jam case stays a simple loop.

## Edit ops

The LLM's entire output surface. A closed set — anything outside it is rejected before
it touches the document.

Ops that touch a cell take an **optional `section`**. Omitted means "the section being
edited", so "make the hats sixteenths" keeps working, while "in the chorus, make the hats
sixteenths" addresses a specific column.

| Op | Fields | Voice example |
|---|---|---|
| `set_pattern` | `track`, `pattern`, `section?` | "in the chorus, make the hats sixteenths" |
| `set_cell` | `track`, `mode` (`inherit`/`silent`), `section?` | "no kick in the breakdown" |
| `set_param` | `track`, `param`, `value` | "turn the kick down" |
| `toggle` | `track`, `field` (`muted`/`soloed`) | "mute the bass" (everywhere) |
| `add_track` | `name`, `sound`, `pattern`, `section?` | "add a clap on the offbeat" |
| `remove_track` | `track` | "get rid of the snare" |
| `add_section` | `name`, `bars`, `after?` | "add a bridge after the verse" |
| `remove_section` | `section` | "cut the intro" |
| `set_section_bars` | `section`, `bars` | "make the chorus sixteen bars" |
| `set_bpm` | `bpm` | "take it to 140" |

Every op is applied by a pure reducer, so undo is just keeping the previous document.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Pattern engine | `@strudel/core` + `@strudel/webaudio` | The IR; runs in-browser, no SuperCollider |
| UI | Vite + React + TypeScript | Fast, and the REPL/stem split is component-shaped |
| ASR | Web Speech API (browser) | Zero-install for MVP; swap point isolated in `src/voice/asr.ts` |
| LLM | Claude `claude-opus-5` via a small Express proxy | Key stays server-side; structured outputs give us a guaranteed op-shaped JSON response |

The Express server exists for exactly one reason: an API key must not ship to the
browser. It has one route.

## First vertical slice (the MVP user story)

> As a musician who can't produce, I speak "make the hats sixteenths", and the hats
> change — and I can see exactly what changed, in both the code and the stem grid.

speak → transcript → normalized → edit op → document → generated Strudel → audible
change on one track. Not FL Studio. That comes after this loop feels like an instrument.

## Melody: symbolic, not a performance capture

Humming in raises a real fork, worth stating because it's tempting to pick the other side:

| | Symbolic melody (chosen) | Performance capture |
|---|---|---|
| Representation | `"c4 _ _ ~ e4"` | f0 curve, amplitude, formants, vibrato, breath |
| Recreates | the **melody** | your **actual take** |
| Editable by voice | yes — "take the lead up a fifth" | no |
| Diffable | yes — `verse/lead: c4 e4 → c4 g4` | no |
| Branchable | yes | not meaningfully |

**We chose symbolic, and the reason is the version control.** A raw f0 envelope is a dense
numeric blob: it can't be diffed, branched, or edited by voice — which is precisely the
opaque-payload problem that makes version control fail for every DAW (see
`docs/LANDSCAPE.md`). Capturing performance nuance would buy fidelity and cost us the one
property the whole product is built on.

The consequence is honest and worth saying out loud: **mujic reconstructs your idea, not
your voice.** Vibrato, timing feel, and timbre are discarded at the moment of transcription.
If performance capture ever matters, the right shape is to keep the take as an *attached
reference* alongside the symbolic notes — never as the canonical representation.

Pitch detection is YIN in TypeScript (`src/audio/pitch.ts`), not Python/librosa: keeping it
in-browser preserves the single-app deployment story, and monophonic humming doesn't need
more. It is tested against synthesized harmonic-rich tones, since a sung vowel has
partials — exactly the case that makes naive autocorrelation report the octave below.

## What the grid still doesn't do

- **Clips at arbitrary offsets.** Everything is section-aligned. A fill starting at bar 3.5
  needs its own short section. If this becomes the common case, cells grow a start offset —
  that's an additive change, not a rewrite.
- **Per-section mix.** Gain/fx are track-level, so "quieter in the intro" isn't expressible
  yet. The natural home is optional gain on a cell.
- **Code-owned tracks ignore the grid.** Hand-written code plays verbatim in every section.
  Per-section code would mean per-cell code ownership; deferred until the flag proves useful.

## Open risks

- **Latency budget.** Speak→hear needs to feel instrument-like. If the LLM hop is the
  bottleneck, the fix is a local fast path for the ~20 most common commands
  (regex/keyword → op, no model call) with the LLM as fallback.
- **Track addressing.** "the hats" must resolve to a track. Track names go into the
  prompt as the addressable vocabulary; ambiguity gets a clarifying response, not a guess.
- **Does the ICP want the code at all,** or is the REPL a trust device they never touch?
  The dual view is the bet; usage will tell us.
