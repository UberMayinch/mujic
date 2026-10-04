/**
 * Builds the mujic design-system previews.
 *
 * Every preview must be self-contained — the Design System pane renders each
 * file on its own — so tokens are inlined into each one rather than linked.
 * Single-sourcing them here is what keeps a dozen files from drifting apart.
 *
 *   node design/build.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "dist");

/* ------------------------------------------------------------------ tokens */

/**
 * Light-first on bare `:root`; dark redefines only what changes, under both
 * `prefers-color-scheme` and an explicit `[data-theme]`, so an explicit choice
 * wins in both directions and "system" still resolves.
 *
 * Two halves, one system: ink-on-manila technical drawing for the marketplace
 * (shops read as paper) and a dark studio ground for the editor. The accents
 * are shared, which is what makes them read as one product.
 */
const TOKENS = `
  :root {
    --paper:   #f4efe4;
    --paper-2: #ebe4d5;
    --sunk:    #e2d9c6;
    --ink:     #1b1815;
    --ink-2:   #574f45;
    --ink-3:   #8b8173;
    --rule:    #d3c9b6;

    --signal:     #b06f12;
    --signal-ink: #fffaf0;
    --blueprint:  #1f6c81;
    --record:     #a8391f;

    --r-sm: 3px;
    --r-md: 6px;
    --r-lg: 10px;
    --r-pill: 999px;

    --s1: 4px;
    --s2: 8px;
    --s3: 12px;
    --s4: 16px;
    --s5: 24px;
    --s6: 32px;

    --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;

    color-scheme: light dark;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper:   #14120f;
      --paper-2: #1d1a16;
      --sunk:    #0e0c0a;
      --ink:     #ece5d8;
      --ink-2:   #a19889;
      --ink-3:   #6d6559;
      --rule:    #332e26;

      --signal:     #e0a53f;
      --signal-ink: #14120f;
      --blueprint:  #5fb0c6;
      --record:     #e0674a;
    }
  }

  :root[data-theme="dark"] {
    --paper:   #14120f;
    --paper-2: #1d1a16;
    --sunk:    #0e0c0a;
    --ink:     #ece5d8;
    --ink-2:   #a19889;
    --ink-3:   #6d6559;
    --rule:    #332e26;

    --signal:     #e0a53f;
    --signal-ink: #14120f;
    --blueprint:  #5fb0c6;
    --record:     #e0674a;
  }
`;

/** Shared chrome for every preview: reset, page frame, and the caption style. */
const BASE = `
  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: var(--s5);
    background: var(--paper);
    color: var(--ink);
    font: 14px/1.5 var(--sans);
    -webkit-font-smoothing: antialiased;
  }

  .spec { display: flex; flex-direction: column; gap: var(--s5); max-width: 940px; }

  .spec-head { display: flex; flex-direction: column; gap: 2px; }
  .spec-head h1 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
  .spec-head p { margin: 0; color: var(--ink-2); font-size: 13px; max-width: 62ch; }

  .group { display: flex; flex-direction: column; gap: var(--s3); }
  .group > h2 {
    margin: 0;
    font: 600 10px/1 var(--mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .note { color: var(--ink-2); font-size: 12.5px; margin: 0; max-width: 62ch; }
  .mono { font-family: var(--mono); }

  /* Anything wide scrolls inside its own box; the page body never does. */
  .scroll { overflow-x: auto; }
`;

/**
 * Wraps a component body in the page shell.
 *
 * The `@dsCard` marker must be the literal first line — the Design System pane
 * builds its card index from it, so a leading newline breaks discovery.
 */
function page({ title, group, heading, blurb, css = "", body }) {
  return `<!-- @dsCard group="${group}" -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${TOKENS}${BASE}${css}</style>
</head>
<body>
<div class="spec">
  <div class="spec-head">
    <h1>${heading}</h1>
    <p>${blurb}</p>
  </div>
${body}
</div>
</body>
</html>
`;
}

/* ------------------------------------------------------------- foundations */

const swatch = (name, token, note) => `
      <div class="sw">
        <div class="sw-chip" style="background: var(${token})"></div>
        <div class="sw-meta">
          <b>${name}</b>
          <code>${token}</code>
          <span>${note}</span>
        </div>
      </div>`;

const color = page({
  title: "Color",
  group: "Foundations",
  heading: "Color",
  blurb:
    "Three accents, each with one job. Amber is live, cyan is structure, red is loss. " +
    "A control that is none of those three stays ink — which is what keeps the live ones readable.",
  css: `
    .sw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--s3); }
    .sw { display: flex; gap: var(--s3); align-items: center; }
    .sw-chip {
      width: 44px; height: 44px; flex: none;
      border-radius: var(--r-md); border: 1px solid var(--rule);
    }
    .sw-meta { display: flex; flex-direction: column; min-width: 0; }
    .sw-meta b { font-size: 13px; font-weight: 600; }
    .sw-meta code { font: 11px var(--mono); color: var(--ink-2); }
    .sw-meta span { font-size: 11.5px; color: var(--ink-3); }
  `,
  body: `
  <div class="group">
    <h2>Accents</h2>
    <div class="sw-grid">
${swatch("Signal", "--signal", "Playing, selected, armed")}
${swatch("Blueprint", "--blueprint", "Schematic line, inherited")}
${swatch("Record", "--record", "Muted, destructive, drop")}
    </div>
  </div>

  <div class="group">
    <h2>Ground</h2>
    <div class="sw-grid">
${swatch("Paper", "--paper", "Page ground")}
${swatch("Panel", "--paper-2", "Raised surface")}
${swatch("Sunk", "--sunk", "Inset: code, inputs")}
${swatch("Rule", "--rule", "Hairlines and borders")}
    </div>
  </div>

  <div class="group">
    <h2>Ink</h2>
    <div class="sw-grid">
${swatch("Ink", "--ink", "Primary text")}
${swatch("Ink 2", "--ink-2", "Secondary text")}
${swatch("Ink 3", "--ink-3", "Labels, captions")}
    </div>
  </div>

  <p class="note">
    Both themes ship the same token names, so no component ever branches on theme.
    Dark is the studio; light is the shop. The marketplace deliberately reads as paper.
  </p>`,
});

const type = page({
  title: "Type",
  group: "Foundations",
  heading: "Type",
  blurb:
    "One sans for the interface, one mono for anything the machine will read back — " +
    "patterns, generated code, diffs, prices. The split is load-bearing: mono means literal.",
  css: `
    .row { display: flex; align-items: baseline; gap: var(--s4); padding: var(--s2) 0; border-bottom: 1px solid var(--rule); }
    .row:last-child { border-bottom: 0; }
    .row .lab { flex: none; width: 130px; font: 10px/1.4 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
    .t-display { font-size: 26px; font-weight: 660; letter-spacing: -0.02em; }
    .t-title   { font-size: 17px; font-weight: 620; letter-spacing: -0.01em; }
    .t-body    { font-size: 14px; }
    .t-small   { font-size: 12.5px; color: var(--ink-2); }
    .t-label   { font: 600 10px/1 var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); }
    .t-mono    { font: 13px var(--mono); }
    .t-price   { font: 620 15px var(--mono); font-variant-numeric: tabular-nums; }
  `,
  body: `
  <div class="group">
    <h2>Scale</h2>
    <div>
      <div class="row"><span class="lab">Display / 26</span><span class="t-display">Ninth Street Pressing</span></div>
      <div class="row"><span class="lab">Title / 17</span><span class="t-title">Halftime chorus</span></div>
      <div class="row"><span class="lab">Body / 14</span><span class="t-body">Four tracks, eight bars, room to move.</span></div>
      <div class="row"><span class="lab">Small / 12.5</span><span class="t-small">Recorded at 120 bpm</span></div>
      <div class="row"><span class="lab">Label / 10</span><span class="t-label">Arrangement</span></div>
      <div class="row"><span class="lab">Mono / 13</span><span class="t-mono">s("bd*4").gain(0.8)</span></div>
      <div class="row"><span class="lab">Price / 15</span><span class="t-price">$4.00</span></div>
    </div>
  </div>

  <p class="note">
    Numbers that change in place — bpm, prices, bar counts — are tabular so they stop
    twitching as they update. Every mono use is a thing the user could type back verbatim.
  </p>`,
});

const spacing = page({
  title: "Spacing",
  group: "Foundations",
  heading: "Spacing &amp; radius",
  blurb:
    "A 4px base. Tracks and cells sit on the small end because the arrangement grid is " +
    "dense by nature; surrounding chrome uses the large end so the grid stays the loudest thing on screen.",
  css: `
    .bars { display: flex; flex-direction: column; gap: var(--s2); }
    .bar-row { display: flex; align-items: center; gap: var(--s3); }
    .bar-row code { width: 74px; font: 11px var(--mono); color: var(--ink-2); }
    .bar-row .fill { height: 14px; background: var(--blueprint); border-radius: 2px; opacity: 0.75; }
    .radii { display: flex; gap: var(--s4); flex-wrap: wrap; }
    .rad { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .rad div { width: 68px; height: 48px; background: var(--paper-2); border: 1px solid var(--rule); }
    .rad code { font: 11px var(--mono); color: var(--ink-2); }
  `,
  body: `
  <div class="group">
    <h2>Scale</h2>
    <div class="bars">
      <div class="bar-row"><code>--s1 4</code><div class="fill" style="width:4px"></div></div>
      <div class="bar-row"><code>--s2 8</code><div class="fill" style="width:8px"></div></div>
      <div class="bar-row"><code>--s3 12</code><div class="fill" style="width:12px"></div></div>
      <div class="bar-row"><code>--s4 16</code><div class="fill" style="width:16px"></div></div>
      <div class="bar-row"><code>--s5 24</code><div class="fill" style="width:24px"></div></div>
      <div class="bar-row"><code>--s6 32</code><div class="fill" style="width:32px"></div></div>
    </div>
  </div>

  <div class="group">
    <h2>Radius</h2>
    <div class="radii">
      <div class="rad"><div style="border-radius:var(--r-sm)"></div><code>--r-sm 3</code></div>
      <div class="rad"><div style="border-radius:var(--r-md)"></div><code>--r-md 6</code></div>
      <div class="rad"><div style="border-radius:var(--r-lg)"></div><code>--r-lg 10</code></div>
      <div class="rad"><div style="border-radius:var(--r-pill)"></div><code>--r-pill</code></div>
    </div>
  </div>`,
});

/* ------------------------------------------------------------------ controls */

const CONTROL_CSS = `
  .btn {
    font: 500 13px var(--sans);
    color: var(--ink);
    background: var(--paper-2);
    border: 1px solid var(--rule);
    border-radius: var(--r-md);
    padding: 7px 13px;
    cursor: pointer;
    display: inline-flex; align-items: center; gap: 7px;
  }
  .btn:hover:not(:disabled) { border-color: var(--ink-3); }
  .btn:disabled { opacity: 0.42; cursor: default; }
  .btn.on { background: var(--signal); border-color: var(--signal); color: var(--signal-ink); }
  .btn.danger { color: var(--record); border-color: color-mix(in srgb, var(--record) 40%, var(--rule)); }
  .btn.ghost { background: transparent; border-color: transparent; color: var(--ink-2); }
  .btn.lg { font-size: 14px; padding: 10px 18px; font-weight: 600; }
  .btn.sm { font-size: 12px; padding: 4px 9px; }

  .chip {
    display: inline-flex; align-items: center; gap: 5px;
    font: 11.5px var(--mono);
    border: 1px solid var(--rule); border-radius: var(--r-pill);
    padding: 3px 10px; color: var(--ink-2);
  }
  .chip.signal { color: var(--signal); border-color: color-mix(in srgb, var(--signal) 45%, var(--rule)); }
  .chip.warn { color: var(--record); border-color: color-mix(in srgb, var(--record) 45%, var(--rule)); }

  .field {
    background: var(--sunk); color: var(--ink);
    border: 1px solid var(--rule); border-radius: var(--r-md);
    padding: 8px 11px; font: 13px var(--sans); min-width: 220px;
  }
  .field::placeholder { color: var(--ink-3); }

  .cluster { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
`;

const buttons = page({
  title: "Controls",
  group: "Controls",
  heading: "Controls",
  blurb:
    "Exactly one filled button per screen region — the live one. Everything else is outlined, " +
    "so 'what is currently happening' is answerable at a glance without reading a single label.",
  css: CONTROL_CSS,
  body: `
  <div class="group">
    <h2>Buttons</h2>
    <div class="cluster">
      <button class="btn lg on">■ Stop</button>
      <button class="btn lg">▶ Play</button>
      <button class="btn">↶ Undo</button>
      <button class="btn sm">Use it</button>
      <button class="btn ghost">Discard</button>
      <button class="btn danger">Delete take</button>
      <button class="btn" disabled>↶ Undo</button>
    </div>
  </div>

  <div class="group">
    <h2>Chips</h2>
    <div class="cluster">
      <span class="chip signal">⑂ main</span>
      <span class="chip">8 bars</span>
      <span class="chip">code-owned</span>
      <span class="chip warn">recorded at 120 bpm</span>
    </div>
  </div>

  <div class="group">
    <h2>Fields</h2>
    <div class="cluster">
      <input class="field" placeholder="Say it, or type it here">
      <input class="field" style="min-width:150px" placeholder="Version name">
    </div>
  </div>

  <p class="note">
    Chips are read-only state, never actions — if it can be clicked it is a button.
    The warn chip is the one place amber gives way to red: a take that no longer matches the tempo.
  </p>`,
});

/* ----------------------------------------------------------------- transport */

const transport = page({
  title: "Transport",
  group: "Transport",
  heading: "Transport bar",
  blurb:
    "The one bar that is always present. Play is the largest target on screen because " +
    "browsers require a gesture before any audio exists — this is the first thing every session touches.",
  css: `${CONTROL_CSS}
    .bar {
      display: flex; align-items: center; gap: var(--s3);
      padding: 10px var(--s4);
      background: var(--paper-2);
      border: 1px solid var(--rule);
      border-radius: var(--r-lg);
    }
    .brand { font-weight: 680; letter-spacing: -0.01em; font-size: 15px; margin-right: var(--s1); }
    .bpm { display: flex; align-items: center; gap: var(--s2); color: var(--ink-2); font-variant-numeric: tabular-nums; font-size: 12.5px; }
    .bpm input { accent-color: var(--signal); width: 108px; }
    .views { margin-left: auto; display: flex; gap: 2px; background: var(--sunk); padding: 3px; border-radius: var(--r-md); }
    .views .btn { border-color: transparent; background: transparent; padding: 5px 11px; font-size: 12.5px; }
    .views .btn.on { background: var(--paper); color: var(--ink); border-color: var(--rule); }
  `,
  body: `
  <div class="group">
    <h2>Playing</h2>
    <div class="scroll">
      <div class="bar">
        <span class="brand">mujic</span>
        <button class="btn on">■ Stop</button>
        <label class="bpm">120 bpm <input type="range" min="60" max="200" value="120"></label>
        <button class="btn">↶ Undo</button>
        <span class="chip signal">⑂ main</span>
        <span class="views">
          <button class="btn on">Arrange</button>
          <button class="btn">Stems</button>
          <button class="btn">Code</button>
          <button class="btn">Versions</button>
          <button class="btn">Shop</button>
        </span>
      </div>
    </div>
  </div>

  <div class="group">
    <h2>Stopped, nothing to undo</h2>
    <div class="scroll">
      <div class="bar">
        <span class="brand">mujic</span>
        <button class="btn">▶ Play</button>
        <label class="bpm">120 bpm <input type="range" min="60" max="200" value="120"></label>
        <button class="btn" disabled>↶ Undo</button>
        <span class="chip signal">⑂ main</span>
        <span class="views">
          <button class="btn on">Arrange</button>
          <button class="btn">Stems</button>
          <button class="btn">Code</button>
          <button class="btn">Versions</button>
          <button class="btn">Shop</button>
        </span>
      </div>
    </div>
  </div>

  <p class="note">
    Tempo commits on release, not per pixel — a drag that committed continuously would
    bury the undo stack and re-evaluate the audio graph dozens of times.
  </p>`,
});

/* --------------------------------------------------------------- arrangement */

const GRID_CSS = `
  .tl {
    background: var(--paper-2);
    border: 1px solid var(--rule);
    border-radius: var(--r-lg);
    padding: var(--s3);
    display: flex; flex-direction: column; gap: 3px;
    min-width: 560px;
  }
  .tl-row { display: flex; gap: 3px; align-items: stretch; }
  .tl-label {
    flex: 0 0 84px; font-size: 12px; color: var(--ink-2);
    display: flex; align-items: center; gap: 5px; overflow: hidden;
  }
  .tl-col { flex-basis: 0; min-width: 0; border-radius: var(--r-sm); padding: 5px 8px; }

  .tl-head { cursor: pointer; background: var(--sunk); border: 1px solid transparent; }
  .tl-head.sel { border-color: var(--signal); background: color-mix(in srgb, var(--signal) 12%, var(--paper-2)); }
  .tl-name { display: block; font-weight: 600; font-size: 12.5px; }
  .tl-bars { font-size: 11px; color: var(--ink-3); font-variant-numeric: tabular-nums; }

  .tl-cell {
    font: 11px var(--mono);
    display: flex; align-items: center; min-height: 28px;
    border: 1px solid transparent; border-radius: var(--r-sm);
    overflow: hidden; white-space: nowrap;
  }
  .tl-cell.explicit { background: color-mix(in srgb, var(--signal) 16%, var(--paper-2)); color: var(--ink); }
  .tl-cell.inherit  { background: transparent; border: 1px dashed color-mix(in srgb, var(--blueprint) 45%, var(--rule)); color: var(--blueprint); justify-content: center; }
  .tl-cell.silent   { background: var(--sunk); color: var(--ink-3); justify-content: center; }
  .tl-cell.code     { background: color-mix(in srgb, var(--blueprint) 14%, var(--paper-2)); color: var(--blueprint); }
  .tl-cell.sel { border-color: var(--signal); border-style: solid; }
  .mute { color: var(--record); font-size: 10px; font-family: var(--mono); }
`;

const timeline = page({
  title: "Arrangement grid",
  group: "Arrangement",
  heading: "Arrangement grid",
  blurb:
    "Tracks are rows, song sections are columns in playback order, and column width is " +
    "proportional to bars — so the picture is the song's actual shape, not a list of clips.",
  css: `${CONTROL_CSS}${GRID_CSS}`,
  body: `
  <div class="group">
    <h2>Three cell states</h2>
    <div class="scroll">
      <div class="tl">
        <div class="tl-row">
          <span class="tl-label"></span>
          <div class="tl-col tl-head" style="flex-grow:4"><b class="tl-name">intro</b><span class="tl-bars">4 bars</span></div>
          <div class="tl-col tl-head sel" style="flex-grow:8"><b class="tl-name">verse</b><span class="tl-bars">8 bars</span></div>
          <div class="tl-col tl-head" style="flex-grow:8"><b class="tl-name">chorus</b><span class="tl-bars">8 bars</span></div>
        </div>
        <div class="tl-row">
          <span class="tl-label">kick</span>
          <div class="tl-col tl-cell explicit" style="flex-grow:4">bd*4</div>
          <div class="tl-col tl-cell inherit" style="flex-grow:8">↳</div>
          <div class="tl-col tl-cell silent" style="flex-grow:8">—</div>
        </div>
        <div class="tl-row">
          <span class="tl-label">hats</span>
          <div class="tl-col tl-cell silent" style="flex-grow:4">—</div>
          <div class="tl-col tl-cell explicit" style="flex-grow:8">hh*8</div>
          <div class="tl-col tl-cell explicit" style="flex-grow:8">hh*16</div>
        </div>
        <div class="tl-row">
          <span class="tl-label">bass <span class="mute">M</span></span>
          <div class="tl-col tl-cell silent" style="flex-grow:4">—</div>
          <div class="tl-col tl-cell silent" style="flex-grow:8">—</div>
          <div class="tl-col tl-cell explicit" style="flex-grow:8">bass(3,8)</div>
        </div>
        <div class="tl-row">
          <span class="tl-label">pad</span>
          <div class="tl-col tl-cell code" style="flex-grow:20">hand-written code — plays in every section</div>
        </div>
      </div>
    </div>
  </div>

  <p class="note">
    <b>Amber</b> is an explicit pattern. <b>Dashed cyan ↳</b> inherits from the section to its left,
    so an unchanged track is never copied across columns. <b>Grey —</b> is a deliberate drop in
    that one section. The distinction most often got wrong: a red <span class="mute">M</span> beside
    the track name mutes it across the <i>whole</i> timeline; a grey cell drops it in <i>one</i> section.
  </p>`,
});

const stemCard = page({
  title: "Stem card",
  group: "Arrangement",
  heading: "Stem card",
  blurb:
    "One track inside the selected section: what it plays, how loud, and where the hits land. " +
    "The step grid only draws rhythms it can prove — anything richer says so rather than lying.",
  css: `${CONTROL_CSS}
    .stem {
      background: var(--paper-2); border: 1px solid var(--rule);
      border-radius: var(--r-lg); padding: var(--s3) var(--s4);
      display: flex; flex-direction: column; gap: var(--s2);
      max-width: 620px;
    }
    .stem.muted { opacity: 0.5; }
    .stem-head { display: flex; align-items: center; gap: var(--s3); }
    .stem-name { font-weight: 620; font-size: 14px; }
    .stem-pattern { font: 12px var(--mono); color: var(--ink-2); }
    .stem-head .spacer { margin-left: auto; }
    .gain { display: flex; align-items: center; gap: var(--s2); font-size: 12px; color: var(--ink-2); }
    .gain input { accent-color: var(--signal); width: 96px; }
    .steps { display: grid; grid-template-columns: repeat(16, 1fr); gap: 3px; }
    .step { height: 24px; background: var(--sunk); border-radius: 2px; }
    .step.beat { background: color-mix(in srgb, var(--ink-3) 22%, var(--sunk)); }
    .step.on { background: var(--signal); }
    .nopreview { font: 11.5px var(--mono); color: var(--ink-3); padding: 6px 0; }
  `,
  body: `
  <div class="group">
    <h2>Default</h2>
    <div class="stem">
      <div class="stem-head">
        <span class="stem-name">hats</span>
        <code class="stem-pattern">hh*8</code>
        <span class="spacer"></span>
        <button class="btn sm">M</button>
        <button class="btn sm">S</button>
      </div>
      <div class="gain">gain <input type="range" min="0" max="1" step="0.01" value="0.8"> 0.80</div>
      <div class="steps">
        <div class="step beat on"></div><div class="step"></div><div class="step on"></div><div class="step"></div>
        <div class="step beat on"></div><div class="step"></div><div class="step on"></div><div class="step"></div>
        <div class="step beat on"></div><div class="step"></div><div class="step on"></div><div class="step"></div>
        <div class="step beat on"></div><div class="step"></div><div class="step on"></div><div class="step"></div>
      </div>
    </div>
  </div>

  <div class="group">
    <h2>Muted, and a pattern too rich to draw</h2>
    <div class="stem muted">
      <div class="stem-head">
        <span class="stem-name">pad</span>
        <code class="stem-pattern">note("c3 eb3").slow(4).room(0.6)</code>
        <span class="spacer"></span>
        <span class="chip">code-owned</span>
      </div>
      <div class="nopreview">no preview — pattern is beyond the step grid</div>
    </div>
  </div>

  <p class="note">
    Euclidean patterns render through a real Bjorklund, so <code class="mono">s(3,8)</code>
    lights 0/3/6 — where Strudel actually plays them — rather than a plausible-looking guess.
  </p>`,
});

/* -------------------------------------------------------------------- capture */

const capture = page({
  title: "Capture",
  group: "Capture",
  heading: "Capture",
  blurb:
    "Three ways in — describe it, beatbox it, hum it — and all three land on the same edit ops. " +
    "Nothing touches the document until you confirm, because mic detection is fiddly and a wrong silent guess is worse than a question.",
  css: `${CONTROL_CSS}
    .dock {
      display: flex; gap: var(--s2); align-items: center;
      background: var(--paper-2); border: 1px solid var(--rule);
      border-radius: var(--r-lg); padding: var(--s3);
    }
    .dock .field { flex: 1; }
    .mic.on { background: var(--record); border-color: var(--record); color: var(--signal-ink); }
    .heard {
      margin-top: var(--s3); padding: var(--s3);
      border: 1px solid var(--rule); border-radius: var(--r-md); background: var(--sunk);
    }
    .heard h3 { margin: 0 0 var(--s2); font: 600 10px/1 var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); }
    .heard-row { display: flex; align-items: center; gap: var(--s3); margin-top: 6px; }
    .heard-row b { width: 54px; font-size: 12px; }
    .heard-row code { width: 128px; font: 11px var(--mono); color: var(--ink-2); }
    .steps { display: grid; grid-template-columns: repeat(16, 1fr); gap: 3px; flex: 1; }
    .step { height: 14px; background: var(--paper-2); border-radius: 2px; }
    .step.on { background: var(--signal); }
    .count { font: 620 30px var(--mono); color: var(--signal); font-variant-numeric: tabular-nums; }
  `,
  body: `
  <div class="group">
    <h2>Idle</h2>
    <div class="dock">
      <button class="btn mic">🎙 Hold to speak</button>
      <input class="field" placeholder="…or type it: “make the hats sixteenths”">
      <button class="btn">🥁 Tap in</button>
      <button class="btn">🎤 Hum</button>
    </div>
  </div>

  <div class="group">
    <h2>Listening</h2>
    <div class="dock">
      <button class="btn mic on">● Listening…</button>
      <input class="field" value="in the chorus, drop the kick" readonly>
      <button class="btn" disabled>🥁 Tap in</button>
      <button class="btn" disabled>🎤 Hum</button>
    </div>
  </div>

  <div class="group">
    <h2>Counting in</h2>
    <div class="dock" style="justify-content:center; gap:var(--s4)">
      <span class="count">2</span>
      <span class="note" style="margin:0">bars remaining — beatbox now</span>
    </div>
  </div>

  <div class="group">
    <h2>Confirm before it lands</h2>
    <div class="heard">
      <h3>Heard</h3>
      <div class="heard-row">
        <b>kick</b><code>bd*4</code>
        <span class="steps">
          <span class="step on"></span><span class="step"></span><span class="step"></span><span class="step"></span>
          <span class="step on"></span><span class="step"></span><span class="step"></span><span class="step"></span>
          <span class="step on"></span><span class="step"></span><span class="step"></span><span class="step"></span>
          <span class="step on"></span><span class="step"></span><span class="step"></span><span class="step"></span>
        </span>
      </div>
      <div class="heard-row">
        <b>hats</b><code>hh*8</code>
        <span class="steps">
          <span class="step on"></span><span class="step"></span><span class="step on"></span><span class="step"></span>
          <span class="step on"></span><span class="step"></span><span class="step on"></span><span class="step"></span>
          <span class="step on"></span><span class="step"></span><span class="step on"></span><span class="step"></span>
          <span class="step on"></span><span class="step"></span><span class="step on"></span><span class="step"></span>
        </span>
      </div>
      <div class="cluster" style="margin-top:var(--s3)">
        <button class="btn on sm">Use it</button>
        <button class="btn sm">Again</button>
        <button class="btn ghost sm">Discard</button>
      </div>
    </div>
  </div>

  <p class="note">
    Beatbox and hum run entirely on local DSP — onset detection and YIN pitch tracking, no model call —
    which is why they answer instantly and work with no network.
  </p>`,
});

const vocalTake = page({
  title: "Vocal take",
  group: "Capture",
  heading: "Vocal take",
  blurb:
    "A recorded take is your actual voice, stored beside the notes rather than replacing them. " +
    "The audio plays back raw; the notes stay canonical, which is the only reason vocals can be versioned at all.",
  css: `${CONTROL_CSS}
    .take {
      background: var(--paper-2); border: 1px solid var(--rule);
      border-radius: var(--r-lg); padding: var(--s3) var(--s4);
      display: flex; flex-direction: column; gap: var(--s3); max-width: 620px;
    }
    .take-head { display: flex; align-items: center; gap: var(--s3); }
    .take-head b { font-size: 14px; font-weight: 620; }
    .take-head .spacer { margin-left: auto; }
    .wave { display: flex; align-items: center; gap: 2px; height: 52px; padding: 0 2px; background: var(--sunk); border-radius: var(--r-md); }
    .wave i { flex: 1; background: var(--blueprint); border-radius: 1px; opacity: 0.8; }
    .toggles { display: flex; gap: var(--s4); flex-wrap: wrap; font-size: 12.5px; color: var(--ink-2); }
    .toggles label { display: flex; align-items: center; gap: 6px; }
    .toggles input { accent-color: var(--signal); }
  `,
  body: `
  <div class="group">
    <h2>Recorded, in tempo</h2>
    <div class="take">
      <div class="take-head">
        <b>vox</b>
        <span class="chip">take 3</span>
        <span class="chip">2 bars</span>
        <span class="spacer"></span>
        <button class="btn sm">M</button>
        <button class="btn sm">Re-record</button>
      </div>
      <div class="wave">
        <i style="height:18%"></i><i style="height:44%"></i><i style="height:72%"></i><i style="height:91%"></i>
        <i style="height:64%"></i><i style="height:38%"></i><i style="height:22%"></i><i style="height:15%"></i>
        <i style="height:30%"></i><i style="height:68%"></i><i style="height:88%"></i><i style="height:97%"></i>
        <i style="height:76%"></i><i style="height:49%"></i><i style="height:28%"></i><i style="height:12%"></i>
        <i style="height:20%"></i><i style="height:52%"></i><i style="height:80%"></i><i style="height:58%"></i>
        <i style="height:34%"></i><i style="height:19%"></i><i style="height:10%"></i><i style="height:8%"></i>
      </div>
      <div class="toggles">
        <label><input type="checkbox" checked> Snap start to bar</label>
        <label><input type="checkbox"> Stretch to tempo</label>
        <label><input type="checkbox"> Tune to notes</label>
      </div>
    </div>
  </div>

  <div class="group">
    <h2>Tempo moved after the take</h2>
    <div class="take">
      <div class="take-head">
        <b>vox</b>
        <span class="chip">take 3</span>
        <span class="chip warn">recorded at 120 bpm · now 140</span>
        <span class="spacer"></span>
        <button class="btn sm">Re-record</button>
      </div>
      <div class="wave">
        <i style="height:18%"></i><i style="height:44%"></i><i style="height:72%"></i><i style="height:91%"></i>
        <i style="height:64%"></i><i style="height:38%"></i><i style="height:22%"></i><i style="height:15%"></i>
        <i style="height:30%"></i><i style="height:68%"></i><i style="height:88%"></i><i style="height:97%"></i>
        <i style="height:76%"></i><i style="height:49%"></i><i style="height:28%"></i><i style="height:12%"></i>
        <i style="height:20%"></i><i style="height:52%"></i><i style="height:80%"></i><i style="height:58%"></i>
        <i style="height:34%"></i><i style="height:19%"></i><i style="height:10%"></i><i style="height:8%"></i>
      </div>
      <p class="note" style="margin:0">
        The audio is left exactly as recorded and will drift against the new tempo.
        Stretching it would smear your voice, and re-pitching it would raise it — so mujic
        says so instead of silently doing either.
      </p>
    </div>
  </div>

  <p class="note">
    Both refinement toggles ship off. On, they trade your performance for grid accuracy —
    which is occasionally what you want and never what you should get by default.
  </p>`,
});

/* ------------------------------------------------------------------ versions */

const versions = page({
  title: "Versions",
  group: "Versions",
  heading: "Versions",
  blurb:
    "Commits, branches, and real musical diffs. This is cheap here and famously impossible in a DAW: " +
    "their projects are opaque binary with gigabytes of undiffable audio, ours is small JSON that generates its audio.",
  css: `${CONTROL_CSS}
    .commits { list-style: none; margin: 0; padding: 0; max-width: 620px; }
    .commit { border-left: 2px solid var(--rule); padding: 9px 0 9px var(--s3); margin-left: var(--s1); }
    .commit.now { border-left-color: var(--signal); }
    .commit-head { display: flex; align-items: center; gap: var(--s2); }
    .commit-msg { flex: 1; font-size: 13.5px; }
    .commit.now .commit-msg { font-weight: 620; }
    .commit-at { font: 11px var(--mono); color: var(--ink-3); font-variant-numeric: tabular-nums; }
    .diff { margin: 6px 0 0; padding-left: var(--s4); font: 12.5px var(--mono); color: var(--ink-2); }
    .diff li { margin: 2px 0; }
    .diff .add { color: var(--blueprint); }
    .diff .del { color: var(--record); }
  `,
  body: `
  <div class="group">
    <h2>History</h2>
    <ul class="commits">
      <li class="commit now">
        <div class="commit-head">
          <span class="commit-msg">halftime chorus</span>
          <span class="commit-at">14:22</span>
          <button class="btn sm">Restore</button>
        </div>
        <ul class="diff">
          <li>chorus/hats: hh*16 → hh*8</li>
          <li class="del">− kick dropped in chorus</li>
        </ul>
      </li>
      <li class="commit">
        <div class="commit-head">
          <span class="commit-msg">added a bridge</span>
          <span class="commit-at">14:05</span>
          <button class="btn sm">Restore</button>
        </div>
        <ul class="diff">
          <li class="add">+ section “bridge” (4 bars)</li>
          <li>verse/lead: c4 e4 g4 → c4 e4 a4</li>
        </ul>
      </li>
      <li class="commit">
        <div class="commit-head">
          <span class="commit-msg">starting point</span>
          <span class="commit-at">13:47</span>
        </div>
      </li>
    </ul>
  </div>

  <div class="group">
    <h2>Save and branch</h2>
    <div class="cluster">
      <input class="field" placeholder="What changed?">
      <button class="btn on">Save version</button>
      <button class="btn">⑂ Branch</button>
      <select class="field" style="min-width:130px"><option>main</option><option>halftime</option></select>
    </div>
  </div>

  <p class="note">
    Restore <b>appends</b> rather than rewrites — nothing done here can lose work.
    Undo and versions stay deliberately separate: undo is per-edit for typos, versions are takes you chose to keep.
  </p>`,
});

/* --------------------------------------------------------------- marketplace */

/**
 * The schematic disc. Drawn as a technical drawing rather than cover art: the
 * thing on sale is the schematic, not the pressing — you are buying structure
 * you can read, edit, and diff, so the artwork should be the structure.
 *
 * Groove bands encode the stem's own track count, which makes the drawing
 * carry information rather than decorate.
 */
function disc({ id, title, seller, price, tracks, bars, bpm, key, tag }) {
  // One groove band per track, so the drawing counts what you are buying.
  const bands = Array.from({ length: tracks }, (_, i) => {
    const r = 66 - i * 8;
    return `<circle class="groove" cx="110" cy="98" r="${r}"/>`;
  }).join("\n        ");

  return `
    <article class="disc-card">
      <svg class="disc" viewBox="0 0 220 208" role="img" aria-label="${title} — ${tracks} tracks, ${bars} bars, ${bpm} bpm">
        <!-- crop marks: this is a drawing, and drawings have a sheet -->
        <path class="crop" d="M6 6 h14 M6 6 v14 M214 6 h-14 M214 6 v14 M6 202 h14 M6 202 v-14 M214 202 h-14 M214 202 v-14"/>

        <circle class="edge" cx="110" cy="98" r="74"/>
        ${bands}
        <circle class="label-disc" cx="110" cy="98" r="22"/>
        <circle class="spindle" cx="110" cy="98" r="3.5"/>

        <!-- callout leader to the outermost groove -->
        <path class="lead" d="M110 18 v6"/>
        <text class="call" x="110" y="14" text-anchor="middle">${tracks} TRACKS</text>

        <!-- dimension sits clear of the disc, as a drafting dimension does -->
        <path class="dim" d="M24 186 h172 M24 182 v8 M196 182 v8"/>
        <text class="dim-t" x="110" y="202" text-anchor="middle">${bars} BARS · ${bpm} BPM · ${key}</text>

        <text class="sig" x="110" y="95" text-anchor="middle">${id}</text>
        <text class="sig dim-t" x="110" y="106" text-anchor="middle">${tag}</text>
      </svg>

      <div class="disc-meta">
        <b>${title}</b>
        <span class="by">${seller}</span>
      </div>
      <div class="disc-foot">
        <span class="price">${price}</span>
        <button class="btn sm">Add to crate</button>
      </div>
    </article>`;
}

const DISC_CSS = `
  .disc-card {
    background: var(--paper-2);
    border: 1px solid var(--rule);
    border-radius: var(--r-md);
    padding: var(--s3);
    display: flex; flex-direction: column; gap: var(--s2);
  }
  .disc { width: 100%; height: auto; display: block; background: var(--sunk); border-radius: var(--r-sm); }

  .edge   { fill: none; stroke: var(--ink-2); stroke-width: 1.2; }
  .groove { fill: none; stroke: var(--blueprint); stroke-width: 0.6; opacity: 0.85; }
  .label-disc { fill: color-mix(in srgb, var(--signal) 22%, var(--sunk)); stroke: var(--ink-2); stroke-width: 0.8; }
  .spindle { fill: var(--sunk); stroke: var(--ink-2); stroke-width: 0.8; }
  .crop { fill: none; stroke: var(--ink-3); stroke-width: 0.8; }
  .dim  { fill: none; stroke: var(--ink-3); stroke-width: 0.6; }
  .lead { fill: none; stroke: var(--ink-3); stroke-width: 0.6; }
  .dim-t, .call, .sig { font-family: var(--mono); fill: var(--ink-2); }
  .dim-t { font-size: 8px; letter-spacing: 0.06em; }
  .call  { font-size: 8px; letter-spacing: 0.1em; fill: var(--ink-3); }
  .sig   { font-size: 9px; font-weight: 600; fill: var(--ink); letter-spacing: 0.04em; }

  .disc-meta { display: flex; flex-direction: column; gap: 1px; }
  .disc-meta b { font-size: 13.5px; font-weight: 620; }
  .disc-meta .by { font-size: 11.5px; color: var(--ink-3); }
  .disc-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--s2); }
  .price { font: 620 14px var(--mono); font-variant-numeric: tabular-nums; }
`;

const SAMPLE_DISCS = [
  { id: "MJ-014", title: "Dilla-adjacent drums", seller: "hovercraft", price: "$4.00", tracks: 4, bars: 8, bpm: 92, key: "—", tag: "DRUMS" },
  { id: "MJ-027", title: "Halftime chorus kit", seller: "ninth street", price: "$6.00", tracks: 5, bars: 8, bpm: 140, key: "F min", tag: "KIT" },
  { id: "MJ-031", title: "Rhodes progression", seller: "mor.", price: "$3.00", tracks: 2, bars: 4, bpm: 120, key: "C maj", tag: "KEYS" },
  { id: "MJ-042", title: "Two-step skeleton", seller: "hovercraft", price: "Free", tracks: 6, bars: 16, bpm: 132, key: "G min", tag: "FULL" },
];

const discSpec = page({
  title: "Schematic disc",
  group: "Marketplace",
  heading: "Schematic disc",
  blurb:
    "A stem for sale, drawn as a technical drawing rather than cover art. What is on sale is the " +
    "schematic — structure you can read, edit and diff — so the drawing is the structure. Groove bands count the stem's tracks.",
  css: `${CONTROL_CSS}${DISC_CSS}
    .strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: var(--s3); max-width: 720px; }
  `,
  body: `
  <div class="group">
    <h2>Variants</h2>
    <div class="strip">
${SAMPLE_DISCS.map(disc).join("\n")}
    </div>
  </div>

  <p class="note">
    Every mark carries data: groove count is track count, the dimension line reads bars, tempo and key,
    and the catalogue number is the stem's id. Nothing here is decoration, which is what keeps a wall of
    them scannable rather than noisy.
  </p>`,
});

const shelf = page({
  title: "Record shop",
  group: "Marketplace",
  heading: "Record shop",
  blurb:
    "Crate-digging for song parts. Stems are patterns — kilobytes of JSON, not audio files — so " +
    "everything on this shelf drops straight into your arrangement and stays editable and diffable after it lands.",
  css: `${CONTROL_CSS}${DISC_CSS}
    .shop { display: flex; flex-direction: column; gap: var(--s4); }
    .shop-bar { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
    .shop-bar .field { flex: 1; min-width: 200px; }
    .crates { display: flex; gap: var(--s1); flex-wrap: wrap; }
    .shelf-head { display: flex; align-items: baseline; gap: var(--s3); border-bottom: 1px solid var(--rule); padding-bottom: 6px; }
    .shelf-head h3 { margin: 0; font-size: 14px; font-weight: 620; }
    .shelf-head span { font-size: 12px; color: var(--ink-3); }
    .strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--s3); }
  `,
  body: `
  <div class="shop">
    <div class="shop-bar">
      <input class="field" placeholder="Search stems — “halftime”, “rhodes”, “92 bpm”">
      <span class="crates">
        <button class="btn sm on">All</button>
        <button class="btn sm">Drums</button>
        <button class="btn sm">Keys</button>
        <button class="btn sm">Bass</button>
        <button class="btn sm">Full kits</button>
      </span>
      <button class="btn sm">🛒 Crate (2)</button>
    </div>

    <div class="group">
      <div class="shelf-head">
        <h3>New this week</h3>
        <span>4 stems</span>
      </div>
      <div class="strip">
${SAMPLE_DISCS.map(disc).join("\n")}
      </div>
    </div>
  </div>

  <p class="note">
    Buying a stem inserts its tracks into the section you are looking at — as ordinary cells,
    with ordinary patterns. After that it is yours to edit by voice like anything else you made;
    the purchase shows up in your version history as one more commit.
  </p>`,
});

/* --------------------------------------------------------------------- write */

const FILES = [
  ["foundations/color.html", color],
  ["foundations/type.html", type],
  ["foundations/spacing.html", spacing],
  ["components/controls.html", buttons],
  ["components/transport.html", transport],
  ["components/arrangement-grid.html", timeline],
  ["components/stem-card.html", stemCard],
  ["components/capture.html", capture],
  ["components/vocal-take.html", vocalTake],
  ["components/versions.html", versions],
  ["marketplace/schematic-disc.html", discSpec],
  ["marketplace/record-shop.html", shelf],
];

for (const [path, html] of FILES) {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html, "utf8");
  console.log("wrote", path, `${(html.length / 1024).toFixed(1)}kb`);
}
