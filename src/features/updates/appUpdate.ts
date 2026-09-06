import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "../../api";

export interface AppUpdate {
  version: string;
  install: () => Promise<void>;
}

/** 应用内更新安装成功后、重启前写入，下次启动读到即弹「更新成功」通知 */
export const UPDATED_VERSION_KEY = "cgswitch.updated-version";

export function toAppUpdate(update: Pick<Update, "version" | "downloadAndInstall">): AppUpdate {
  // macOS 的 downloadAndInstall 只替换 .app 不重启，装完手动 relaunch
  return {
    version: update.version,
    install: async () => {
      await update.downloadAndInstall();
      // localStorage 同步落盘且升级不清理 WebView 数据，重启后可读到
      localStorage.setItem(UPDATED_VERSION_KEY, update.version);
      await relaunch();
    },
  };
}

export async function checkForAppUpdate(): Promise<AppUpdate | null> {
  if (!isTauri) return null;
  const update = await check({ timeout: 30_000 });
  return update ? toAppUpdate(update) : null;
}
