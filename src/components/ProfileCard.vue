<script setup lang="ts">
import { NButton, NCard, NTag } from "naive-ui";
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
  <n-card class="profile-card" :class="{ active }" content-class="!p-5">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="truncate text-lg font-bold">{{ profile.name }}</h3>
          <n-tag v-if="active" type="success" size="small" round>当前生效</n-tag>
        </div>
        <dl class="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt class="muted text-xs">模型</dt>
            <dd class="mono mt-1 truncate font-semibold">{{ profile.model ?? "未设置" }}</dd>
          </div>
          <div>
            <dt class="muted text-xs">Provider</dt>
            <dd class="mono mt-1 truncate font-semibold">{{ profile.provider ?? "官方" }}</dd>
          </div>
          <div>
            <dt class="muted text-xs">推理强度</dt>
            <dd class="mono mt-1 truncate font-semibold">{{ profile.reasoning_effort ?? "默认" }}</dd>
          </div>
        </dl>
      </div>

      <div class="flex shrink-0 flex-col gap-2">
        <n-button type="primary" size="small" :disabled="busy || active" @click="emit('apply')">应用</n-button>
        <n-button size="small" :disabled="busy" @click="emit('rename')">重命名</n-button>
        <n-button size="small" quaternary type="error" :disabled="busy" @click="emit('remove')">删除</n-button>
      </div>
    </div>
  </n-card>
</template>

<style scoped>
.profile-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.profile-card:hover {
  transform: translateY(-1px);
}

.profile-card.active {
  box-shadow: 0 0 0 1px rgba(34, 195, 142, 0.32), 0 18px 42px rgba(34, 195, 142, 0.1);
}
</style>
