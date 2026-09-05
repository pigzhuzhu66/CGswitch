import { useEffect, useRef } from "react";
import { useFeedback } from "../../app/Feedback";
import { checkForAppUpdate } from "./appUpdate";
import { updateFailureMessage } from "./updateText";

/** 启动时静默检查一次更新：发现新版仅提示（不自动下载安装），失败与已最新均不打扰。 */
export function AutoUpdateCheck({ enabled }: { enabled: boolean }) {
  const feedback = useFeedback();
  // StrictMode 下 effect 双跑共用实例，用 ref 保证每次应用启动只检查一次
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!enabled || checkedRef.current) return;
    checkedRef.current = true;
    void checkForAppUpdate()
      .then((update) => {
        // 安装入口仍是设置 → 关于，避免启动时偷偷下载
        if (update) feedback.info(`发现新版本 v${update.version}，可在设置 → 关于中更新`);
      })
      .catch((error) => console.warn("自动检查更新失败：", updateFailureMessage(error)));
  }, [enabled, feedback]);

  return null;
}
