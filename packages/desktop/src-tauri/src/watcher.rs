// Observa um workspace no disco e emite lotes de mudanças já
// debounced/coalescidos pro frontend. Não existe plugin oficial do Tauri 2
// pra isso (confirmado na documentação atual, v2.tauri.app/plugin) — `notify`
// + `notify-debouncer-full` são as crates padrão do ecossistema Rust pra
// isso, poupando reimplementar a coalescência à mão (como foi feito em C#
// na fase WPF, ver docs/adr/0001).
//
// Rename mostra como Remove+Create separados, não como um evento de rename
// único — a heurística exata que o `notify` usa pra correlacionar os dois
// lados de um rename não está documentada com certeza suficiente pra
// confiar nela; o lado TypeScript (workspaceIndex.ts) já sabe reconciliar
// isso corretamente através de Reconcile(), então é uma simplificação
// honesta, não uma lacuna escondida.

use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_fs::FsExt;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceChangeKind {
    Created,
    Modified,
    Removed,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChangePayload {
    pub kind: WorkspaceChangeKind,
    pub path: String,
    /// `Some(true/false)` quando dá pra checar no disco no instante do
    /// evento (`Path::is_dir`); `None` quando o caminho já sumiu de novo
    /// (ex.: caso de Remove, ou uma corrida rara). O lado TS só depende
    /// disso pra eventos `created` — sem essa informação, teria que
    /// adivinhar pasta-vs-arquivo só pela extensão, o que classifica
    /// errado qualquer arquivo sem `.markup`/`.mkup` (ex.: `notas.txt`
    /// viraria uma pasta fantasma até a próxima reconciliação).
    pub is_directory: Option<bool>,
}

type WatcherHandle = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

#[derive(Default)]
pub struct WatcherState(pub Mutex<Option<WatcherHandle>>);

/// Concede acesso de leitura/escrita à pasta escolhida (via o seletor
/// nativo) e liga o watcher nela. As duas coisas andam juntas porque o
/// escopo do plugin `fs` não conhece automaticamente uma pasta só porque o
/// usuário a selecionou no diálogo — precisa ser estendido em runtime
/// (`allow_directory`), e é mais seguro conceder isso só para a pasta
/// escolhida (com recursão) do que liberar o filesystem inteiro
/// estaticamente (missão: princípio de menor privilégio).
#[tauri::command]
pub fn watch_workspace(
    app: AppHandle,
    state: State<WatcherState>,
    path: String,
) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(&path, true)
        .map_err(|e| e.to_string())?;

    let app_handle = app.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        None,
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                let payloads: Vec<WorkspaceChangePayload> = events
                    .iter()
                    .filter_map(|event| {
                        let kind = match event.kind {
                            notify::EventKind::Create(_) => Some(WorkspaceChangeKind::Created),
                            notify::EventKind::Modify(_) => Some(WorkspaceChangeKind::Modified),
                            notify::EventKind::Remove(_) => Some(WorkspaceChangeKind::Removed),
                            _ => None,
                        }?;
                        let path_buf = event.paths.first()?;
                        let is_directory = if path_buf.exists() { Some(path_buf.is_dir()) } else { None };
                        let path = path_buf.to_string_lossy().to_string();
                        Some(WorkspaceChangePayload { kind, path, is_directory })
                    })
                    .collect();

                if !payloads.is_empty() {
                    let _ = app_handle.emit("workspace:changed", payloads);
                }
            }
            Err(errors) => {
                for error in errors {
                    eprintln!("markup: erro no watcher do workspace: {error:?}");
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watch(std::path::Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(debouncer);
    Ok(())
}

/// Para de observar o workspace atual — chamado antes de abrir um novo
/// (nunca dois watchers concorrentes) e no encerramento do app.
#[tauri::command]
pub fn unwatch_workspace(state: State<WatcherState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None; // Debouncer não tem stop() explícito — dropar encerra a thread de watch.
    Ok(())
}
