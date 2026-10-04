import { useEffect, useRef, useState } from "react";
import { createAsr, isAsrSupported } from "../voice/asr";

type Props = {
  busy: boolean;
  onTranscript: (text: string) => void;
  onNote: (line: string) => void;
};

export function VoiceBar({ busy, onTranscript, onNote }: Props) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [typed, setTyped] = useState("");

  // The callbacks change identity whenever the document does. Route them
  // through a ref so the recognizer is constructed exactly once — rebuilding it
  // mid-utterance would leave the old instance running while stop() targeted
  // the new one, sticking the UI in "listening".
  const handlers = useRef({ onTranscript, onNote });
  handlers.current = { onTranscript, onNote };

  const asrRef = useRef<ReturnType<typeof createAsr> | null>(null);

  useEffect(() => {
    asrRef.current = createAsr({
      onPartial: setPartial,
      onFinal: (text) => {
        setPartial("");
        setListening(false);
        handlers.current.onTranscript(text);
      },
      onError: (message) => {
        setPartial("");
        setListening(false);
        handlers.current.onNote(`✗ mic: ${message}`);
      },
    });
    return () => asrRef.current?.stop();
  }, []);

  const toggle = () => {
    if (listening) {
      asrRef.current?.stop();
      setListening(false);
    } else {
      setListening(true);
      asrRef.current?.start();
    }
  };

  const submitTyped = (event: React.FormEvent) => {
    event.preventDefault();
    if (!typed.trim()) return;
    onTranscript(typed);
    setTyped("");
  };

  return (
    <form className="voice" onSubmit={submitTyped}>
      <button type="button" className={listening ? "mic on" : "mic"} onClick={toggle} disabled={busy}>
        {listening ? "● listening" : "🎙 speak"}
      </button>
      {/* Typed input is the fallback when the browser has no speech API, and
          the fastest way to test the pipeline without talking. */}
      <input
        value={partial || typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={isAsrSupported() ? "…or type a command" : "type a command (no speech API in this browser)"}
        disabled={listening || busy}
      />
      <button type="submit" disabled={busy || !typed.trim()}>
        {busy ? "…" : "send"}
      </button>
    </form>
  );
}
