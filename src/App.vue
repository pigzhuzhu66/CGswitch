<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  NButton,
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NLayout,
  NMessageProvider,
  darkTheme,
} from "naive-ui";
import ProfilesView from "./views/ProfilesView.vue";
import SettingsView from "./views/SettingsView.vue";
import { api } from "./api";
import { themeOverrides } from "./theme";
import type { AppState, Settings } from "./types";

type View = "profiles" | "settings";

const view = ref<View>("profiles");
const sidebarCollapsed = ref(false);
const state = ref<AppState | null>(null);
const loadError = ref("");
const systemDark = ref(window.matchMedia("(prefers-color-scheme: dark)").matches);

const media = window.matchMedia("(prefers-color-scheme: dark)");
const mediaListener = (event: MediaQueryListEvent) => {
  systemDark.value = event.matches;
};

const isDark = computed(() => {
  const theme = state.value?.settings.theme ?? "system";
  return theme === "dark" || (theme === "system" && systemDark.value);
});
const naiveTheme = computed(() => (isDark.value ? darkTheme : null));

async function refresh() {
  try {
    state.value = await api.getState();
    loadError.value = "";
  } catch (error) {
    loadError.value = String(error);
  }
}

async function saveSettings(settings: Settings) {
  if (!state.value) return;
  state.value = { ...state.value, settings };
}

function previewTheme(theme: Settings["theme"]) {
  if (!state.value) return;
  state.value = { ...state.value, settings: { ...state.value.settings, theme } };
}

watch(
  isDark,
  (dark) => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  },
  { immediate: true, flush: "sync" },
);

onMounted(async () => {
  media.addEventListener("change", mediaListener);
  await refresh();
});

onBeforeUnmount(() => {
  media.removeEventListener("change", mediaListener);
});
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-dialog-provider>
      <n-message-provider>
        <n-global-style />
        <n-layout v-if="state" class="h-full! rounded-none! bg-transparent!">
          <div class="flex min-h-screen">
            <aside class="apple-sidebar relative hidden min-h-screen shrink-0 p-3 lg:block" :class="sidebarCollapsed ? ['w-[68px]', 'apple-sidebar--collapsed'] : 'w-[204px]'">
              <div class="apple-sidebar-brand flex items-center gap-3">
                <div class="grid h-9 w-9 place-items-center rounded-xl bg-white text-sm font-bold text-[#007aff] shadow-sm dark:bg-white/10">SG</div>
                <div class="apple-sidebar-label" :aria-hidden="sidebarCollapsed">
                  <div class="text-sm font-bold">SwitchGPT</div>
                  <div class="muted text-[11px]">Codex Profile Manager</div>
                </div>
              </div>

              <nav class="mt-8 space-y-1">
                <button type="button" class="apple-sidebar-nav-button relative flex h-9 w-full items-center rounded-[10px] text-sm transition-colors" :class="view === 'profiles' ? 'bg-[var(--selection-bg)] font-semibold text-[#007aff] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[#007aff]' : 'font-medium hover:bg-black/5 dark:hover:bg-white/8'" :title="sidebarCollapsed ? '配置档案' : undefined" aria-label="配置档案" @click="view = 'profiles'">
                  <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
                    <path d="M8.5 9h7M8.5 12h7M8.5 15h4" stroke-linecap="round" />
                  </svg>
                  <span class="apple-sidebar-label" :aria-hidden="sidebarCollapsed">配置档案</span>
                </button>
                <button type="button" class="apple-sidebar-nav-button relative flex h-9 w-full items-center rounded-[10px] text-sm transition-colors" :class="view === 'settings' ? 'bg-[var(--selection-bg)] font-semibold text-[#007aff] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[#007aff]' : 'font-medium hover:bg-black/5 dark:hover:bg-white/8'" :title="sidebarCollapsed ? '设置' : undefined" aria-label="设置" @click="view = 'settings'">
                  <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <path d="M5.5 7.5h13M5.5 12h13M5.5 16.5h13" stroke-linecap="round" />
                    <circle cx="9" cy="7.5" r="1.5" fill="var(--panel-bg)" />
                    <circle cx="15" cy="12" r="1.5" fill="var(--panel-bg)" />
                    <circle cx="11" cy="16.5" r="1.5" fill="var(--panel-bg)" />
                  </svg>
                  <span class="apple-sidebar-label" :aria-hidden="sidebarCollapsed">设置</span>
                </button>
              </nav>

              <div class="absolute inset-x-3 bottom-4">
                <button type="button" class="apple-sidebar-toggle apple-sidebar-nav-button flex h-9 items-center rounded-[10px] text-sm" :class="sidebarCollapsed ? 'mx-auto w-9 bg-[var(--selection-bg)] font-semibold text-[#007aff]' : 'w-full font-medium hover:bg-black/5 dark:hover:bg-white/8'" :title="sidebarCollapsed ? '展开侧边栏' : undefined" :aria-label="sidebarCollapsed ? '展开侧边栏' : '收缩侧边栏'" @click="sidebarCollapsed = !sidebarCollapsed">
                  <svg class="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                    <rect x="4.5" y="5.5" width="15" height="13" rx="3" />
                    <path d="M12 5.5v13" stroke-linecap="round" />
                  </svg>
                  <span class="apple-sidebar-label" :aria-hidden="sidebarCollapsed">收缩侧边栏</span>
                </button>
              </div>
            </aside>

            <main class="min-w-0 flex-1 overflow-auto bg-[var(--app-bg)] px-5 py-7 lg:px-10">
              <div class="mb-4 flex gap-2 lg:hidden">
                <n-button :type="view === 'profiles' ? 'primary' : 'default'" size="small" @click="view = 'profiles'">档案</n-button>
                <n-button :type="view === 'settings' ? 'primary' : 'default'" size="small" @click="view = 'settings'">设置</n-button>
              </div>
              <ProfilesView v-if="view === 'profiles'" :state="state" @refresh="refresh" />
              <SettingsView v-else :state="state" @preview-theme="previewTheme" @refresh="refresh" @saved="saveSettings" />
            </main>
          </div>
        </n-layout>

        <div v-else class="grid h-full place-items-center text-center">
          <div>
            <div class="text-lg font-semibold">正在加载 SwitchGPT…</div>
            <div v-if="loadError" class="muted mt-2">{{ loadError }}</div>
          </div>
        </div>
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
