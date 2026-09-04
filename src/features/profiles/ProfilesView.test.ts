// @ts-expect-error 测试运行于 Node，但应用的浏览器 tsconfig 不加载 Node 类型。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ProfilesView.tsx", import.meta.url), "utf8");

describe("ProfilesView 拖拽预览", () => {
  it("将拖拽浮层挂到 body，避免被页面 transform 容器偏移", () => {
    expect(source).toContain('import { createPortal } from "react-dom";');
    expect(source).toContain("createPortal(<DragOverlay");
    expect(source).toContain("document.body");
  });
});
