import { describe, expect, it, vi } from "vitest";
import { toAppUpdate, UPDATED_VERSION_KEY } from "./appUpdate";

vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

describe("toAppUpdate", () => {
  it("只暴露版本号和安装动作", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => void store.set(key, value),
    });
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    const update = toAppUpdate({ version: "0.10.5", downloadAndInstall });

    expect(update.version).toBe("0.10.5");
    await update.install();
    expect(downloadAndInstall).toHaveBeenCalledOnce();
    // 安装成功后留下版本标记，重启回来据此弹「更新成功」通知
    expect(store.get(UPDATED_VERSION_KEY)).toBe("0.10.5");
  });
});
