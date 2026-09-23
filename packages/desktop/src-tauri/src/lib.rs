//! MarkUP Desktop — native side.
//!
//! The front end does all language work; this crate only provides a small,
//! workspace-scoped file system API: every path it touches must live inside the
//! folder the user opened (exports excepted, which go through a save dialog).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

const IGNORED: &[&str] = &["node_modules", "target", ".git", "dist", "out"];
const MAX_ENTRIES: usize = 20_000;
const MAX_DEPTH: usize = 16;
const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Default)]
struct Workspace {
    root: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<Debouncer<notify::RecommendedWatcher>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    path: String,
    name: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<Entry>>,
}

fn slash(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    // Drop the Windows verbatim prefix added by canonicalize.
    text.strip_prefix("//?/").map(str::to_string).unwrap_or(text)
}

fn root(state: &State<Workspace>) -> Result<PathBuf, String> {
    state.root.lock().unwrap().clone().ok_or_else(|| "No folder is open.".to_string())
}

/// Resolves `path` and checks that it lies inside the workspace root.
fn inside(state: &State<Workspace>, path: &str) -> Result<PathBuf, String> {
    let root = root(state)?;
    let candidate = PathBuf::from(path);
    let resolved = if candidate.exists() {
        candidate.canonicalize().map_err(|e| e.to_string())?
    } else {
        let parent = candidate.parent().ok_or("Invalid path.")?;
        let name = candidate.file_name().ok_or("Invalid path.")?;
        parent.canonicalize().map_err(|e| format!("{}: {e}", slash(parent)))?.join(name)
    };
    if resolved.starts_with(&root) {
        Ok(resolved)
    } else {
        Err(format!("{} is outside the open folder.", slash(&candidate)))
    }
}

fn walk(dir: &Path, depth: usize, count: &mut usize) -> Vec<Entry> {
    let Ok(read) = fs::read_dir(dir) else { return Vec::new() };
    let mut entries: Vec<Entry> = Vec::new();
    for item in read.flatten() {
        if *count >= MAX_ENTRIES {
            break;
        }
        let name = item.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || IGNORED.contains(&name.as_str()) {
            continue;
        }
        let path = item.path();
        let Ok(kind) = item.file_type() else { continue };
        *count += 1;
        if kind.is_dir() {
            let children = if depth < MAX_DEPTH { walk(&path, depth + 1, count) } else { Vec::new() };
            entries.push(Entry { path: slash(&path), name, kind: "directory", children: Some(children) });
        } else if kind.is_file() {
            entries.push(Entry { path: slash(&path), name, kind: "file", children: None });
        }
    }
    entries.sort_by(|a, b| (a.kind != "directory").cmp(&(b.kind != "directory")).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    entries
}

#[tauri::command]
fn open_workspace(path: String, state: State<Workspace>) -> Result<String, String> {
    let root = PathBuf::from(&path).canonicalize().map_err(|e| format!("{path}: {e}"))?;
    if !root.is_dir() {
        return Err(format!("{path} is not a folder."));
    }
    *state.watcher.lock().unwrap() = None;
    *state.root.lock().unwrap() = Some(root.clone());
    Ok(slash(&root))
}

#[tauri::command]
fn list_tree(state: State<Workspace>) -> Result<Vec<Entry>, String> {
    let root = root(&state)?;
    let mut count = 0;
    Ok(walk(&root, 0, &mut count))
}

#[tauri::command]
fn read_text(path: String, state: State<Workspace>) -> Result<String, String> {
    let path = inside(&state, &path)?;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!("{} is too large to open ({} MB).", slash(&path), meta.len() / 1024 / 1024));
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|_| format!("{} is not a UTF-8 text file.", slash(&path)))
}

/// Writes atomically: a temporary file in the same folder is renamed over the target.
fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let name = path.file_name().ok_or("Invalid path.")?.to_string_lossy();
    let temp = path.with_file_name(format!(".{name}.markup-tmp"));
    fs::write(&temp, contents).map_err(|e| e.to_string())?;
    fs::rename(&temp, path).map_err(|e| {
        let _ = fs::remove_file(&temp);
        e.to_string()
    })
}

#[tauri::command]
fn write_text(path: String, contents: String, state: State<Workspace>) -> Result<(), String> {
    let path = inside(&state, &path)?;
    write_atomic(&path, &contents)
}

#[tauri::command]
fn create_file(path: String, contents: Option<String>, state: State<Workspace>) -> Result<(), String> {
    let path = inside(&state, &path)?;
    if path.exists() {
        return Err(format!("{} already exists.", slash(&path)));
    }
    fs::write(&path, contents.unwrap_or_default()).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_dir(path: String, state: State<Workspace>) -> Result<(), String> {
    let path = inside(&state, &path)?;
    if path.exists() {
        return Err(format!("{} already exists.", slash(&path)));
    }
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_path(from: String, to: String, state: State<Workspace>) -> Result<(), String> {
    let from = inside(&state, &from)?;
    let to = inside(&state, &to)?;
    if to.exists() {
        return Err(format!("{} already exists.", slash(&to)));
    }
    fs::rename(&from, &to).map_err(|e| e.to_string())
}

/// Deleting moves to the system trash, so it can be undone.
#[tauri::command]
fn delete_path(path: String, state: State<Workspace>) -> Result<(), String> {
    let path = inside(&state, &path)?;
    if path == root(&state)? {
        return Err("The workspace folder itself cannot be deleted.".into());
    }
    trash::delete(&path).map_err(|e| e.to_string())
}

/// Exports may go anywhere the user picked in the save dialog, but only as HTML.
#[tauri::command]
fn save_export(path: String, contents: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let ext = target.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if ext != "html" && ext != "htm" {
        return Err("Exports must be .html files.".into());
    }
    write_atomic(&target, &contents)
}

#[tauri::command]
fn watch_workspace(app: AppHandle, state: State<Workspace>) -> Result<(), String> {
    let root = root(&state)?;
    let mut debouncer = new_debouncer(Duration::from_millis(250), move |result: DebounceEventResult| {
        if let Ok(events) = result {
            let paths: Vec<String> = events
                .into_iter()
                .map(|e| slash(&e.path))
                .filter(|p| !p.contains("/.git/") && !p.contains("/node_modules/") && !p.ends_with(".markup-tmp"))
                .collect();
            if !paths.is_empty() {
                let _ = app.emit("fs-change", paths);
            }
        }
    })
    .map_err(|e| e.to_string())?;
    debouncer.watcher().watch(&root, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    *state.watcher.lock().unwrap() = Some(debouncer);
    Ok(())
}

/// Files passed on the command line (e.g. double-clicking a .markup file).
#[tauri::command]
fn launch_files() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .filter_map(|a| PathBuf::from(a).canonicalize().ok())
        .filter(|p| p.is_file())
        .map(|p| slash(&p))
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Workspace::default())
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            list_tree,
            read_text,
            write_text,
            create_file,
            create_dir,
            rename_path,
            delete_path,
            save_export,
            watch_workspace,
            launch_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running MarkUP");
}
