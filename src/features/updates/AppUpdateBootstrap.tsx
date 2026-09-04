import { useEffect } from "react";
import { useFeedback } from "../../app/Feedback";
import { checkForAppUpdate } from "./appUpdate";
import { updateFailureMessage } from "./updateText";

export function AppUpdateBootstrap() {
  const feedback = useFeedback();

  useEffect(() => {
    void checkForAppUpdate().then(async (update) => {
      if (!update) return;
      if (!await feedback.confirm({ title: "发现新版本", description: `v${update.version}`, confirmText: "升级", cancelText: "稍后" })) return;
      feedback.info("正在下载并安装更新");
      try { await update.install(); } catch (error) { feedback.error(updateFailureMessage(error)); }
    }).catch(() => undefined);
  }, []);

  return null;
}
