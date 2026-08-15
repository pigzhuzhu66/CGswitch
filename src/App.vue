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

watch(
  isDark,
  (dark) => {
    document.documentElement.classList.toggle("dark", dark);
  },
  { immediate: true },
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
          <div class="flex h-full">
            <aside class="panel hidden w-[236px] shrink-0 border-r p-5 lg:block">
              <div class="flex items-center gap-3">
                <div class="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-emerald-400 text-lg font-black text-white">SG</div>
                <div>
                  <div class="text-base font-bold">SwitchGPT</div>
                  <div class="muted text-xs">Codex Profile Manager</div>
                </div>
              </div>

              <nav class="mt-8 space-y-2">
                <button type="button" class="h-11 w-full rounded-xl px-4 text-left text-sm font-semibold transition" :class="view === 'profiles' ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25' : 'hover:bg-black/5 dark:hover:bg-white/5'" @click="view = 'profiles'">
                  配置档案
                </button>
                <button type="button" class="h-11 w-full rounded-xl px-4 text-left text-sm font-semibold transition" :class="view === 'settings' ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25' : 'hover:bg-black/5 dark:hover:bg-white/5'" @click="view = 'settings'">
                  设置
                </button>
              </nav>

            </aside>

            <main class="min-w-0 flex-1 overflow-auto px-5 py-6 lg:px-8">
              <div class="mb-4 flex gap-2 lg:hidden">
                <n-button :type="view === 'profiles' ? 'primary' : 'default'" size="small" @click="view = 'profiles'">档案</n-button>
                <n-button :type="view === 'settings' ? 'primary' : 'default'" size="small" @click="view = 'settings'">设置</n-button>
              </div>
              <ProfilesView v-if="view === 'profiles'" :state="state" @refresh="refresh" />
              <SettingsView v-else :state="state" @refresh="refresh" @saved="saveSettings" />
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
