use super::profile_config::{parse_provider_detail, stored_provider_api_key};
use super::{app_err, atomic_write, AppContext, AppResult, BTreeMap, PathBuf, ProfileBalanceInfo};

/// 供应商连通性测试结果
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProfileConnectionResult {
    pub ok: bool,
    pub latency_ms: Option<u128>,
    pub status: Option<u16>,
    pub error: Option<String>,
}

/// 供应商余额/用量查询结果
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProfileBalance {
    pub is_available: bool,
    pub balance_infos: Vec<ProfileBalanceInfo>,
    pub latency_ms: Option<u128>,
}

/// DeepSeek 余额接口响应（接口文档：https://api-docs.deepseek.com/zh-cn/api/get-user-balance）
#[derive(Debug, serde::Deserialize)]
struct DeepSeekBalanceResponse {
    is_available: bool,
    balance_infos: Vec<ProfileBalanceInfo>,
}

/// MiniMax Coding Plan 用量接口响应（国内版：api.minimaxi.com/v1/api/openplatform/coding_plan/remains）
#[derive(Debug, serde::Deserialize)]
struct MiniMaxRemainsResponse {
    #[serde(default)]
    base_resp: MiniMaxBaseResp,
    #[serde(default)]
    model_remains: Vec<MiniMaxModelRemains>,
}

#[derive(Debug, Default, serde::Deserialize)]
struct MiniMaxBaseResp {
    #[serde(default)]
    status_code: Option<i64>,
    #[serde(default)]
    status_msg: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub(crate) struct MiniMaxModelRemains {
    #[serde(default)]
    pub(crate) model_name: String,
    /// 剩余百分比（0-100），接口语义为“剩余”，卡片显示“用量”时换算成已用。
    #[serde(default)]
    pub(crate) current_interval_remaining_percent: Option<f64>,
    /// 7 天窗口剩余百分比（0-100）。
    #[serde(default)]
    pub(crate) current_weekly_remaining_percent: Option<f64>,
    /// 5 小时窗口重置倒计时（毫秒）。
    #[serde(default)]
    pub(crate) remains_time: Option<i64>,
    /// 7 天窗口重置倒计时（毫秒）。
    #[serde(default)]
    pub(crate) weekly_remains_time: Option<i64>,
}

/// 统一的 HTTP 客户端：8 秒超时。
fn http_client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|error| app_err!("创建 HTTP 客户端失败: {error}"))
}

/// reqwest 错误转可读提示。
fn reqwest_error_message(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "请求超时".to_string()
    } else if error.is_connect() {
        "连接失败".to_string()
    } else {
        error.to_string()
    }
}

/// 从 2xx 的 JSON 响应体里识别供应商级错误（OpenAI 风格 `error` 或智谱风格 `code/success`）。
pub(crate) fn connection_error_from_body(value: &serde_json::Value) -> Option<String> {
    if let Some(error) = value.get("error") {
        let message = error
            .get("message")
            .and_then(serde_json::Value::as_str)
            .or_else(|| error.as_str());
        return Some(message.unwrap_or("接口返回错误").to_string());
    }
    if value.get("success").and_then(serde_json::Value::as_bool) == Some(false) {
        let message = value
            .get("msg")
            .and_then(serde_json::Value::as_str)
            .or_else(|| value.get("message").and_then(serde_json::Value::as_str));
        return Some(message.unwrap_or("接口返回错误").to_string());
    }
    if let Some(code) = value.get("code") {
        let is_error_code = match code {
            serde_json::Value::Number(number) => number.as_i64().is_some_and(|n| n >= 400),
            serde_json::Value::String(text) => text.parse::<i64>().is_ok_and(|n| n >= 400),
            _ => false,
        };
        if is_error_code {
            let message = value
                .get("msg")
                .and_then(serde_json::Value::as_str)
                .or_else(|| value.get("message").and_then(serde_json::Value::as_str));
            return Some(message.unwrap_or("接口返回错误").to_string());
        }
    }
    None
}

/// 余额/用量请求公共骨架：统一处理 401/403、错误提取与网络错误；
/// 各家只提供 URL 和成功响应的解析。
async fn query_balance_endpoint(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    start: std::time::Instant,
    label: &str,
    parse: impl FnOnce(String, Option<u128>) -> AppResult<ProfileBalance>,
) -> AppResult<ProfileBalance> {
    let response = client.get(url).bearer_auth(api_key).send().await;
    match response {
        Ok(response) => {
            let status = response.status();
            let latency_ms = Some(start.elapsed().as_millis());
            if status.is_success() {
                let body = response
                    .text()
                    .await
                    .map_err(|error| app_err!("{label}接口响应读取失败: {error}"))?;
                return parse(body, latency_ms);
            }
            if status == reqwest::StatusCode::UNAUTHORIZED
                || status == reqwest::StatusCode::FORBIDDEN
            {
                return Err(app_err!("API 密钥无效或无权查询{label}（HTTP {status}）"));
            }
            let message = response
                .json::<serde_json::Value>()
                .await
                .ok()
                .and_then(|value| {
                    value
                        .get("error")
                        .and_then(|error| error.get("message"))
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_string)
                })
                .unwrap_or_else(|| format!("接口返回 HTTP {status}"));
            Err(app_err!("{label}查询失败：{message}"))
        }
        Err(error) => {
            let error_message = reqwest_error_message(&error);
            Err(app_err!("{label}查询失败：{error_message}"))
        }
    }
}

/// DeepSeek 余额查询：GET {base}/user/balance。
async fn query_deepseek_balance(
    client: &reqwest::Client,
    base: &str,
    api_key: &str,
    start: std::time::Instant,
) -> AppResult<ProfileBalance> {
    let url = format!("{}/user/balance", base.trim_end_matches('/'));
    query_balance_endpoint(
        client,
        &url,
        api_key,
        start,
        "余额",
        |body, latency_ms| {
            let parsed = serde_json::from_str::<DeepSeekBalanceResponse>(&body)
                .map_err(|error| app_err!("余额接口响应解析失败: {error}"))?;
            Ok(ProfileBalance {
                is_available: parsed.is_available,
                balance_infos: parsed.balance_infos,
                latency_ms,
            })
        },
    )
    .await
}

/// MiniMax Coding Plan 用量查询：GET {base}/api/openplatform/coding_plan/remains。
/// 接口形态以用户实测可用的 statusline.ps1 为准（国内版 Coding Plan）。
/// GET {base}/models 带密钥的连通性测试核心，与 profile 无关（创建态表单直接复用）。
async fn test_models_endpoint(base_url: &str, api_key: &str) -> AppResult<ProfileConnectionResult> {
    let models_url = format!("{}/models", base_url.trim_end_matches('/'));
    let client = http_client()?;

    let start = std::time::Instant::now();
    match client.get(&models_url).bearer_auth(api_key).send().await {
        Ok(response) => {
            let status = response.status();
            let latency_ms = Some(start.elapsed().as_millis());
            if status.is_success() {
                // 部分服务端（如智谱 /api/v1/models）用 HTTP 200 包装认证失败，
                // 只认状态码会把“密钥错误/地址错误”误判成连通成功，必须校验响应体。
                let body = response.text().await.unwrap_or_default();
                match serde_json::from_str::<serde_json::Value>(&body) {
                    Ok(json) => {
                        if let Some(error) = connection_error_from_body(&json) {
                            Ok(ProfileConnectionResult {
                                ok: false,
                                latency_ms,
                                status: Some(status.as_u16()),
                                error: Some(error),
                            })
                        } else {
                            Ok(ProfileConnectionResult {
                                ok: true,
                                latency_ms,
                                status: Some(status.as_u16()),
                                error: None,
                            })
                        }
                    }
                    Err(_) => Ok(ProfileConnectionResult {
                        ok: false,
                        latency_ms,
                        status: Some(status.as_u16()),
                        error: Some(format!(
                            "接口返回 HTTP {status}，但响应不是有效的 JSON（请检查调用地址）"
                        )),
                    }),
                }
            } else if status == reqwest::StatusCode::UNAUTHORIZED
                || status == reqwest::StatusCode::FORBIDDEN
            {
                Ok(ProfileConnectionResult {
                    ok: false,
                    latency_ms,
                    status: Some(status.as_u16()),
                    error: Some("API 密钥无效".to_string()),
                })
            } else {
                Ok(ProfileConnectionResult {
                    ok: false,
                    latency_ms,
                    status: Some(status.as_u16()),
                    error: Some(format!("接口返回 HTTP {status}")),
                })
            }
        }
        Err(error) => {
            let status = error.status().map(|status| status.as_u16());
            let error_message = reqwest_error_message(&error);
            Ok(ProfileConnectionResult {
                ok: false,
                latency_ms: None,
                status,
                error: Some(error_message),
            })
        }
    }
}

/// 创建态表单的连通性测试：地址/密钥实时传入，无已存 profile 可回退，空值直接报错。
pub async fn test_provider_connection(
    base_url: &str,
    api_key: &str,
) -> AppResult<ProfileConnectionResult> {
    let base_url = base_url.trim();
    if base_url.is_empty() {
        return Err(app_err!("请填写调用地址"));
    }
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err(app_err!("请填写 API 密钥"));
    }
    test_models_endpoint(base_url, api_key).await
}

async fn query_minimax_balance(
    client: &reqwest::Client,
    base: &str,
    api_key: &str,
    start: std::time::Instant,
) -> AppResult<ProfileBalance> {
    let url = format!(
        "{}/api/openplatform/coding_plan/remains",
        base.trim_end_matches('/')
    );
    query_balance_endpoint(
        client,
        &url,
        api_key,
        start,
        "用量",
        |body, latency_ms| {
            let parsed = serde_json::from_str::<MiniMaxRemainsResponse>(&body)
                .map_err(|error| app_err!("用量接口响应解析失败: {error}"))?;
            let code = parsed.base_resp.status_code.unwrap_or(-1);
            if code != 0 {
                let message = parsed.base_resp.status_msg.unwrap_or_default();
                return Err(app_err!("用量查询失败：{message}"));
            }
            let entry = parsed
                .model_remains
                .iter()
                .find(|item| item.model_name == "general")
                .or_else(|| parsed.model_remains.first())
                .ok_or_else(|| app_err!("用量查询失败：接口未返回用量数据"))?;
            let usage_percent = used_percent(entry.current_interval_remaining_percent)
                .ok_or_else(|| app_err!("用量查询失败：接口未返回用量数据"))?;
            Ok(ProfileBalance {
                is_available: true,
                balance_infos: vec![ProfileBalanceInfo {
                    currency: String::new(),
                    total_balance: String::new(),
                    granted_balance: String::new(),
                    topped_up_balance: String::new(),
                    usage_percent: Some(usage_percent),
                    usage_reset: entry.remains_time.and_then(|ms| format_reset(ms, false)),
                    weekly_usage_percent: used_percent(entry.current_weekly_remaining_percent),
                    weekly_reset: entry
                        .weekly_remains_time
                        .and_then(|ms| format_reset(ms, true)),
                }],
                latency_ms,
            })
        },
    )
    .await
}

/// 接口给的是“剩余”百分比，卡片显示“用量”= 100 - 剩余。
pub(crate) fn used_percent(remaining: Option<f64>) -> Option<u32> {
    let remaining = remaining?;
    let used = 100.0 - remaining;
    Some(used.clamp(0.0, 100.0).round() as u32)
}

/// 重置倒计时格式：with_days=true 支持 d/h/m（7 天窗口），否则 h/m（5 小时窗口）；不足 1 分钟不显示。
pub(crate) fn format_reset(ms: i64, with_days: bool) -> Option<String> {
    if ms <= 60_000 {
        return None;
    }
    let days = if with_days { ms / 86_400_000 } else { 0 };
    let hours = (ms % 86_400_000) / 3_600_000;
    let minutes = (ms % 3_600_000) / 60_000;
    Some(if days > 0 {
        if hours > 0 {
            format!("{days}d{hours}h")
        } else {
            format!("{days}d")
        }
    } else if hours > 0 {
        if minutes > 0 {
            format!("{hours}h{minutes}m")
        } else {
            format!("{hours}h")
        }
    } else {
        format!("{minutes}m")
    })
}

impl AppContext {
    /// 验证供应商密钥连通性：请求 OpenAI 兼容的 GET {base}/models（带 Bearer 密钥），
    /// 2xx 视为可用，401/403 视为密钥无效，返回延迟 / HTTP 状态 / 错误信息。
    /// 表单传入的地址/密钥实时生效（传了就用传的，空的直接报错）；
    /// 不传才回退已保存值（卡片上的测试按钮走这条）。
    pub async fn test_profile_connection(
        &self,
        id: &str,
        base_url_override: Option<&str>,
        api_key_override: Option<&str>,
    ) -> AppResult<ProfileConnectionResult> {
        let stored = self.database.profile(id)?;
        let payload = &stored.payload;
        if payload.provider_id.is_none() {
            return Err(app_err!("该供应商缺少配置，无法测试连通性"));
        }
        let body = payload
            .provider_body
            .as_deref()
            .ok_or_else(|| app_err!("该供应商缺少配置数据"))?;
        let detail = parse_provider_detail(body)?;
        let base_url = match base_url_override {
            Some(value) => {
                let value = value.trim();
                if value.is_empty() {
                    return Err(app_err!("请填写调用地址"));
                }
                value.to_string()
            }
            None => detail
                .base_url
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| app_err!("该供应商没有配置调用地址"))?,
        };
        let api_key = match api_key_override {
            Some(value) => {
                let value = value.trim();
                if value.is_empty() {
                    return Err(app_err!("请填写 API 密钥"));
                }
                value.to_string()
            }
            None => stored_provider_api_key(payload)
                .ok_or_else(|| app_err!("该供应商没有配置 API 密钥，请先填写后再测试"))?,
        };

        test_models_endpoint(&base_url, &api_key).await
    }

    /// 验证 ChatGPT 订阅认证连通性：用当前 access_token 请求 Codex 官方后端用量端点
    /// （Codex CLI 后台轮询同一个端点）。2xx 可用；401/403 登录失效或地区拦截；
    /// 网络错误提示代理/网络问题。仅手动点击测试时调用，不参与切换流程。
    pub async fn test_subscription_connection(
        &self,
        access_token: &str,
    ) -> AppResult<ProfileConnectionResult> {
        let client = http_client()?;
        let start = std::time::Instant::now();
        match client
            .get("https://chatgpt.com/backend-api/wham/usage")
            .bearer_auth(access_token)
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                let latency_ms = Some(start.elapsed().as_millis());
                if status.is_success() {
                    Ok(ProfileConnectionResult {
                        ok: true,
                        latency_ms,
                        status: Some(status.as_u16()),
                        error: None,
                    })
                } else if status == reqwest::StatusCode::UNAUTHORIZED
                    || status == reqwest::StatusCode::FORBIDDEN
                {
                    let text = response.text().await.unwrap_or_default();
                    let error = if text.contains("unsupported_country_region_territory") {
                        "认证请求被地区限制拦截。请开启系统代理并确认节点位于 ChatGPT 支持的地区后重试。"
                            .to_string()
                    } else {
                        "ChatGPT 登录已失效，请重新登录".to_string()
                    };
                    Ok(ProfileConnectionResult {
                        ok: false,
                        latency_ms,
                        status: Some(status.as_u16()),
                        error: Some(error),
                    })
                } else {
                    Ok(ProfileConnectionResult {
                        ok: false,
                        latency_ms,
                        status: Some(status.as_u16()),
                        error: Some(format!("接口返回 HTTP {status}")),
                    })
                }
            }
            Err(error) => {
                let status = error.status().map(|status| status.as_u16());
                Ok(ProfileConnectionResult {
                    ok: false,
                    latency_ms: None,
                    status,
                    error: Some(reqwest_error_message(&error)),
                })
            }
        }
    }

    /// 按供应商查询余额/用量：DeepSeek 查账户余额，MiniMax 查 Token Plan 剩余用量。
    /// 使用该供应商自己保存的 API 密钥，以配置为单位查询。
    pub async fn get_profile_balance(&self, id: &str) -> AppResult<ProfileBalance> {
        let stored = self.database.profile(id)?;
        let payload = &stored.payload;
        let provider = payload.provider_id.as_deref().unwrap_or_default();
        if provider != "deepseek" && provider != "minimax" {
            return Err(app_err!("该供应商不支持余额/用量查询"));
        }
        let body = payload
            .provider_body
            .as_deref()
            .ok_or_else(|| app_err!("该供应商缺少配置数据"))?;
        let detail = parse_provider_detail(body)?;
        let api_key = stored_provider_api_key(payload)
            .ok_or_else(|| app_err!("该供应商没有配置 API 密钥，无法查询余额/用量"))?;
        let client = http_client()?;
        let start = std::time::Instant::now();
        let base = detail
            .base_url
            .as_deref()
            .filter(|value| !value.trim().is_empty());
        match provider {
            "deepseek" => {
                query_deepseek_balance(
                    &client,
                    base.unwrap_or("https://api.deepseek.com"),
                    &api_key,
                    start,
                )
                .await
            }
            "minimax" => {
                query_minimax_balance(
                    &client,
                    base.unwrap_or("https://api.minimaxi.com/v1"),
                    &api_key,
                    start,
                )
                .await
            }
            _ => unreachable!(),
        }
    }

    /// 供应商级余额缓存：上次成功查询结果写入 ~/.cgswitch/balance-cache.json，
    /// 保证卡片首次渲染/切换视图时数字就在，不出现“消失→出现”的闪烁。
    pub fn set_profile_balance(
        &self,
        profile_id: &str,
        info: &ProfileBalanceInfo,
    ) -> AppResult<()> {
        let mut cache = self.load_balance_cache();
        cache.insert(profile_id.to_string(), info.clone());
        self.save_balance_cache(&cache)
    }

    pub(super) fn balance_cache_path(&self) -> PathBuf {
        self.paths.root.join("balance-cache.json")
    }

    pub(super) fn load_balance_cache(&self) -> BTreeMap<String, ProfileBalanceInfo> {
        std::fs::read_to_string(self.balance_cache_path())
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub(super) fn save_balance_cache(
        &self,
        cache: &BTreeMap<String, ProfileBalanceInfo>,
    ) -> AppResult<()> {
        let text = serde_json::to_string(cache)
            .map_err(|error| app_err!("余额缓存序列化失败: {error}"))?;
        atomic_write(&self.balance_cache_path(), text.as_bytes())
    }
}
