// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Regula desktop shell.
//!
//! By default Regula is only a pink dot in the menu bar / tray, the full stop
//! from the finnova logo, recoloured per cockpit state. The Rust side owns that
//! dot, the tray menu and the transparent companion window, which stays hidden
//! until the user opts in ("Show Regula on the desktop"). Everything Regula
//! knows (state machine, feed client, card, bubbles) lives in the web view, so
//! this file stays deliberately small.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, Emitter,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

const TRAY_ID: &str = "regula";

/// Startup configuration derived from CLI flags, environment and settings.
///
/// `regula --mock` replays the scripted hackathon story.
/// `regula --cockpit https://host` subscribes to the real event feed.
/// With neither flag the mock feed is used, so a plain `npm start` always demos.
#[derive(Clone, Serialize)]
struct Config {
    mock: bool,
    cockpit_url: String,
    lang: String,
    /// True when the user opted into the desktop companion.
    desktop: bool,
}

impl Config {
    fn from_env(desktop: bool) -> Self {
        let args: Vec<String> = std::env::args().collect();
        let mut cockpit_url = std::env::var("REGULA_COCKPIT_URL").unwrap_or_default();
        let mut mock = args.iter().any(|a| a == "--mock");
        let mut lang = std::env::var("REGULA_LANG").unwrap_or_else(|_| "en".to_string());

        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--cockpit" if i + 1 < args.len() => {
                    cockpit_url = args[i + 1].clone();
                    i += 1;
                }
                "--lang" if i + 1 < args.len() => {
                    lang = args[i + 1].clone();
                    i += 1;
                }
                _ => {}
            }
            i += 1;
        }
        if cockpit_url.is_empty() {
            mock = true;
            cockpit_url = "https://cockpit.finnova.local".to_string();
        }
        Config {
            mock,
            cockpit_url: cockpit_url.trim_end_matches('/').to_string(),
            lang,
            desktop,
        }
    }
}

// ---------------------------------------------------------------- settings
/// The only thing Regula stores besides the window position: whether the user
/// wants the companion on the desktop. Lives in the app config dir as JSON.
#[derive(Clone, Default, Serialize, Deserialize)]
struct Settings {
    #[serde(default)]
    desktop: bool,
}

fn settings_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    settings_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_settings(app: &AppHandle, settings: &Settings) {
    if let Some(p) = settings_path(app) {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_string_pretty(settings) {
            let _ = std::fs::write(p, json);
        }
    }
}

/// Shared handles the commands need: the "show on desktop" check item.
struct Shell {
    desktop_item: CheckMenuItem<tauri::Wry>,
    settings: Mutex<Settings>,
}

// ---------------------------------------------------------------- tray dot
// Brand colours, one to one with src/tokens.css.
const PINK: [f32; 3] = [240.0, 66.0, 190.0];
const PINK_MUTED: [f32; 3] = [249.0, 182.0, 228.0];
const NAVY: [f32; 3] = [23.0, 35.0, 59.0];
const GREEN: [f32; 3] = [31.0, 77.0, 58.0];
const MUTED: [f32; 3] = [77.0, 86.0, 81.0];

/// Canvas is 36 px, shown at 18 pt in the macOS menu bar (2x). The dot itself
/// is 8 pt across, a full stop next to 13 pt menu-bar text, like the logo.
const SIZE: usize = 36;
const DOT_R: f32 = 8.0;

struct Canvas(Vec<[f32; 4]>);

impl Canvas {
    fn new() -> Self {
        Canvas(vec![[0.0; 4]; SIZE * SIZE])
    }
    fn each<F: FnMut(&mut [f32; 4], f32)>(&mut self, cx: f32, cy: f32, r: f32, mut f: F) {
        for y in 0..SIZE {
            for x in 0..SIZE {
                let dx = x as f32 + 0.5 - cx;
                let dy = y as f32 + 0.5 - cy;
                let cov = (r - (dx * dx + dy * dy).sqrt() + 0.5).clamp(0.0, 1.0);
                if cov > 0.0 {
                    f(&mut self.0[y * SIZE + x], cov);
                }
            }
        }
    }
    /// Anti-aliased filled circle, composited "over".
    fn disc(&mut self, cx: f32, cy: f32, r: f32, rgb: [f32; 3]) {
        self.each(cx, cy, r, |px, cov| {
            let a = cov;
            let out_a = a + px[3] * (1.0 - a);
            for i in 0..3 {
                px[i] = if out_a > 0.0 { (rgb[i] * a + px[i] * px[3] * (1.0 - a)) / out_a } else { 0.0 };
            }
            px[3] = out_a;
        });
    }
    /// Punch a transparent hole (for hollow rings and the gap around a badge).
    fn cut(&mut self, cx: f32, cy: f32, r: f32) {
        self.each(cx, cy, r, |px, cov| px[3] *= 1.0 - cov);
    }
    fn into_image(self) -> Image<'static> {
        let mut rgba = Vec::with_capacity(SIZE * SIZE * 4);
        for px in self.0 {
            for c in px.iter().take(3) {
                rgba.push(c.round() as u8);
            }
            rgba.push((px[3] * 255.0).round() as u8);
        }
        Image::new_owned(rgba, SIZE as u32, SIZE as u32)
    }
}

/// The menu-bar dot for a pose. `phase` alternates while Working so the dot
/// breathes; everything else is a still image.
fn dot_icon(pose: &str, phase: u8) -> Image<'static> {
    let c = SIZE as f32 / 2.0;
    let mut cv = Canvas::new();
    let badge = |cv: &mut Canvas, rgb: [f32; 3]| {
        let (bx, by, br) = (c + DOT_R * 0.72, c - DOT_R * 0.72, 3.4);
        cv.cut(bx, by, br + 1.6);
        cv.disc(bx, by, br, rgb);
    };
    match pose {
        "working" => {
            let r = if phase % 2 == 0 { DOT_R } else { DOT_R - 1.4 };
            cv.disc(c, c, r, PINK);
        }
        "protected" => {
            cv.disc(c, c, DOT_R, PINK);
            badge(&mut cv, NAVY);
        }
        "pending" => {
            cv.disc(c, c, DOT_R, PINK);
            cv.cut(c, c, DOT_R - 2.6);
        }
        "granted" => {
            cv.disc(c, c, DOT_R, PINK);
            badge(&mut cv, GREEN);
        }
        "declined" => {
            cv.disc(c, c, DOT_R, PINK);
            badge(&mut cv, MUTED);
        }
        "signoff" => {
            cv.disc(c, c, DOT_R, PINK);
            badge(&mut cv, NAVY);
            cv.cut(c + DOT_R * 0.72, c - DOT_R * 0.72, 1.4);
        }
        "offline" => cv.disc(c, c, DOT_R, PINK_MUTED),
        "paused" => {
            cv.disc(c, c, DOT_R, PINK_MUTED);
            cv.cut(c, c, DOT_R - 2.6);
        }
        "disabled" => cv.disc(c, c, DOT_R, MUTED),
        _ => cv.disc(c, c, DOT_R, PINK),
    }
    cv.into_image()
}

// ---------------------------------------------------------------- commands
#[tauri::command]
fn get_config(config: tauri::State<'_, Config>) -> Config {
    config.inner().clone()
}

/// Opens a cockpit deep link in the default browser. Regula never navigates
/// itself; every action button ends up here.
#[tauri::command]
fn open_cockpit(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only http(s) links are allowed".into());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Click-through mode: the companion stays visible but the cursor falls through
/// to whatever is underneath. Toggled from the tray, or from the card.
#[tauri::command]
fn set_click_through(window: tauri::Window, enabled: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|e| e.to_string())
}

/// The web view reports the derived pose; the shell redraws the menu-bar dot
/// and shows the number of items waiting on the user next to it.
#[tauri::command]
fn set_tray_state(app: AppHandle, pose: String, count: u32, phase: u8) -> Result<(), String> {
    let tray = app.tray_by_id(TRAY_ID).ok_or("no tray")?;
    tray.set_icon(Some(dot_icon(&pose, phase))).map_err(|e| e.to_string())?;
    let title = if count > 0 { Some(count.to_string()) } else { None };
    tray.set_title(title).map_err(|e| e.to_string())?;
    let tip = match pose.as_str() {
        "offline" => "Regula · cockpit not reachable",
        "paused" => "Regula · paused",
        _ => "Regula",
    };
    tray.set_tooltip(Some(tip)).map_err(|e| e.to_string())
}

/// Opt in or out of the desktop companion. Persisted, mirrored in the tray menu.
#[tauri::command]
fn set_desktop(app: AppHandle, enabled: bool) -> Result<(), String> {
    apply_desktop(&app, enabled);
    Ok(())
}

fn apply_desktop(app: &AppHandle, enabled: bool) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = if enabled { win.show() } else { win.hide() };
    }
    if let Some(shell) = app.try_state::<Shell>() {
        let _ = shell.desktop_item.set_checked(enabled);
        let mut s = shell.settings.lock().unwrap();
        s.desktop = enabled;
        save_settings(app, &s);
    }
    let _ = app.emit("regula:desktop", enabled);
}

fn build_tray(app: &AppHandle, settings: Settings) -> tauri::Result<()> {
    let desktop = CheckMenuItem::with_id(
        app,
        "desktop",
        "Show Regula on the desktop",
        true,
        settings.desktop,
        None::<&str>,
    )?;
    let open = MenuItem::with_id(app, "open", "Open cockpit", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause reactions for 1 h", true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume", "Resume reactions", true, None::<&str>)?;
    let click_through = MenuItem::with_id(app, "clickthrough", "Toggle click-through", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Regula", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[&desktop, &open, &sep, &pause, &resume, &click_through, &sep2, &quit],
    )?;

    app.manage(Shell {
        desktop_item: desktop,
        settings: Mutex::new(settings),
    });

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(dot_icon("offline", 0))
        .icon_as_template(false)
        .tooltip("Regula")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "desktop" => {
                let enabled = app
                    .try_state::<Shell>()
                    .and_then(|s| s.desktop_item.is_checked().ok())
                    .unwrap_or(false);
                apply_desktop(app, enabled);
            }
            "open" => {
                let url = app.state::<Config>().cockpit_url.clone();
                let _ = app.opener().open_url(url, None::<&str>);
            }
            "pause" => {
                let _ = app.emit("regula:pause", 60 * 60);
            }
            "resume" => {
                let _ = app.emit("regula:pause", 0);
            }
            "clickthrough" => {
                let _ = app.emit("regula:toggle-click-through", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            // Remember where the user put Regula, but never its visibility:
            // that follows the "show on the desktop" setting instead.
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION | StateFlags::SIZE)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_config,
            open_cockpit,
            set_click_through,
            set_tray_state,
            set_desktop
        ])
        .setup(|app| {
            let settings = load_settings(app.handle());
            app.manage(Config::from_env(settings.desktop));
            build_tray(app.handle(), settings.clone())?;
            if settings.desktop {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                }
            }
            #[cfg(target_os = "macos")]
            {
                // Menu-bar-only app: no Dock icon, never a focus thief.
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Regula");
}
