<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { NButton, NModal } from "naive-ui";
import type { McpSyncDiffEntry, McpSyncPreview } from "../types";
import { mcpTransportText } from "../utils";

type SyncDirection = "live-to-db" | "db-to-live";
// 确认文案的一个片段；hl = 高亮 token（路径 / 段名 / 服务器名）
type ConfirmSeg = { text: string; hl?: boolean };
type ConfirmLine = { segs: ConfirmSeg[]; danger?: boolean };

const props = defineProps<{
  show: boolean;
  preview: McpSyncPreview | null;
  /** live 配置无法解析时的错误文本；非空进入“仅可从数据库恢复”降级模式。 */
  previewError: string;
  busy: boolean;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
  apply: [direction: SyncDirection];
}>();

// 弹窗内两步流：diff（看差异选方向）→ confirm（列出将要执行的操作）。
// 不用确认弹窗套差异弹窗——弹窗叠弹窗是公认反模式（阻断紧急出口、认知负担翻倍），
// 在同一弹窗内切换步骤（NN/g 与 Material 均推荐的单弹窗多步做法）。
const step = ref<"diff" | "confirm">("diff");
const pendingDirection = ref<SyncDirection | null>(null);
// 二次确认里的一行操作说明（分段渲染，关键变量高亮）；danger = 会丢失 live 侧数据
const pendingLines = ref<ConfirmLine[]>([]);
watch(
  () => props.show,
  (show) => {
    if (!show) {
      step.value = "diff";
      pendingDirection.value = null;
      pendingLines.value = [];
    }
  },
);

const modalTitle = computed(() => {
  if (step.value !== "confirm" || !pendingDirection.value) return "MCP 同步差异";
  if (pendingDirection.value === "db-to-live") {
    return props.previewError ? "确认：从镜像恢复" : "确认：写回 config.toml";
  }
  return "确认：更新数据库镜像";
});

const confirmButtonText = computed(() => {
  if (pendingDirection.value === "db-to-live") {
    return props.previewError ? "确认从镜像恢复" : "确认写回 config.toml";
  }
  return "确认更新数据库镜像";
});

// 展开明细的服务器名；预览数据更新后整体收起
const expandedNames = ref<Set<string>>(new Set());
watch(
  () => props.preview,
  () => {
    expandedNames.value = new Set();
  },
);

// 记录被点中的方向，只让那个按钮转 loading；同步结束后父组件把 busy 置回 false
const clickedDirection = ref<SyncDirection | null>(null);
watch(
  () => props.busy,
  (busy) => {
    if (!busy) clickedDirection.value = null;
  },
);

function toggleExpand(name: string) {
  const next = new Set(expandedNames.value);
  if (next.has(name)) {
    next.delete(name);
  } else {
    next.add(name);
  }
  expandedNames.value = next;
}

function apply(direction: SyncDirection) {
  // 服务器名逐个转高亮片段，名字之间用普通顿号分隔
  const nameSegs = (names: string[]): ConfirmSeg[] =>
    names.flatMap((name, index) =>
      (index ? [{ text: "、" } as ConfirmSeg] : []).concat({ text: name, hl: true }),
    );
  const backupLine: ConfirmLine = {
    segs: [
      { text: "执行前会自动备份 " },
      { text: "~/.codex/config.toml", hl: true },
      { text: "。" },
    ],
  };
  const lines: ConfirmLine[] = [];
  const preview = props.preview;
  if (!preview) {
    // 降级模式（live 无法解析）：只能按镜像整段重建
    lines.push({ segs: [{ text: "该文件当前无法解析，将按镜像重建整个 MCP 段。" }] });
    lines.push(backupLine);
  } else {
    // 按差异类型归组服务器名，确认文案直接点名（比台数更可判读）
    const namesOf = (kind: McpSyncDiffEntry["kind"]) =>
      preview.entries.filter((entry) => entry.kind === kind).map((entry) => entry.name);
    const added = namesOf("live_only");
    const missing = namesOf("db_only");
    const changed = namesOf("changed");
    if (direction === "db-to-live") {
      if (added.length)
        lines.push({ segs: [{ text: "删除外部新增的服务器：" }, ...nameSegs(added)], danger: true });
      if (missing.length)
        lines.push({ segs: [{ text: "恢复缺失的服务器：" }, ...nameSegs(missing)] });
      if (changed.length)
        lines.push({ segs: [{ text: "恢复被改动的服务器为镜像内容：" }, ...nameSegs(changed)] });
      lines.push(backupLine);
    } else {
      if (added.length)
        lines.push({ segs: [{ text: "把外部新增的服务器纳入镜像：" }, ...nameSegs(added)] });
      if (changed.length)
        lines.push({ segs: [{ text: "用当前值更新被改动的镜像条目：" }, ...nameSegs(changed)] });
      if (missing.length)
        lines.push({ segs: [{ text: "删除配置文件中已不存在的镜像条目：" }, ...nameSegs(missing)] });
    }
  }
  pendingLines.value = lines;
  pendingDirection.value = direction;
  step.value = "confirm";
}

// 第二步点「确认」才真正执行；返回则回到差异明细
function confirmNow() {
  if (!pendingDirection.value) return;
  clickedDirection.value = pendingDirection.value;
  emit("apply", pendingDirection.value);
}

function goBack() {
  if (props.busy) return;
  step.value = "diff";
  pendingDirection.value = null;
}

function onShowChange(value: boolean) {
  if (props.busy) return;
  emit("update:show", value);
}

// 建模字段的中文名（与 Rust 侧 mcp_sync_preview 输出的字段一一对应）
const fieldLabels: Record<string, string> = {
  enabled: "启用状态",
  startup_timeout_sec: "启动超时秒",
  tool_timeout_sec: "工具超时秒",
  command: "启动命令",
  args: "启动参数",
  env: "环境变量",
  url: "服务地址",
  bearer_token_env_var: "令牌环境变量",
  http_headers: "HTTP 头",
  env_http_headers: "环境变量 HTTP 头",
};

function fieldValueText(value: unknown) {
  if (value === null) return "未设置";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// 差异标签以数据库镜像（静态基准）为基准描述 live 的偏离：
// 镜像有 live 没有 = 配置文件缺失；live 有镜像没有 = 应用外部新增；其余为内容被外部改动
function kindText(entry: McpSyncDiffEntry) {
  if (entry.kind === "live_only") return "外部新增";
  if (entry.kind === "db_only") return "配置文件缺失";
  return entry.unmodeled_only ? "仅格式差异" : "内容被修改";
}

function kindChipClass(entry: McpSyncDiffEntry) {
  if (entry.kind === "live_only" || entry.unmodeled_only) {
    return "apple-chip chip-warn";
  }
  return "apple-chip chip-danger";
}

function transportTextOf(entry: McpSyncDiffEntry) {
  return mcpTransportText(entry.live_spec ?? entry.db_spec);
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="max-w-[560px]"
    :title="modalTitle"
    @update:show="onShowChange"
  >
    <!-- 第二步：执行确认——同一弹窗内切换步骤，不另开确认弹窗（避免弹窗叠弹窗） -->
    <div v-if="step === 'confirm'" class="space-y-3">
      <p class="text-sm">
        <template v-if="pendingDirection === 'db-to-live'"
          >即将用数据库镜像覆写 <code class="mono code-tok">~/.codex/config.toml</code> 的
          <code class="mono code-tok">[mcp_servers]</code> 段：</template
        >
        <template v-else
          >即将用 <code class="mono code-tok">~/.codex/config.toml</code> 的
          <code class="mono code-tok">[mcp_servers]</code> 段覆写数据库镜像：</template
        >
      </p>
      <ul class="space-y-1.5">
        <li
          v-for="(line, index) in pendingLines"
          :key="index"
          class="text-sm leading-relaxed"
          :class="
            line.danger
              ? 'font-semibold text-red-600 dark:text-red-400'
              : 'text-zinc-600 dark:text-zinc-300'
          "
        >
          <template v-for="(seg, segIndex) in line.segs" :key="segIndex">
            <code v-if="seg.hl" class="mono code-tok">{{ seg.text }}</code>
            <template v-else>{{ seg.text }}</template>
          </template>
        </li>
      </ul>
    </div>
    <!-- 降级模式：live 无法解析，无法对比，只能从数据库镜像恢复 -->
    <div v-else-if="previewError" class="space-y-3">
      <p class="muted text-sm">{{ previewError }}</p>
      <p class="muted text-sm">
        配置文件当前无法解析，无法对比差异；可从数据库镜像恢复（写前自动备份原文件）。
      </p>
    </div>
    <!-- 正常模式：body 只放摘要与差异列表（列表自身滚动），操作区固定在卡片 footer -->
    <div v-else-if="preview" class="space-y-3">
      <div class="flex flex-wrap gap-2">
        <span class="apple-chip">
          配置文件 <span class="font-semibold">{{ preview.live_count }} 台</span>
        </span>
        <span class="apple-chip">
          数据库镜像 <span class="font-semibold">{{ preview.db_count }} 台</span>
        </span>
        <span class="apple-chip">
          差异 <span class="font-semibold">{{ preview.entries.length }} 项</span>
        </span>
      </div>
      <div class="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
        <div v-for="entry in preview.entries" :key="entry.name" class="apple-group">
          <button
            type="button"
            class="flex w-full items-center gap-2 bg-black/4 px-3 py-2.5 text-left transition-colors hover:bg-black/4 dark:bg-white/6 dark:hover:bg-white/6"
            :aria-expanded="expandedNames.has(entry.name)"
            @click="toggleExpand(entry.name)"
          >
            <span class="flex min-w-0 flex-1 items-center gap-2">
              <span :class="kindChipClass(entry)" class="shrink-0">{{ kindText(entry) }}</span>
              <span class="truncate text-[var(--font-size-base)] font-semibold">{{ entry.name }}</span>
              <span class="shrink-0 rounded-md bg-black/5 px-1.5 py-px text-[10px] font-medium tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                {{ transportTextOf(entry) }}
              </span>
            </span>
            <span class="muted shrink-0 text-xs">{{ expandedNames.has(entry.name) ? "收起" : "查看明细" }}</span>
          </button>
          <div
            v-if="expandedNames.has(entry.name)"
            class="mono space-y-1 border-t border-[var(--panel-divider)] bg-black/4 p-3 text-[11px] leading-relaxed break-all dark:bg-white/6"
          >
            <div v-if="entry.changed_fields.length" class="space-y-1">
              <div v-for="diff in entry.changed_fields" :key="diff.field">
                {{ fieldLabels[diff.field] ?? diff.field }}：镜像 {{ fieldValueText(diff.db) }} →
                当前 {{ fieldValueText(diff.live) }}
              </div>
            </div>
            <p v-else-if="entry.unmodeled_only">建模字段全部相同，差异只在注释 / 格式 / 未建模键。</p>
            <p v-else class="whitespace-pre-wrap">{{ entry.live_toml ?? entry.db_toml }}</p>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="space-y-2">
        <p v-if="!previewError && step === 'diff'" class="muted text-xs">
          差异以数据库镜像为基准，明细中「镜像 X → 当前
          Y」表示配置文件相对镜像的改动。保留外部改动选「更新数据库」（用 config.toml
          覆盖镜像）；恢复缺失或被改的服务器选「写回配置文件」（用镜像覆盖
          config.toml，写前自动备份当前文件）。
        </p>
        <div v-if="step === 'confirm'" class="flex items-center justify-end gap-2">
          <n-button :disabled="busy" @click="goBack">
            {{ previewError ? "返回" : "返回差异" }}
          </n-button>
          <n-button
            type="primary"
            :disabled="busy"
            :loading="busy && clickedDirection === pendingDirection"
            @click="confirmNow"
          >
            {{ confirmButtonText }}
          </n-button>
        </div>
        <div
          v-else
          class="dialog-actions grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"
        >
          <n-button class="shrink-0" :disabled="busy" @click="onShowChange(false)">取消</n-button>
          <n-button
            v-if="!previewError"
            secondary
            :disabled="busy"
            :loading="busy && clickedDirection === 'db-to-live'"
            @click="apply('db-to-live')"
          >
            写回配置文件
          </n-button>
          <n-button
            type="primary"
            :disabled="busy"
            :loading="busy && clickedDirection === 'live-to-db'"
            @click="apply(previewError ? 'db-to-live' : 'live-to-db')"
          >
            {{ previewError ? "从数据库恢复" : "更新数据库" }}
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>
