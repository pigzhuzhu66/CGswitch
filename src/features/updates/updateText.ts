export function updateFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/request|network|connect|timeout|proxy|dns/i.test(message)) {
    return "无法连接 GitHub，请检查系统代理后重试";
  }
  return message || "检查更新失败";
}
