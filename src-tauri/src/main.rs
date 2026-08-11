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
//! Tauri has no WebDriver on macOS, so this shell cannot be driven by a suite. The app it loads
//! is driven instead, by verify/app.mjs in a real browser against the same dist, and the commands
//! only a desktop can answer are tested below. verify/tauri.mjs joins the two by checking
//! statically that every command the page calls exists and is registered here.

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
/// Marked async, which is what keeps the blocking folder picker off the thread that invoked it.
/// The comment here used to say the opposite, that a plain command runs on a worker. It does not:
/// tauri-macros builds a plain command with ExecutionContext::Blocking, whose body calls the
/// function inline on the invoking thread, and the dialog plugin says in its own documentation
/// that blocking_pick_folder should not be used there. Every automated path sets WALL_EXPORT_DIR
/// and never opens the picker, which is why nothing has caught it. What I have not reproduced is
/// the window freezing, because that needs a built shell and a real click.
#[tauri::command(async)]
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

/// The model the person already has.
///
/// Someone who reached Wall through their agent has a working Claude session on this machine,
/// and asking for an API key to reach a second one buys nothing. The flags matter as much as the
/// call: an identical system prompt across a wall means the first request builds the cache and
/// the rest read it, and the parts of the CLI's own prompt that are about editing code are
/// excluded because none of it helps write a page and all of it would be paid for.
/// Marked async for the same reason as export_page, and with more of it at stake: this one waits
/// on a whole Claude session, measured in this repo at twenty to a hundred and ten seconds, and a
/// plain command would run that wait inline on the thread that invoked it. A wall asks for eleven
/// or more of these within a few seconds.
#[tauri::command(async)]
fn claude_text(system: String, user: String, kind: Option<String>) -> serde_json::Value {
    use std::io::Write;
    use std::process::{Command, Stdio};

    // designing the worlds, reading a brief and writing the words are three different jobs, and
    // a deployment may want a different model on each, so the caller says which one this is
    let writing = std::env::var("WALL_CLI_MODEL").unwrap_or_else(|_| "sonnet".into());
    let model = match kind.as_deref() {
        Some("design") => std::env::var("WALL_DESIGN_MODEL").unwrap_or(writing.clone()),
        Some("intake") => std::env::var("WALL_INTAKE_MODEL").unwrap_or(writing.clone()),
        _ => writing,
    };

    let mut command = Command::new("claude");
    command
        .args([
            "-p",
            "--output-format",
            "json",
            "--model",
            &model,
            "--system-prompt",
            &system,
            "--exclude-dynamic-system-prompt-sections",
            "--strict-mcp-config",
            // the reply is one JSON object, not a task with steps, and a session holding Read and
            // Write will sometimes spend a whole round trip using one before it answers
            "--tools",
            "",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Thinking is most of the wait and also most of the design, so it goes only when asked.
    // Reading a brief is the exception: it pulls five fields out of a paragraph, there is
    // nothing there to weigh up, and it is the one call somebody waits in front of with nothing
    // yet on screen. Measured on the same brief it takes about 5.6 seconds this way and 14.8
    // with the model's own budget left alone.
    if std::env::var("WALL_FAST").is_ok() || matches!(kind.as_deref(), Some("intake") | Some("repair")) {
        command.env("MAX_THINKING_TOKENS", "0");
    }
    let spawned = command.spawn();

    let mut child = match spawned {
        Ok(c) => c,
        Err(_) => return serde_json::json!({ "error": "the claude command was not found on this machine" }),
    };
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(user.as_bytes());
    }
    let out = match child.wait_with_output() {
        Ok(o) => o,
        Err(e) => return serde_json::json!({ "error": e.to_string() }),
    };
    match serde_json::from_slice::<serde_json::Value>(&out.stdout) {
        Ok(j) if j["is_error"] != serde_json::Value::Bool(true) => {
            serde_json::json!({ "text": j["result"].as_str().unwrap_or_default() })
        }
        _ => serde_json::json!({
            "error": String::from_utf8_lossy(&out.stderr).chars().take(200).collect::<String>()
        }),
    }
}

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

/// A request from outside, written by the MCP server before it launched this window.
///
/// The handoff is files in a directory rather than a return value, because the agent that asked
/// may have timed out, moved on, or been restarted by the time someone finishes choosing, and a
/// file is still there when it comes back.
#[tauri::command]
fn wall_request() -> Option<serde_json::Value> {
    let file = std::env::var("WALL_REQUEST").ok()?;
    let raw = fs::read_to_string(&file).ok()?;
    let mut value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let dir = Path::new(&file).parent()?.to_string_lossy().into_owned();
    // What this project's walls kept and killed before, read here because it is wanted at the
    // same moment as the brief and lives in the same directory. A project with no file yet is
    // the ordinary case rather than an error, and so is one this build cannot parse.
    if let Some(taste) = fs::read_to_string(Path::new(&dir).join("taste.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
    {
        value.as_object_mut()?.insert("taste".into(), taste);
    }
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
        // A name is a name, never a path. Rust's join replaces the whole base when given an
        // absolute path, so an unchecked name here could write anywhere on the machine, and
        // this command is reachable by anything running in the webview.
        let bad = name.is_empty()
            || name.contains('/')
            || name.contains('\\')
            || name.contains("..")
            || Path::new(name).is_absolute();
        if bad {
            continue;
        }
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

/// The commands a browser cannot answer, tested where they live.
///
/// The UI half of the agent handoff is covered by verify/mcp.mjs, which drives the served build
/// where the same flow runs over /api. This is the half that only exists here, and writing files
/// is not a thing a window has to be open to do.
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

    /// Everything a request carries, in one test, because these all read the same environment
    /// variable and a second test that sets it would race the one that clears it.
    #[test]
    fn a_request_carries_the_directory_it_came_from() {
        let dir = tmp("request");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("request.json");
        fs::write(&file, r#"{"brief":"a product","name":"Spoor"}"#).unwrap();
        std::env::set_var("WALL_REQUEST", &file);

        // a project on its first wall has no memory beside the brief, which is the ordinary case
        // rather than a failure, so nothing is attached and the brief arrives regardless
        let first = wall_request().expect("a written request should be read");
        assert_eq!(first["name"], "Spoor");
        // the agent collects from the directory, so the app has to be told which one it is
        assert_eq!(first["dir"], dir.to_string_lossy().as_ref());
        assert!(first.get("taste").is_none());

        fs::write(
            dir.join("taste.json"),
            r#"{"format":1,"walls":[{"at":"2026-08-11","kind":"software","kept":[],"killed":[],"asked":[]}]}"#,
        )
        .unwrap();
        let again = wall_request().expect("a request beside a memory should be read");
        assert_eq!(again["taste"]["walls"][0]["kind"], "software");

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
            claude_text,
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
