use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

// Injected into every page load. Intercepts clicks on anchors with
// target="_blank" (and any cross-origin link) and reroutes them through
// the opener plugin so they open in the user's default browser. Without
// this, target="_blank" clicks inside the WebView2 webview do nothing.
const EXTERNAL_LINK_INTERCEPTOR: &str = r#"
(function () {
  window.__SECOND_BRAIN_DESKTOP__ = true;

  function log() { try { console.log.apply(console, ["[sb-desktop]"].concat([].slice.call(arguments))); } catch (e) {} }

  function isExternal(href) {
    try {
      var u = new URL(href, window.location.href);
      if (!/^https?:$/.test(u.protocol)) return false;
      return u.host !== window.location.host;
    } catch (e) {
      return false;
    }
  }

  function openExternal(href) {
    var ipc = window.__TAURI_INTERNALS__;
    if (!ipc || typeof ipc.invoke !== "function") {
      log("IPC bridge missing, cannot open", href);
      return false;
    }
    log("opening externally:", href);
    ipc.invoke("plugin:opener|open_url", { url: href, with: null })
      .then(function () { log("opener succeeded"); })
      .catch(function (err) { log("opener failed:", err); });
    return true;
  }

  document.addEventListener(
    "click",
    function (e) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      var node = e.target;
      while (node && node !== document.body) {
        if (node.tagName === "A" && node.href) {
          var href = node.href;
          var blank = node.target === "_blank";
          if (blank || isExternal(href)) {
            if (openExternal(href)) {
              e.preventDefault();
              e.stopPropagation();
            }
          }
          return;
        }
        node = node.parentNode;
      }
    },
    true
  );

  var origOpen = window.open;
  window.open = function (url, target) {
    if (url && (target === "_blank" || isExternal(url))) {
      if (openExternal(String(url))) return null;
    }
    return origOpen.apply(this, arguments);
  };

  log("link interceptor installed");
})();
"#;

// Custom command: open a card as a standalone Tauri window.
// Called from the frontend via window.__TAURI_INTERNALS__.invoke("pop_out_card", ...)
// because window.open() in WebView2 silently fails for same-origin popups.
#[tauri::command]
fn pop_out_card(app: tauri::AppHandle, url: String, label: String) -> Result<(), String> {
    // Re-focus if a window with this label already exists instead of erroring
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        return Ok(());
    }
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title("Second Brain — Card")
        .inner_size(720.0, 900.0)
        .min_inner_size(400.0, 500.0)
        .resizable(true)
        .initialization_script(EXTERNAL_LINK_INTERCEPTOR)
        .devtools(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Custom command: open a local folder/file path in the OS file manager (or its
// default app). Called from folder cards via
// window.__TAURI_INTERNALS__.invoke("open_path", { path }). Browsers block
// opening file:// paths from a hosted page, so this desktop bridge is the only
// way to make folder cards actually open the folder. Calls the opener plugin
// directly from trusted Rust, so the plugin's path scope doesn't apply — the
// user is free to open any folder they saved.
#[tauri::command]
fn open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

// Close a card pop-out window by label. Used by the Close button in the card
// page because window.close() does not work for Tauri-created windows.
#[tauri::command]
fn close_card_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![pop_out_card, close_card_window, open_path])
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            app.deep_link().register_all()?;

            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |_event| {
                focus_main_window(&app_handle);
            });

            let url: tauri::Url = "https://second-brain-bice-two.vercel.app/"
                .parse()
                .expect("hardcoded URL is valid");

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Second Brain")
                .inner_size(1200.0, 900.0)
                .min_inner_size(400.0, 500.0)
                .resizable(true)
                .center()
                .initialization_script(EXTERNAL_LINK_INTERCEPTOR)
                .devtools(true)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
