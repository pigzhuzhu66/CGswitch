use super::storage::{backup_keep_count, DATABASE_BACKUP_PREFIX};
use super::{
    app_err, atomic_write, codex_process, now_ms, prune_backups, AppContext, AppHandle, AppResult,
    Emitter, Path, PathInfo, Settings,
};

fn emit(app: &AppHandle, stage: &str, message: Option<&str>) {
    let _ = app.emit(
        "restart-progress",
        serde_json::json!({ "stage": stage, "message": message }),
    );
}

fn open_in_file_explorer(path: &Path) -> AppResult<()> {
    #[cfg(windows)]
    {
        use windows::{
            core::HSTRING,
            Win32::{
                System::Com::CoInitialize,
                UI::Shell::{ILCreateFromPathW, ILFree, SHOpenFolderAndSelectItems},
            },
        };

        let _ = unsafe { CoInitialize(None) };
        let folder = if path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
        };
        let folder_text = HSTRING::from(folder);
        let folder_id = unsafe { ILCreateFromPathW(&folder_text) };
        if folder_id.is_null() {
            return Err(app_err!("无法定位资源管理器路径：{}", folder.display()));
        }
        let item_text = HSTRING::from(path);
        let item_id = path
            .is_file()
            .then(|| unsafe { ILCreateFromPathW(&item_text) });
        let selection = item_id
            .filter(|item| !item.is_null())
            .map(|item| [item.cast_const()]);
        let result = unsafe {
            SHOpenFolderAndSelectItems(
                folder_id.cast_const(),
                selection.as_ref().map(|items| &items[..]),
                0,
            )
        };
        unsafe {
            ILFree(Some(folder_id.cast_const()));
            if let Some(item) = item_id.filter(|item| !item.is_null()) {
                ILFree(Some(item.cast_const()));
            }
        }
        result.map_err(|error| app_err!("无法打开资源管理器：{error}"))
    }

    #[cfg(not(windows))]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| app_err!("无法打开文件管理器：{error}"))
    }
}

impl AppContext {
    pub fn restart_codex(&self, app: &AppHandle) -> AppResult<()> {
        let _guard = self
            .operation
            .lock()
            .map_err(|_| app_err!("操作锁已损坏"))?;
        emit(app, "stopping", None);

        let process_ids = codex_process::find_process_ids(None);
        if !process_ids.is_empty() {
            codex_process::terminate_process_ids(&process_ids);
            emit(app, "waiting", None);
            // 固定等待 5 秒（可配置的“重启等待超时”已移除）
            let exited = codex_process::wait_for_exit(&process_ids, 5_000, 100);
            if !exited {
                let message = "Codex 未在超时时间内退出，已取消重新启动";
                self.database.record_event(
                    None,
                    "restart",
                    "timeout",
                    Some(message),
                    &now_ms().to_string(),
                )?;
                emit(app, "error", Some(message));
                return Err(app_err!("{message}"));
            }
        }

        emit(app, "launching", None);
        let result = codex_process::launch_codex(None);
        let status = if result.is_ok() { "success" } else { "failed" };
        let message = result.as_ref().err().map(|error| error.0.clone());
        self.database.record_event(
            None,
            "restart",
            status,
            message.as_deref(),
            &now_ms().to_string(),
        )?;
        match result {
            Ok(()) => {
                emit(app, "success", None);
                Ok(())
            }
            Err(error) => {
                emit(app, "error", Some(&error.0));
                Err(error)
            }
        }
    }

    pub fn settings(&self) -> AppResult<Settings> {
        let path = &self.paths.settings;
        let text = match std::fs::read_to_string(path) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                // 首次运行：写出默认设置文件，方便直接手动编辑
                let defaults = Settings::default();
                let text = serde_json::to_string_pretty(&defaults)
                    .map_err(|_| app_err!("默认设置序列化失败"))?;
                atomic_write(path, text.as_bytes())?;
                return Ok(defaults);
            }
            Err(error) => return Err(app_err!("无法读取设置文件 {}: {error}", path.display())),
        };
        serde_json::from_str(&text)
            .map_err(|error| app_err!("设置文件 {} 无效: {error}", path.display()))
    }

    pub fn save_settings(&self, settings: &Settings) -> AppResult<Settings> {
        let _guard = self
            .operation
            .lock()
            .map_err(|_| app_err!("操作锁已损坏"))?;
        let mut settings = settings.clone();
        settings.theme = settings.theme.trim().to_lowercase();
        if !["system", "light", "dark"].contains(&settings.theme.as_str()) {
            return Err(app_err!("不支持的主题设置"));
        }
        let text =
            serde_json::to_string_pretty(&settings).map_err(|_| app_err!("设置序列化失败"))?;
        atomic_write(&self.paths.settings, text.as_bytes())?;
        prune_backups(
            &self.paths.database_backup,
            DATABASE_BACKUP_PREFIX,
            ".db",
            backup_keep_count(settings.database_backup_keep_count),
        );
        Ok(settings)
    }

    pub fn open_path(&self, path: &str) -> AppResult<()> {
        if !self.is_managed_path(path) {
            return Err(app_err!("不能打开未列出的本机路径"));
        }
        open_in_file_explorer(Path::new(path))
    }

    pub(super) fn path_info(&self) -> Vec<PathInfo> {
        vec![
            PathInfo {
                label: "应用数据目录".into(),
                path: self.paths.root.display().to_string(),
            },
            PathInfo {
                label: "Codex 配置".into(),
                path: self.paths.codex_config().display().to_string(),
            },
            PathInfo {
                label: "备份目录".into(),
                path: self.paths.root.join("backups").display().to_string(),
            },
        ]
    }

    pub(super) fn is_managed_path(&self, path: &str) -> bool {
        self.path_info().iter().any(|item| item.path == path)
    }
}
