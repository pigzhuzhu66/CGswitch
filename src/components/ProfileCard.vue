<script setup lang="ts">
import { NButton, NTag } from "naive-ui";
import type { ProfileSummary } from "../types";

defineProps<{
  profile: ProfileSummary;
  active: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  apply: [];
  rename: [];
  remove: [];
}>();
</script>

<template>
  <article class="grid gap-3 border-l-2 px-4 py-4 transition-colors lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto_auto] lg:items-center lg:gap-4" :class="active ? 'border-indigo-600 bg-indigo-50/55 dark:bg-white/3' : 'border-transparent hover:bg-black/2 dark:hover:bg-white/2'">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h3 class="truncate font-semibold">{{ profile.name }}</h3>
        <n-tag v-if="active" type="success" size="small">当前生效</n-tag>
      </div>
    </div>
    <div class="min-w-0 text-sm">
      <div class="muted text-xs lg:hidden">模型</div>
      <div class="mono truncate">{{ profile.model ?? "未设置" }}</div>
    </div>
    <div class="min-w-0 text-sm">
      <div class="muted text-xs lg:hidden">Provider</div>
      <div class="mono truncate">{{ profile.provider ?? "官方" }}</div>
    </div>
    <div class="min-w-0 text-sm">
      <div class="muted text-xs lg:hidden">推理强度</div>
      <div class="mono truncate">{{ profile.reasoning_effort ?? "默认" }}</div>
    </div>
    <div class="hidden lg:block">
      <span v-if="active" class="text-sm text-emerald-700 dark:text-emerald-400">已应用</span>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <n-button type="primary" size="small" :disabled="busy || active" @click="emit('apply')">应用</n-button>
      <n-button size="small" :disabled="busy" @click="emit('rename')">重命名</n-button>
      <n-button size="small" quaternary type="error" :disabled="busy" @click="emit('remove')">删除</n-button>
    </div>
  </article>
</template>
