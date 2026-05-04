import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API — narrow types because lib.dom.d.ts doesn't ship them.
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SRCtor = new () => SR;

function getSRConstructor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type UseSpeechRecognitionOptions = {
  lang?: string;
  /** Called with the latest interim transcript while the user speaks. */
  onInterim?: (text: string) => void;
  /** Called with each finalized chunk (after a pause). */
  onFinal?: (text: string) => void;
};

export function useSpeechRecognition(opts: UseSpeechRecognitionOptions = {}) {
  const { lang = "en-IN", onInterim, onFinal } = opts;
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = useRef<boolean>(getSRConstructor() !== null).current;
  const recRef = useRef<SR | null>(null);

  // Keep the latest callbacks in refs so we don't re-wire onresult on every render.
  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onInterimRef.current = onInterim;
    onFinalRef.current = onFinal;
  }, [onInterim, onFinal]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch { /* idempotent */ }
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      setError("Speech recognition isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (recRef.current) {
      stop();
      return;
    }
    setError(null);
    const Ctor = getSRConstructor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
        else interimChunk += r[0].transcript;
      }
      if (finalChunk) onFinalRef.current?.(finalChunk);
      if (interimChunk) onInterimRef.current?.(interimChunk);
    };
    rec.onerror = (e) => {
      // "no-speech" and "aborted" fire as part of normal stop — don't surface them.
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone permission was denied. Allow it in the browser address bar and try again.");
        return;
      }
      if (e.error === "network") {
        // The Web Speech API streams to Google's servers (speech.googleapis.com).
        // Brave Shields and corporate firewalls block this even though the API
        // reports as "supported". Tell the user what's actually wrong.
        setError(
          "Couldn't reach the speech service. If you're on Brave, lower Shields for this site, or use Chrome/Edge. Otherwise check your internet / VPN.",
        );
        return;
      }
      setError(`Speech recognition error: ${e.error}`);
    };
    rec.onend = () => {
      recRef.current = null;
      setRecording(false);
    };
    recRef.current = rec;
    setRecording(true);
    rec.start();
  }, [supported, lang, stop]);

  // Tear down on unmount.
  useEffect(() => () => stop(), [stop]);

  return { supported, recording, error, start, stop, toggle: start };
}
