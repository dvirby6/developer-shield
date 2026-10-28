use std::path::{Path, PathBuf};
use std::process::Command;

use tauri_plugin_fs::FsExt;

/// Directories that can never contain another repository we care about.
const SKIPPED_DIRECTORIES: &[&str] = &[
    ".gradle",
    ".next",
    ".nuxt",
    ".pnpm-store",
    ".terraform",
    ".turbo",
    ".venv",
    ".yarn",
    "Pods",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
    "venv",
];

const MAX_REPOSITORY_DEPTH: usize = 8;
const MAX_REPOSITORIES: usize = 50;
const MAX_EXPORT_BYTES: usize = 20 * 1024 * 1024;

/// Resolve and validate a folder chosen in the native picker, then extend the
/// filesystem scope so the frontend can read (and write its Git hook) inside it.
///
/// The dialog is the only caller, so the user always confirms the folder before
/// it becomes reachable through the fs plugin.
#[tauri::command]
fn allow_directory(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let absolute =
        std::path::absolute(&path).map_err(|error| format!("Invalid folder path: {error}"))?;

    let metadata =
        std::fs::metadata(&absolute).map_err(|error| format!("Cannot access {path}: {error}"))?;

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
    let candidate =
        std::path::absolute(&path).map_err(|error| format!("Invalid hook path: {error}"))?;

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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHookInfo {
    /// True when the folder is inside a Git working tree.
    is_repo: bool,
    work_tree: Option<String>,
    /// Directory Git will actually read hooks from, respecting `core.hooksPath`.
    hooks_dir: Option<String>,
    branch: Option<String>,
    /// True when HEAD is detached, in which case `branch` is `None`.
    detached: bool,
    /// True when the repository overrides the hook location via `core.hooksPath`.
    uses_custom_hooks_path: bool,
}

fn git_command(root: &Path) -> Command {
    let mut command = Command::new("git");
    command.arg("-C").arg(root);

    // Prevent a console window from flashing on Windows while the app runs.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }

    command
}

fn git_output(root: &Path, args: &[&str]) -> Option<String> {
    let output = git_command(root).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() { None } else { Some(value) }
}

/// Resolve the hook directory for a repository.
///
/// `git rev-parse --git-path hooks` handles linked worktrees, submodules, and
/// `core.hooksPath`, including paths that live outside the work tree.
fn resolve_hooks_dir(work_tree: &Path) -> PathBuf {
    let Some(raw) = git_output(work_tree, &["rev-parse", "--git-path", "hooks"]) else {
        return work_tree.join(".git").join("hooks");
    };

    let candidate = PathBuf::from(&raw);
    let resolved = if candidate.is_absolute() {
        candidate
    } else {
        work_tree.join(candidate)
    };

    // `--git-path` can return `./.git/hooks`; normalise without touching disk.
    let mut normalised = PathBuf::new();
    for component in resolved.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                normalised.pop();
            }
            other => normalised.push(other),
        }
    }

    normalised
}

#[tauri::command]
fn git_hook_info(app: tauri::AppHandle, path: String) -> Result<GitHookInfo, String> {
    let root =
        std::path::absolute(&path).map_err(|error| format!("Invalid repository path: {error}"))?;

    if !root.is_dir() {
        return Err(format!("{path} is not a folder"));
    }

    if git_output(&root, &["rev-parse", "--is-inside-work-tree"]).as_deref() != Some("true") {
        return Ok(GitHookInfo {
            is_repo: false,
            work_tree: None,
            hooks_dir: None,
            branch: None,
            detached: false,
            uses_custom_hooks_path: false,
        });
    }

    let work_tree = git_output(&root, &["rev-parse", "--show-toplevel"])
        .map(PathBuf::from)
        .unwrap_or_else(|| root.clone());

    let hooks_dir = resolve_hooks_dir(&work_tree);
    let branch = git_output(&root, &["symbolic-ref", "--quiet", "--short", "HEAD"]);
    let detached = branch.is_none();
    let uses_custom_hooks_path =
        git_output(&root, &["config", "--get", "core.hooksPath"]).is_some();

    // Ensure the directory exists before granting the runtime fs scope and let
    // the frontend write hooks into worktrees whose hooks folder is absent.
    std::fs::create_dir_all(&hooks_dir).map_err(|error| {
        format!(
            "Cannot create hook directory {}: {error}",
            hooks_dir.display()
        )
    })?;

    app.fs_scope()
        .allow_directory(&hooks_dir, true)
        .map_err(|error| format!("Cannot grant access to {}: {error}", hooks_dir.display()))?;

    Ok(GitHookInfo {
        is_repo: true,
        work_tree: Some(work_tree.to_string_lossy().into_owned()),
        hooks_dir: Some(hooks_dir.to_string_lossy().into_owned()),
        branch,
        detached,
        uses_custom_hooks_path,
    })
}

fn discover_repositories(root: &Path) -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = Vec::new();
    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];

    while let Some((directory, depth)) = stack.pop() {
        if directory.join(".git").exists() {
            found.push(directory.clone());
            if found.len() >= MAX_REPOSITORIES {
                break;
            }
        }

        if depth >= MAX_REPOSITORY_DEPTH {
            continue;
        }

        let Ok(entries) = std::fs::read_dir(&directory) else {
            continue;
        };

        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            // `file_type` does not follow symlinks, so loops cannot occur.
            if !file_type.is_dir() {
                continue;
            }

            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name == ".git" || SKIPPED_DIRECTORIES.contains(&name.as_ref()) {
                continue;
            }

            stack.push((entry.path(), depth + 1));
        }
    }

    found.sort();
    found
}

/// Find every Git repository inside a workspace so a monorepo can protect all
/// of its repositories in one action.
#[tauri::command]
fn discover_git_repositories(root: String) -> Result<Vec<String>, String> {
    let absolute =
        std::path::absolute(&root).map_err(|error| format!("Invalid workspace path: {error}"))?;

    if !absolute.is_dir() {
        return Err(format!("{root} is not a folder"));
    }

    Ok(discover_repositories(&absolute)
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect())
}

/// Write a report chosen through the native save dialog. The command is limited
/// to text report formats and a bounded size so it cannot be used as a generic
/// arbitrary-file writer by the webview.
#[tauri::command]
fn write_export_file(path: String, contents: String) -> Result<(), String> {
    if contents.len() > MAX_EXPORT_BYTES {
        return Err("Report is too large to export".into());
    }

    let absolute =
        std::path::absolute(&path).map_err(|error| format!("Invalid report path: {error}"))?;

    let extension = absolute
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if !matches!(extension.as_str(), "json" | "html") {
        return Err("Reports can only be saved as JSON or HTML".into());
    }

    if let Some(parent) = absolute.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Cannot create report folder: {error}"))?;
    }

    std::fs::write(&absolute, contents).map_err(|error| format!("Cannot write report: {error}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            allow_directory,
            mark_executable,
            git_hook_info,
            discover_git_repositories,
            write_export_file
        ])
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

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_dir(label: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock is before the unix epoch")
            .as_nanos();
        let mut path = std::env::temp_dir();
        path.push(format!(
            "developer-shield-{label}-{}-{nanos}",
            std::process::id()
        ));
        std::fs::create_dir_all(&path).expect("create temp directory");
        path
    }

    #[test]
    fn discovers_nested_repositories_and_skips_dependencies() {
        let root = unique_temp_dir("discover");
        let workspace = root.join("workspace");
        let nested = workspace.join("packages").join("api");
        let dependency = nested.join("node_modules").join("dep");

        std::fs::create_dir_all(workspace.join(".git")).expect("root repo");
        std::fs::create_dir_all(nested.join(".git")).expect("nested repo");
        std::fs::create_dir_all(dependency.join(".git")).expect("dependency repo");

        let found = discover_repositories(&workspace);
        assert_eq!(found, vec![workspace.clone(), nested.clone()]);

        std::fs::remove_dir_all(&root).expect("clean temp directory");
    }

    #[test]
    fn rejects_unsupported_export_formats() {
        let root = unique_temp_dir("export");
        let target = root.join("report.exe");

        let result =
            write_export_file(target.to_string_lossy().into_owned(), "payload".to_string());

        assert!(result.is_err());
        std::fs::remove_dir_all(&root).expect("clean temp directory");
    }

    #[test]
    fn writes_json_exports() {
        let root = unique_temp_dir("json");
        let target = root.join("report.json");

        write_export_file(
            target.to_string_lossy().into_owned(),
            "{\"ok\":true}".to_string(),
        )
        .expect("write report");

        assert_eq!(
            std::fs::read_to_string(&target).expect("read report"),
            "{\"ok\":true}"
        );

        std::fs::remove_dir_all(&root).expect("clean temp directory");
    }
}
