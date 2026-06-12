// Platform glue for reminder notifications (roadmap 3.2). Inside the Tauri
// desktop wrapper the WebView can't use the web Notification API reliably,
// so the Tauri notification plugin is used via IPC; everywhere else (browser
// tab, installed PWA) the standard Notification API does the job.

type TauriIpc = { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };

function tauriIpc(): TauriIpc | null {
  if (typeof window === "undefined") return null;
  const ipc = (window as unknown as { __TAURI_INTERNALS__?: TauriIpc }).__TAURI_INTERNALS__;
  return ipc && typeof ipc.invoke === "function" ? ipc : null;
}

export function isTauriDesktop(): boolean {
  return tauriIpc() !== null;
}

/** Ask for permission; true when notifications may be shown. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const ipc = tauriIpc();
  if (ipc) {
    try {
      const granted = await ipc.invoke!("plugin:notification|is_permission_granted");
      if (granted === true) return true;
      const result = await ipc.invoke!("plugin:notification|request_permission");
      return result === "granted";
    } catch {
      return false;
    }
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Fire one notification; never throws. */
export async function notifyDesktop(title: string, body: string): Promise<void> {
  const ipc = tauriIpc();
  if (ipc) {
    try {
      await ipc.invoke!("plugin:notification|notify", { options: { title, body } });
    } catch (error) {
      console.error("Tauri notification failed:", error);
    }
    return;
  }
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch (error) {
    console.error("Notification failed:", error);
  }
}
