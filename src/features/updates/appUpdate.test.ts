import { describe, expect, it, vi } from "vitest";
import { toAppUpdate } from "./appUpdate";

describe("toAppUpdate", () => {
  it("只暴露版本号和安装动作", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    const update = toAppUpdate({ version: "0.10.5", downloadAndInstall });

    expect(update.version).toBe("0.10.5");
    await update.install();
    expect(downloadAndInstall).toHaveBeenCalledOnce();
  });
});
