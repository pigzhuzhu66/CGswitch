<script setup lang="ts">
import { h } from "vue";
import { NInput, NSelect } from "naive-ui";
import type { SelectOption } from "naive-ui";
import AppSwitch from "../AppSwitch.vue";
import LoadingSpinner from "../LoadingSpinner.vue";
import ProfileIconTile from "../ProfileIconTile.vue";
import { builtinPresets } from "../../presets";
import type { BuiltinPreset } from "../../presets";
import type { ManagedAccount, ProfileDetail } from "../../types";
import {
  PhActivity,
  PhArrowSquareOut,
  PhCheck,
  PhInfo,
  PhKey,
  PhMonitor,
  PhPencilSimple,
} from "@phosphor-icons/vue";

type AuthOption = SelectOption & {
  source?: "desktop" | "oauth";
};

const props = defineProps<{
  creating: boolean;
  presetKind: string;
  selectedPreset: BuiltinPreset | null;
  detail: ProfileDetail | null;
  name: string;
  baseUrl: string;
  apiKey: string;
  adminUrl: string;
  selectedIcon: string | null;
  boundAccountId: string | null;
  showProviderFields: boolean;
  isOpenCode: boolean;
  isOfficial: boolean;
  hasProfileAuthOverride: boolean;
  externalAccount: ManagedAccount | null;
  accountOptions: SelectOption[];
  supportsBalance: boolean;
  showBalance: boolean;
  testing: boolean;
}>();

const emit = defineEmits<{
  selectPreset: [kind: string];
  pickIcon: [];
  "update:name": [value: string];
  "update:baseUrl": [value: string];
  "update:apiKey": [value: string];
  "update:adminUrl": [value: string];
  "update:boundAccountId": [value: string | null];
  openOpenCodeRef: [];
  testConnection: [];
  openAdminUrl: [];
  toggleBalance: [enabled: boolean];
}>();

function renderAuthOptionLabel(option: SelectOption) {
  const authOption = option as AuthOption;
  const source = authOption.source === "desktop" ? "桌面端认证" : "OAuth 认证";
  const Icon = authOption.source === "desktop" ? PhMonitor : PhKey;
  return h(
    "span",
    { class: "inline-flex min-w-0 items-center gap-2" },
    [
      h(Icon, {
        class: "h-3.5 w-3.5 shrink-0 text-accent",
        weight: "bold",
        "aria-hidden": "true",
      }),
      h("span", { class: "shrink-0 text-xs font-medium text-[var(--text-secondary)]" }, source),
      h("span", { class: "text-[var(--text-tertiary)]" }, "·"),
      h("span", { class: "truncate" }, String(authOption.label ?? "")),
    ],
  );
}

function updateBoundAccount(value: string | number | null) {
  emit("update:boundAccountId", value == null ? null : String(value));
}
</script>

<template>
  <div v-if="creating" class="apple-panel-section">
    <div class="field-subtitle">选择供应商</div>
    <div class="mt-3 grid gap-2 sm:grid-cols-3 md:grid-cols-6">
      <button
        v-for="preset in builtinPresets"
        :key="preset.kind"
        type="button"
        class="flex items-center gap-2.5 rounded-xl p-2.5 text-left transition-colors"
        :class="presetKind === preset.kind ? 'shadow-[0_0_0_1px_var(--accent)] bg-[var(--selection-bg)]' : 'shadow-[0_0_0_1px_var(--panel-ring)] hover:bg-black/3 dark:hover:bg-white/4'"
        :aria-pressed="presetKind === preset.kind"
        @click="emit('selectPreset', preset.kind)"
      >
        <ProfileIconTile :name="preset.name" :icon="preset.icon" size="xs" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-xs font-semibold tracking-tight">{{ preset.name }}</span>
          <span class="muted block truncate text-[11px]">{{ preset.model }}{{ preset.base_url ? "" : (preset.kind === "chatgpt" ? " · 认证登录" : " · 无需密钥") }}</span>
        </span>
        <PhCheck
          v-if="presetKind === preset.kind"
          class="h-4 w-4 shrink-0 text-accent"
          weight="bold"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>

  <div class="apple-panel-section">
    <div class="flex items-center gap-4">
      <button
        type="button"
        class="relative grid h-[61px] w-[61px] shrink-0 place-items-center rounded-[16px] transition-opacity hover:opacity-80"
        title="点击更换图标"
        aria-label="更换图标"
        @click="emit('pickIcon')"
      >
        <span class="relative grid h-full w-full place-items-center">
          <ProfileIconTile :name="detail?.name ?? name" :icon="selectedIcon" size="fill" />
          <span
            class="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-white shadow"
            aria-hidden="true"
          >
            <PhPencilSimple class="h-2.5 w-2.5" weight="bold" aria-hidden="true" />
          </span>
        </span>
      </button>
      <div class="min-w-0 flex-1">
        <div class="field-label mb-1.5">名称</div>
        <n-input
          :value="name"
          :bordered="false"
          class="underline-input"
          maxlength="50"
          placeholder="供应商名称"
          @update:value="emit('update:name', $event)"
        />
      </div>
    </div>
    <div v-if="showProviderFields" class="mt-4">
      <div class="field-label mb-1.5">请求地址</div>
      <n-input
        :value="baseUrl"
        placeholder="https://api.example.com/v1"
        @update:value="emit('update:baseUrl', $event)"
      />
    </div>
    <div v-if="showProviderFields" class="mt-4">
      <div class="mb-1.5 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="field-label">API 密钥</span>
          <button
            v-if="isOpenCode && creating"
            type="button"
            class="apple-inline-btn"
            @click="emit('openOpenCodeRef')"
          >
            <PhArrowSquareOut class="h-3 w-3" weight="bold" aria-hidden="true" />
            获取 API 密钥
          </button>
          <button
            type="button"
            class="apple-inline-btn"
            :disabled="!apiKey.trim() || !baseUrl.trim()"
            @click="emit('testConnection')"
          >
            <LoadingSpinner v-if="testing" />
            <PhActivity v-else class="h-3 w-3" weight="bold" aria-hidden="true" />
            测试连通
          </button>
        </div>
      </div>
      <n-input
        :value="apiKey"
        type="password"
        show-password-on="click"
        placeholder="请输入 API 密钥"
        @update:value="emit('update:apiKey', $event)"
      />
      <p v-if="isOpenCode && creating" class="muted mt-2 flex items-start gap-1.5 text-xs">
        <PhInfo class="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" weight="bold" aria-hidden="true" />
        使用此链接订阅 OpenCode Go，首月只需 $5，并可获得额外的 $5 额度！
      </p>
    </div>
    <div v-if="isOfficial" class="mt-4">
      <div class="field-subtitle mb-1.5">认证来源</div>
      <div
        v-if="hasProfileAuthOverride"
        class="flex items-center justify-between gap-3 rounded-xl border border-[var(--panel-ring)] bg-black/3 px-3 py-2.5 dark:bg-white/4"
      >
        <div class="min-w-0">
          <div class="text-sm font-medium">配置内 auth.json</div>
          <div class="muted mt-0.5 text-xs">应用时优先使用当前档案的认证文件</div>
        </div>
        <span class="shrink-0 text-xs font-medium text-accent">优先使用</span>
      </div>
      <n-select
        v-else
        :value="boundAccountId"
        :options="accountOptions"
        :render-label="renderAuthOptionLabel"
        :placeholder="externalAccount ? '桌面端认证' : '自动选择账号'"
        @update:value="updateBoundAccount"
      />
    </div>
    <div v-if="!creating || selectedPreset?.base_url" class="mt-4">
      <div class="mb-1.5 flex items-center gap-1">
        <span class="field-label">官网地址</span>
        <button
          type="button"
          class="grid h-4 w-4 cursor-pointer place-items-center rounded-full text-accent transition-colors hover:bg-accent/10 disabled:cursor-default disabled:opacity-40"
          title="打开官网"
          aria-label="打开官网"
          :disabled="!adminUrl.trim()"
          @click="emit('openAdminUrl')"
        >
          <PhArrowSquareOut class="h-3.5 w-3.5" weight="bold" aria-hidden="true" />
        </button>
      </div>
      <n-input
        :value="adminUrl"
        placeholder="https://console.example.com（可选）"
        @update:value="emit('update:adminUrl', $event)"
      />
    </div>
    <div v-if="!creating && supportsBalance" class="mt-4 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="text-sm font-semibold">余额/用量查询</div>
        <div class="muted mt-0.5 text-xs">窗口激活时自动刷新，点击数字手动刷新</div>
      </div>
      <AppSwitch :value="showBalance" @update:value="emit('toggleBalance', $event)" />
    </div>
  </div>
</template>
