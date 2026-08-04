//! Wall's desktop shell.
//!
//! This is the same app the browser runs, in a window, with the four things a browser cannot
//! do: keep state on disk, write a real file where you asked for it, open that file in your
//! browser, and pick up a brief an agent left behind before it launched this window.
//!
//! What is deliberately not here is the model path. The webview calls `shared/providers.mjs`
//! exactly as the web build does, over a fetch that travels through this process so there is no
//! preflight. Request shapes, SSE splitting and delta extraction are written down once, in
//! JavaScript, and this shell carries bytes rather than opinions about them. A second
//! implementation in Rust would be the one thing the host boundary exists to prevent.
//!
//! Every command mirrors an Electron IPC handler by name and by behaviour, including the
//! WALL_DATA, WALL_EXPORT_DIR, WALL_REQUEST and WALL_TEST hooks the suites drive it with, so
//! the two shells can be checked against each other rather than trusted separately.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
struct Exported {
    file: String,
    bytes: usize,
}

#[derive(Serialize)]
struct Handed {
    #[serde(skip_serializing_if = "Option::is_none")]
    dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    wrote: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn state_path(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(dir) = std::env::var("WALL_DATA") {
        return PathBuf::from(dir).join("wall-state.json");
    }
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let _ = fs::create_dir_all(&dir);
    dir.join("wall-state.json")
}

/// Opening a path is what makes an export feel like it happened. The suites set WALL_TEST so a
/// run does not fill the machine with Finder windows.
fn reveal(app: &tauri::AppHandle, path: &Path) {
    if std::env::var("WALL_TEST").is_ok() {
        return;
    }
    let _ = app.opener().open_path(path.to_string_lossy(), None::<&str>);
}

#[tauri::command]
fn read_state(app: tauri::AppHandle) -> Option<serde_json::Value> {
    let raw = fs::read_to_string(state_path(&app)).ok()?;
    serde_json::from_str(&raw).ok()
}

#[tauri::command]
fn write_state(app: tauri::AppHandle, value: serde_json::Value) -> bool {
    let path = state_path(&app);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(path, value.to_string()).is_ok()
}

/// Ship: a real, self contained index.html the founder owns.
///
/// Not async, so Tauri runs it on a worker thread and the blocking folder picker cannot sit on
/// the thread that has to draw the picker.
#[tauri::command]
fn export_page(app: tauri::AppHandle, html: String, name: String) -> Option<Exported> {
    let dir = match std::env::var("WALL_EXPORT_DIR") {
        Ok(d) => PathBuf::from(d),
        Err(_) => app
            .dialog()
            .file()
            .set_title("Where should the page go?")
            .blocking_pick_folder()?
            .into_path()
            .ok()?,
    };
    let out = dir.join(if name.is_empty() { "landing" } else { &name });
    fs::create_dir_all(&out).ok()?;
    let file = out.join("index.html");
    fs::write(&file, &html).ok()?;
    reveal(&app, &out);
    Some(Exported {
        file: file.to_string_lossy().into_owned(),
        bytes: html.len(),
    })
}

#[tauri::command]
fn preview(app: tauri::AppHandle, html: String) -> String {
    // named by content rather than by clock, so previewing the same page twice does not leave a
    // trail of identical files behind
    let stamp = html.len();
    let file = std::env::temp_dir().join(format!("wall-preview-{stamp}.html"));
    let _ = fs::write(&file, &html);
    reveal(&app, &file);
    file.to_string_lossy().into_owned()
}

/// A request from outside, written by the MCP server before it launched this window.
///
/// The handoff is files in a directory rather than a return value, because the agent that asked
/// may have timed out, moved on, or been restarted by the time someone finishes choosing, and a
/// file is still there when it comes back.
/// A key belongs in the keychain, not in a file and not in the page.
///
/// The webview's own storage is a file on disk readable by anything running as this user. The
/// system keychain is encrypted at rest and unlocked with the login session, which is the same
/// place every other application on the machine keeps its credentials.
fn entry(name: &str) -> Option<keyring::Entry> {
    keyring::Entry::new("wall", name).ok()
}

#[tauri::command]
fn get_key(name: String) -> Option<String> {
    entry(&name)?.get_password().ok()
}

#[tauri::command]
fn set_key(name: String, value: String) -> bool {
    let Some(e) = entry(&name) else { return false };
    if value.is_empty() {
        // deleting a key that was never there is success, not failure
        return matches!(e.delete_credential(), Ok(()) | Err(keyring::Error::NoEntry));
    }
    e.set_password(&value).is_ok()
}

#[tauri::command]
fn wall_request() -> Option<serde_json::Value> {
    let file = std::env::var("WALL_REQUEST").ok()?;
    let raw = fs::read_to_string(&file).ok()?;
    let mut value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let dir = Path::new(&file).parent()?.to_string_lossy().into_owned();
    value.as_object_mut()?.insert("dir".into(), dir.into());
    Some(value)
}

#[tauri::command]
fn handoff(dir: String, files: BTreeMap<String, String>) -> Handed {
    let fail = |e: std::io::Error| Handed {
        dir: None,
        wrote: None,
        error: Some(e.to_string().chars().take(200).collect()),
    };
    if let Err(e) = fs::create_dir_all(&dir) {
        return fail(e);
    }
    let mut wrote = Vec::new();
    for (name, body) in &files {
        if let Err(e) = fs::write(Path::new(&dir).join(name), body) {
            return fail(e);
        }
        wrote.push(name.clone());
    }
    Handed {
        dir: Some(dir),
        wrote: Some(wrote),
        error: None,
    }
}

/// The two commands a browser cannot answer, tested where they live.
///
/// The agent handoff used to be proved end to end by driving Electron, which is gone. The UI half
/// of that flow now has no automated cover and says so in the docs; this is the half that can be
/// tested honestly, because writing files is not a thing a window has to be open to do.
#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("wall-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn handoff_writes_every_file_where_the_agent_will_look() {
        let dir = tmp("handoff");
        let mut files = BTreeMap::new();
        files.insert("chosen.md".to_string(), "# a spec".to_string());
        files.insert("chosen.html".to_string(), "<!doctype html>".to_string());
        files.insert("chosen.json".to_string(), "{}".to_string());

        let out = handoff(dir.to_string_lossy().into_owned(), files);
        assert!(out.error.is_none(), "{:?}", out.error);
        assert_eq!(out.wrote.unwrap().len(), 3);
        assert_eq!(fs::read_to_string(dir.join("chosen.md")).unwrap(), "# a spec");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn handoff_creates_the_directory_rather_than_failing_on_it() {
        let dir = tmp("nested").join("deep").join("deeper");
        let mut files = BTreeMap::new();
        files.insert("chosen.json".to_string(), "{}".to_string());
        let out = handoff(dir.to_string_lossy().into_owned(), files);
        assert!(out.error.is_none());
        assert!(dir.join("chosen.json").exists());
    }

    #[test]
    fn a_request_carries_the_directory_it_came_from() {
        let dir = tmp("request");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("request.json");
        fs::write(&file, r#"{"brief":"a product","name":"Spoor"}"#).unwrap();
        std::env::set_var("WALL_REQUEST", &file);

        let got = wall_request().expect("a written request should be read");
        assert_eq!(got["name"], "Spoor");
        // the agent collects from the directory, so the app has to be told which one it is
        assert_eq!(got["dir"], dir.to_string_lossy().as_ref());

        std::env::remove_var("WALL_REQUEST");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_request_is_not_an_error() {
        std::env::remove_var("WALL_REQUEST");
        assert!(wall_request().is_none());
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_state,
            write_state,
            export_page,
            preview,
            wall_request,
            get_key,
            set_key,
            handoff
        ])
        .setup(|app| {
            // The suites drive the window and need to know it is theirs to drive. Electron
            // answers this with an environment variable the renderer never sees, so the same
            // signal is put where the page can read it.
            if std::env::var("WALL_TEST").is_ok() {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("wall:test", true);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("wall failed to start");
}
