<script setup lang="ts">
import { reactive, ref } from "vue";
import {
  NButton,
  NDivider,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NList,
  NListItem,
  NSelect,
  NSwitch,
  useMessage,
} from "naive-ui";
import { api } from "../api";
import type { AppState, PathInfo, Settings } from "../types";

const props = defineProps<{ state: AppState }>();
const emit = defineEmits<{ refresh: []; saved: [settings: Settings]; previewTheme: [theme: Settings["theme"]] }>();
const message = useMessage();

const form = reactive<Settings>({ ...props.state.settings });
const saving = ref(false);
const savingGeneral = ref(false);
const openingPath = ref<string | null>(null);
const section = ref<"general" | "codex" | "about">("general");
const themeOptions = [
  { label: "跟随系统", value: "system" },
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" },
];

async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    const settings = await api.saveSettings({ ...form });
    message.success("设置已保存");
    emit("saved", settings);
    emit("refresh");
  } catch (error) {
    message.error(String(error));
  } finally {
    saving.value = false;
  }
}

async function saveGeneral() {
  if (savingGeneral.value) return;
  const previous = props.state.settings;
  savingGeneral.value = true;
  try {
    const settings = await api.saveSettings({
      ...previous,
      theme: form.theme,
      auto_restart: form.auto_restart,
    });
    emit("saved", settings);
  } catch (error) {
    form.theme = previous.theme;
    form.auto_restart = previous.auto_restart;
    emit("previewTheme", previous.theme);
    message.error(String(error));
  } finally {
    savingGeneral.value = false;
  }
}

function updateTheme(theme: Settings["theme"]) {
  form.theme = theme;
  emit("previewTheme", theme);
  void saveGeneral();
}

function updateAutoRestart(autoRestart: boolean) {
  form.auto_restart = autoRestart;
  void saveGeneral();
}

async function openPath(item: PathInfo) {
  if (openingPath.value) return;
  openingPath.value = item.path;
  try {
    await api.openPath(item.path);
  } catch (error) {
    message.error(String(error));
  } finally {
    openingPath.value = null;
  }
}
</script>

<template>
  <section class="mx-auto w-full max-w-none">
    <h1 class="apple-title">设置</h1>
    <p class="muted mt-2 text-sm">控制外观、Codex 路径和重启行为。</p>

    <div class="apple-group mt-6 flex p-1">
      <button type="button" class="h-9 flex-1 rounded-xl px-3 text-sm transition-colors" :class="section === 'general' ? 'bg-[var(--selection-bg)] font-semibold text-[#007aff]' : 'font-medium hover:bg-black/5 dark:hover:bg-white/8'" @click="section = 'general'">通用</button>
      <button type="button" class="h-9 flex-1 rounded-xl px-3 text-sm transition-colors" :class="section === 'codex' ? 'bg-[var(--selection-bg)] font-semibold text-[#007aff]' : 'font-medium hover:bg-black/5 dark:hover:bg-white/8'" @click="section = 'codex'">Codex</button>
      <button type="button" class="h-9 flex-1 rounded-xl px-3 text-sm transition-colors" :class="section === 'about' ? 'bg-[var(--selection-bg)] font-semibold text-[#007aff]' : 'font-medium hover:bg-black/5 dark:hover:bg-white/8'" @click="section = 'about'">关于</button>
    </div>

    <div v-if="section === 'general'" class="apple-group mt-4 p-5 sm:p-6">
      <h2 class="text-lg font-semibold tracking-tight">通用</h2>
      <n-form class="mt-5" label-placement="top">
        <n-form-item label="主题">
          <div class="w-full space-y-2">
            <n-select v-model:value="form.theme" :options="themeOptions" :loading="savingGeneral" @update:value="updateTheme" />
            <p class="muted text-xs">选择后立即生效并保存。</p>
          </div>
        </n-form-item>
        <n-form-item label="应用配置后自动重启 Codex">
          <div class="flex items-center gap-3">
            <n-switch v-model:value="form.auto_restart" :loading="savingGeneral" @update:value="updateAutoRestart" />
            <span class="muted text-sm">关闭时仅写入 config.toml，由你手动点击重启。</span>
          </div>
        </n-form-item>
      </n-form>
    </div>

    <div v-else-if="section === 'codex'" class="apple-group mt-4 p-5 sm:p-6">
      <h2 class="text-lg font-semibold tracking-tight">Codex</h2>
      <n-form class="mt-5" label-placement="top">
        <n-form-item label="Codex / ChatGPT 应用路径覆盖">
          <n-input v-model:value="form.codex_app_path" clearable placeholder="留空使用自动识别" />
        </n-form-item>
        <n-form-item label="重启等待超时（毫秒）">
          <n-input-number v-model:value="form.restart_timeout_ms" :min="1000" :max="60000" :step="500" class="w-full" />
        </n-form-item>
        <div class="flex justify-end">
          <n-button type="primary" :loading="saving" @click="save">保存设置</n-button>
        </div>
      </n-form>
    </div>

    <div v-else class="apple-group mt-4 p-5 sm:p-6">
      <h2 class="text-lg font-semibold tracking-tight">数据与路径</h2>
      <p class="muted mt-2 text-sm">所有本机数据固定保存在用户 Home 目录，不会进入 Git。</p>
      <n-divider />
      <n-list class="bg-transparent" :show-divider="true">
        <n-list-item v-for="item in state.paths" :key="item.label">
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <div class="text-sm font-semibold">{{ item.label }}</div>
              <div class="mono muted mt-1 break-all text-xs">{{ item.path }}</div>
            </div>
            <n-button size="small" secondary :loading="openingPath === item.path" :disabled="Boolean(openingPath)" title="在资源管理器中打开" @click="openPath(item)">
              <template #icon>
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M3.75 7.75A2.75 2.75 0 0 1 6.5 5h3l1.7 2h6.05A2.75 2.75 0 0 1 20 9.75v7.75a2.75 2.75 0 0 1-2.75 2.75h-10.5A2.75 2.75 0 0 1 4 17.5V9.75" stroke-linejoin="round" />
                </svg>
              </template>
              打开
            </n-button>
          </div>
        </n-list-item>
      </n-list>
    </div>
  </section>
</template>
