"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0D0F12]">
          <div className="text-center p-8 max-w-md">
            <div className="text-4xl mb-4">⚠</div>
            <h1
              className="text-lg font-bold mb-2"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                background: "linear-gradient(135deg, #E8A838, #EB5757)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Something went wrong
            </h1>
            <p className="text-xs text-gray-500 font-mono mb-6">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-xl text-white text-sm font-medium"
              style={{
                background: "linear-gradient(135deg, #E8A838, #EB5757)",
                boxShadow: "0 4px 16px rgba(232,168,56,0.25)",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
