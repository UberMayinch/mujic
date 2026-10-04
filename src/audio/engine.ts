/**
 * Strudel audio engine wrapper.
 *
 * @strudel/web installs its API (evaluate, hush, samples, …) as globals after
 * initStrudel(). Keeping every assumption about that behind this module means
 * the rest of the app only sees start/stop/evaluate.
 */

import { initStrudel } from "@strudel/web";
import { takeSampleName } from "../model/codegen";
import type { ProjectDoc } from "../model/project";

type StrudelGlobals = {
  evaluate: (code: string) => Promise<unknown>;
  hush: () => void;
  samples: (map: unknown) => Promise<unknown>;
};

let ready: Promise<StrudelGlobals> | null = null;

/**
 * Must be called from a user gesture — browsers refuse to start an AudioContext
 * otherwise. Safe to call repeatedly; initialization happens once.
 */
export function initAudio(): Promise<StrudelGlobals> {
  if (!ready) {
    ready = (async () => {
      await initStrudel({
        prebake: async () => {
          const g = globalThis as any;
          // The default sample pack — dirt-samples names (bd, sd, hh, cp, …).
          await g.samples("github:tidalcycles/dirt-samples");
        },
      });
      const g = globalThis as any;
      if (typeof g.evaluate !== "function" || typeof g.hush !== "function") {
        throw new Error("Strudel initialized but did not install evaluate/hush globals");
      }
      return { evaluate: g.evaluate, hush: g.hush, samples: g.samples };
    })();
  }
  return ready;
}

/** Take ids already handed to Strudel, so re-registering the same audio is free. */
const registered = new Set<string>();

/**
 * Forget which takes are registered. **Must** be called when switching projects.
 *
 * Take ids are minted from a per-session counter, so two independently saved
 * projects can each legitimately contain `take1`. Without clearing, opening the
 * second project skips registration and its vocal plays back the *first*
 * project's audio — silently playing someone else's voice is the worst failure
 * this layer can have.
 */
export function forgetTakes(): void {
  registered.clear();
}

/**
 * Make the document's recorded takes playable.
 *
 * Strudel resolves sample names at evaluate time, so every take referenced by
 * the generated code has to be registered *before* it runs — otherwise the
 * first play after a reload is silent for exactly the tracks the user cares
 * most about hearing.
 */
export async function registerTakes(doc: ProjectDoc): Promise<void> {
  const pending = Object.values(doc.takes ?? {}).filter((t) => !registered.has(t.id));
  if (pending.length === 0) return;

  const { samples } = await initAudio();
  if (typeof samples !== "function") return;

  const map = Object.fromEntries(pending.map((t) => [takeSampleName(t.id), [t.audio]]));
  await samples(map);
  pending.forEach((t) => registered.add(t.id));
}

export async function play(code: string, doc?: ProjectDoc): Promise<void> {
  const { evaluate } = await initAudio();
  if (doc) await registerTakes(doc);
  await evaluate(code);
}

export async function stop(): Promise<void> {
  const { hush } = await initAudio();
  hush();
}
