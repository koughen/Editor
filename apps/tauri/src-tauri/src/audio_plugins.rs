//! macOS Audio Unit adapter. Plug-ins render in a separate process so a crash cannot take down the editor.
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
#[derive(Default)]
pub struct AudioSessions(Mutex<HashMap<String, PathBuf>>);
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn path(state: &AudioSessions, ticket: &str) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .map_err(error)?
        .get(ticket)
        .cloned()
        .ok_or("Audio render session ended".into())
}
#[cfg(target_os = "macos")]
fn helper(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use std::os::unix::fs::PermissionsExt;
    let folder = app
        .path()
        .app_cache_dir()
        .map_err(error)?
        .join("audio-host");
    fs::create_dir_all(&folder).map_err(error)?;
    let target = folder.join(concat!("AudioUnitHost-", env!("CARGO_PKG_VERSION")));
    let bytes = include_bytes!(concat!(env!("OUT_DIR"), "/AudioUnitHost"));
    if fs::read(&target).ok().as_deref() != Some(bytes) {
        let temp = folder.join("AudioUnitHost.new");
        fs::write(&temp, bytes).map_err(error)?;
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o755)).map_err(error)?;
        fs::rename(temp, &target).map_err(error)?;
    }
    Ok(target)
}
#[cfg(not(target_os = "macos"))]
fn helper(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Err("Audio Units require macOS".into())
}
fn run(app: &tauri::AppHandle, args: Vec<String>) -> Result<serde_json::Value, String> {
    let mut child = Command::new(helper(app)?)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(error)?;
    // Drain output concurrently so verbose third-party effects cannot block the child.
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let out_thread = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stdout.take(16 * 1024 * 1024).read_to_string(&mut s);
        s
    });
    let err_thread = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stderr.take(1024 * 1024).read_to_string(&mut s);
        s
    });
    let start = Instant::now();
    let status = loop {
        if let Some(s) = child.try_wait().map_err(error)? {
            break s;
        }
        if start.elapsed() > Duration::from_secs(600) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Audio Unit render timed out".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    let out = out_thread.join().unwrap_or_default();
    let err = err_thread.join().unwrap_or_default();
    let result = out
        .lines()
        .rev()
        .find_map(|s| s.strip_prefix("EDITOR_AUDIO_RESULT "))
        .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok());
    if let Some(v) = result {
        if let Some(e) = v.get("error").and_then(|v| v.as_str()) {
            return Err(e.into());
        }
        if status.success() {
            return Ok(v);
        }
    }
    Err(format!(
        "Audio Unit host failed: {}",
        err.chars().take(400).collect::<String>()
    ))
}
#[tauri::command]
pub async fn audio_plugins(
    app: tauri::AppHandle,
    id: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run(
            &app,
            if let Some(id) = id {
                vec!["parameters".into(), id]
            } else {
                vec!["list".into()]
            },
        )
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub fn begin_audio_render(
    app: tauri::AppHandle,
    state: tauri::State<AudioSessions>,
) -> Result<String, String> {
    let ticket = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(error)?
        .as_nanos()
        .to_string();
    let folder = app
        .path()
        .app_cache_dir()
        .map_err(error)?
        .join("audio-renders")
        .join(&ticket);
    fs::create_dir_all(&folder).map_err(error)?;
    state
        .0
        .lock()
        .map_err(error)?
        .insert(ticket.clone(), folder);
    Ok(ticket)
}
#[tauri::command]
pub fn write_audio_render(
    state: tauri::State<AudioSessions>,
    ticket: String,
    offset: u64,
    bytes: Vec<u8>,
) -> Result<(), String> {
    if bytes.len() > 524288 {
        return Err("Audio chunk too large".into());
    }
    let file = path(&state, &ticket)?.join("input.wav");
    let mut output = if offset == 0 {
        OpenOptions::new().write(true).create_new(true).open(file)
    } else {
        OpenOptions::new().append(true).open(file)
    }
    .map_err(error)?;
    if output.metadata().map_err(error)?.len() != offset {
        return Err("Audio upload out of order".into());
    }
    output.write_all(&bytes).map_err(error)
}
#[tauri::command]
pub async fn render_audio_plugins(
    app: tauri::AppHandle,
    state: tauri::State<'_, AudioSessions>,
    ticket: String,
    inserts: serde_json::Value,
) -> Result<u64, String> {
    let root = path(&state, &ticket)?;
    if !inserts.is_array() || inserts.as_array().unwrap().len() > 8 {
        return Err("Invalid audio inserts".into());
    }
    fs::write(
        root.join("inserts.json"),
        serde_json::to_vec(&inserts).map_err(error)?,
    )
    .map_err(error)?;
    tauri::async_runtime::spawn_blocking(move || {
        run(
            &app,
            vec![
                "render".into(),
                root.join("input.wav").to_string_lossy().into(),
                root.join("output.wav").to_string_lossy().into(),
                root.join("inserts.json").to_string_lossy().into(),
            ],
        )?;
        Ok(fs::metadata(root.join("output.wav")).map_err(error)?.len())
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub fn read_audio_render(
    state: tauri::State<AudioSessions>,
    ticket: String,
    offset: u64,
) -> Result<tauri::ipc::Response, String> {
    let mut f = fs::File::open(path(&state, &ticket)?.join("output.wav")).map_err(error)?;
    f.seek(SeekFrom::Start(offset)).map_err(error)?;
    let mut bytes = Vec::new();
    f.take(524288).read_to_end(&mut bytes).map_err(error)?;
    Ok(tauri::ipc::Response::new(bytes))
}
#[tauri::command]
pub fn finish_audio_render(
    state: tauri::State<AudioSessions>,
    ticket: String,
) -> Result<(), String> {
    if let Some(p) = state.0.lock().map_err(error)?.remove(&ticket) {
        fs::remove_dir_all(p).map_err(error)?;
    }
    Ok(())
}
