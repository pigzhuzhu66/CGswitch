import { describe, expect, it } from "vitest";
import { normalizeToastMessage } from "./Feedback";

describe("normalizeToastMessage", () => {
  it("removes duplicated connection-failure prefixes", () => {
    expect(normalizeToastMessage("「供应商」连接失败：连接失败：浏览器跨域限制")).toBe("「供应商」连接失败：浏览器跨域限制");
    expect(normalizeToastMessage("Error: 连接失败：连接失败")).toBe("连接失败");
  });
});
