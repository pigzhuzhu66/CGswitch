import { Check, Copy, ExternalLink, KeyRound, Monitor, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { useFeedback } from "../../app/Feedback";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { balanceChipClass } from "../../presets";
import type { AuthStatus, DeviceCodeResponse, ProfileBalanceInfo } from "../../types";

const authQuotaCache = new Map<string, ProfileBalanceInfo>();

function authQuotaCacheKey(source: "desktop" | "oauth", accountId?: string) {
  return `auth:${source}:${accountId ?? "codex-external"}`;
}

function formatQuotaReset(resetAt?: number | null) {
  if (resetAt == null) return null;
  return `重置时间：${new Date(resetAt).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" })}`;
}

function quotaTitle(label: string) {
  return label === "7天" ? "每周使用限额" : `${label}使用限额`;
}

function QuotaProgressBar({ label, usedPercent, resetAt, onRefresh, loading }: { label: string; usedPercent: number; resetAt?: number | null; onRefresh?: () => void; loading?: boolean }) {
  const used = Math.min(100, Math.max(0, usedPercent));
  const remaining = 100 - used;
  const fillClass = used >= 90 ? "bg-(--danger)" : used >= 70 ? "bg-(--warning)" : "bg-(--chip-success)";
  const reset = formatQuotaReset(resetAt);
  return <div className="grid min-w-0 grid-cols-1 items-center gap-2 text-xs sm:grid-cols-[14rem_minmax(0,1fr)_auto] sm:gap-6">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="field-label">{quotaTitle(label)}</span>
        {onRefresh ? <button type="button" className="apple-icon-button h-5 w-5 text-[var(--text-secondary)] hover:bg-(--profile-chip-bg) hover:text-accent" disabled={loading} title="刷新额度" aria-label="刷新额度" onClick={onRefresh}>{loading ? <LoadingSpinner /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />}</button> : null}
      </div>
      {reset ? <div className="meta-xs mt-0.5 muted">{reset}</div> : null}
    </div>
    <div className="flex min-w-0 items-center">
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/6 dark:bg-white/8" role="progressbar" aria-label={`${quotaTitle(label)}剩余`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={remaining}>
        <span className={`block h-full rounded-full transition-[width] duration-300 ${fillClass}`} style={{ width: `${remaining}%` }} />
      </div>
    </div>
    <span className="meta-xs shrink-0 whitespace-nowrap">剩余 <span className={`font-semibold ${balanceChipClass(used, false)}`}>{remaining}%</span></span>
  </div>;
}

function AccountQuota({ source, accountId, cachedBalance }: { source: "desktop" | "oauth"; accountId?: string; cachedBalance?: ProfileBalanceInfo }) {
  const cacheKey = authQuotaCacheKey(source, accountId);
  const [quota, setQuota] = useState<ProfileBalanceInfo | null>(() => authQuotaCache.get(cacheKey) ?? cachedBalance ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await api.authGetQuota(source, accountId);
      const info = result.balance_infos[0];
      if (!info) throw new Error("额度查询未返回数据");
      setQuota(info);
      authQuotaCache.set(cacheKey, info);
      // 复用现有持久化余额缓存，只用 auth 命名空间隔离账号。
      void api.setProfileBalance(cacheKey, info);
      setError("");
    } catch (cause) {
      setQuota(null);
      authQuotaCache.delete(cacheKey);
      setError(String(cause));
    }
    finally { setLoading(false); }
  };

  useEffect(() => {
    setQuota(authQuotaCache.get(cacheKey) ?? cachedBalance ?? null);
    void refresh();
    // Cache identity changes are the only reload trigger; refresh keeps the latest value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const primaryLabel = quota?.usage_label ?? "额度";
  const weeklyLabel = quota?.weekly_label ?? "周期";

  return <div className="mt-3 border-t border-[var(--panel-divider)] pt-2">{quota?.usage_percent != null ? <div className="space-y-2"><QuotaProgressBar label={primaryLabel} usedPercent={quota.usage_percent} resetAt={quota.usage_reset_at} onRefresh={() => void refresh()} loading={loading} />{quota.weekly_usage_percent != null ? <QuotaProgressBar label={weeklyLabel} usedPercent={quota.weekly_usage_percent} resetAt={quota.weekly_reset_at} /> : null}</div> : <p className={`mt-1 text-xs ${error ? "text-[var(--danger)]" : "muted"}`}>{error ? "额度查询失败" : "正在查询额度…"}</p>}</div>;
}

export default function ChatGPTAccount({ initialStatus, balanceCache }: { initialStatus: AuthStatus; balanceCache?: Record<string, ProfileBalanceInfo> }) {
  const feedback = useFeedback();
  const [status, setStatus] = useState(initialStatus);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState<DeviceCodeResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const disposed = useRef(false);
  const pollCancelled = useRef(false);
  const copyResetTimer = useRef<number | undefined>(undefined);

  const refreshStatus = async () => {
    try { const next = await api.authGetStatus(); if (!disposed.current) { setStatus(next); setLoadError(""); } }
    catch (error) { if (!disposed.current) setLoadError(String(error)); }
  };
  useEffect(() => { disposed.current = false; void refreshStatus(); return () => { disposed.current = true; if (copyResetTimer.current !== undefined) window.clearTimeout(copyResetTimer.current); }; }, []);
  useEffect(() => setStatus(initialStatus), [initialStatus]);

  const poll = async (current: DeviceCodeResponse) => {
    try {
      const deadline = Date.now() + current.expires_in * 1000;
      while (!disposed.current && !pollCancelled.current && Date.now() < deadline) {
        const account = await api.authPollForAccount(current.device_code);
        if (account) { setLogin(null); await refreshStatus(); feedback.success("ChatGPT 账号已添加，可在配置中选择"); break; }
        await new Promise((resolve) => window.setTimeout(resolve, current.interval * 1000));
      }
    } catch (error) { if (!disposed.current) { feedback.error(String(error)); setLogin(null); } }
    finally { if (!disposed.current) setBusy(false); }
  };

  const startLogin = async () => {
    if (busy) return;
    setBusy(true); setLogin(null); setCopied(false); pollCancelled.current = false;
    try { const next = await api.authStartLogin(); setLogin(next); await api.openUrl(next.verification_uri); void poll(next); }
    catch (error) { const text = String(error); feedback.error(text.includes("unsupported_country_region_territory") ? "认证请求被地区限制拦截。请开启系统代理并确认节点位于 ChatGPT 支持的地区后重试。" : text); setBusy(false); }
  };

  const copyUserCode = async () => {
    if (!login) return;
    try {
      await navigator.clipboard.writeText(login.user_code);
      setCopied(true);
      if (copyResetTimer.current !== undefined) window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch { feedback.error("复制失败，请手动选择复制"); }
  };

  const removeAccount = async (accountId: string) => {
    if (!await feedback.confirm({ title: "移除订阅账号", description: "确定移除该 ChatGPT 订阅账号吗？移除后本机将清除该账号的登录凭据。", confirmText: "移除", destructive: true })) return;
    try { await api.authRemoveAccount(accountId); feedback.success("账号已移除"); await refreshStatus(); }
    catch (error) { feedback.error(String(error)); }
  };

  if (login) return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><ShieldCheck className="h-[18px] w-[18px]" strokeWidth={2} /></span>
          <div><div className="setting-title">ChatGPT 设备码登录</div><p className="setting-description mt-0.5">请在浏览器完成 ChatGPT 登录，应用会自动继续。</p></div>
        </div>
        <span className="apple-chip chip-warn" role="status"><LoadingSpinner />等待授权中...</span>
      </div>
      <div className="rounded-[var(--radius-card)] bg-accent/6 p-4 shadow-[0_0_0_1px_var(--panel-ring)] dark:bg-accent/10">
        <div className="text-center">
          <div className="field-label">授权码：请在浏览器中输入此码</div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <code className="mono whitespace-nowrap rounded-lg bg-black/8 px-4 py-2 text-2xl font-bold tracking-[0.3em] dark:bg-white/8">{login.user_code}</code>
            <button type="button" className={`grid h-8 w-8 place-items-center rounded-full ${copied ? "bg-success/10 text-success" : "text-accent hover:bg-(--profile-chip-bg)"}`} title={copied ? "已复制" : "复制授权码"} aria-label={copied ? "授权码已复制" : "复制授权码"} onClick={() => void copyUserCode()}>{copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={2} />}</button>
          </div>
        </div>
        <div className="mt-3 border-t border-[var(--panel-border)] pt-3 text-center"><div className="muted text-xs">授权页面</div><button type="button" className="mt-1 flex w-full min-w-0 items-center justify-center gap-1.5 text-sm font-medium text-accent hover:underline" title={login.verification_uri} onClick={() => void api.openUrl(login.verification_uri)}><span className="truncate">{login.verification_uri}</span><ExternalLink className="h-4 w-4 shrink-0" strokeWidth={2} /></button></div>
        <div className="mt-4 flex justify-center"><button type="button" className="apple-action-button" onClick={() => { pollCancelled.current = true; setLogin(null); setBusy(false); }}>取消登录</button></div>
      </div>
    </div>
  );

  if (status.authenticated) return (
    <div className="space-y-4">
      {status.external ? <div className="rounded-[var(--radius-card)] bg-(--input-bg) p-3 shadow-[0_0_0_1px_var(--panel-ring)]"><div className="flex items-center gap-3"><Monitor className="h-5 w-5 shrink-0 text-accent" strokeWidth={2} /><div className="min-w-0"><div className="setting-title">Codex 登录</div><span className="mono mt-0.5 block truncate text-sm font-medium">{status.external.login}</span></div></div><AccountQuota source="desktop" accountId={status.external.id} cachedBalance={balanceCache?.[authQuotaCacheKey("desktop", status.external.id)]} /></div> : null}
      {status.accounts.length ? <div className="space-y-2">{status.accounts.map((account) => <div key={account.id} className="rounded-[var(--radius-card)] bg-(--input-bg) p-3 shadow-[0_0_0_1px_var(--panel-ring)]"><div className="flex items-center gap-3"><KeyRound className="h-5 w-5 shrink-0 text-accent" strokeWidth={2} /><div className="min-w-0 flex-1"><div className="setting-title">OAuth 设备码登录</div><span className="mono mt-0.5 block truncate text-sm font-medium">{account.login}</span></div><button type="button" className="apple-action-button text-[var(--danger)]" onClick={() => void removeAccount(account.id)}>移除</button></div><AccountQuota source="oauth" accountId={account.id} cachedBalance={balanceCache?.[authQuotaCacheKey("oauth", account.id)]} /></div>)}</div> : null}
      <button type="button" className="apple-action-button" disabled={busy} onClick={() => void startLogin()}><Plus className="h-4 w-4" strokeWidth={2} />添加其他账号</button>
    </div>
  );

  return <div><div className="rounded-[var(--radius-card)] border border-[var(--panel-border)] bg-black/2 p-3 dark:bg-white/4"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><ShieldCheck className="h-[18px] w-[18px]" strokeWidth={2} /></span><div><div className="setting-title">尚未连接 ChatGPT</div><p className="setting-description mt-0.5">登录后可管理多个 ChatGPT 账号。</p></div></div><div className="mt-4"><button type="button" className="apple-action-button app-button--primary" disabled={busy} onClick={() => void startLogin()}><ExternalLink className="h-4 w-4" strokeWidth={2} />使用 ChatGPT 登录</button></div></div>{loadError ? <p className="muted mt-3 text-sm">{loadError}</p> : null}</div>;
}
