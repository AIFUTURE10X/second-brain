# Second Brain — Chrome Extension

One-click capture of any page, link, or selected text straight into your
Second Brain. Manifest V3.

- **Toolbar popup** — pick a type (link / clip / note / thought), add title,
  notes, tags, and category, then **Save to Brain**.
- **Right-click menu** — "Save page / link / selection to Brain" anywhere.
  Result flashes on the toolbar badge (green ✓ / red !).
- **Keyboard shortcuts** — `Ctrl/Cmd+Shift+S` saves the current page;
  `Ctrl/Cmd+Shift+L` saves the highlighted text as an annotation on this
  page's existing card.

## Before you start

You need two things from your deployment:

1. **Your Second Brain URL** — the deployed app, e.g.
   `https://your-app.vercel.app`.
2. **Your API key** — the `API_SECRET` value from your environment variables
   (Vercel → Settings → Environment Variables).

> **Heads up:** this extension is only permitted to talk to `*.vercel.app`
> (`host_permissions` in `manifest.json`). If you later move your app to a
> custom domain, that domain has to be added to the manifest or saving will
> fail.

## Install (load unpacked)

This is a developer/unpacked extension — it is **not** on the Chrome Web
Store, so you load it manually. It will **not** sync across devices via your
Google account, and Chrome shows a "disable developer-mode extensions" notice
on startup (safe to dismiss).

1. Get this `extension/` folder onto your computer (download it or
   `git clone` the repo).
2. Open Chrome and switch to the profile / Google account you want it in
   (avatar, top-right).
3. Go to **`chrome://extensions`**.
4. Turn on **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select this **`extension`** folder.
6. "◆ Second Brain — Save to Brain" appears. Click the puzzle-piece icon in
   the toolbar and **pin** it.

## Configure

1. Click the pinned extension icon.
2. Enter your **Second Brain URL** and **API key** (`API_SECRET`).
3. Click **Connect**. It test-calls `GET /api/categories` with your key:
   - **Connected!** — you're set.
   - **Invalid API key** — the key doesn't match `API_SECRET`.
   - **Can't reach server / Server returned N** — check the URL.

Settings are stored locally per browser profile (re-enter them if you load the
extension in another profile or on another machine). Change them anytime via
the **Settings** button in the popup.

## Use it

- **Popup:** click the icon → choose a type → fill in fields → **Save to
  Brain**. If you have text selected on the page, it's pre-filled into notes.
- **Right-click:** anywhere on a page / on a link / over selected text →
  "Save … to Brain". Watch the toolbar badge: green ✓ = saved, red ! = error,
  `set` = not configured yet (open the popup), `sel` = nothing highlighted.
- **Shortcuts:** `Ctrl/Cmd+Shift+S` (save page), `Ctrl/Cmd+Shift+L` (annotate
  selection onto this page's card). Rebind or fix conflicts at
  `chrome://extensions/shortcuts`.

## Updating

After pulling new code, go to `chrome://extensions` and click the **reload**
↻ icon on the Second Brain card.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Badge shows `set` | Open the popup and connect (URL + API key). |
| "Invalid API key" | Key must equal `API_SECRET` on the deployment. |
| "Can't reach server" | Verify the URL; it must be reachable and `https`. |
| Saves fail on a custom domain | Add the domain to `host_permissions` in `manifest.json`, then reload. |
| Shortcut does nothing | Another extension may own it — rebind at `chrome://extensions/shortcuts`. |

## Want a one-click, synced install?

Publishing to the Chrome Web Store gives you a normal install that syncs to
your Google account across devices (it needs icons, a packaged zip, a listing,
and a Google developer account — a one-time $5 fee). That's a separate task —
ask and it can be prepped.
