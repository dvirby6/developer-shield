use tauri_plugin_fs::FsExt;

/// Resolve and validate a folder chosen in the native picker, then extend the
/// filesystem scope so the frontend can read (and write its Git hook) inside it.
///
/// The dialog is the only caller, so the user always confirms the folder before
/// it becomes reachable through the fs plugin.
#[tauri::command]
fn allow_directory(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let absolute = std::path::absolute(&path)
        .map_err(|error| format!("Invalid folder path: {error}"))?;

    let metadata = std::fs::metadata(&absolute)
        .map_err(|error| format!("Cannot access {path}: {error}"))?;

    if !metadata.is_dir() {
        return Err(format!("{path} is not a folder"));
    }

    app.fs_scope()
        .allow_directory(&absolute, true)
        .map_err(|error| format!("Cannot grant access to {path}: {error}"))?;

    Ok(absolute.to_string_lossy().into_owned())
}

/// Git for Windows runs hooks through sh and ignores the executable bit, but
/// macOS and Linux require the hook to be executable before Git will run it.
#[tauri::command]
fn mark_executable(path: String) -> Result<(), String> {
    let candidate = std::path::absolute(&path)
        .map_err(|error| format!("Invalid hook path: {error}"))?;

    if candidate.file_name().and_then(|name| name.to_str()) != Some("pre-commit") {
        return Err("Refusing to change permissions on a non-hook file".into());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let mut permissions = std::fs::metadata(&candidate)
            .map_err(|error| format!("Cannot read hook permissions: {error}"))?
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&candidate, permissions)
            .map_err(|error| format!("Cannot make hook executable: {error}"))?;
    }

    #[cfg(not(unix))]
    {
        let _ = candidate;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![allow_directory, mark_executable])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
