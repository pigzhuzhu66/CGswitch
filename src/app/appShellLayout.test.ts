// @ts-expect-error 测试运行于 Node，但应用的浏览器 tsconfig 不加载 Node 类型。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");

describe("AppShell 布局", () => {
  it("保持侧栏导航紧贴品牌区，并让设置按钮锚定底部", () => {
    expect(source).toContain("apple-sidebar relative h-full shrink-0");
    expect(source).toContain('className="relative mx-1.5 mt-3 space-y-1"');
    expect(source).toContain('className="absolute inset-x-1.5 bottom-4"');
  });

  it("让窗口控制区与主卡片仅保留微小间隙", () => {
    expect(styles).toContain("--window-chrome-height: 1.875rem;");
    expect(styles).toContain("margin: 0.125rem 0.3125rem 0.3125rem 0.375rem;");
  });

  it("将通知条与页面顶部操作按钮对齐", () => {
    expect(styles).toContain(".app-toast-viewport {\n  position: fixed;\n  top: 2.5rem;");
  });
});
