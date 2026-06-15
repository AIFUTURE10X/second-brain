// Bridge to the Tauri desktop wrapper (desktop/src-tauri). The app loads the
// hosted site inside a WebView and exposes custom commands over
// window.__TAURI_INTERNALS__.invoke. These helpers are no-ops in a normal
// browser, where the desktop bridge is absent.

type TauriInternals = {
  invoke?: (cmd: string, args?: unknown) => Promise<unknown>;
};

function tauriInternals(): TauriInternals | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    __TAURI_INTERNALS__?: TauriInternals;
    __SECOND_BRAIN_DESKTOP__?: unknown;
  };
  return win.__TAURI_INTERNALS__ ?? null;
}

/** True when running inside the Second Brain desktop app (Tauri WebView). */
export function isDesktopApp(): boolean {
  return Boolean(tauriInternals()?.invoke);
}

/**
 * Open a local folder/file path in the OS file manager via the desktop app's
 * `open_path` command. Returns false when not running in the desktop app (so
 * callers can fall back to copy-to-clipboard) or if the command errors.
 */
export async function openLocalPathInDesktop(path: string): Promise<boolean> {
  const trimmed = path.trim();
  if (!trimmed) return false;
  const ipc = tauriInternals();
  if (!ipc?.invoke) return false;
  try {
    await ipc.invoke("open_path", { path: trimmed });
    return true;
  } catch {
    return false;
  }
}
