import { check, type Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "../../api";

export interface AppUpdate {
  version: string;
  install: () => Promise<void>;
}

export function toAppUpdate(update: Pick<Update, "version" | "downloadAndInstall">): AppUpdate {
  return { version: update.version, install: () => update.downloadAndInstall() };
}

export async function checkForAppUpdate(): Promise<AppUpdate | null> {
  if (!isTauri) return null;
  const update = await check({ timeout: 30_000 });
  return update ? toAppUpdate(update) : null;
}
