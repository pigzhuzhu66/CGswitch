import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "../../api";

export interface AppUpdate {
  version: string;
  install: () => Promise<void>;
}

export function toAppUpdate(update: Pick<Update, "version" | "downloadAndInstall">): AppUpdate {
  // macOS 的 downloadAndInstall 只替换 .app 不重启，装完手动 relaunch
  return {
    version: update.version,
    install: async () => {
      await update.downloadAndInstall();
      await relaunch();
    },
  };
}

export async function checkForAppUpdate(): Promise<AppUpdate | null> {
  if (!isTauri) return null;
  const update = await check({ timeout: 30_000 });
  return update ? toAppUpdate(update) : null;
}
