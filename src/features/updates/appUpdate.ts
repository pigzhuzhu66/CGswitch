import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "../../api";

export interface AppUpdate {
  version: string;
  install: () => Promise<void>;
}

/** 应用内更新安装成功后、重启前写入，下次启动读到即弹「更新成功」通知 */
export const UPDATED_VERSION_KEY = "cgswitch.updated-version";

export function toAppUpdate(update: Pick<Update, "version" | "download" | "install">): AppUpdate {
  return {
    version: update.version,
    install: async () => {
      await update.download();
      // Windows 的 install 成功启动安装器后会退出当前进程，标记必须在此之前落盘。
      localStorage.setItem(UPDATED_VERSION_KEY, update.version);
      try {
        await update.install();
      } catch (error) {
        localStorage.removeItem(UPDATED_VERSION_KEY);
        throw error;
      }
      // macOS / Linux 安装后不会自动重启，手动 relaunch；Windows 不会走到这里。
      await relaunch();
    },
  };
}

export async function checkForAppUpdate(): Promise<AppUpdate | null> {
  if (!isTauri) return null;
  const update = await check({ timeout: 30_000 });
  return update ? toAppUpdate(update) : null;
}
