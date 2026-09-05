// @ts-expect-error 测试运行于 Node，但应用的浏览器 tsconfig 不加载 Node 类型。
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedbackProvider } from "../../app/Feedback";
import { AppUpdateProvider, UpdateNotice } from "./AppUpdateProvider";

const providerSource = readFileSync(new URL("./AppUpdateProvider.tsx", import.meta.url), "utf8");

const render = (enabled: boolean) => renderToStaticMarkup(
  <FeedbackProvider>
    <AppUpdateProvider enabled={enabled}>
      <UpdateNotice collapsed={false} />
    </AppUpdateProvider>
  </FeedbackProvider>,
);

describe("AppUpdateProvider", () => {
  it("未发现更新时横幅不产出任何 UI", () => {
    expect(render(true)).toBe(render(false));
    expect(render(true)).not.toContain("新版本 v");
  });

  it("启动自动检查静默进行：发现新版只更新状态（横幅出现），失败只写 console", () => {
    expect(providerSource).toContain('console.warn("自动检查更新失败');
    expect(providerSource).not.toContain("feedback.info");
    expect(providerSource).toContain("autoCheckedRef.current = true");
  });

  it("升级必须由用户点击「升级到 v…」触发，安装失败走 toast", () => {
    expect(providerSource).toContain(`升级到 v${"${update.version}"}`);
    expect(providerSource).toContain("feedback.error(updateFailureMessage(error))");
    expect(providerSource).not.toContain("downloadAndInstall");
  });
});
