use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::webview::WebviewBuilder;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Bookmark {
    id: String,
    label: String,
    url: String,
    #[serde(default)]
    category: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Config {
    vault_path: String,
    #[serde(default)]
    bookmarks: Vec<Bookmark>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TreeNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Vec<TreeNode>,
}

const CONFIG_FILE: &str = "new-ocean.config.json";

fn find_config_path() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    for _ in 0..4 {
        let candidate = dir.join(CONFIG_FILE);
        if candidate.is_file() {
            return Some(candidate);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

#[tauri::command]
fn load_config(app: AppHandle) -> Result<Config, String> {
    let path = find_config_path()
        .or_else(|| {
            app.path()
                .app_config_dir()
                .ok()
                .map(|d| d.join(CONFIG_FILE))
                .filter(|p| p.is_file())
        })
        .ok_or_else(|| format!("{CONFIG_FILE} not found; copy the example config and set your vault path"))?;
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("invalid config: {e}"))
}

fn build_tree(dir: &Path, vault_root: &Path) -> Vec<TreeNode> {
    let mut nodes: Vec<TreeNode> = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return nodes;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let rel = path
            .strip_prefix(vault_root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        if path.is_dir() {
            nodes.push(TreeNode {
                name,
                path: rel,
                is_dir: true,
                children: build_tree(&path, vault_root),
            });
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            nodes.push(TreeNode {
                name: name.trim_end_matches(".md").to_string(),
                path: rel,
                is_dir: false,
                children: Vec::new(),
            });
        }
    }
    nodes.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    nodes
}

#[tauri::command]
fn list_vault_tree(vault_path: String) -> Result<Vec<TreeNode>, String> {
    let root = PathBuf::from(&vault_path);
    if !root.is_dir() {
        return Err(format!("vault path is not a directory: {vault_path}"));
    }
    Ok(build_tree(&root, &root))
}

fn resolve_in_vault(vault_path: &str, rel_path: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(vault_path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let full = root
        .join(rel_path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !full.starts_with(&root) {
        return Err("path escapes the vault root".into());
    }
    Ok(full)
}

#[tauri::command]
fn read_note(vault_path: String, rel_path: String) -> Result<String, String> {
    let full = resolve_in_vault(&vault_path, &rel_path)?;
    fs::read_to_string(full).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_note(vault_path: String, rel_path: String, content: String) -> Result<(), String> {
    // Only existing notes are writable; resolve_in_vault fails on paths that don't exist.
    let full = resolve_in_vault(&vault_path, &rel_path)?;
    if full.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err("only markdown notes can be written".into());
    }
    fs::write(full, content).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecentFile {
    name: String,
    path: String,
    dir: String,
    modified_ms: u64,
}

#[tauri::command]
fn recent_files(vault_path: String, dirs: Vec<String>, limit: usize) -> Result<Vec<RecentFile>, String> {
    let root = PathBuf::from(&vault_path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let mut files: Vec<RecentFile> = Vec::new();
    for dir in &dirs {
        let Ok(full_dir) = root.join(dir).canonicalize() else {
            continue;
        };
        if !full_dir.starts_with(&root) || !full_dir.is_dir() {
            continue;
        }
        let Ok(entries) = fs::read_dir(&full_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let modified_ms = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let rel = path
                .strip_prefix(&root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            let dir_label = dir
                .rsplit('/')
                .next()
                .unwrap_or(dir)
                .to_string();
            files.push(RecentFile {
                name: name.trim_end_matches(".md").to_string(),
                path: rel,
                dir: dir_label,
                modified_ms,
            });
        }
    }
    files.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    files.truncate(limit.min(100));
    Ok(files)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchHit {
    docid: String,
    score: f64,
    file: String,
    #[serde(default)]
    line: Option<u32>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    snippet: Option<String>,
}

#[tauri::command]
async fn search_vault(query: String, semantic: Option<bool>) -> Result<Vec<SearchHit>, String> {
    let trimmed = query.trim().to_string();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    // vsearch cold-loads an embedding model (~15-30s); the UI treats it as an explicit deep search.
    let subcommand = if semantic.unwrap_or(false) { "vsearch" } else { "search" };
    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new("cmd");
        cmd.args(["/C", "qmd", subcommand, &trimmed, "--json"]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        cmd.output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("could not run qmd: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    // qmd can exit nonzero while still printing valid results; trust parseable stdout.
    match serde_json::from_str::<Vec<SearchHit>>(stdout.trim()) {
        Ok(mut hits) => {
            hits.truncate(20);
            Ok(hits)
        }
        Err(_) if !output.status.success() => Err(format!(
            "qmd search failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )),
        Err(e) => Err(format!("unexpected qmd output: {e}")),
    }
}

fn bookmark_label(id: &str) -> String {
    format!("bm-{id}")
}

#[tauri::command]
fn show_bookmark(
    app: AppHandle,
    id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let label = bookmark_label(&id);
    if let Some(webview) = app.webviews().get(&label) {
        webview
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        webview
            .set_size(LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        webview.show().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let window = app
        .get_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let external = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    window
        .add_child(
            WebviewBuilder::new(&label, WebviewUrl::External(external)),
            LogicalPosition::new(x, y),
            LogicalSize::new(width, height),
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_bookmark(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(webview) = app.webviews().get(&bookmark_label(&id)) {
        webview.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_bookmark(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(webview) = app.webviews().get(&bookmark_label(&id)) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_bookmark_bounds(
    app: AppHandle,
    id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(webview) = app.webviews().get(&bookmark_label(&id)) {
        webview
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        webview
            .set_size(LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let width = 1360.0;
            let height = 860.0;
            let window = tauri::window::WindowBuilder::new(app, "main")
                .title("New Ocean OS")
                .inner_size(width, height)
                .min_inner_size(960.0, 600.0)
                .build()?;
            window.add_child(
                WebviewBuilder::new("main-ui", WebviewUrl::App(Default::default()))
                    .auto_resize(),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(width, height),
            )?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            list_vault_tree,
            read_note,
            write_note,
            search_vault,
            recent_files,
            show_bookmark,
            hide_bookmark,
            close_bookmark,
            set_bookmark_bounds
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
