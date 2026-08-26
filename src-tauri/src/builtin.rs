use crate::error::{app_err, AppResult};

pub const KIND_DEEPSEEK: &str = "deepseek";
pub const KIND_MINIMAX: &str = "minimax";
pub const KIND_ZHIPU: &str = "zhipu";
pub const KIND_CHATGPT: &str = "chatgpt";
pub const KIND_OPENCODE: &str = "opencode";

pub const DEEPSEEK_CONFIG: &[u8] = include_bytes!("../assets/builtin/deepseek.toml");
pub const DEEPSEEK_MODELS: &[u8] = include_bytes!("../assets/builtin/deepseek-models.json");
pub const MINIMAX_CONFIG: &[u8] = include_bytes!("../assets/builtin/minimax.toml");
pub const MINIMAX_CATALOG: &[u8] = include_bytes!("../assets/builtin/minimax-catalog.json");
pub const ZHIPU_CONFIG: &[u8] = include_bytes!("../assets/builtin/zhipu.toml");
pub const ZHIPU_MODELS: &[u8] = include_bytes!("../assets/builtin/zhipu-models.json");
pub const CHATGPT_CONFIG: &[u8] = include_bytes!("../assets/builtin/chatgpt.toml");
pub const OPENCODE_CONFIG: &[u8] = include_bytes!("../assets/builtin/opencode.toml");
pub const OPENCODE_MODELS: &[u8] = include_bytes!("../assets/builtin/opencode-models.json");

pub struct BuiltinTemplate {
    pub kind: &'static str,
    pub name: &'static str,
    pub icon: &'static str,
    /// 生产 config.toml 的模板原文（字节级）。
    pub config: &'static [u8],
    /// 模板中的密钥占位符，应用时替换为用户填写的密钥。
    pub placeholder: Option<&'static [u8]>,
    /// 相对 ~/.codex 的关联文件路径及内容（deepseek/智谱 各自独立的 models.json、minimax 的 custom-catalog.json）。
    pub catalog: Option<(&'static str, &'static [u8])>,
    /// minimax 需要额外插入 model_catalog_json 行。
    pub insert_catalog_line: bool,
}

pub const BUILTINS: [BuiltinTemplate; 5] = [
    BuiltinTemplate {
        kind: KIND_DEEPSEEK,
        name: "DeepSeek",
        icon: "deepseek",
        config: DEEPSEEK_CONFIG,
        placeholder: Some("<你的 DeepSeek API Key>".as_bytes()),
        catalog: Some(("models.json", DEEPSEEK_MODELS)),
        insert_catalog_line: false,
    },
    BuiltinTemplate {
        kind: KIND_MINIMAX,
        name: "MiniMax",
        icon: "minimax",
        config: MINIMAX_CONFIG,
        placeholder: Some("<MINIMAX_API_KEY>".as_bytes()),
        catalog: Some(("model-catalogs/custom-catalog.json", MINIMAX_CATALOG)),
        insert_catalog_line: true,
    },
    BuiltinTemplate {
        kind: KIND_ZHIPU,
        name: "智谱",
        icon: "zhipu",
        config: ZHIPU_CONFIG,
        placeholder: Some("<Your API Key>".as_bytes()),
        catalog: Some(("models.json", ZHIPU_MODELS)),
        insert_catalog_line: false,
    },
    BuiltinTemplate {
        kind: KIND_CHATGPT,
        name: "ChatGPT",
        icon: "openai-chatgpt",
        config: CHATGPT_CONFIG,
        placeholder: None,
        catalog: None,
        insert_catalog_line: false,
    },
    // OpenCode Go（Zen 网关 Go 订阅）无官方 Codex 目录；模型元数据（上下文窗口、
    // 逐模型推理档位）镜像 cc-switch 的 OpenCode Go 预设（其数据源为 models.dev），
    // 按 Codex 目录格式（slug + 必填 base_instructions/supports_reasoning_summaries，
    // 对照 zhipu-models.json）构造。
    BuiltinTemplate {
        kind: KIND_OPENCODE,
        name: "OpenCode",
        icon: "opencode",
        config: OPENCODE_CONFIG,
        placeholder: Some("<你的 OpenCode API Key>".as_bytes()),
        catalog: Some(("models.json", OPENCODE_MODELS)),
        insert_catalog_line: false,
    },
];

impl BuiltinTemplate {
    /// 在已渲染/已编辑的 config 文本中替换密钥占位符（未填或占位符不存在则原样返回）。
    pub fn substitute_key(&self, bytes: Vec<u8>, api_key: Option<&str>) -> AppResult<Vec<u8>> {
        let Some(key) = api_key.filter(|key| !key.trim().is_empty()) else {
            return Ok(bytes);
        };
        let Some(placeholder) = self.placeholder else {
            return Ok(bytes);
        };
        let Some(start) = find_subslice(&bytes, placeholder) else {
            // 编辑结果里已没有占位符（例如用户直接写入了真实密钥）：原样保留，不报错
            return Ok(bytes);
        };
        let mut bytes = bytes;
        bytes.splice(
            start..start + placeholder.len(),
            key.as_bytes().iter().copied(),
        );
        Ok(bytes)
    }

    /// 渲染生产 config 原文：仅替换密钥占位符（未填则保留），
    /// minimax 额外在 model_context_window 之后插入 model_catalog_json 行，其余字节不动。
    pub fn render_config(&self, api_key: Option<&str>) -> AppResult<Vec<u8>> {
        let mut bytes = self.substitute_key(self.config.to_vec(), api_key)?;
        if self.insert_catalog_line {
            let needle = b"model_context_window = 1000000\n";
            let start = find_subslice(&bytes, needle)
                .ok_or_else(|| app_err!("{} 模板缺少插入位置", self.name))?;
            let line = b"model_catalog_json = \"~/.codex/model-catalogs/custom-catalog.json\"\n";
            let end = start + needle.len();
            bytes.splice(end..end, line.iter().copied());
        }
        Ok(bytes)
    }
}

pub fn template(kind: &str) -> AppResult<&'static BuiltinTemplate> {
    BUILTINS
        .iter()
        .find(|item| item.kind == kind)
        .ok_or_else(|| app_err!("未知的内置供应商类型：{kind}"))
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_configs_match_official_templates_byte_for_byte() {
        assert_eq!(
            DEEPSEEK_CONFIG,
            b"model = \"deepseek-v4-flash\"\nmodel_provider = \"deepseek\"\npreferred_auth_method = \"apikey\"\nforced_login_method = \"api\"\nmodel_reasoning_effort = \"high\"\nmodel_catalog_json = \"~/.codex/models.json\"\n\n[model_providers.deepseek]\nname = \"deepseek\"\nbase_url = \"https://api.deepseek.com/\"\nwire_api = \"responses\"\nexperimental_bearer_token = \"<\xE4\xBD\xA0\xE7\x9A\x84 DeepSeek API Key>\""
        );
        assert_eq!(
            MINIMAX_CONFIG,
            b"model = \"MiniMax-M3\"\nmodel_provider = \"minimax\"\nmodel_context_window = 1000000\n\n[model_providers.minimax]\nname = \"MiniMax\"\nbase_url = \"https://api.minimaxi.com/v1\"\nexperimental_bearer_token = \"<MINIMAX_API_KEY>\"\nwire_api = \"responses\""
        );
        assert_eq!(
            ZHIPU_CONFIG,
            b"model_provider = \"ZAI\"\nmodel = \"glm-5.3\"\nmodel_reasoning_effort = \"max\"\nmodel_catalog_json = \"~/.codex/models.json\"\n\n[model_providers.ZAI]\nname = \"ZAI\"\nbase_url = \"https://open.bigmodel.cn/api/v1\"\nexperimental_bearer_token = \"<Your API Key>\"\nwire_api = \"responses\""
        );
        assert_eq!(
            CHATGPT_CONFIG,
            b"model = \"gpt-5.6\"\nmodel_reasoning_effort = \"medium\"\n"
        );
        assert_eq!(
            OPENCODE_CONFIG,
            b"model = \"glm-5.2\"\nmodel_provider = \"opencode-go\"\nmodel_reasoning_effort = \"high\"\ndisable_response_storage = true\nmodel_catalog_json = \"~/.codex/models.json\"\n\n[model_providers.opencode-go]\nname = \"OpenCode Go\"\nbase_url = \"https://opencode.ai/zen/go/v1\"\nwire_api = \"responses\"\nexperimental_bearer_token = \"<\xE4\xBD\xA0\xE7\x9A\x84 OpenCode API Key>\""
        );
    }

    #[test]
    fn embedded_catalogs_keep_original_size_and_line_endings() {
        assert_eq!(DEEPSEEK_MODELS.len(), 114364);
        assert_eq!(count(DEEPSEEK_MODELS, b"\r\n"), 205);
        assert_eq!(ZHIPU_MODELS.len(), 2543);
        assert_eq!(count(ZHIPU_MODELS, b"\r\n"), 72);
        assert_eq!(MINIMAX_CATALOG.len(), 953);
        assert_eq!(count(MINIMAX_CATALOG, b"\r\n"), 25);
        // OpenCode 目录为构造产物（无官方文件），不做字节级快照；
        // 内容由下方 opencode_catalog 结构断言覆盖
    }

    #[test]
    fn opencode_catalog_mirrors_ccswitch_model_metadata() {
        let catalog: serde_json::Value = serde_json::from_slice(OPENCODE_MODELS).unwrap();
        let models = catalog["models"].as_array().unwrap();
        let slugs: Vec<&str> = models
            .iter()
            .map(|model| model["slug"].as_str().unwrap())
            .collect();
        assert_eq!(
            slugs,
            [
                "glm-5.2",
                "glm-5.1",
                "kimi-k2.7-code",
                "deepseek-v4-pro",
                "deepseek-v4-flash",
                "mimo-v2.5-pro"
            ]
        );

        // 逐模型上下文窗口 + 推理档位（数据源：cc-switch 预设镜像的 models.dev）
        let by_slug = |slug: &str| {
            models
                .iter()
                .find(|model| model["slug"] == slug)
                .unwrap()
                .clone()
        };
        let glm = by_slug("glm-5.2");
        assert_eq!(glm["context_window"], 204_800);
        assert_eq!(glm["default_reasoning_level"], "high");
        let efforts: Vec<&str> = glm["supported_reasoning_levels"]
            .as_array()
            .unwrap()
            .iter()
            .map(|level| level["effort"].as_str().unwrap())
            .collect();
        assert_eq!(efforts, ["high", "max"]);

        let flash = by_slug("deepseek-v4-flash");
        assert_eq!(flash["context_window"], 1_048_576);
        let efforts: Vec<&str> = flash["supported_reasoning_levels"]
            .as_array()
            .unwrap()
            .iter()
            .map(|level| level["effort"].as_str().unwrap())
            .collect();
        assert_eq!(efforts, ["low", "high", "max"]);

        // Codex 目录解析器必填字段（缺失会拒载整个文件）
        for model in models {
            assert!(model.get("base_instructions").is_some());
            assert!(model.get("supports_reasoning_summaries").is_some());
        }

        // 官方目录（zhipu/minimax）的完整 21 字段集，缺字段会退化 Codex 的能力声明
        for field in [
            "slug",
            "display_name",
            "description",
            "default_reasoning_level",
            "supported_reasoning_levels",
            "shell_type",
            "visibility",
            "supported_in_api",
            "priority",
            "base_instructions",
            "supports_reasoning_summaries",
            "default_reasoning_summary",
            "support_verbosity",
            "apply_patch_tool_type",
            "truncation_policy",
            "context_window",
            "max_context_window",
            "effective_context_window_percent",
            "supports_parallel_tool_calls",
            "experimental_supported_tools",
            "input_modalities",
        ] {
            if field == "default_reasoning_level" || field == "supported_reasoning_levels" {
                // 无 effort 档位的模型（glm-5.1 等）合法省略这两个可选字段
                continue;
            }
            for model in models {
                assert!(
                    model.get(field).is_some(),
                    "{} 缺少字段 {field}",
                    model["slug"].as_str().unwrap_or("?")
                );
            }
        }
    }

    #[test]
    fn deepseek_catalog_preserves_search_tool_overrides() {
        let catalog: serde_json::Value = serde_json::from_slice(DEEPSEEK_MODELS).unwrap();
        let models = catalog["models"].as_array().unwrap();
        assert_eq!(models.len(), 3);
        assert_eq!(models[0]["slug"], "deepseek-v4-flash");
        assert_eq!(models[0]["supports_search_tool"], false);
        assert_eq!(models[1]["slug"], "deepseek-v4-pro");
        assert_eq!(models[1]["supports_search_tool"], false);
        assert_eq!(models[2]["slug"], "deepseek-v4-flash-vision-exp");
        assert_eq!(models[2]["supports_search_tool"], true);
    }

    #[test]
    fn render_replaces_key_and_inserts_minimax_line() {
        let deepseek = template(KIND_DEEPSEEK).unwrap();
        let rendered = deepseek.render_config(Some("sk-real")).unwrap();
        assert!(rendered.windows(b"sk-real".len()).any(|w| w == b"sk-real"));
        assert!(!rendered
            .windows("<你的 DeepSeek API Key>".len())
            .any(|w| w == "<你的 DeepSeek API Key>".as_bytes()));
        let kept = deepseek.render_config(None).unwrap();
        assert_eq!(kept, DEEPSEEK_CONFIG);

        let minimax = template(KIND_MINIMAX).unwrap();
        let rendered = minimax.render_config(Some("mm-key")).unwrap();
        assert!(rendered
            .windows(b"model_catalog_json = \"~/.codex/model-catalogs/custom-catalog.json\"".len())
            .any(|w| {
                w == b"model_catalog_json = \"~/.codex/model-catalogs/custom-catalog.json\""
            }));
        assert!(rendered.windows(b"mm-key".len()).any(|w| w == b"mm-key"));
    }

    fn count(haystack: &[u8], needle: &[u8]) -> usize {
        haystack
            .windows(needle.len())
            .filter(|w| *w == needle)
            .count()
    }
}
