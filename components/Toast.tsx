"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface ToastItem {
  id: number;
  message: string;
  variant: "success" | "error" | "info";
}

let addToastGlobal: ((message: string, variant?: "success" | "error" | "info") => void) | null = null;

export function showToast(message: string, variant: "success" | "error" | "info" = "info") {
  addToastGlobal?.(message, variant);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const addToast = useCallback((message: string, variant: "success" | "error" | "info" = "info") => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    addToastGlobal = addToast;
    return () => { addToastGlobal = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  const variantStyles = {
    success: { border: "1px solid #27AE6050", background: "#27AE6015", color: "#27AE60" },
    error: { border: "1px solid #EB575750", background: "#EB575715", color: "#EB5757" },
    info: { border: "1px solid #5B8DEF50", background: "#5B8DEF15", color: "#5B8DEF" },
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="px-4 py-2.5 rounded-lg text-xs font-mono shadow-lg pointer-events-auto animate-[fadeSlide_0.3s_ease]"
          style={variantStyles[t.variant]}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
