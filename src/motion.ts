// 进出场变体（motion-v）。
// 关键规则：transition 必须写在「目标」变体上（center/exit）——Motion 从目标态读取
// 过渡参数；写在起始态（enter）上会被忽略，静默回落到默认的弹簧物理（弹跳抖动）。
export const pageVariants = {
  enter: { opacity: 0 },
  center: {
    opacity: 1,
    transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
  },
};

// 设置页分区（tab）切换变体：cc-switch 同款"缓升"——小位移 10px 上移 + 淡入，
// 0.3s + framer 默认曲线 [0.25, 0.1, 0.25, 1]（起步端也是柔的，"精调"感的来源）。
// 出场用更快的纯淡出：把节奏让给进场这个主角，tab 点击不拖沓。
export const riseVariants = {
  enter: { opacity: 0, y: 10 },
  center: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  },
};
