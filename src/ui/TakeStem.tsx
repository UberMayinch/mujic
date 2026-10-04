/**
 * A recorded vocal take, shown as a stem.
 *
 * The waveform is the point of this component: it is the one place in mujic
 * where you see *your performance* rather than a symbolic reconstruction of it.
 * Everything else in the document is notes and patterns; this is the audio.
 */

import type { ProjectDoc, Track } from "../model/project";

type Props = {
  doc: ProjectDoc;
  track: Track;
  onChange: (next: ProjectDoc) => void;
};

export function TakeStem({ doc, track, onChange }: Props) {
  const settings = track.take;
  const take = settings ? doc.takes[settings.takeId] : undefined;

  if (!settings || !take) {
    return <p className="nopreview">recording missing — re-record this take</p>;
  }

  const drifted = take.recordedBpm !== doc.bpm;

  const set = (patch: Partial<NonNullable<Track["take"]>>) =>
    onChange({
      ...doc,
      tracks: doc.tracks.map((t) =>
        t.id === track.id ? { ...t, take: { ...settings, ...patch } } : t,
      ),
    });

  return (
    <div className="take">
      <div className="wave">
        {take.peaks.map((peak, i) => (
          // A floor of 2% keeps silence visible as a line rather than a gap,
          // so you can see where you came in.
          <i key={i} style={{ height: `${Math.max(2, peak * 100)}%` }} />
        ))}
      </div>

      <div className="take-toggles">
        <label title="Skip the run-up before you came in. Offsets playback; never cuts the file.">
          <input
            type="checkbox"
            checked={settings.snapStart}
            onChange={(e) => set({ snapStart: e.target.checked })}
          />
          Snap start to bar
        </label>
        <label title="Resamples the take to match the tempo — which raises or lowers its pitch.">
          <input
            type="checkbox"
            checked={settings.fitTempo}
            onChange={(e) => set({ fitTempo: e.target.checked })}
          />
          Fit to tempo (re-pitches)
        </label>
      </div>

      {drifted && !settings.fitTempo && (
        <p className="take-note">
          Recorded at {take.recordedBpm} bpm, playing at {doc.bpm}. The audio is left exactly
          as you sang it and will drift against the beat. Fitting it to tempo would change its
          pitch — so mujic says so rather than quietly doing either.
        </p>
      )}
    </div>
  );
}
