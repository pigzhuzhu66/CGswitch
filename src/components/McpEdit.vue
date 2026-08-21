<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch, type Ref } from "vue";
import { NButton, NCollapse, NCollapseItem, NDynamicInput, NInput, NInputNumber, NSelect, useMessage } from "naive-ui";
import { api } from "../api";
import type { EditorDiagnosticSummary, McpServerSpec } from "../types";
import { PhArrowLeft, PhFloppyDisk } from "@phosphor-icons/vue";

// CodeMirror 编辑器按需加载：只在打开编辑页时拉取，不进主包（同 ProfileEdit 模式）
const ConfigTextEditor = defineAsyncComponent(() => import("./ConfigTextEditor.vue"));

const props = defineProps<{ server: McpServerSpec | null; create?: boolean }>();
const emit = defineEmits<{ back: [] }>();

const message = useMessage();
const creating = computed(() => props.create);

const name = ref(props.server?.name ?? "");
const transport = ref<"stdio" | "http">(props.server?.url ? "http" : "stdio");
const command = ref(props.server?.command ?? "");
const argsText = ref((props.server?.args ?? []).join("\n"));
const url = ref(props.server?.url ?? "");
const bearer = ref(props.server?.bearer_token_env_var ?? "");
const startupTimeout = ref<number | null>(props.server?.startup_timeout_sec ?? null);
const toolTimeout = ref<number | null>(props.server?.tool_timeout_sec ?? null);

interface KVPair {
  key: string;
  value: string;
}

function recordToPairs(record: Record<string, string>): KVPair[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

function pairsToRecord(pairs: KVPair[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const pair of pairs) {
    const key = pair.key.trim();
    if (key) record[key] = pair.value.trim();
  }
  return record;
}

const envPairs = ref<KVPair[]>(recordToPairs(props.server?.env ?? {}));
const headerPairs = ref<KVPair[]>(recordToPairs(props.server?.http_headers ?? {}));
const envHeaderPairs = ref<KVPair[]>(recordToPairs(props.server?.env_http_headers ?? {}));

const transportOptions = [
  { label: "本地进程 (STDIO)", value: "stdio" },
  { label: "远程服务 (HTTP)", value: "http" },
];

const saving = ref(false);

// —— TOML 编辑器与表单实时双向同步（改表单 → 写回编辑器；改编辑器 → 回填表单）——
const tomlText = ref("");
const editorDiagnostics = ref<EditorDiagnosticSummary>({ count: 0, firstLine: null });
const formatting = ref(false);
const activeEditor = ref<{ focusFirstDiagnostic: () => void } | null>(null);
// 初始装载完成后才开启同步，避免装载期间互相触发（同 ProfileEdit）
let initialized = false;
// 未保存改动标识（标签旁的圆点，同 ProfileEdit 的 tab 圆点）：
// 表单改动会实时写进片段，比较片段文本即可覆盖表单与编辑器两侧
const initialToml = ref("");
const normalizeNewlines = (text: string) => text.replace(/\r\n/g, "\n");
const dirty = computed(
  () => initialized && normalizeNewlines(tomlText.value) !== normalizeNewlines(initialToml.value),
);
// 异步 IPC 时序守卫：旧请求结果晚到时直接丢弃
let patchSeq = 0;
let parseSeq = 0;

function handleEditorDiagnostics(summary: EditorDiagnosticSummary) {
  editorDiagnostics.value = summary;
}

function jumpToFirstDiagnostic() {
  activeEditor.value?.focusFirstDiagnostic();
}

// 表单当前值 → McpServerSpec（保存与"表单 → 编辑器"同步共用同一构造）
function formSpec(): McpServerSpec {
  return {
    name: name.value.trim() || "server",
    enabled: props.server?.enabled ?? null,
    startup_timeout_sec: startupTimeout.value,
    tool_timeout_sec: toolTimeout.value,
    command: transport.value === "stdio" ? command.value.trim() || null : null,
    args: transport.value === "stdio" ? argsList() : [],
    env: transport.value === "stdio" ? pairsToRecord(envPairs.value) : {},
    url: transport.value === "http" ? url.value.trim() || null : null,
    bearer_token_env_var: transport.value === "http" ? bearer.value.trim() || null : null,
    http_headers: transport.value === "http" ? pairsToRecord(headerPairs.value) : {},
    env_http_headers: transport.value === "http" ? pairsToRecord(envHeaderPairs.value) : {},
  };
}

// 表单 → 编辑器：把建模字段写进片段（未建模键/注释由 Rust 侧 toml_edit 保留）
async function syncFormToToml() {
  const seq = ++patchSeq;
  try {
    const next = await api.patchMcpFragment(tomlText.value, formSpec());
    if (seq === patchSeq && next !== tomlText.value) tomlText.value = next;
  } catch {
    // 片段被手动改成非法 TOML 时跳过本次回写，等表单下一次变更
  }
}

// 编辑器 → 表单：解析片段回填（语法不完整时保留表单当前值）
async function syncTomlToForm() {
  const seq = ++parseSeq;
  try {
    const spec = await api.parseMcpFragment(tomlText.value);
    if (seq === parseSeq) applySpecToForm(spec);
  } catch {
    // 输入进行中的中间态，忽略
  }
}

// 片段字段回填；Vue ref 对相同基础值不会触发更新，数组仍需比较内容
function applySpecToForm(spec: McpServerSpec) {
  if (/^[A-Za-z0-9_-]+$/.test(spec.name) && spec.name !== name.value) {
    name.value = spec.name;
  }
  transport.value = spec.url ? "http" : "stdio";
  command.value = spec.command ?? "";
  argsText.value = spec.args.join("\n");
  url.value = spec.url ?? "";
  bearer.value = spec.bearer_token_env_var ?? "";
  startupTimeout.value = spec.startup_timeout_sec;
  toolTimeout.value = spec.tool_timeout_sec;
  const syncPairs = (pairs: Ref<KVPair[]>, record: Record<string, string>) => {
    const next = recordToPairs(record);
    if (JSON.stringify(next) !== JSON.stringify(pairs.value)) pairs.value = next;
  };
  syncPairs(envPairs, spec.env);
  syncPairs(headerPairs, spec.http_headers);
  syncPairs(envHeaderPairs, spec.env_http_headers);
}

watch(
  [name, transport, command, argsText, url, bearer, startupTimeout, toolTimeout, envPairs, headerPairs, envHeaderPairs],
  () => {
    if (initialized) void syncFormToToml();
  },
);
watch(tomlText, () => {
  if (initialized) void syncTomlToForm();
});

onMounted(async () => {
  try {
    if (creating.value) {
      // 新建：按表单初值生成片段；名称为空时先占位 server，改名后自动重写表头
      tomlText.value = await api.patchMcpFragment("[mcp_servers.server]\n", formSpec());
    } else {
      const serverName = props.server?.name ?? "";
      // 优先取 live 原文片段（含未建模键与注释）；拿不到再按表单生成
      tomlText.value =
        (await api.getMcpServerToml(serverName)) ??
        (await api.patchMcpFragment(`[mcp_servers.${serverName}]\n`, formSpec()));
    }
  } catch (error) {
    message.error(String(error));
  }
  initialToml.value = tomlText.value;
  initialized = true;
});

// 格式化当前片段（TOML 走 Rust 侧 taplo，同 ProfileEdit）
async function formatToml() {
  if (formatting.value || saving.value) return;
  if (!tomlText.value.trim()) {
    message.warning("编辑器没有内容");
    return;
  }
  formatting.value = true;
  try {
    const formatted = await api.formatToml(tomlText.value);
    if (formatted !== tomlText.value) {
      tomlText.value = formatted;
      message.success("片段已格式化");
    } else {
      message.info("格式无误，无需调整");
    }
  } catch (error) {
    message.error(`格式化失败：${String(error)}`);
  } finally {
    formatting.value = false;
  }
}

function argsList(): string[] {
  return argsText.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function save() {
  if (saving.value) return;
  const trimmedName = name.value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(trimmedName)) {
    message.error("名称只能包含字母、数字、下划线和连字符");
    return;
  }
  if (transport.value === "stdio" && !command.value.trim()) {
    message.error("请填写启动命令");
    return;
  }
  if (transport.value === "http") {
    if (!url.value.trim()) {
      message.error("请填写服务地址");
      return;
    }
    if (!/^https?:\/\//.test(url.value.trim())) {
      message.error("服务地址必须以 http:// 或 https:// 开头");
      return;
    }
  }
  if (startupTimeout.value !== null && startupTimeout.value <= 0) {
    message.error("启动超时必须为正数（秒）");
    return;
  }
  if (toolTimeout.value !== null && toolTimeout.value <= 0) {
    message.error("工具调用超时必须为正数（秒）");
    return;
  }

  saving.value = true;
  try {
    // 只提交当前传输类型的建模字段；同时带上编辑器片段——后端以片段为准整表写入，
    // 未建模键与注释所见即所得（表单与片段实时同步，spec 作为建模字段兜底）
    const spec: McpServerSpec = { ...formSpec(), name: trimmedName };
    await api.saveMcpServer(props.server?.name ?? null, spec, tomlText.value);
    message.success("MCP 服务器已保存");
    emit("back");
  } catch (error) {
    message.error(String(error));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="apple-edit-page mx-auto flex w-full max-w-none flex-col" @keydown.ctrl.enter="save">
    <div class="apple-page-bar apple-page-bar--roomy apple-edit-toolbar apple-edit-toolbar--header">
      <button type="button" class="apple-page-header apple-back-button" aria-label="返回" @click="emit('back')">
        <PhArrowLeft class="h-4 w-4 shrink-0 text-accent" weight="bold" aria-hidden="true" />
        <span class="apple-title">{{ creating ? "新建 MCP 服务器" : "编辑 MCP 服务器" }}</span>
      </button>
    </div>

    <div class="apple-edit-content">
      <div class="apple-group p-0">
        <div class="apple-panel-section">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <div class="field-label mb-1.5">名称</div>
              <n-input v-model:value="name" maxlength="64" placeholder="例如：context7" />
              <p class="muted mt-1.5 text-xs">写入 config.toml 的 [mcp_servers.名称]，仅限字母、数字、下划线和连字符。</p>
            </div>
            <div>
              <div class="field-label mb-1.5">传输类型</div>
              <n-select v-model:value="transport" :options="transportOptions" />
            </div>
          </div>
        </div>

        <div class="apple-panel-section">
          <template v-if="transport === 'stdio'">
            <div>
              <div class="field-label mb-1.5">启动命令</div>
              <n-input v-model:value="command" class="mono" placeholder="例如：npx 或 C:\tools\server.exe" />
            </div>
            <div class="mt-4">
              <div class="field-label mb-1.5">启动参数</div>
              <n-input v-model:value="argsText" type="textarea" :rows="2" class="mono" placeholder="每行一个参数，例如：-y" />
            </div>
          </template>
          <template v-else>
            <div>
              <div class="field-label mb-1.5">服务地址</div>
              <n-input v-model:value="url" class="mono" placeholder="https://mcp.example.com/mcp" />
            </div>
            <div class="mt-4">
              <div class="field-label mb-1.5">Bearer Token 环境变量名（可选）</div>
              <n-input v-model:value="bearer" class="mono" placeholder="例如：TAVILY_API_KEY" />
              <p class="muted mt-1.5 text-xs">Codex 启动时从该环境变量读取令牌放入 Authorization 头；留空则不携带。</p>
            </div>
          </template>
        </div>

        <div class="apple-panel-section">
          <n-collapse>
            <n-collapse-item title="高级选项（环境变量 / 请求头 / 超时）" name="advanced">
              <template v-if="transport === 'stdio'">
                <div class="field-label mb-1.5">环境变量</div>
                <n-dynamic-input v-model:value="envPairs" preset="pair" key-placeholder="变量名" value-placeholder="值" :on-create="() => ({ key: '', value: '' })" />
              </template>
              <template v-else>
                <div class="field-label mb-1.5">HTTP 请求头（固定值）</div>
                <n-dynamic-input v-model:value="headerPairs" preset="pair" key-placeholder="Header 名" value-placeholder="值" :on-create="() => ({ key: '', value: '' })" />
                <div class="field-label mb-1.5 mt-4">HTTP 请求头（值取自环境变量）</div>
                <n-dynamic-input v-model:value="envHeaderPairs" preset="pair" key-placeholder="Header 名" value-placeholder="环境变量名" :on-create="() => ({ key: '', value: '' })" />
              </template>
              <div class="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <div class="field-label mb-1.5">启动超时（秒，可选）</div>
                  <n-input-number v-model:value="startupTimeout" class="w-full" :min="1" clearable placeholder="默认 10" />
                </div>
                <div>
                  <div class="field-label mb-1.5">工具调用超时（秒，可选）</div>
                  <n-input-number v-model:value="toolTimeout" class="w-full" :min="1" clearable placeholder="默认 60" />
                </div>
              </div>
            </n-collapse-item>
          </n-collapse>

        </div>

        <div class="apple-panel-section">
          <div class="field-label mb-1.5 flex items-center gap-1.5">
            TOML 源码
            <span
              v-if="dirty"
              class="h-1.5 w-1.5 rounded-full bg-accent"
              role="img"
              aria-label="有未保存的改动"
              title="有未保存的改动"
            />
          </div>
          <ConfigTextEditor
            ref="activeEditor"
            v-model="tomlText"
            language="toml"
            placeholder="编辑 [mcp_servers.*] 片段，与上方表单双向同步。"
            @diagnostics="handleEditorDiagnostics"
          />
          <p class="muted mt-2 text-xs">
            表单与 TOML 会实时同步；未显示的设置和注释会保留。
          </p>
        </div>
      </div>
    </div>

    <div class="apple-edit-toolbar apple-edit-toolbar--footer">
      <button
        v-if="editorDiagnostics.count > 0"
        type="button"
        class="mr-auto flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--danger)] transition-opacity hover:opacity-80"
        title="跳转到第一个错误"
        aria-live="polite"
        @click="jumpToFirstDiagnostic"
      >
        <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--danger)]" aria-hidden="true" />
        <span class="truncate">
          {{ editorDiagnostics.count }} 个错误
          <template v-if="editorDiagnostics.firstLine !== null">
            · 第 {{ editorDiagnostics.firstLine }} 行
          </template>
        </span>
      </button>
      <n-button secondary :disabled="formatting || saving" @click="formatToml">格式化</n-button>
      <n-button secondary @click="emit('back')">取消</n-button>
      <n-button type="primary" :loading="saving" @click="save">
        <template #icon>
          <PhFloppyDisk class="h-4 w-4" weight="bold" aria-hidden="true" />
        </template>
        保存
      </n-button>
    </div>
  </section>
</template>
