import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpCircle, LoaderCircle } from "lucide-react";
import { useFeedback } from "../../app/Feedback";
import { AppDialog } from "../../components/AppDialog";
import { checkForAppUpdate, type AppUpdate } from "./appUpdate";
import { updateFailureMessage } from "./updateText";

interface AppUpdateContextValue {
  /** 已发现的可用更新；null 表示已是最新或尚未检查 */
  update: AppUpdate | null;
  checking: boolean;
  installing: boolean;
  /** 检查更新：结果写入 context（横幅随之出现），失败时抛错由调用方决定是否提示 */
  check: () => Promise<AppUpdate | null>;
  /** 用户点击升级后才执行：下载安装并重启 */
  install: () => Promise<void>;
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function useAppUpdate() {
  const value = useContext(AppUpdateContext);
  if (!value) throw new Error("useAppUpdate 必须在 AppUpdateProvider 内使用");
  return value;
}

export function AppUpdateProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const feedback = useFeedback();
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  // StrictMode 下 effect 双跑共用同一组件实例，state 守卫两次都读到旧值，必须用 ref 防重入
  const autoCheckedRef = useRef(false);
  const checkingRef = useRef(false);

  const check = useCallback(async (): Promise<AppUpdate | null> => {
    if (checkingRef.current) return update;
    checkingRef.current = true;
    setChecking(true);
    try {
      const found = await checkForAppUpdate();
      setUpdate(found);
      return found;
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [update]);

  // 启动时静默检查一次：发现新版只让侧边栏横幅出现，不弹窗、不自动下载
  useEffect(() => {
    if (!enabled || autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    void check().catch((error) => console.warn("自动检查更新失败：", updateFailureMessage(error)));
  }, [enabled, check]);

  const install = useCallback(async () => {
    if (!update || installing) return;
    setInstalling(true);
    try {
      await update.install();
    } catch (error) {
      feedback.error(updateFailureMessage(error));
    } finally {
      setInstalling(false);
    }
  }, [update, installing, feedback]);

  return <AppUpdateContext.Provider value={{ update, checking, installing, check, install }}>{children}</AppUpdateContext.Provider>;
}

/** 侧边栏更新横幅（设置按钮上方）+ 点击后的升级确认弹窗；无可用更新时不渲染。 */
export function UpdateNotice({ collapsed }: { collapsed: boolean }) {
  const { update, installing, install } = useAppUpdate();
  const [open, setOpen] = useState(false);
  if (!update) return null;
  return (
    <>
      <button type="button" className="update-notice-button" title={`发现新版本 v${update.version}`} onClick={() => setOpen(true)}>
        <ArrowUpCircle strokeWidth={2} aria-hidden="true" />
        <span className="apple-sidebar-label" aria-hidden={collapsed}>新版本 v{update.version}</span>
        {collapsed ? <span className="apple-sidebar-flyout" aria-hidden="true">发现新版本 v{update.version}</span> : null}
      </button>
      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title="发现新版本"
        footer={
          <>
            <button type="button" className="apple-action-button" onClick={() => setOpen(false)}>稍后</button>
            <button type="button" className="apple-action-button app-button--primary" disabled={installing} onClick={() => void install()}>
              {installing ? <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" /> : null}
              {installing ? "正在下载安装…" : `升级到 v${update.version}`}
            </button>
          </>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">检测到新版本 v{update.version}，升级将下载安装并自动重启应用。</p>
      </AppDialog>
    </>
  );
}
