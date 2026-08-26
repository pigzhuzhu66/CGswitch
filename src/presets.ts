export interface BuiltinPreset {
  kind: string;
  name: string;
  provider: string | null;
  icon: string;
  base_url: string;
  admin_url: string | null;
  model: string;
  model_values: Record<string, string>;
  fragment: string;
}

/** 支持余额/用量查询的供应商（以 provider_id 键控）；加供应商时在这里加一行即可 */
export const balanceQueryProviders = new Set(["deepseek", "minimax", "ZAI"]);

/** 文案使用“用量”的供应商；DeepSeek 保持“余额”，ChatGPT 额度单独处理。 */
export const usageQueryProviders = new Set(["minimax", "ZAI"]);

/** 余额/用量胶囊变色（已用 <70% 绿 / 70-89% 橙 / ≥90% 红；负余额红色） */
export function balanceChipClass(
  usagePercent: number | null,
  failed: boolean,
  totalBalance: string | null = null,
): string {
  if (failed) return "chip-danger";
  if (usagePercent == null) return Number(totalBalance) < 0 ? "chip-danger" : "chip-success";
  if (usagePercent >= 90) return "chip-danger";
  if (usagePercent >= 70) return "chip-warn";
  return "chip-success";
}

export const customConfigTemplate = `model = "your-model"
model_provider = "your-provider"
model_reasoning_effort = "high"
disable_response_storage = true
model_catalog_json = "~/.codex/models.json"

[model_providers.your-provider]
name = "your-provider"
base_url = "https://api.example.com/v1"
wire_api = "responses"
experimental_bearer_token = ""`;

/** 模型目录按 Codex 官方目录的完整字段集（对照 assets/builtin/zhipu-models.json，
 * 每条 21 个字段）：slug 是模型标识；base_instructions 与 supports_reasoning_summaries
 * 为解析器必填字段，缺失会让 Codex 拒载整个目录文件。 */
export const customCatalogTemplate = `{
  "models": [
    {
      "slug": "your-model",
      "display_name": "Your Model",
      "description": "Your Model",
      "default_reasoning_level": "high",
      "supported_reasoning_levels": [
        { "effort": "low", "description": "Light reasoning" },
        { "effort": "high", "description": "Deep reasoning" }
      ],
      "shell_type": "shell_command",
      "visibility": "list",
      "supported_in_api": true,
      "priority": 0,
      "base_instructions": "",
      "supports_reasoning_summaries": true,
      "default_reasoning_summary": "none",
      "support_verbosity": false,
      "apply_patch_tool_type": "freeform",
      "truncation_policy": { "mode": "bytes", "limit": 10000 },
      "context_window": 128000,
      "max_context_window": 128000,
      "effective_context_window_percent": 95,
      "supports_parallel_tool_calls": true,
      "experimental_supported_tools": [],
      "input_modalities": ["text"]
    }
  ]
}`;

export const builtinPresets: BuiltinPreset[] = [
  {
    kind: "deepseek",
    name: "DeepSeek",
    provider: "deepseek",
    icon: "deepseek",
    base_url: "https://api.deepseek.com/",
    admin_url: "https://platform.deepseek.com",
    model: "deepseek-v4-flash",
    model_values: {
      model: '"deepseek-v4-flash"',
      model_reasoning_effort: '"high"',
      model_catalog_json: '"~/.codex/models.json"',
    },
    fragment: [
      'model = "deepseek-v4-flash"',
      'model_provider = "deepseek"',
      'preferred_auth_method = "apikey"',
      'forced_login_method = "api"',
      'model_reasoning_effort = "high"',
      'model_catalog_json = "~/.codex/models.json"',
      "",
      "[model_providers.deepseek]",
      'name = "deepseek"',
      'base_url = "https://api.deepseek.com/"',
      'wire_api = "responses"',
      'experimental_bearer_token = "<你的 DeepSeek API Key>"',
    ].join("\n"),
  },
  {
    kind: "minimax",
    name: "MiniMax",
    provider: "minimax",
    icon: "minimax",
    base_url: "https://api.minimaxi.com/v1",
    admin_url: "https://platform.minimaxi.com",
    model: "MiniMax-M3",
    model_values: {
      model: '"MiniMax-M3"',
      model_reasoning_effort: '"high"',
      model_catalog_json: '"~/.codex/model-catalogs/custom-catalog.json"',
    },
    fragment: [
      'model = "MiniMax-M3"',
      'model_provider = "minimax"',
      "model_context_window = 1000000",
      'model_catalog_json = "~/.codex/model-catalogs/custom-catalog.json"',
      "",
      "[model_providers.minimax]",
      'name = "MiniMax"',
      'base_url = "https://api.minimaxi.com/v1"',
      'experimental_bearer_token = "<MINIMAX_API_KEY>"',
      'wire_api = "responses"',
    ].join("\n"),
  },
  {
    kind: "zhipu",
    name: "智谱",
    provider: "ZAI",
    icon: "zhipu",
    base_url: "https://open.bigmodel.cn/api/v1",
    admin_url: "https://open.bigmodel.cn",
    model: "glm-5.3",
    model_values: {
      model: '"glm-5.3"',
      model_reasoning_effort: '"max"',
      model_catalog_json: '"~/.codex/models.json"',
    },
    fragment: [
      'model_provider = "ZAI"',
      'model = "glm-5.3"',
      'model_reasoning_effort = "max"',
      'model_catalog_json = "~/.codex/models.json"',
      "",
      "[model_providers.ZAI]",
      'name = "ZAI"',
      'base_url = "https://open.bigmodel.cn/api/v1"',
      'experimental_bearer_token = "<Your API Key>"',
      'wire_api = "responses"',
    ].join("\n"),
  },
  {
    kind: "chatgpt",
    name: "ChatGPT",
    provider: null,
    icon: "openai-chatgpt",
    base_url: "",
    admin_url: "https://openai.com/chatgpt/pricing",
    model: "gpt-5.6",
    model_values: {
      model: '"gpt-5.6"',
      model_reasoning_effort: '"medium"',
    },
    fragment: 'model = "gpt-5.6"\nmodel_reasoning_effort = "medium"',
  },
  {
    kind: "opencode",
    name: "OpenCode",
    provider: "opencode-go",
    icon: "opencode",
    base_url: "https://opencode.ai/zen/go/v1",
    admin_url: null,
    model: "glm-5.2",
    model_values: {
      model: '"glm-5.2"',
      model_reasoning_effort: '"high"',
      model_catalog_json: '"~/.codex/models.json"',
    },
    fragment: [
      'model = "glm-5.2"',
      'model_provider = "opencode-go"',
      'model_reasoning_effort = "high"',
      "disable_response_storage = true",
      'model_catalog_json = "~/.codex/models.json"',
      "",
      "[model_providers.opencode-go]",
      'name = "OpenCode Go"',
      'base_url = "https://opencode.ai/zen/go/v1"',
      'wire_api = "responses"',
      'experimental_bearer_token = "<你的 OpenCode API Key>"',
    ].join("\n"),
  },
  {
    kind: "openrouter",
    name: "OpenRouter",
    provider: "openrouter",
    icon: "openrouter",
    base_url: "https://openrouter.ai/api/v1",
    admin_url: "https://openrouter.ai/settings/keys",
    model: "openai/gpt-5.6-sol",
    // 聚合站模型众多，无静态目录；模型由编辑页"获取模型列表"拉取（slug 需带厂商前缀）
    model_values: {
      model: '"openai/gpt-5.6-sol"',
      model_reasoning_effort: '"high"',
    },
    fragment: [
      'model = "openai/gpt-5.6-sol"',
      'model_provider = "openrouter"',
      'model_reasoning_effort = "high"',
      "disable_response_storage = true",
      "",
      "[model_providers.openrouter]",
      'name = "OpenRouter"',
      'base_url = "https://openrouter.ai/api/v1"',
      'wire_api = "responses"',
      'experimental_bearer_token = "<你的 OpenRouter API Key>"',
    ].join("\n"),
  },
  {
    kind: "custom",
    name: "自定义",
    provider: null,
    icon: "custom",
    base_url: "",
    admin_url: null,
    model: "自定义",
    model_values: { model_catalog_json: '"~/.codex/models.json"' },
    fragment: customConfigTemplate,
  },
];

export function builtinPresetByKind(kind: string): BuiltinPreset | undefined {
  return builtinPresets.find((preset) => preset.kind === kind);
}
