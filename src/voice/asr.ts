/**
 * Speech recognition, isolated behind one interface.
 *
 * MVP uses the browser's Web Speech API: zero-install, works in Chrome. Every
 * assumption about it lives in this file, so swapping in a server-side ASR
 * (Whisper, Deepgram) later is a single-module change.
 */

export type AsrHandlers = {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isAsrSupported(): boolean {
  return getRecognitionCtor() !== undefined;
}

export function createAsr(handlers: AsrHandlers) {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    return {
      start: () => handlers.onError?.("Speech recognition is unavailable in this browser. Chrome supports it."),
      stop: () => {},
    };
  }

  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0].transcript;
      if (result.isFinal) handlers.onFinal(text);
      else handlers.onPartial?.(text);
    }
  };

  recognition.onerror = (event: any) => {
    handlers.onError?.(event.error ?? "speech recognition failed");
  };

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  };
}
