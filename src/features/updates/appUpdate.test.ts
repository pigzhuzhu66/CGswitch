import { describe, expect, it, vi } from "vitest";
import { relaunch } from "@tauri-apps/plugin-process";
import { toAppUpdate, UPDATED_VERSION_KEY } from "./appUpdate";

vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

describe("toAppUpdate", () => {
  it("只暴露版本号和安装动作", async () => {
    const store = new Map<string, string>();
    const events: string[] = [];
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => {
        events.push("mark");
        store.set(key, value);
      },
      removeItem: (key: string) => void store.delete(key),
    });
    const download = vi.fn(async () => { events.push("download"); });
    const install = vi.fn(async () => { events.push("install"); });
    vi.mocked(relaunch).mockClear();
    const update = toAppUpdate({ version: "0.10.5", download, install });

    expect(update.version).toBe("0.10.5");
    await update.install();
    expect(download).toHaveBeenCalledOnce();
    expect(install).toHaveBeenCalledOnce();
    expect(events).toEqual(["download", "mark", "install"]);
    expect(relaunch).toHaveBeenCalledOnce();
    // 安装成功后留下版本标记，重启回来据此弹「更新成功」通知
    expect(store.get(UPDATED_VERSION_KEY)).toBe("0.10.5");
  });
});
