"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; isFinal: boolean }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

const subscribeNoop = () => () => {};

export function VoiceButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  // SSR-safe capability check: server snapshot is false, client snapshot reflects the browser.
  const supported = useSyncExternalStore(subscribeNoop, () => !!getSpeechRecognitionCtor(), () => false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = last[0].transcript.trim();
      if (transcript) onTranscript(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return () => {
      try { rec.stop(); } catch {}
      recRef.current = null;
    };
  }, [onTranscript]);

  if (!supported) return null;

  const toggle = () => {
    if (!recRef.current) return;
    if (listening) {
      recRef.current.stop();
    } else {
      try {
        recRef.current.start();
        setListening(true);
      } catch {
        // ignore "already started" errors
      }
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-label={listening ? "Stop voice input" : "Start voice input"}
      title={listening ? "Listening…" : "Voice input"}
      className="px-3 py-2 rounded-lg text-sm border border-brand-border text-gray-500 hover:text-gray-300 hover:border-gray-600 disabled:opacity-50 active:scale-95 transition shrink-0"
      style={listening ? { background: "#EB575720", borderColor: "#EB575770", color: "#EB5757" } : undefined}
    >
      {listening ? "●" : "🎤"}
    </button>
  );
}
