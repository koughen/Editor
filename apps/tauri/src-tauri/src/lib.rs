mod handoff;
mod audio_plugins;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(handoff::HandoffSessions::default())
    .manage(audio_plugins::AudioSessions::default())
    .invoke_handler(tauri::generate_handler![handoff::begin_handoff, handoff::write_handoff_file, handoff::cancel_handoff, handoff::finish_handoff, handoff::finish_audio_export, audio_plugins::audio_plugins, audio_plugins::begin_audio_render, audio_plugins::write_audio_render, audio_plugins::render_audio_plugins, audio_plugins::read_audio_render, audio_plugins::finish_audio_render])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
        if let Ok(icon) =
          tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
        {
          let _ = window.set_icon(icon);
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
