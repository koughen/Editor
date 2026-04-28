#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
