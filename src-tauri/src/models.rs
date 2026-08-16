use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProfilePayload {
    #[serde(default)]
    pub model_values: BTreeMap<String, String>,
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub provider_body: Option<String>,
    /// 内置官方档案类型（deepseek/minimax/zhipu/chatgpt）；普通捕获的档案为 None。
    #[serde(default)]
    pub builtin: Option<String>,
    /// 档案自己保存的完整 config 原文（内置档案可全量编辑；普通档案无该字段）。
    #[serde(default)]
    pub raw_config: Option<String>,
    /// 档案自己保存的 models.json 原文（编辑后随档案应用写入 ~/.codex）。
    #[serde(default)]
    pub raw_catalog: Option<String>,
    /// 模型提供方的管理后台网址（卡片显示跳转按钮）。
    #[serde(default)]
    pub admin_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProfileSummary {
    pub id: String,
    pub name: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub reasoning_effort: Option<String>,
    /// 档案是否已配置有效 API 密钥（占位符视为未配置）
    pub has_key: bool,
    pub admin_url: Option<String>,
    pub icon: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProfileDetail {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub model_values: std::collections::BTreeMap<String, String>,
    pub config_fragment: String,
    pub raw_config: Option<String>,
    pub auth_content: Option<String>,
    pub catalog_content: Option<String>,
    pub raw_catalog: Option<String>,
    pub admin_url: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Settings {
    pub theme: String,
    #[serde(default)]
    pub codex_app_path: Option<String>,
    #[serde(default)]
    pub auto_restart: bool,
    #[serde(default = "default_restart_timeout")]
    pub restart_timeout_ms: u64,
    #[serde(default)]
    pub autostart_enabled: bool,
    #[serde(default)]
    pub silent_start: bool,
    #[serde(default)]
    pub minimize_to_tray: bool,
}

pub fn default_restart_timeout() -> u64 {
    5_000
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            codex_app_path: None,
            auto_restart: false,
            restart_timeout_ms: default_restart_timeout(),
            autostart_enabled: false,
            silent_start: false,
            minimize_to_tray: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct PathInfo {
    pub label: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CodexAppStatus {
    pub running: bool,
    pub display_path: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppState {
    pub profiles: Vec<ProfileSummary>,
    pub active_profile_id: Option<String>,
    pub codex: CodexAppStatus,
    pub settings: Settings,
    pub paths: Vec<PathInfo>,
}
