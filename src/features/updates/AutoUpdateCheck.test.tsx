// @ts-expect-error 测试运行于 Node，但应用的浏览器 tsconfig 不加载 Node 类型。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedbackProvider } from "../../app/Feedback";
import { AutoUpdateCheck } from "./AutoUpdateCheck";

const autoUpdateCheckSource = readFileSync(new URL("./AutoUpdateCheck.tsx", import.meta.url), "utf8");

describe("AutoUpdateCheck", () => {
  it("渲染为空节点，不产出任何 UI", () => {
    const bare = renderToStaticMarkup(<FeedbackProvider>{null}</FeedbackProvider>);
    const html = renderToStaticMarkup(
      <FeedbackProvider><AutoUpdateCheck enabled={true} /></FeedbackProvider>,
    );
    expect(html).toBe(bare);
  });

  it("用 ref 防重入，每次应用启动只检查一次", () => {
    expect(autoUpdateCheckSource).toContain("if (!enabled || checkedRef.current) return;");
    expect(autoUpdateCheckSource).not.toContain("}, [enabled]);");
  });

  it("发现新版仅提示不自动安装，失败静默", () => {
    expect(autoUpdateCheckSource).toContain("可在设置 → 关于中更新");
    expect(autoUpdateCheckSource).not.toContain("install()");
    expect(autoUpdateCheckSource).toContain('console.warn("自动检查更新失败');
  });
});
