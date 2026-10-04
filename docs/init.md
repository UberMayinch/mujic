# Handoff — mujic

Written 2026-08-12, at the end of the session that created the project. Read this first if
you're picking mujic up cold (human or agent). It covers what exists, what's verified, what
isn't, and which decisions must not be quietly relitigated.

Companion docs: **[ARCHITECTURE.md](ARCHITECTURE.md)** (how and why it's built this way),
**[LANDSCAPE.md](LANDSCAPE.md)** (competitors and where the whitespace is).

---

## 1. What this is

Edit music by voice. Speech becomes a **structured edit**, the edit becomes **Strudel
code**, the code makes sound — and every step is readable and hand-editable.

**The user it's for is the person who commissioned it: a strong musician with little
production experience.** They know what they want to hear and don't know which knob it lives
behind. Every design call gets judged on one question: *does this turn musical intent into
an edit without producer-grade tool knowledge, while keeping the result inspectable?*

This is why it is **not** a text-to-audio generator. Suno/Udio give you a re-roll; this user
has specific intent and needs an *edit*.

---

## 2. Status at a glance

| Area | State |
|---|---|
| Document model (tracks × sections grid, inheritance) | Built, 32 tests |
| Codegen → Strudel `arrange()` | Built, deterministic, tested |
| Voice → edit ops (Claude, structured outputs) | Built — **never executed once**, see §6 |
| Beatbox → drum patterns | Built, 9 tests, **synthesized audio only** |
| Hum → melody (YIN pitch tracking) | Built, 11 tests, **synthesized audio only** |
| Version control (commits/branches/diff) | Built, 12 tests |
| UI: timeline, stems, REPL, versions | Built, typechecks, builds |
| **Total** | **64 tests green, `tsc --noEmit` clean, `vite build` passes** |

Nothing has been used by a real user yet, including the person it's for.

---

## 3. Decisions not to relitigate

These were made deliberately with reasons. Change them only with a better reason, not by
accident.

### 3.1 "Strudel", not TidalCycles
The original brief said *"student language"*. That is ASR mangling of **Strudel**, the
JavaScript port of TidalCycles. It matters enormously: Strudel runs in-browser with its own
sample engine, so the REPL lives *inside* the app; real TidalCycles needs GHCi +
SuperCollider as external processes and cannot be embedded.

⚠️ **This was flagged as an assumption and never explicitly confirmed in words.** The user
engaged with everything built on top of it across many turns and never disputed it, so treat
it as settled by usage — but if something feels deeply wrong at the foundation, this is the
first thing to re-check.

### 3.2 One canonical JSON document; generate, never parse
`ProjectDoc` is the single source of truth. Strudel code is **generated** from it and never
parsed back. Timeline, stem view, REPL, voice, and mic input all edit the same object.

Hand-editing a track's code flips it to `codeOwned: true`: its GUI controls go read-only,
voice edits to it are *refused* rather than silently clobbering it, and codegen emits the
text verbatim in every section. "Revert to controls" is the way back.

**Do not add a code→document parser.** Round-tripping arbitrary JS is a parser project, not
a feature, and it would dissolve the property everything else depends on.

### 3.3 Voice emits edit ops, not code
`ASR → glossary → LLM → EditOp[] → pure reducer → document`. The LLM's entire output surface
is a closed set of ops (see `src/model/ops.ts`). This is what buys undo, showable diffs
(`verse/hats: hh*8 → hh*16`), and testability. Generated-code-as-output would have none of it.

The **glossary layer is not optional** (`src/voice/glossary.ts`). ASR reliably mangles domain
vocabulary — it produced this project's founding typo. Normalizing before the model sees the
transcript is cheap, deterministic, and fixes what otherwise reads to the user as "the AI
didn't understand me".

### 3.4 The timeline is a grid with inheritance
Tracks are rows, sections are columns in playback order. A cell holds a pattern, `silent`
(a drop), or **inherits** from the section to its left.

```
          intro    verse    chorus
kick      bd*4  ─▶  ·        —
hats      —        hh*8  ─▶  hh*16
```

Chosen over scene-rows (duplicates unchanged tracks into every column) and per-track clip
lanes (no shared notion of "the chorus" for voice to address). Compiles to Strudel's native
`arrange([bars, stack(…)], …)`, so **we run no clock or scheduler of our own.**

**The distinction most likely to be got wrong:** mute silences a track across the *whole*
timeline; a `silent` cell is a drop in *one* section. The system prompt calls this out
explicitly — keep it there.

### 3.5 Melody is symbolic, not a performance capture
Humming produces notes (`"c4 _ _ ~ e4"`), not an f0 curve with formants and vibrato.

A pitch envelope can't be diffed, branched, or edited by voice — it's the same opaque-blob
problem that makes version control fail for every DAW. Fidelity was traded for the property
the product rests on. **Consequence to state plainly to users: mujic reconstructs your idea,
not your voice.** If performance nuance is ever needed, attach the take as a *reference*
beside the notes; never make it canonical.

### 3.6 DSP in TypeScript, not Python
Onset detection and YIN pitch tracking are ~120 lines each of pure TS. A Python/librosa
service would fragment a browser-only app and break single-command deploy, and monophonic
input doesn't need more. Both are pure functions, which is why they're testable against
synthesized audio with no microphone.

---

### 3.7 A recorded take is a reference layer, never canonical
`🎙 sing` stores the raw recording and plays it as an ordinary grid track. **The symbolic notes
remain canonical** — this is 3.5 honoured, not overturned. Audio is opaque to diffing, so a take's
version history can only ever read `take 3 → take 4`; everything that makes vocals editable still
lives in the notes beside it.

Both refinement toggles ship **off**, and one of them is deliberately absent:
- `snapStart` (on) offsets playback past the run-up via `begin()`. Non-destructive, so turning it
  off returns exactly what the mic heard.
- `fitTempo` (off) resamples, which **re-pitches**. There is no phase vocoder here. It is labelled
  "re-pitches" in the UI, and calling it time-stretching would be a lie.
- Pitch correction is **not implemented**. Don't ship a toggle that pretends to do it.

When bpm moves away from `recordedBpm` the take drifts and the UI says so. Silently re-pitching or
smearing a user's voice to hide that is the failure this whole design is avoiding.

### 3.8 Stems are pattern JSON, not audio
A marketplace stem is a few tracks and what they play over one section. Keeping audio out is what
makes it *cheap* (kilobytes), *editable* (voice commands work on it after purchase), and
*diffable* (a purchase is one more commit). It also means no object storage, transcoding, CDN, or
licensing tail — the entire shop is one JSON file behind `server/stems.ts`.

**Do not let audio into the shelf.** `sanitize()` rebuilds every field rather than spreading the
request body, specifically so a client cannot smuggle one in. Recorded takes are excluded from
`extractStem` at the model layer for the same reason, plus the consent question that selling
someone's voice raises.

### 3.9 A project is a repository, and ids must be reserved on load
Export writes the document *and* the commit graph. Autosave uses localStorage, which cannot hold
recorded audio — `save()` retries without it and reports `complete: false` rather than failing the
whole save or silently dropping a vocal.

⚠️ **`reserveIds` must run on every document that enters from outside** (load, import, migrate).
Ids come from a module-level counter that restarts at zero on each page load; without reserving,
the first track added after opening a saved project is minted as `t1` — an id the document already
uses — and it silently inherits the old track's cells. There is a regression test for this in
`persist.test.ts`.

## 4. How it fits together

```
🎙 speech ──ASR──▶ glossary ──▶ Claude ──▶ ┐
🥁 beatbox ─────▶ onset detection ────────┤
🎤 humming ─────▶ YIN pitch tracking ─────┼──▶ EditOp[] ──▶ reducer ──▶ ProjectDoc
🖱 timeline / stems / repl ───────────────┘                                │
                                                                  codegen ─┤
                                                                           ▼
                                                        arrange([bars, stack(…)], …)
                                                                           │
                                                                    superdough audio
```

Every input surface reduces to the same `EditOp[]`. That's why adding beatbox cost one
module and adding humming cost one more — **new front-ends are cheap by construction.**

| Path | What |
|---|---|
| `src/model/project.ts` | `ProjectDoc`, `Track`, `Section`, `Cell` — the document |
| `src/model/arrange.ts` | Cell inheritance resolution (what actually plays where) |
| `src/model/ops.ts` | `EditOp` union + the pure reducer |
| `src/model/codegen.ts` | Document → Strudel. One direction, deterministic |
| `src/model/history.ts` | Commits, branches, restore, musical diffs |
| `src/model/steps.ts` | Mini-notation → step grid for previews |
| `src/audio/onsets.ts` | Beatbox → drum patterns (pure) |
| `src/audio/pitch.ts` | Hum → melody, YIN (pure) |
| `src/audio/tapin.ts` | Microphone capture |
| `src/audio/engine.ts` | The only module that touches Strudel |
| `src/voice/asr.ts` | Speech recognition, swappable in one file |
| `src/voice/glossary.ts` | ASR normalization |
| `src/ui/*.tsx` | App, Timeline, StemView, ReplView, VoiceBar, TapIn, HistoryPanel |
| `server/index.ts` | One route: transcript + doc → ops. Exists solely to keep the API key off the client |
| `server/opSchema.ts` | JSON Schema constraining the model's output |

---

## 5. Running and testing

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # or put it in .env (gitignored)
npm run dev                            # web :5173, api :8787
```

Chrome — speech recognition is Chrome-only. The text box beside the mic drives the identical
pipeline, so you can test everything without talking. Press **play** before anything else;
browsers require a gesture to start audio.

```bash
npm test         # 64 tests
npm run typecheck
npm run build
```

**Credentials:** the SDK reads `ANTHROPIC_API_KEY` from the environment automatically, and
`dotenv` does not override the shell — so a shell export wins over `.env`. It must be visible
to the **API process**, not Vite. A Claude/Claude Code subscription is *not* API credentials;
get a key from console.anthropic.com, or use `ant auth login` (creates a profile the SDK
reads automatically).

If `npm run dev` fails on `tsx`, run the halves separately: `npx vite` and
`npx tsx server/index.ts`.

---

## 6. Where the bodies are buried

**The model call has never run.** No API key was available during development. `/api/interpret`
is verified for routing, request validation, and error paths only. Unverified: whether the
structured-outputs schema compiler accepts the 10-variant `anyOf` + `const` op discriminators,
and whether the response arrives as expected. **This is the single biggest unknown in the
codebase** — expect the first real command to be where it surfaces, and expect the fix to be
in `server/opSchema.ts`.

**Take playback is verified; take *capture* is not.** Registering a `data:audio/wav;base64,…`
sample via Strudel's `samples()` and evaluating the exact chains codegen emits —
`s("mujic_x").begin(0.25).slow(2).speed(1.1667)`, including nested inside `arrange()` — was
executed in the browser on 2026-08-12 and all of it is accepted. What has **not** run is
`getUserMedia` → `MediaRecorder` → `decodeAudioData` → `makeTake`, because that needs a real
microphone. `encodeWav`, `peaksOf` and `leadOf` are unit-tested against synthesized audio.

**No accounts, no payments, anywhere.** The shop records and displays prices and charges nothing.
Anyone who can reach the API can publish. `server/stems.ts` rebuilds every field of a posted stem
rather than spreading it, specifically so audio or unexpected keys can't get onto the shelf —
keep it that way if the shop ever grows auth.

**Neither DSP path has met a real microphone.** Both were developed against synthesized audio.
Four constants will want tuning against a real voice:

| Constant | File | Governs |
|---|---|---|
| `BRIGHT_HAT`, `BRIGHT_SNARE` | `src/audio/onsets.ts` | kick/snare/hat classification |
| `relativeThreshold` | `src/audio/onsets.ts` | what counts as a hit |
| `energyFloor` | `src/audio/pitch.ts` | voiced vs. breath |

**Time resolution has a hard floor.** The pitch analysis window is ~46ms, so a 30ms blip
smears across enough frames to *measure* as ~80ms. `minDurationSec` below ~2× the window
silently does nothing — this is why the default is 100ms, not 80ms. Same class of issue
applies to onset debouncing.

**Bugs the tests caught that a manual demo would have missed** — worth knowing the codebase
has form here:
- onset detection dropped any hit at *t=0*, i.e. every groove that starts on the downbeat
- the euclid step grid drew hits at 2/5/7 instead of 0/3/6 — right count, wrong rhythm
- diffs cascaded one edit into every inheriting section

Keep the pure-function/test discipline; it's earning its keep.

**Known limits, all deliberate:**
- Everything is section-aligned — no clips at arbitrary offsets. A fill at bar 3.5 needs its
  own short section. Cells could grow a start offset later (additive, not a rewrite).
- Mix is track-level: "quieter in the intro" isn't expressible. Natural home is optional gain
  on a cell.
- Code-owned tracks bypass the grid and play verbatim in every section.
- No persistence. Reload loses everything, version history included. **Probably the most
  glaring gap for real use** — the document is plain JSON, so this is small work.

---

## 7. Where the product stands

Re-checked against the market on 2026-08-12 (full analysis in LANDSCAPE.md):

**"AI edits music instead of generating it" is no longer differentiating.** LIA and MIDI Agent
ship natural-language → editable MIDI into existing DAWs; Vochlea DubBox does beatbox → drum
loops. Both lanes have credible occupants.

**What is defensible is the single canonical document** — one structure that voice, beatbox,
humming, a timeline, a mixer, and readable code all edit. Version control is the sharpest
proof: git-for-DAWs fails universally because projects are opaque binary with gigabytes of
undiffable audio; ours is small JSON that *generates* its audio, so commits are kilobytes and
diffs are musical. A conventional DAW cannot copy that without becoming us.

**The nearest real threat** is not Suno — it's a competent NL assistant inside Ableton or FL
that a strong musician can use without leaving a tool they already half-know. LIA bets the DAW
is the right home and you just need a better assistant in it; mujic bets the DAW itself is the
barrier. **That bet is unvalidated.**

---

## 8. What to do next

In the order I'd do it:

1. **Get a key in and run one voice command.** Everything else is speculation until the
   op-generation loop has executed once end to end.
2. **Use it for an actual musical idea**, then fix what hurts. The ICP has never touched it.
   Every remaining ranking below is a guess by comparison.
3. **Persistence** — save/load the document and its version history. Small, and the absence is
   glaring the moment someone cares about what they made.
4. **Tune the DSP constants** against a real voice (§6).
5. Then, informed by 2: per-section mix (gain on a cell), or clips at arbitrary offsets, or a
   local fast-path for the ~20 most common voice commands if LLM latency breaks the
   instrument feel.

**Open questions only real use can answer:**
- Does the ICP actually want to *see* the code, or is the REPL a trust device they never touch?
  The dual view is the product's central bet.
- Is per-track "code-owned" an acceptable trade, or does round-tripping become table stakes fast?
- What's the longest speak→hear gap that still feels like an instrument?
