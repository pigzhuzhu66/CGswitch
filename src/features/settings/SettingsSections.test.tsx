// @ts-expect-error 测试运行于 Node，但应用的浏览器 tsconfig 不加载 Node 类型。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedbackProvider } from "../../app/Feedback";
import { SettingsAbout, SettingsGeneral, backupTitle, formatSize, formatTimestamp } from "./SettingsSections";
import type { Settings } from "../../types";

const settingsSectionsSource = readFileSync(new URL("./SettingsSections.tsx", import.meta.url), "utf8");

describe("SettingsSections", () => {
  it("formats backup titles", () => {
    expect(backupTitle("cg-backup-20260822-120000-000.db")).toBe("20260822-120000-000");
    expect(backupTitle("cgswitch-export-demo.db")).toBe("demo");
  });

  it("formats backup sizes", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1024 * 1024)).toBe("1.00 MB");
  });

  it("formats backup timestamps", () => {
    expect(formatTimestamp(0)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("provides a manual app update check in the about section", () => {
    const html = renderToStaticMarkup(
      <FeedbackProvider><SettingsAbout paths={[]} onOpenPath={() => undefined} openingPath={null} /></FeedbackProvider>,
    );
    expect(html).toContain("检查更新");
    expect(html).not.toContain("检查 GitHub 正式发布版本");
  });

  it("更新检查支持启动自动检查（可开关）与关于页手动触发并存", () => {
    const appShellPath = new URL("../../app/AppShell.tsx", import.meta.url);
    const autoCheckSource = readFileSync(appShellPath, "utf8");
    expect(autoCheckSource).toContain("<AutoUpdateCheck enabled={Boolean(state?.settings.auto_check_update)} />");
    expect(settingsSectionsSource).not.toContain("useEffect(() => { void checkUpdate(); }, []);");
  });

  it("检查更新用 ref 防重入，避免 StrictMode 双跑导致重复通知", () => {
    expect(settingsSectionsSource).toContain("if (checkingRef.current) return;");
    expect(settingsSectionsSource).not.toContain("if (checkingUpdate) return;");
  });

  it("通用设置区提供自动检查更新开关", () => {
    const form: Settings = { theme: "system", auto_restart: false, autostart_enabled: false, silent_start: false, minimize_to_tray: false, auto_check_update: true, auto_backup_interval_hours: 0, database_backup_keep_count: 5 };
    const html = renderToStaticMarkup(
      <FeedbackProvider><SettingsGeneral form={form} onPatch={() => undefined} /></FeedbackProvider>,
    );
    expect(html).toContain("自动检查更新");
    expect(html).toContain("发现后仅提示");
  });
});
