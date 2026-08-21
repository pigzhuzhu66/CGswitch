<script setup lang="ts">
import { defineAsyncComponent, ref } from "vue";
import { NCheckbox } from "naive-ui";
import type { EditorDiagnosticSummary, ProfileDetail } from "../../types";
import { PhBracketsCurly, PhGearSix } from "@phosphor-icons/vue";

const ConfigTextEditor = defineAsyncComponent(() => import("../ConfigTextEditor.vue"));

export type ProfileEditTab = "config" | "auth" | "models";
export interface ProfileEditTabOption {
  id: ProfileEditTab;
  label: string;
  title?: string;
}

type EditorInstance = {
  focusFirstDiagnostic: () => void;
};

defineProps<{
  creating: boolean;
  detail: ProfileDetail | null;
  activeTab: ProfileEditTab;
  tabs: ProfileEditTabOption[];
  configDirty: boolean;
  catalogDirty: boolean;
  authDirty: boolean;
  showLongContextOverride: boolean;
  longContextEnabled: boolean;
  patchingLongContext: boolean;
  saving: boolean;
  configText: string;
  catalogText: string;
  authText: string;
}>();

const emit = defineEmits<{
  "update:activeTab": [value: ProfileEditTab];
  "update:configText": [value: string];
  "update:catalogText": [value: string];
  "update:authText": [value: string];
  diagnostics: [summary: EditorDiagnosticSummary];
  toggleLongContext: [enabled: boolean];
}>();

const activeEditor = ref<EditorInstance | null>(null);
defineExpose({
  focusFirstDiagnostic: () => activeEditor.value?.focusFirstDiagnostic(),
});
</script>

<template>
  <div class="apple-panel-section flex flex-col">
    <div class="flex items-center justify-between gap-3">
      <div class="flex gap-1">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="relative flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] transition-colors"
          :class="activeTab === tab.id ? 'bg-[var(--selection-bg)] font-semibold text-accent' : 'muted hover:bg-black/5 dark:hover:bg-white/8'"
          :aria-pressed="activeTab === tab.id"
          :title="tab.title"
          @click="emit('update:activeTab', tab.id)"
        >
          <PhGearSix
            v-if="tab.id === 'config'"
            class="h-3.5 w-3.5"
            weight="bold"
            aria-hidden="true"
          />
          <PhBracketsCurly
            v-else
            class="h-3.5 w-3.5"
            weight="bold"
            aria-hidden="true"
          />
          <span class="relative inline-grid">
            <span class="invisible font-semibold" aria-hidden="true">{{ tab.label }}</span>
            <span class="absolute inset-0 whitespace-nowrap">{{ tab.label }}</span>
          </span>
          <span
            v-if="(tab.id === 'config' && configDirty) || (tab.id === 'models' && catalogDirty) || (tab.id === 'auth' && authDirty)"
            class="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent"
            aria-label="有未保存的改动"
          />
        </button>
      </div>
      <n-checkbox
        v-if="showLongContextOverride && activeTab === 'config'"
        size="small"
        :checked="longContextEnabled"
        :disabled="patchingLongContext || saving"
        class="rounded-[10px] border px-2.5 py-1 transition-colors"
        :class="longContextEnabled ? 'border-accent/30 bg-accent/10 text-accent' : 'border-[var(--panel-ring)] hover:bg-black/4 dark:hover:bg-white/6'"
        title="上下文窗口：1000000 tokens；自动压缩阈值：900000 tokens"
        @update:checked="emit('toggleLongContext', $event)"
      >
        <span class="whitespace-nowrap font-medium">1M 上下文窗口</span>
      </n-checkbox>
    </div>

    <div class="mt-4 flex flex-col pr-1">
      <div v-if="activeTab === 'config'">
        <ConfigTextEditor
          ref="activeEditor"
          :model-value="configText"
          language="toml"
          :placeholder="creating ? '选择供应商后显示配置预览' : '编辑 config.toml 内容，保存后仅写入该供应商；应用时才生效。'"
          @update:model-value="emit('update:configText', $event)"
          @diagnostics="emit('diagnostics', $event)"
        />
      </div>
      <div v-else-if="activeTab === 'auth'">
        <p v-if="detail?.provider !== null && !detail?.raw_auth" class="muted mb-2 text-xs">
          未保存自定义认证：应用此供应商不会改动 ~/.codex/auth.json。
        </p>
        <p v-else-if="detail?.raw_auth" class="muted mb-2 text-xs">
          已保存自定义认证：清空并保存即可移除，应用时写入 ~/.codex/auth.json。
        </p>
        <ConfigTextEditor
          ref="activeEditor"
          :model-value="authText"
          language="json"
          placeholder="认证文件（~/.codex/auth.json）。保存后仅存入本配置，应用时才写入生效。"
          @update:model-value="emit('update:authText', $event)"
          @diagnostics="emit('diagnostics', $event)"
        />
        <p v-if="detail?.provider === null && !detail?.raw_auth" class="muted mt-2 text-xs">
          当前使用全局认证；修改后保存为本配置认证。
        </p>
      </div>
      <div v-else class="flex flex-col text-sm">
        <ConfigTextEditor
          ref="activeEditor"
          :model-value="catalogText"
          language="json"
          placeholder="模型目录文件不存在或无法读取；保存后内容将随该供应商生效。"
          @update:model-value="emit('update:catalogText', $event)"
          @diagnostics="emit('diagnostics', $event)"
        />
      </div>
    </div>
  </div>
</template>
