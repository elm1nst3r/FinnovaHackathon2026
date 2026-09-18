// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Regula desktop shell.
//!
//! By default Regula is only a pink dot in the menu bar / tray, the full stop
//! from the finnova logo, recoloured per cockpit state. The Rust side owns that
//! dot, its dropdown (a short summary the web view reports, plus the actions
//! and the two local settings: regula.dot on the desktop or not, and whether
//! the popup under the dot shows while it is hidden; every other setting is
//! managed online in the cockpit, the dropdown only links there),
//! the popup that appears under the dot when something happens while the
//! companion is hidden, and the transparent companion window itself, which
//! stays hidden until the user opts in ("Show on desktop").
//! Everything Regula knows (state machine, feed client, card, bubbles) lives in
//! the web view, so this file stays deliberately small.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewWindow,
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
    /// True when the disc sits at the window's left and the bubble opens to the right
    /// (the companion was parked near the left edge of the screen).
    flipped: bool,
}

impl Config {
    fn from_env(desktop: bool, flipped: bool) -> Self {
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
            flipped,
        }
    }
}

// ---------------------------------------------------------------- settings
/// What Regula stores besides the window position: whether the user wants the
/// companion on the desktop, and whether the popup under the dot may show while
/// the companion is hidden. Lives in the app config dir as JSON.
#[derive(Clone, Serialize, Deserialize)]
struct Settings {
    #[serde(default)]
    desktop: bool,
    #[serde(default = "default_true")]
    popups: bool,
    /// Disc at the left of the window, bubble to its right (parked near the left screen edge).
    #[serde(default)]
    flipped: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { desktop: false, popups: true, flipped: false }
    }
}

fn default_true() -> bool {
    true
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

// ---------------------------------------------------------------- dropdown
/// One line of the dropdown; with a url it opens that cockpit page on click.
#[derive(Clone, Default, Serialize, Deserialize)]
struct TrayLink {
    text: String,
    url: Option<String>,
}

/// Labels of the fixed actions, localised by the web view (see `src/strings.ts`).
/// The English defaults only show until the web view reports.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayActions {
    open_cockpit: String,
    pause: String,
    resume: String,
    desktop: String,
    click_through: String,
    #[serde(default)]
    popups: String,
    settings: TrayLink,
    #[serde(default)]
    help: TrayLink,
    quit: String,
}

impl Default for TrayActions {
    fn default() -> Self {
        TrayActions {
            open_cockpit: "Open cockpit".into(),
            pause: "Pause reactions".into(),
            resume: "Resume reactions".into(),
            desktop: "Show on desktop".into(),
            click_through: "Let clicks pass through".into(),
            popups: "Show notes while hidden".into(),
            settings: TrayLink { text: "Settings…".into(), url: None },
            help: TrayLink { text: "About regula.dot".into(), url: None },
            quit: "Quit regula.dot".into(),
        }
    }
}

/// A titled group of items waiting ("Needs you", "With the approver").
#[derive(Clone, Default, Serialize, Deserialize)]
struct TrayGroup {
    title: String,
    items: Vec<TrayLink>,
}

/// The short summary the web view derives from its model (see `src/tray.ts`).
/// The shell turns it into native menu items above the actions; `status` is
/// also the tooltip of the dot, so the tooltip is localised like the rest.
#[derive(Clone, Default, Serialize, Deserialize)]
struct TrayInfo {
    status: String,
    counters: String,
    note: Option<TrayLink>,
    #[serde(default)]
    groups: Vec<TrayGroup>,
    #[serde(default)]
    paused: bool,
    #[serde(default)]
    actions: TrayActions,
}

/// Shared state the commands and menu events need. The menu is rebuilt from
/// `info` whenever the web view reports a change, so the check item and the
/// link table are replaced along with it.
struct Shell {
    desktop_item: Mutex<CheckMenuItem<tauri::Wry>>,
    click_item: Mutex<CheckMenuItem<tauri::Wry>>,
    popup_item: Mutex<CheckMenuItem<tauri::Wry>>,
    /// Click-through is a session toggle, not a setting: it resets on restart.
    click_through: Mutex<bool>,
    settings: Mutex<Settings>,
    /// Bumped on every window move; the on-screen check runs once the moves stop.
    move_gen: Mutex<u64>,
    info: Mutex<TrayInfo>,
    /// Deep links behind the `link:<n>` menu ids, in menu order.
    links: Mutex<Vec<String>>,
}

/// Logical width of the popup window, one to one with `tauri.conf.json`.
const POPUP_WIDTH: f64 = 340.0;
/// Gap between the menu bar and the popup's caret.
const POPUP_GAP: f64 = 4.0;

// ---------------------------------------------------------------- tray dot
// Brand colours, one to one with src/tokens.css.
const PINK: [f32; 3] = [240.0, 66.0, 190.0];
const PINK_MUTED: [f32; 3] = [249.0, 182.0, 228.0];
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
/// The dot has four looks, each legible at 8 pt without relying on colour
/// alone: solid pink (nothing waiting), a hollow ring while `count` items wait
/// (the number sits next to it), muted pink while offline or paused, grey when
/// the cockpit disabled the pet. Transient events (protected, granted,
/// declined) are said by the popup or bubble, not by the dot, and the dot
/// never animates: a menu-bar icon that moves is a distraction all day long.
fn dot_icon(pose: &str, count: u32) -> Image<'static> {
    let c = SIZE as f32 / 2.0;
    let mut cv = Canvas::new();
    let colour = match pose {
        "offline" | "paused" => PINK_MUTED,
        "disabled" => MUTED,
        _ => PINK,
    };
    cv.disc(c, c, DOT_R, colour);
    if count > 0 && pose != "disabled" {
        cv.cut(c, c, DOT_R - 2.6);
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
/// and shows the number of items waiting next to it. The tooltip comes with
/// the dropdown summary (`set_tray_info`), so it is localised there.
#[tauri::command]
fn set_tray_state(app: AppHandle, pose: String, count: u32) -> Result<(), String> {
    let tray = app.tray_by_id(TRAY_ID).ok_or("no tray")?;
    tray.set_icon(Some(dot_icon(&pose, count))).map_err(|e| e.to_string())?;
    let title = if count > 0 { Some(count.to_string()) } else { None };
    tray.set_title(title).map_err(|e| e.to_string())
}

/// Opt in or out of the desktop companion. Persisted, mirrored in the tray menu.
#[tauri::command]
fn set_desktop(app: AppHandle, enabled: bool) -> Result<(), String> {
    apply_desktop(&app, enabled);
    Ok(())
}

/// The web view reports what the dropdown should say; the shell rebuilds the
/// native menu so the summary sits above the actions.
#[tauri::command]
fn set_tray_info(app: AppHandle, info: TrayInfo) -> Result<(), String> {
    let shell = app.try_state::<Shell>().ok_or("no shell")?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let tip = if info.status.is_empty() { "regula.dot".to_string() } else { format!("regula.dot · {}", info.status) };
        let _ = tray.set_tooltip(Some(tip));
    }
    *shell.info.lock().unwrap() = info;
    refresh_menu(&app).map_err(|e| e.to_string())
}

/// Something happened. If the companion is visible its bubble already says it
/// and nothing else is needed; if it is hidden, the popup under the menu-bar
/// dot shows the same wording. The popup window renders, shows and hides itself.
#[tauri::command]
fn show_popup(app: AppHandle, text: String, deep_link: Option<String>, open_label: String) -> Result<(), String> {
    let companion_visible = app
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let popups_enabled = app
        .try_state::<Shell>()
        .map(|s| s.settings.lock().unwrap().popups)
        .unwrap_or(true);
    if companion_visible || !popups_enabled {
        // The dropdown still keeps the last note, so nothing is lost.
        return Ok(());
    }
    let popup = app.get_webview_window("popup").ok_or("no popup window")?;
    place_under_tray(&app, &popup);
    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Payload {
        text: String,
        deep_link: Option<String>,
        open_label: String,
    }
    app.emit_to("popup", "regula:popup", Payload { text, deep_link, open_label })
        .map_err(|e| e.to_string())
}

/// How far the window shifts when the disc changes side, so the disc itself stays
/// put: the 120 px canvas moves from `right: 14px` to `left: 14px` in a 360 px window.
const FLIP_SHIFT: f64 = 360.0 - 120.0 - 14.0 - 14.0;

/// The companion never leaves the screen, and neither does its bubble. After a
/// move settles: dragged past the left edge, the disc changes side so the bubble
/// opens to the right; dragged back past the right edge, it changes back. What
/// still hangs over any edge is clamped into the work area of the screen it is on.
fn keep_on_screen(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else { return };
    let Some(shell) = app.try_state::<Shell>() else { return };
    let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) else { return };
    let centre = (pos.x as f64 + size.width as f64 / 2.0, pos.y as f64 + size.height as f64 / 2.0);
    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.monitor_from_point(centre.0, centre.1).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else { return };
    let scale = monitor.scale_factor();
    let area_pos = monitor.work_area().position.to_logical::<f64>(scale);
    let area_size = monitor.work_area().size.to_logical::<f64>(scale);
    let p = pos.to_logical::<f64>(scale);
    let s = size.to_logical::<f64>(scale);
    let (left, right) = (area_pos.x, area_pos.x + area_size.width);
    let (top, bottom) = (area_pos.y, area_pos.y + area_size.height);

    let was_flipped = shell.settings.lock().unwrap().flipped;
    let mut flipped = was_flipped;
    let mut x = p.x;
    if !flipped && x < left {
        flipped = true;
        x += FLIP_SHIFT;
    } else if flipped && x + s.width > right {
        flipped = false;
        x -= FLIP_SHIFT;
    }
    x = x.clamp(left, (right - s.width).max(left));
    let y = p.y.clamp(top, (bottom - s.height).max(top));

    if flipped != was_flipped {
        {
            let mut settings = shell.settings.lock().unwrap();
            settings.flipped = flipped;
            save_settings(app, &settings);
        }
        let _ = app.emit("regula:flip", flipped);
    }
    if (x - p.x).abs() > 0.5 || (y - p.y).abs() > 0.5 {
        let _ = win.set_position(LogicalPosition::new(x, y));
    }
}

/// Centre the popup under the menu-bar dot, kept inside the screen it is on.
fn place_under_tray(app: &AppHandle, popup: &WebviewWindow) {
    let Some(rect) = app.tray_by_id(TRAY_ID).and_then(|t| t.rect().ok().flatten()) else {
        return;
    };
    let scale = popup.scale_factor().unwrap_or(1.0);
    let pos: LogicalPosition<f64> = rect.position.to_logical(scale);
    let size: LogicalSize<f64> = rect.size.to_logical(scale);
    let width = popup
        .outer_size()
        .map(|s| s.to_logical::<f64>(scale).width)
        .unwrap_or(POPUP_WIDTH);
    let mut x = pos.x + size.width / 2.0 - width / 2.0;
    let y = pos.y + size.height + POPUP_GAP;

    let centre = rect.position.to_physical::<f64>(scale);
    if let Ok(Some(monitor)) = app.monitor_from_point(centre.x + 1.0, centre.y + 1.0) {
        let ms = monitor.scale_factor();
        let area = monitor.work_area();
        let left = area.position.to_logical::<f64>(ms).x + 8.0;
        let right = left + area.size.to_logical::<f64>(ms).width - width - 16.0;
        x = x.clamp(left, right.max(left));
    }
    let _ = popup.set_position(LogicalPosition::new(x, y));
}

fn apply_desktop(app: &AppHandle, enabled: bool) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = if enabled { win.show() } else { win.hide() };
    }
    if enabled {
        // The companion takes over; whatever the popup was saying is now a bubble.
        if let Some(popup) = app.get_webview_window("popup") {
            let _ = popup.hide();
        }
    }
    if let Some(shell) = app.try_state::<Shell>() {
        let mut s = shell.settings.lock().unwrap();
        s.desktop = enabled;
        save_settings(app, &s);
    }
    // Rebuilt rather than re-checked: click-through only makes sense while the companion shows.
    let _ = refresh_menu(app);
    let _ = app.emit("regula:desktop", enabled);
}

/// The popup under the dot, on or off. Persisted, mirrored in the tray menu.
fn apply_popups(app: &AppHandle, enabled: bool) {
    if !enabled {
        if let Some(popup) = app.get_webview_window("popup") {
            let _ = popup.hide();
        }
    }
    if let Some(shell) = app.try_state::<Shell>() {
        let mut s = shell.settings.lock().unwrap();
        s.popups = enabled;
        save_settings(app, &s);
    }
    let _ = refresh_menu(app);
}

/// Click-through from the dropdown: applied to the companion window here and
/// mirrored to the web view, which only updates its cursor styling.
fn apply_click_through(app: &AppHandle, enabled: bool) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_ignore_cursor_events(enabled);
    }
    if let Some(shell) = app.try_state::<Shell>() {
        *shell.click_through.lock().unwrap() = enabled;
    }
    let _ = refresh_menu(app);
    let _ = app.emit("regula:click-through", enabled);
}

/// Everything the dropdown builds beyond the menu itself.
struct BuiltMenu {
    menu: Menu<tauri::Wry>,
    desktop_item: CheckMenuItem<tauri::Wry>,
    click_item: CheckMenuItem<tauri::Wry>,
    popup_item: CheckMenuItem<tauri::Wry>,
    links: Vec<String>,
}

/// The dropdown, top to bottom: the summary from the web view (status and
/// counters as plain lines, the last note, the items waiting under their group
/// headers), the cockpit link, Pause (or Resume), the
/// settings (the desktop check item, the click-through check item, the link to
/// the rest in the cockpit, and what regula.dot is), quit.
fn build_menu(app: &AppHandle, info: &TrayInfo, settings: &Settings, click_through: bool) -> tauri::Result<BuiltMenu> {
    let desktop = settings.desktop;
    let menu = Menu::new(app)?;
    let mut links: Vec<String> = Vec::new();
    let mut link_item = |text: &str, url: &Option<String>| -> tauri::Result<MenuItem<tauri::Wry>> {
        let item = match url {
            Some(u) => {
                links.push(u.clone());
                MenuItem::with_id(app, format!("link:{}", links.len() - 1), text, true, None::<&str>)?
            }
            None => MenuItem::new(app, text, false, None::<&str>)?,
        };
        Ok(item)
    };
    let a = &info.actions;

    // Summary
    if !info.status.is_empty() {
        menu.append(&MenuItem::new(app, &info.status, false, None::<&str>)?)?;
    }
    if !info.counters.is_empty() {
        menu.append(&MenuItem::new(app, &info.counters, false, None::<&str>)?)?;
    }
    if let Some(note) = &info.note {
        menu.append(&link_item(&note.text, &note.url)?)?;
    }
    for group in &info.groups {
        if group.items.is_empty() {
            continue;
        }
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        menu.append(&MenuItem::new(app, &group.title, false, None::<&str>)?)?;
        for item in &group.items {
            menu.append(&link_item(&item.text, &item.url)?)?;
        }
    }

    // Cockpit
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "open", &a.open_cockpit, true, None::<&str>)?)?;

    // Reactions: Resume while paused, otherwise Pause (one hour).
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    if info.paused {
        menu.append(&MenuItem::with_id(app, "resume", &a.resume, true, None::<&str>)?)?;
    } else {
        menu.append(&MenuItem::with_id(app, "pause", &a.pause, true, None::<&str>)?)?;
    }

    // Settings kept locally: the desktop companion, click-through, the popup under the dot.
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let desktop_item = CheckMenuItem::with_id(app, "desktop", &a.desktop, true, desktop, None::<&str>)?;
    menu.append(&desktop_item)?;
    let click_item = CheckMenuItem::with_id(app, "clickthrough", &a.click_through, desktop, click_through, None::<&str>)?;
    menu.append(&click_item)?;
    let popup_item = CheckMenuItem::with_id(app, "popups", &a.popups, true, settings.popups, None::<&str>)?;
    menu.append(&popup_item)?;
    menu.append(&link_item(&a.settings.text, &a.settings.url)?)?;
    if !a.help.text.is_empty() {
        menu.append(&link_item(&a.help.text, &a.help.url)?)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", &a.quit, true, None::<&str>)?)?;

    Ok(BuiltMenu { menu, desktop_item, click_item, popup_item, links })
}

/// Rebuild the dropdown from the current summary and settings and hand it to the tray.
fn refresh_menu(app: &AppHandle) -> tauri::Result<()> {
    let shell = app.state::<Shell>();
    let built = {
        let info = shell.info.lock().unwrap();
        let settings = shell.settings.lock().unwrap().clone();
        let click_through = *shell.click_through.lock().unwrap();
        build_menu(app, &info, &settings, click_through)?
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(built.menu))?;
    }
    *shell.desktop_item.lock().unwrap() = built.desktop_item;
    *shell.click_item.lock().unwrap() = built.click_item;
    *shell.popup_item.lock().unwrap() = built.popup_item;
    *shell.links.lock().unwrap() = built.links;
    Ok(())
}

fn build_tray(app: &AppHandle, settings: Settings) -> tauri::Result<()> {
    let info = TrayInfo {
        status: "starting".to_string(),
        ..TrayInfo::default()
    };
    let built = build_menu(app, &info, &settings, false)?;
    let menu = built.menu;

    app.manage(Shell {
        desktop_item: Mutex::new(built.desktop_item),
        click_item: Mutex::new(built.click_item),
        popup_item: Mutex::new(built.popup_item),
        click_through: Mutex::new(false),
        settings: Mutex::new(settings),
        move_gen: Mutex::new(0),
        info: Mutex::new(info),
        links: Mutex::new(built.links),
    });

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(dot_icon("offline", 0))
        .icon_as_template(false)
        .tooltip("regula.dot")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            if let Some(index) = id.strip_prefix("link:") {
                let url = index
                    .parse::<usize>()
                    .ok()
                    .and_then(|i| app.state::<Shell>().links.lock().unwrap().get(i).cloned());
                if let Some(url) = url {
                    if app.opener().open_url(&url, None::<&str>).is_ok() {
                        // The web view retires what was behind the link (a declined note).
                        let _ = app.emit("regula:opened", url);
                    }
                }
                return;
            }
            match id {
                "desktop" => {
                    let enabled = app
                        .try_state::<Shell>()
                        .and_then(|s| s.desktop_item.lock().unwrap().is_checked().ok())
                        .unwrap_or(false);
                    apply_desktop(app, enabled);
                }
                "open" => {
                    let url = app.state::<Config>().cockpit_url.clone();
                    let _ = app.opener().open_url(url, None::<&str>);
                }
                "pause" => {
                    let _ = app.emit("regula:pause", "1h");
                }
                "resume" => {
                    let _ = app.emit("regula:pause", "resume");
                }
                "clickthrough" => {
                    let enabled = app
                        .try_state::<Shell>()
                        .and_then(|s| s.click_item.lock().unwrap().is_checked().ok())
                        .unwrap_or(false);
                    apply_click_through(app, enabled);
                }
                "popups" => {
                    let enabled = app
                        .try_state::<Shell>()
                        .and_then(|s| s.popup_item.lock().unwrap().is_checked().ok())
                        .unwrap_or(true);
                    apply_popups(app, enabled);
                }
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .build(app)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            // Remember where the user put Regula, but never its visibility
            // (that follows the "show on the desktop" setting) nor its size
            // (that is fixed in tauri.conf.json, so a shrunk window stays shrunk).
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION)
                .skip_initial_state("popup")
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_config,
            open_cockpit,
            set_click_through,
            set_tray_state,
            set_desktop,
            set_tray_info,
            show_popup
        ])
        .on_window_event(|window, event| {
            // A move (drag, restore, monitor change) is checked once it settles.
            if window.label() != "main" || !matches!(event, tauri::WindowEvent::Moved(_)) {
                return;
            }
            let app = window.app_handle().clone();
            let Some(shell) = app.try_state::<Shell>() else { return };
            let generation = {
                let mut g = shell.move_gen.lock().unwrap();
                *g += 1;
                *g
            };
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(250));
                let settled = app.try_state::<Shell>().map(|s| *s.move_gen.lock().unwrap() == generation).unwrap_or(false);
                if settled {
                    keep_on_screen(&app);
                }
            });
        })
        .setup(|app| {
            let settings = load_settings(app.handle());
            app.manage(Config::from_env(settings.desktop, settings.flipped));
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
        .expect("error while running regula.dot");
}
