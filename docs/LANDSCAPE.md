# Landscape Survey — voice-driven music creation via live-coding IR

**Date:** 2026-08-11
**Assumption stated up front:** "student language" in the brief = **Strudel**, the official
JavaScript port of the TidalCycles pattern language. Everything below assumes the
intermediate representation (IR) is Strudel, not GHCi-hosted TidalCycles. Rationale:
Strudel runs entirely in-browser with its own sample engine (superdough), so the REPL
can live *inside* our dashboard. Real TidalCycles needs GHCi + SuperCollider + SuperDirt
as external processes and cannot be embedded — and this machine has no `sclang` installed.

**Evaluation axis:** our ICP is a *strong musician, weak producer*. So the question asked
of every tool below is not "is it powerful" but: **does it let musical intent become an
edit without producer-grade tool knowledge, while keeping the result inspectable and
re-editable?**

---

## 1. Browser live-coding environments (our substrate)

| Tool | What it is | Relevance |
|---|---|---|
| [Strudel](https://strudel.cc/) | Faithful JS port of TidalCycles. Browser REPL, live pattern highlighting, own sample engine. Code is JS + syntax sugar, transpiled then eval'd. | **Our IR and playback engine.** Embeddable; the REPL view of the dashboard is essentially this. |
| [TidalCycles](https://tidalcycles.org/) | Original Haskell pattern language, drives SuperDirt/SuperCollider over OSC. | The semantics we inherit. Not embeddable — external process. Possible later "pro export" target. |
| [Sonic Pi](https://sonic-pi.net/) | Ruby-flavoured live coding, strong education focus, self-contained. | Closest competitor on the "approachable" axis, but desktop-only and imperative/loop-based rather than pattern-based — harder to diff and regenerate from a document model. |
| [Gibber](https://gibber.cc/) | Browser audiovisual live coding, in-editor annotations and visualizations. | Prior art for *visual feedback inside the editor* — worth stealing for the REPL view. |
| [Estuary](https://estuary.mcmaster.ca/) | Zero-install, multilingual, collaborative ("Google Docs for live coding"); multiple languages in one page. | Prior art for multi-view/multi-panel architecture and for collaboration if we ever want it. |

**Whitespace:** all of these assume you *want* to write code. None treat code as a
generated artifact you arrive at by describing music. None ship a timeline/stem view.

---

## 2. LLM-in-the-DAW

- **[WavTool](https://wavtool.com/)** — browser DAW with "Conductor", an NL assistant that
  generates melodies/drums and suggests arrangements. Closest thing to our product shape.
  **Notably: currently offline**, team says features will return. That's both a validation
  signal (someone funded this thesis) and an opening.
- **[LUNA](https://www.uaudio.com/products/luna)** (Universal Audio) — AI Voice Control,
  Smart Tempo, Instrument Detection, framed as "the DAW as your assistant".
  Voice controls *transport and session ops*, not musical content.
- **Ableton / Logic assistant features** — audio-to-MIDI, Session/arrangement helpers.
  Assistive within an existing producer workflow; assumes you already know the DAW.

**Whitespace:** these bolt NL onto an opaque DAW state. The assistant's action is not
inspectable or diffable — you cannot read what it did, only hear it and undo. Our IR
inverts that: every voice command lands as a visible, editable code/document change.

---

## 3. Text→audio generation (adjacent, deliberately *not* our category)

- **[Suno](https://suno.com/)** — prompt → finished song. V5.5 regenerates stems from
  scratch rather than filtering frequencies; Auto Split (up to 12 stems), Split from Mix,
  Advanced Split (~100 instruments, Premier).
- **[Udio](https://udio.com/)** — comparable generation; differentiator is **inpainting**:
  select a ~2s region, describe the change, only that region regenerates.

**Why this is a different category:** output is audio, not structure. You cannot say
"make the hats 16ths" and get a deterministic, repeatable, version-controlled change —
you get a re-roll. Our ICP is a musician with *specific* intent; re-rolling is the wrong
primitive for them. Udio's inpainting is the closest anyone gets to targeted editing, and
it's still probabilistic.

**Worth stealing:** stem separation as an *import* path — bring a reference or an existing
recording in as stems that sit alongside generated patterns.

---

## 4. Sample / stem tooling

- **Splice CoSo, Arcade** — sample discovery and playable stacks; solves "what sound",
  not "what structure".
- **AudioShake, Demucs, Suno Auto Split** — source separation, viable as our import path.

---

## 5. Voice control prior art

- **[Dubler 2](https://vochlea.com/products/dubler2)** — voice→MIDI in real time
  (hum a line, drive a synth). Voice as *instrument*, not as *command*.
- **Tazti and similar** — generic voice→keystroke macros, DAW-agnostic, brittle.
- **LUNA Voice Control** — vendor-native, transport/session scope.

**Whitespace:** nobody treats speech as a **compiler front-end for musical structure**.
Voice is either an instrument (Dubler) or a remote control (Tazti/LUNA). The gap is
speech → semantic edit → structured document → readable code.

---

## 6. Direct prior art on LLM ↔ Strudel/Tidal

- **[calvinw/strudel-llm-docs](https://github.com/calvinw/strudel-llm-docs)** — docs and a
  hosted MCP server letting an LLM play and edit Strudel compositions live. Closest
  existing implementation of our middle layer; check its prompt/doc corpus before writing
  ours.
- **STRUDEL-SYNTH** (arXiv) — research on translating NL music descriptions into idiomatic
  Strudel.
- **[Cibo / Cibo v2](https://arxiv.org/pdf/2106.14835)** — neural agents generating
  TidalCycles code for solo performance; predates LLMs, useful framing on autonomy levels.
- **[Decomposer](https://arxiv.org/pdf/2607.01849)** — learning to decompile symbolic music
  into programs. Relevant if we ever want audio/MIDI → pattern code (the inverse direction
  we're explicitly deferring).

**Community note:** the Strudel/TOPLAP community is openly wary of LLMs and asks that AI
discussion stay in dedicated channels. Anything we ship into that ecosystem needs to be
framed as authoring assistance with human-readable output, not generation-as-product.

---

## 7. Where this product sits

Nobody occupies the intersection of:

1. **Voice as the primary input**, at the level of musical intent ("make the hats 16ths,
   swing them, drop the kick on bar 3") — not transport control, not humming.
2. **A readable, editable code IR** in the middle, so the AI's action is inspectable and
   the user can graduate into editing it directly.
3. **Dual view** — REPL and a stem/timeline surface over the *same* document, so a
   producer-shaped mental model and a coder-shaped one are the same project.

That third point is the hardest and the most defensible. It's also the main technical
risk: pattern code is cyclic and relative-time; a stem timeline is absolute-time clips.
See `docs/ARCHITECTURE.md` for how we reconcile them (single canonical JSON document,
Strudel generated from it, code-ownership flag per track).

---

# Position check — 2026-08-12

Re-run after building the timeline, tap-in, and version control. Scoring against the
three whitespace claims in §7, plus what moved in the market since the first survey.

## What moved

| Signal | So what |
|---|---|
| **[LIA](https://liaplugin.com/daw/)** and **[MIDI Agent](https://www.midiagent.com/)** — NL → *editable MIDI* written into your DAW. LIA's own framing: "an assistant, not a generator." | **Our §2 whitespace narrowed.** "NL edits, not re-rolls" is no longer ours alone. Their bet is a plugin *inside* Logic/FL/Ableton; ours is that the DAW is the barrier. Same thesis, opposite side of the tool. |
| **[Vochlea DubBox](https://www.musicradar.com/music-tech/beatbox-your-ideas-into-reality-with-vochleas-dubbox-an-app-that-converts-your-voice-into-drum-loops)** — beatbox → drum loops, trained on your vocal sounds. | Direct competitor to tap-in, and better at the DSP than we will be soon. But it outputs **a loop**; ours outputs **an edit to a structured document** that voice can then keep editing. |
| **[Suno](https://suno.com/) V5.5 stem regeneration, [Udio](https://udio.com/) inpainting** | Generation keeps eating "make me a track." Reinforces staying out of that lane. |
| **[Gitcrusher](https://github.com/monkybrain/gitcrusher), Dawlab, blend.io** — and the recurring complaint that [git-for-DAWs fails](https://news.ycombinator.com/item?id=45092895) on undiffable audio and opaque binary project files. | **The most useful finding.** See below. |

## The version-control asymmetry

Every attempt at version control for music fights the same two problems: DAW projects are
**opaque binary**, and the payload is **huge undiffable audio**. You get commits that say
nothing and repos that balloon.

Neither applies to us. The document is small structured JSON and **the audio is generated
from it** — so:

- commits are kilobytes, not gigabytes
- diffs are *musical* — `verse/hats: hh*8 → hh*16`, not "binary files differ"
- branching a section is copying an object
- commit messages write themselves, because the reducer already describes every edit in
  the user's own words

This isn't a feature we bolted on well. It's a **structural consequence of the
generate-don't-parse decision** — and it's the one thing here a conventional DAW cannot
copy without becoming us. That makes it worth treating as a headline, not a utility.

## Scorecard against §7

| Claim | Status |
|---|---|
| **1. Voice as primary input, at the level of musical intent** | **Held, and widened.** Two front-ends now feed the same ops: speech→intent, and beatbox→rhythm. Nobody pairs both onto one editable document. |
| **2. Readable, editable code IR** | **Held, but contested.** LIA/MIDI Agent give editable *MIDI*; we give editable *code*, which is more inspectable and more intimidating. Genuinely unproven for the ICP. |
| **3. Dual view over one document** | **Held — and this is the moat.** Nobody has timeline + REPL + voice over a single source of truth. Version control now sits on the same foundation. |

## Honest read

The defensible core is **not** "AI edits music" — that's now crowded. It's the
**single canonical document**: one structure that voice, beatbox, a timeline grid, a stem
mixer, and readable code all edit, and that version-controls like software because it *is*
software. Each new front-end (§tap-in took one module and reused `set_pattern` unchanged)
gets cheaper, because they all reduce to the same closed set of edit ops.

The risk is unchanged and now sharper: **LIA is betting the DAW is the right home and the
user just needs a better assistant in it.** We're betting the DAW itself is the barrier for
a musician who can't produce. That bet is still unvalidated, and you are the only ICP who
has touched this.

## Nearest real threat

Not Suno. It's a competent NL-editing assistant inside Ableton or FL that a strong musician
can use without leaving a tool they already half-know. Our counter is the part they
structurally can't do: the document, the diffable history, and voice that edits *song
structure* rather than a selected clip.

---

## Open questions to resolve with real use

- Does the ICP actually want to *see* the code, or is it a trust device they never edit?
- Is per-track "code-owned" (hand-edited code disables that track's GUI controls) an
  acceptable trade, or does round-tripping become table stakes fast?
- Latency budget: what's the longest speak→hear gap that still feels like an instrument?

---

**Sources:**
[Strudel REPL](https://strudel.cc/) ·
[Strudel technical manual](https://strudel.cc/technical-manual/repl/) ·
[strudel repo (Codeberg)](https://codeberg.org/uzu/strudel) ·
[TidalCycles](https://tidalcycles.org/) ·
[CDM on Strudel](https://cdm.link/musical-powerful-live-coding-in-the-browser-is-near-with-strudel-usable-now/) ·
[Gibber](https://gibber.cc/) ·
[awesome-livecoding](https://github.com/toplap/awesome-livecoding) ·
[Live coding 2026 deep-dive](https://www.youngju.dev/blog/culture/2026-05-16-live-coding-music-visuals-2026-sonic-pi-tidal-strudel-hydra-touchdesigner-supercollider-deep-dive.en) ·
[WavTool](https://wavtool.com/) ·
[LUNA](https://www.uaudio.com/products/luna) ·
[Suno stem separation](https://suno.com/release-notes/advanced-stems) ·
[Suno vs Udio 2026](https://neuronad.com/suno-vs-udio/) ·
[Dubler 2](https://vochlea.com/products/dubler2) ·
[Sonarworks on voice-driven instruments](https://www.sonarworks.com/blog/learn/voice-driven-instruments-for-modern-music-producers) ·
[strudel-llm-docs](https://github.com/calvinw/strudel-llm-docs) ·
[Virtual Agents in Live Coding](https://arxiv.org/pdf/2106.14835) ·
[Decomposer](https://arxiv.org/pdf/2607.01849)
