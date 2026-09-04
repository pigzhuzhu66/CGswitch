import { describe, expect, it } from "vitest";
import { updateFailureMessage } from "./updateText";

describe("updateFailureMessage", () => {
  it("将网络层错误转成系统代理提示", () => {
    expect(updateFailureMessage(new Error("error sending request for url"))).toBe(
      "无法连接 GitHub，请检查系统代理后重试",
    );
  });

  it("保留非网络错误的可读信息", () => {
    expect(updateFailureMessage(new Error("更新包签名无效"))).toBe("更新包签名无效");
  });
});
