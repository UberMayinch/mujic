/**
 * Record a vocal take into the section you're looking at.
 *
 * Deliberately separate from 🎤 hum: humming produces *notes* played by a synth,
 * this produces *your voice*. Both are useful and they are not the same feature,
 * so they get different buttons rather than a mode switch — a user who wants to
 * hear themselves back should never have to discover a toggle to get it.
 */

import { useState } from "react";
import { recordTake } from "../audio/take";
import { isMicSupported } from "../audio/tapin";
import { makeTrack, type ProjectDoc } from "../model/project";

type Props = {
  doc: ProjectDoc;
  sectionId: string | undefined;
  bars: number;
  disabled?: boolean;
  onChange: (next: ProjectDoc, label: string) => void;
  onNote: (line: string) => void;
};

type State = "idle" | "counting" | "saving";

export function SingIn({ doc, sectionId, bars, disabled, onChange, onNote }: Props) {
  const [state, setState] = useState<State>("idle");
  const [countdown, setCountdown] = useState(0);

  const supported = isMicSupported();

  const record = async () => {
    if (!sectionId) return onNote("✗ no section selected");
    setState("counting");
    try {
      const take = await recordTake(doc.bpm, bars, setCountdown);
      setState("saving");

      const name = doc.tracks.some((t) => t.name === "vox")
        ? `vox ${doc.tracks.filter((t) => t.kind === "take").length + 1}`
        : "vox";

      const track = makeTrack({
        name,
        kind: "take",
        defaultSound: "take",
        gain: 1,
        take: { takeId: take.id, snapStart: true, fitTempo: false },
      });

      // Explicit where you recorded it, silent elsewhere — a take lands in the
      // section you were listening to, not across the whole song.
      onChange(
        {
          ...doc,
          takes: { ...doc.takes, [take.id]: take },
          tracks: [...doc.tracks, track],
          sections: doc.sections.map((section) => ({
            ...section,
            cells: {
              ...section.cells,
              [track.id]:
                section.id === sectionId
                  ? { kind: "pattern", pattern: take.id }
                  : { kind: "silent" },
            },
          })),
        },
        `🎙 recorded “${name}” — ${bars} ${bars === 1 ? "bar" : "bars"} at ${doc.bpm} bpm`,
      );
    } catch (error) {
      onNote(`✗ ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setState("idle");
      setCountdown(0);
    }
  };

  if (!supported) return null;

  return (
    <button
      className={state === "idle" ? "" : "on"}
      disabled={disabled || state !== "idle"}
      onClick={() => void record()}
      title="Record your actual voice as a reference track"
    >
      {state === "counting" ? `● ${countdown}` : state === "saving" ? "saving…" : "🎙 sing"}
    </button>
  );
}
