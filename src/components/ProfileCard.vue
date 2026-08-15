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
  <article class="flex flex-col gap-4 px-5 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between" :class="active ? 'bg-[var(--selection-bg)]' : 'hover:bg-black/3 dark:hover:bg-white/4'">
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <h3 class="truncate font-semibold">{{ profile.name }}</h3>
        <n-tag v-if="active" type="success" size="small">当前生效</n-tag>
      </div>
      <div class="muted mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span class="mono">{{ profile.model ?? "未设置" }}</span>
        <span>{{ profile.provider ?? "官方" }}</span>
        <span>推理：{{ profile.reasoning_effort ?? "默认" }}</span>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <n-button type="primary" size="small" :disabled="busy || active" @click="emit('apply')">应用</n-button>
      <n-button size="small" :disabled="busy" @click="emit('rename')">重命名</n-button>
      <n-button size="small" quaternary type="error" :disabled="busy" @click="emit('remove')">删除</n-button>
    </div>
  </article>
</template>
