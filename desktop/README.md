# Second Brain — Desktop App

A native Windows `.exe` wrapper for the Second Brain web app, built with Tauri v2.
The app loads `https://second-brain-bice-two.vercel.app/` in a dedicated window
using the system's WebView2 runtime — no Chrome dependency.

## How builds work

Builds run on GitHub Actions (`.github/workflows/build-desktop.yml`). On every
push to `desktop/**` or on manual dispatch, CI produces an NSIS installer
(`.exe`) you can download from the workflow run's artifacts.

You do not need Rust installed locally. Just edit files here, push, and download
the resulting installer from GitHub Actions.

## Local development (optional)

If you ever want to iterate locally:
1. Install Rust: https://rustup.rs
2. Install Tauri CLI: `npm install -g @tauri-apps/cli`
3. From this folder: `tauri dev` (runs against the live Vercel URL)
4. To build locally: `tauri build`
