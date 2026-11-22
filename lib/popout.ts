/**
 * Opens a card in a pop-out browser window (or the user's default system
 * browser when running inside the Tauri desktop wrapper).
 */
export function popOutCardWindow(id: string, onError?: (msg: string) => void): void {
  if (typeof window === "undefined") return;
  const absoluteUrl = new URL(`/card/${id}`, window.location.origin).toString();

  const tauriIpc = (
    window as unknown as {
      __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };
    }
  ).__TAURI_INTERNALS__;
  if (tauriIpc && typeof tauriIpc.invoke === "function") {
    tauriIpc.invoke("plugin:opener|open_url", { url: absoluteUrl, with: null })
      .catch((err: unknown) => {
        console.error("[popOut] opener failed:", err);
        onError?.(`Pop-out failed: ${String(err)}`);
      });
    return;
  }

  const w = 720;
  const h = 900;
  const left = window.screenX + Math.max(0, window.outerWidth - w - 40);
  const top = window.screenY + 40;
  let popup: Window | null = null;
  try {
    popup = window.open(absoluteUrl, `card-${id}`, `popup,width=${w},height=${h},left=${left},top=${top}`);
  } catch {
    popup = null;
  }
  if (popup === null) {
    window.location.href = absoluteUrl;
  }
}

export function navigateToCard(id: string): void {
  if (typeof window === "undefined") return;
  window.location.href = new URL(`/card/${id}`, window.location.origin).toString();
}
