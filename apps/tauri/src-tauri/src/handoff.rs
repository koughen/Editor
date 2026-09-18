//! Desktop file transport and application launch. Timeline conversion lives in editor-export.
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Default)]
pub struct HandoffSessions(Mutex<HashMap<String, PathBuf>>);
fn io_error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn session_path(state: &HandoffSessions, ticket: &str) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .map_err(io_error)?
        .get(ticket)
        .cloned()
        .ok_or("This export session has ended.".into())
}
fn relative_path(path: &str) -> Result<&Path, String> {
    let path = Path::new(path);
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("Invalid export file path.".into());
    }
    Ok(path)
}
#[tauri::command]
pub fn begin_handoff(
    app: tauri::AppHandle,
    state: tauri::State<HandoffSessions>,
    name: String,
) -> Result<String, String> {
    let base = app
        .path()
        .download_dir()
        .map_err(io_error)?
        .join("Editor Exports");
    fs::create_dir_all(&base).map_err(io_error)?;
    let ticket = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(io_error)?
        .as_nanos()
        .to_string();
    let directory = base.join(format!("{} - {}", editor_export::safe_name(&name), ticket));
    fs::create_dir(&directory).map_err(io_error)?;
    state
        .0
        .lock()
        .map_err(io_error)?
        .insert(ticket.clone(), directory);
    Ok(ticket)
}
#[tauri::command]
pub fn write_handoff_file(
    state: tauri::State<HandoffSessions>,
    ticket: String,
    path: String,
    offset: u64,
    bytes: Vec<u8>,
) -> Result<(), String> {
    if bytes.len() > 524288 {
        return Err("Export chunk is too large.".into());
    }
    let root = session_path(&state, &ticket)?;
    let output = root.join(relative_path(&path)?);
    let parent = output.parent().ok_or("Invalid path")?;
    fs::create_dir_all(parent).map_err(io_error)?;
    if !parent
        .canonicalize()
        .map_err(io_error)?
        .starts_with(root.canonicalize().map_err(io_error)?)
    {
        return Err("Export path leaves its folder.".into());
    }
    let mut file = if offset == 0 {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output)
    } else {
        if fs::symlink_metadata(&output)
            .map_err(io_error)?
            .file_type()
            .is_symlink()
        {
            return Err("Export destination is a symlink.".into());
        }
        OpenOptions::new().append(true).open(&output)
    }
    .map_err(io_error)?;
    if file.metadata().map_err(io_error)?.len() != offset {
        return Err("Export file changed while it was being written.".into());
    }
    file.write_all(&bytes).map_err(io_error)
}
#[tauri::command]
pub fn cancel_handoff(state: tauri::State<HandoffSessions>, ticket: String) -> Result<(), String> {
    // Only remove the new, incomplete folder created by this export session.
    if let Some(root) = state.0.lock().map_err(io_error)?.remove(&ticket) {
        fs::remove_dir_all(root).map_err(io_error)?;
    }
    Ok(())
}
#[tauri::command]
pub async fn finish_handoff(
    state: tauri::State<'_, HandoffSessions>,
    ticket: String,
    target: String,
) -> Result<String, String> {
    if !["premiere", "resolve", "after-effects", "capcut"].contains(&target.as_str()) {
        return Err("Unknown destination.".into());
    }
    let root = session_path(&state, &ticket)?;
    let timeline = root.join("timeline.xml");
    if timeline.exists() {
        let xml = fs::read_to_string(&timeline).map_err(io_error)?;
        let path = editor_export::url_path(&root.to_string_lossy());
        fs::write(&timeline, xml.replace("/__EDITOR_PACKAGE__", &path)).map_err(io_error)?;
    }
    // The package is complete; a launch error must not delete saved work.
    state.0.lock().map_err(io_error)?.remove(&ticket);
    let result = tauri::async_runtime::spawn_blocking({
        let root = root.clone();
        move || launch(&root, &target)
    })
    .await
    .map_err(io_error)?;
    Ok(format!("Saved to {}. {}", root.display(), result))
}
#[cfg(target_os = "macos")]
fn launch(root: &Path, target: &str) -> String {
    let (app,document,instruction)=match target {
        "premiere"=>("Adobe Premiere Pro",Some("timeline.xml"),"In Premiere Pro, import timeline.xml if the import dialog did not open."),
        "resolve"=>("DaVinci Resolve",None,"In Resolve, choose File > Import > Timeline and select timeline.xml. An optional import-resolve.py script is included."),
        "after-effects"=>("Adobe After Effects",None,"In After Effects, choose File > Scripts > Run Script File, then Open in After Effects.jsx."),
        _=>("CapCut",None,"Run import-capcut.py as described in README.txt to build the experimental draft, or import media/Rendered timeline.mp4 directly.")
    };
    let roots = [
        Path::new("/Applications").to_path_buf(),
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_default()
            .join("Applications"),
    ];
    let mut candidates = Vec::new();
    for base in roots {
        if let Ok(entries) = fs::read_dir(base) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.starts_with(app) {
                    if name.ends_with(".app") {
                        candidates.push(path);
                    } else if let Ok(children) = fs::read_dir(path) {
                        for child in children.flatten() {
                            let n = child.file_name().to_string_lossy().into_owned();
                            if n.starts_with(app) && n.ends_with(".app") {
                                candidates.push(child.path());
                            }
                        }
                    }
                }
            }
        }
    }
    candidates.sort();
    let _ = Command::new("open").arg(root).spawn();
    let Some(application) = candidates.last() else {
        return format!("{app} was not found. {instruction}");
    };
    let mut command = Command::new("open");
    command.arg("-a").arg(application);
    if let Some(document) = document {
        command.arg(root.join(document));
    }
    match command.status() {
        Ok(status) if status.success() => {
            if target == "after-effects" {
                // Pass paths as argv; project names never become AppleScript source.
                let script="on run argv\ntell application id \"com.adobe.AfterEffects.application\"\nactivate\nDoScriptFile (POSIX file (item 1 of argv))\nend tell\nend run";
                if Command::new("osascript")
                    .arg("-e")
                    .arg(script)
                    .arg(root.join("Open in After Effects.jsx"))
                    .spawn()
                    .is_ok()
                {
                    return "After Effects opened and the composition import script was requested. If macOS blocks automation, run the included JSX through File > Scripts > Run Script File.".into();
                }
            }
            format!("{app} opened. {instruction}")
        }
        _ => format!("Could not launch {app}. {instruction}"),
    }
}
#[cfg(not(target_os = "macos"))]
fn launch(root: &Path, _target: &str) -> String {
    #[cfg(target_os = "windows")]
    let result = Command::new("explorer").arg(root).spawn();
    #[cfg(not(target_os = "windows"))]
    let result = Command::new("xdg-open").arg(root).spawn();
    let _ = result;
    "Open README.txt in the handoff folder for the destination app's import steps.".into()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn package_paths_cannot_escape() {
        assert!(relative_path("media/clip.mp4").is_ok());
        for path in ["../clip", "/tmp/clip", "media/../../clip", ""] {
            assert!(relative_path(path).is_err());
        }
    }
}

#[tauri::command]
pub fn finish_audio_export(state: tauri::State<HandoffSessions>, ticket: String) -> Result<String, String> {
    let root = session_path(&state, &ticket)?;
    state.0.lock().map_err(io_error)?.remove(&ticket);
    Ok(root.to_string_lossy().into_owned())
}
