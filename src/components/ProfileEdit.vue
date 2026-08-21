<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { NButton, useMessage } from "naive-ui";
import ProfileEditDocuments, {
  type ProfileEditTab,
  type ProfileEditTabOption,
} from "./profile-edit/ProfileEditDocuments.vue";
import ProfileEditProviderSection from "./profile-edit/ProfileEditProviderSection.vue";
import ProfileIconEdit from "./ProfileIconEdit.vue";
import { api } from "../api";
import {
  balanceQueryProviders,
  builtinPresets,
  customAuthTemplate,
  customCatalogTemplate,
  customConfigTemplate,
} from "../presets";
import {
  patchProviderFields,
  readProviderFields,
  withMcpSection as appendMcpSection,
} from "./profile-edit/profileEditText";
import type {
  EditorDiagnosticSummary,
  ManagedAccount,
  ProfileDetail,
  ProfileSummary,
} from "../types";
import { PhArrowLeft, PhBracketsCurly, PhFloppyDisk, PhGearSix } from "@phosphor-icons/vue";

const props = defineProps<{
  profile: ProfileSummary | null;
  create?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  changed: [];
}>();

const message = useMessage();
const detail = ref<ProfileDetail | null>(null);
const loadError = ref("");
const saving = ref(false);
const formatting = ref(false);
const testing = ref(false);
const pickingIcon = ref(false);
const name = ref(props.profile?.name ?? "");
const baseUrl = ref("");
const apiKey = ref("");
const adminUrl = ref("");
const authAccounts = ref<ManagedAccount[]>([]);
const externalAccount = ref<ManagedAccount | null>(null);
const boundAccountId = ref<string | null>(null);
const selectedIcon = ref<string | null>(props.profile?.icon ?? null);
const activeTab = ref<ProfileEditTab>("config");
const presetKind = ref("");
const configText = ref("");
const configTouched = ref(false);
const catalogTouched = ref(false);
const catalogText = ref("");
const authText = ref("");
const configInitial = ref("");
const catalogInitial = ref("");
const authInitial = ref("");
const longContextEnabled = ref(false);
const patchingLongContext = ref(false);
const showBalance = ref(false);
const savingBalance = ref(false);
const activeEditor = ref<{ focusFirstDiagnostic: () => void } | null>(null);
const editorDiagnostics = ref<EditorDiagnosticSummary>({
  count: 0,
  firstLine: null,
});
// 初始数据装载完成后才允许双向同步，避免装载时产生假差异
let initialized = false;

function handleEditorDiagnostics(summary: EditorDiagnosticSummary) {
  editorDiagnostics.value = summary;
}

function jumpToFirstDiagnostic() {
  activeEditor.value?.focusFirstDiagnostic();
}

const creating = computed(() => props.create === true);
const selectedPreset = computed(
  () => builtinPresets.find((preset) => preset.kind === presetKind.value) ?? null,
);
// 编辑器会把 CRLF 规范成 LF，比较时统一换行避免误报“未保存”
const normalizeNewlines = (text: string) => text.replace(/\r\n/g, "\n");
const configDirty = computed(
  () => normalizeNewlines(configText.value) !== normalizeNewlines(configInitial.value),
);
const catalogDirty = computed(
  () => normalizeNewlines(catalogText.value) !== normalizeNewlines(catalogInitial.value),
);
const authDirty = computed(
  () => normalizeNewlines(authText.value) !== normalizeNewlines(authInitial.value),
);
const showProviderFields = computed(() =>
  creating.value
    ? Boolean(selectedPreset.value?.base_url)
    : Boolean(detail.value?.provider),
);
const isOfficial = computed(() =>
  creating.value
    ? presetKind.value === "chatgpt"
    : detail.value?.provider === null,
);
const isCustom = computed(() => creating.value && presetKind.value === "custom");
const showLongContextOverride = computed(() => isOfficial.value);

watch(activeTab, () => {
  editorDiagnostics.value = { count: 0, firstLine: null };
});

const hasProfileAuthOverride = computed(() => {
  if (creating.value || !detail.value?.raw_auth?.trim()) return false;
  return !(authDirty.value && !authText.value.trim());
});
// 余额查询开关是否显示：由 presets.ts 的供应商表决定，新增供应商只需在那里加一行
const supportsBalance = computed(() =>
  balanceQueryProviders.has(detail.value?.provider ?? ""),
);
const isOpenCode = computed(() =>
  creating.value
    ? presetKind.value === "opencode"
    : detail.value?.provider === "opencode-go",
);
const accountOptions = computed(() => [
  {
    label: externalAccount.value?.login ?? "自动选择账号",
    source: externalAccount.value ? "desktop" : "oauth",
    value: "",
  },
  ...authAccounts.value.map((account) => ({
    label: account.login,
    source: "oauth",
    value: account.id,
  })),
]);

// 编辑态所有供应商都显示认证文件组件：第三方可保存自己的 auth.json 随应用写入
const hasAuthTab = computed(() => !creating.value);

// 模型目录引用随草稿 config.toml 实时联动（readProviderFields 同款模式）：
// 贴上路径标签即出现，删掉即消失，避免已删引用的幽灵 tab 把目录内容存成孤儿文件
const liveCatalogPath = computed(() => {
  const m = /^\s*model_catalog_json\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/m.exec(
    configText.value,
  );
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
});

// 标签随实际文件名显示（models.json / custom-catalog.json 等），无路径数据时回退通用名
const catalogFileName = computed(() => liveCatalogPath.value.split(/[\\/]/).pop() || "models.json");

const tabs = computed(() => {
  if (creating.value) {
    const list: ProfileEditTabOption[] = [
      { id: "config", label: "config.toml" },
    ];
    if (isCustom.value) {
      if (liveCatalogPath.value)
        list.push({ id: "models", label: catalogFileName.value, title: liveCatalogPath.value });
      list.push({ id: "auth", label: "auth.json" });
    } else if (liveCatalogPath.value) {
      list.push({ id: "models", label: catalogFileName.value, title: liveCatalogPath.value });
    }
    return list;
  }
  const list: { id: "config" | "auth" | "models"; label: string; title?: string }[] = [
    { id: "config", label: "config.toml" },
  ];
  if (liveCatalogPath.value)
    list.push({ id: "models", label: catalogFileName.value, title: liveCatalogPath.value });
  if (hasAuthTab.value) list.push({ id: "auth", label: "auth.json" });
  return list;
});

const baseFragment = computed(() =>
  creating.value
    ? selectedPreset.value?.fragment ?? ""
    : detail.value?.config_fragment ?? "",
);

// 创建表单优先预填数据库 MCP 镜像；首次无镜像时由后端回退 live。
const mcpSection = ref("");
const addMcpSection = (base: string) => appendMcpSection(base, mcpSection.value);

const liveConfigFragment = computed(() => {
  if (!baseFragment.value) return "";
  const values: Record<string, string> = {
    base_url: baseUrl.value.trim(),
    experimental_bearer_token: apiKey.value.trim(),
  };
  return addMcpSection(
    baseFragment.value
      .split("\n")
      .map((line) => {
        const trimmed = line.trimStart();
        const match = /^(base_url|experimental_bearer_token)\s*=/.exec(trimmed);
        if (!match) return line;
        const field = match[1];
        const indent = line.slice(0, line.length - trimmed.length);
        const escaped = (values[field] ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return `${indent}${field} = "${escaped}"`;
      })
      .join("\n"),
  );
});

const canSave = computed(() => {
  if (!creating.value) return true;
  if (isCustom.value) return Boolean(configText.value.trim());
  const preset = selectedPreset.value;
  return Boolean(preset);
});

function hasLongContextOverride(text: string): boolean {
  return (
    /^\s*model_context_window\s*=/m.test(text) &&
    /^\s*model_auto_compact_token_limit\s*=/m.test(text)
  );
}

async function toggleLongContext(enabled: boolean) {
  if (patchingLongContext.value) return;
  patchingLongContext.value = true;
  try {
    configText.value = await api.patchChatgptContextConfig(configText.value, enabled);
    longContextEnabled.value = enabled;
  } catch (error) {
    longContextEnabled.value = !enabled;
    message.error(`更新长上下文配置失败：${String(error)}`);
  } finally {
    patchingLongContext.value = false;
  }
}

// 格式化按钮随 tab 联动：图标与 tab 栏一致，让用户一眼看出格式化的是哪个文件
const formatTarget = computed(() => {
  if (activeTab.value === "config") {
    return { icon: PhGearSix, label: "config.toml", title: "格式化 config.toml（TOML）" };
  }
  if (activeTab.value === "auth") {
    return { icon: PhBracketsCurly, label: "auth.json", title: "格式化 auth.json（JSON）" };
  }
  return { icon: PhBracketsCurly, label: catalogFileName.value, title: `格式化 ${catalogFileName.value}（JSON）` };
});

async function formatCurrentDocument() {
  if (formatting.value || saving.value) return;
  const text =
    activeTab.value === "config"
      ? configText.value
      : activeTab.value === "auth"
        ? authText.value
        : catalogText.value;
  if (!text.trim()) {
    message.warning("当前文件没有内容");
    return;
  }

  formatting.value = true;
  try {
    // TOML 走 Rust 侧 taplo（语法错误时跳过错误区间仍可格式化），JSON 用原生
    const formatted =
      activeTab.value === "config"
        ? await api.formatToml(text)
        : JSON.stringify(JSON.parse(text), null, 2);
    if (formatted === text) {
      message.info(`${formatTarget.value.label} 格式无误，无需调整`);
    } else {
      if (activeTab.value === "config") configText.value = formatted;
      else if (activeTab.value === "auth") authText.value = formatted;
      else catalogText.value = formatted;
      message.success(`${formatTarget.value.label} 格式化成功（保存后生效）`);
    }
  } catch (error) {
    message.error(`格式化失败：${String(error)}`);
  } finally {
    formatting.value = false;
  }
}

function selectPreset(kind: string) {
  if (kind === "custom") {
    presetKind.value = kind;
    name.value = "自定义供应商";
    baseUrl.value = "https://api.example.com/v1";
    apiKey.value = "";
    adminUrl.value = "";
    selectedIcon.value = "custom";
    configText.value = addMcpSection(customConfigTemplate);
    catalogText.value = customCatalogTemplate;
    authText.value = customAuthTemplate;
    configInitial.value = configText.value;
    catalogInitial.value = customCatalogTemplate;
    authInitial.value = customAuthTemplate;
    longContextEnabled.value = false;
    configTouched.value = false;
    catalogTouched.value = false;
    activeTab.value = "config";
    return;
  }
  const preset = builtinPresets.find((item) => item.kind === kind);
  if (!preset) return;
  configTouched.value = false;
  presetKind.value = kind;
  name.value = preset.name;
  baseUrl.value = preset.base_url;
  adminUrl.value = preset.admin_url ?? "";
  apiKey.value = "";
  configText.value = addMcpSection(
    patchProviderFields(preset.fragment, baseUrl.value, apiKey.value),
  );
  configInitial.value = configText.value;
  longContextEnabled.value = kind === "chatgpt" && hasLongContextOverride(configText.value);
  selectedIcon.value = preset.icon;
  activeTab.value = "config";
  if (kind === "chatgpt") loadAuthStatus();
}

async function loadAuthStatus() {
  try {
    const status = await api.authGetStatus();
    authAccounts.value = status.accounts;
    externalAccount.value = status.external;
  } catch {
    authAccounts.value = [];
    externalAccount.value = null;
  }
}

async function openAdminUrl() {
  const url = adminUrl.value.trim();
  if (!url) return;
  try {
    await api.openUrl(url);
  } catch (error) {
    message.error(String(error));
  }
}

async function openOpenCodeRef() {
  try {
    await api.openUrl("https://opencode.ai/go?ref=APHY0DXATH");
  } catch (error) {
    message.error(String(error));
  }
}

async function testConnection() {
  if (testing.value) return;
  if (!creating.value && !props.profile) return;
  if (!baseUrl.value.trim()) {
    message.warning("请填写调用地址");
    return;
  }
  if (!apiKey.value.trim()) {
    message.warning("请先填写 API 密钥");
    return;
  }
  testing.value = true;
  try {
    // 输入框里填什么就测什么：创建态尚无 profile id，直接用表单值测端点
    const result = creating.value
      ? await api.testProviderConnection(baseUrl.value.trim(), apiKey.value.trim())
      : await api.testProfileConnection(
          props.profile!.id,
          baseUrl.value.trim(),
          apiKey.value.trim(),
        );
    if (result.ok) {
      message.success(
        `连接正常${result.latency_ms != null ? ` · ${result.latency_ms}ms` : ""}`,
      );
    } else {
      message.error(`连接失败：${result.error ?? "未知错误"}`);
    }
  } catch (error) {
    message.error(`测试失败：${String(error)}`);
  } finally {
    testing.value = false;
  }
}

watch(presetKind, async (kind) => {
  if (isCustom.value) return;
  if (!creating.value || !kind) {
    catalogText.value = "";
    catalogTouched.value = false;
    return;
  }
  catalogTouched.value = false;
  const preset = builtinPresets.find((item) => item.kind === kind);
  if (!preset?.model_values.model_catalog_json) {
    catalogText.value = "";
    return;
  }
  try {
    catalogText.value = (await api.getBuiltinCatalog(kind)) ?? "";
    catalogInitial.value = catalogText.value;
  } catch {
    catalogText.value = "";
  }
});

// 表单地址/密钥 → 编辑器 provider 段（所见即所得，始终同步）
watch([baseUrl, apiKey], () => {
  if (!initialized) return;
  const next = patchProviderFields(configText.value, baseUrl.value, apiKey.value);
  if (next !== configText.value) configText.value = next;
});

// 编辑器 provider 段 → 表单地址/密钥（所见即所得，始终同步）
watch(configText, (text) => {
  if (!initialized) return;
  const fields = readProviderFields(text);
  // 只在校准到当前供应商段时同步表单；段没匹配上（如正在改供应商名）时保留原值，
  // 避免表单被清空后反向把配置里的请求地址/密钥覆写成空
  if (fields.found) {
    if (fields.base_url !== baseUrl.value) baseUrl.value = fields.base_url;
    // 模板占位符（<你的 API Key> 等）不应当回填进输入框
    const key = /^<.*>$/.test(fields.experimental_bearer_token)
      ? ""
      : fields.experimental_bearer_token;
    if (key !== apiKey.value) apiKey.value = key;
  }
  if (creating.value && text !== liveConfigFragment.value) {
    configTouched.value = true;
  }
  const hasOverride = hasLongContextOverride(text);
  if (
    !patchingLongContext.value &&
    showLongContextOverride.value &&
    hasOverride !== longContextEnabled.value
  ) {
    longContextEnabled.value = hasOverride;
  }
});

onMounted(async () => {
  if (creating.value) {
    // 先取全局 MCP 段再初始化模板：创建表单打开即展示 MCP 配置
    try {
      mcpSection.value = (await api.getMcpSectionToml()).trim();
    } catch {
      // 拿不到就不预填，保存时后端仍会合并
    }
    selectPreset("custom");
  } else {
    try {
      if (!props.profile) throw new Error("缺少供应商信息");
      detail.value = await api.getProfile(props.profile.id);
      name.value = detail.value.name;
      configText.value = detail.value.raw_config ?? detail.value.config_fragment;
      catalogText.value = detail.value.raw_catalog ?? detail.value.catalog_content ?? "";
      longContextEnabled.value =
        detail.value.provider === null && hasLongContextOverride(configText.value);
      authText.value = detail.value.raw_auth ?? detail.value.auth_content ?? "";
      baseUrl.value = detail.value.base_url ?? "";
      apiKey.value = detail.value.api_key ?? "";
      adminUrl.value = detail.value.admin_url ?? "";
      selectedIcon.value = detail.value.icon;
      if (detail.value.provider === null) {
        boundAccountId.value = detail.value.account_id ?? "";
      }
      configInitial.value = configText.value;
      catalogInitial.value = catalogText.value;
      authInitial.value = authText.value;
      showBalance.value = detail.value.show_balance;
    } catch (error) {
      loadError.value = String(error);
    }
  }
  await loadAuthStatus();
  await nextTick();
  initialized = true;
});

async function saveIcon(icon: string | null) {
  if (saving.value) return;
  saving.value = true;
  try {
    if (creating.value) {
      selectedIcon.value = icon;
    } else {
      if (!props.profile) throw new Error("缺少供应商信息");
      await api.setProfileIcon(props.profile.id, icon);
      selectedIcon.value = icon;
      if (detail.value) detail.value.icon = icon;
    }
    emit("changed");
    pickingIcon.value = false;
  } catch (error) {
    message.error(String(error));
  } finally {
    saving.value = false;
  }
}

async function toggleBalance(enabled: boolean) {
  if (savingBalance.value || !props.profile) return;
  showBalance.value = enabled;
  savingBalance.value = true;
  try {
    await api.setProfileShowBalance(props.profile.id, enabled);
  } catch (error) {
    showBalance.value = !enabled;
    message.error(String(error));
  } finally {
    savingBalance.value = false;
  }
}

async function save() {
  if (saving.value) return;
  if (creating.value) {
    if (isCustom.value && !configText.value.trim()) {
      message.error("请填写 config.toml 内容");
      return;
    }
    if (!selectedPreset.value) {
      message.error("请先选择供应商");
      return;
    }
  }
  saving.value = true;
  try {
    if (creating.value) {
      if (isCustom.value) {
        await api.addCustomProfile(
          name.value.trim() || "自定义供应商",
          configText.value,
          baseUrl.value.trim() || undefined,
          apiKey.value.trim() || undefined,
          adminUrl.value.trim() || undefined,
          liveCatalogPath.value && catalogText.value.trim() ? catalogText.value : null,
          authText.value.trim() ? authText.value : null,
        );
        message.success("自定义供应商已添加");
      } else {
        const created = await api.addBuiltinProfile(
          presetKind.value,
          baseUrl.value.trim() || undefined,
          apiKey.value.trim() || undefined,
          adminUrl.value.trim() || undefined,
          isOfficial.value ? boundAccountId.value || undefined : undefined,
        );
        if (configTouched.value || catalogTouched.value) {
          await api.updateProfileConfig(
            created.id,
            configText.value,
            liveCatalogPath.value ? catalogText.value || null : null,
            null,
          );
        }
        message.success("内置供应商已添加");
      }
    } else {
      if (!props.profile) throw new Error("缺少供应商信息");
      const hasProvider = Boolean(detail.value?.provider);
      await api.updateProfile(
        props.profile.id,
        name.value,
        hasProvider ? baseUrl.value : undefined,
        hasProvider ? apiKey.value : undefined,
        adminUrl.value.trim() || undefined,
      );
      await api.updateProfileConfig(
        props.profile.id,
        configText.value,
        liveCatalogPath.value && catalogDirty.value ? catalogText.value || null : null,
        hasAuthTab.value && authDirty.value ? authText.value : null,
      );
      if (isOfficial.value) {
        await api.setProfileAccount(props.profile.id, boundAccountId.value || null);
      }
      message.success("供应商已更新");
    }
    // 新建供应商：back 前先通知父级刷新列表，让首页立即显示新卡片（编辑路径由 closeEdit 刷新）
    if (creating.value) emit("changed");
    emit("back");
  } catch (error) {
    message.error(String(error));
  } finally {
    saving.value = false;
  }
}

</script>

<template>
  <ProfileIconEdit
    v-if="pickingIcon"
    :icon="selectedIcon"
    :name="name"
    @back="pickingIcon = false"
    @save="saveIcon"
  />
  <section v-else class="apple-edit-page mx-auto flex w-full max-w-none flex-col" @keydown.ctrl.enter="save">
    <div class="apple-page-bar apple-page-bar--roomy apple-edit-toolbar apple-edit-toolbar--header">
      <button
        type="button"
        class="apple-page-header apple-back-button"
        aria-label="返回"
        @click="emit('back')"
      >
        <PhArrowLeft class="h-4 w-4 shrink-0 text-accent" weight="bold" aria-hidden="true" />
        <span class="apple-title">{{ creating ? "新建供应商" : "编辑供应商" }}</span>
      </button>
    </div>

    <div class="apple-edit-content">
      <p v-if="loadError" class="muted mt-4 text-sm">{{ loadError }}</p>

      <div class="apple-group p-0">
        <ProfileEditProviderSection
          :creating="creating"
          :preset-kind="presetKind"
          :selected-preset="selectedPreset"
          :detail="detail"
          :name="name"
          :base-url="baseUrl"
          :api-key="apiKey"
          :admin-url="adminUrl"
          :selected-icon="selectedIcon"
          :bound-account-id="boundAccountId"
          :show-provider-fields="showProviderFields"
          :is-open-code="isOpenCode"
          :is-official="isOfficial"
          :has-profile-auth-override="hasProfileAuthOverride"
          :external-account="externalAccount"
          :account-options="accountOptions"
          :supports-balance="supportsBalance"
          :show-balance="showBalance"
          :testing="testing"
          @select-preset="selectPreset"
          @pick-icon="pickingIcon = true"
          @update:name="name = $event"
          @update:base-url="baseUrl = $event"
          @update:api-key="apiKey = $event"
          @update:admin-url="adminUrl = $event"
          @update:bound-account-id="boundAccountId = $event"
          @open-open-code-ref="openOpenCodeRef"
          @test-connection="testConnection"
          @open-admin-url="openAdminUrl"
          @toggle-balance="toggleBalance"
        />
        <ProfileEditDocuments
          ref="activeEditor"
          :creating="creating"
          :detail="detail"
          :active-tab="activeTab"
          :tabs="tabs"
          :config-dirty="configDirty"
          :catalog-dirty="catalogDirty"
          :auth-dirty="authDirty"
          :show-long-context-override="showLongContextOverride"
          :long-context-enabled="longContextEnabled"
          :patching-long-context="patchingLongContext"
          :saving="saving"
          :config-text="configText"
          :catalog-text="catalogText"
          :auth-text="authText"
          @update:active-tab="activeTab = $event"
          @update:config-text="configText = $event"
          @update:catalog-text="catalogText = $event"
          @update:auth-text="authText = $event"
          @diagnostics="handleEditorDiagnostics"
          @toggle-long-context="toggleLongContext"
        />
      </div>
    </div>

    <div class="apple-edit-toolbar apple-edit-toolbar--footer">
      <button
        v-if="editorDiagnostics.count > 0"
        type="button"
        class="mr-auto flex min-w-0 items-center gap-1.5 rounded-lg border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-2.5 py-1 text-xs chip-danger transition-opacity hover:opacity-80"
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
      <n-button
        secondary
        :disabled="saving"
        :title="formatTarget.title"
        @click="formatCurrentDocument"
      >
        <template #icon>
          <component :is="formatTarget.icon" class="h-4 w-4" weight="bold" aria-hidden="true" />
        </template>
        格式化
      </n-button>
      <n-button secondary @click="emit('back')">取消</n-button>
      <n-button type="primary" :loading="saving" :disabled="!canSave" @click="save">
        <template #icon>
          <PhFloppyDisk class="h-4 w-4" weight="bold" aria-hidden="true" />
        </template>
        保存
      </n-button>
    </div>

  </section>
</template>
