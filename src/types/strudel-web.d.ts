/**
 * @strudel/web ships no TypeScript declarations. This is the slice of its
 * surface we actually use; see src/audio/engine.ts, which is the only module
 * allowed to touch it.
 */
declare module "@strudel/web" {
  export function initStrudel(options?: {
    prebake?: () => Promise<void> | void;
    [key: string]: unknown;
  }): Promise<void>;
}
