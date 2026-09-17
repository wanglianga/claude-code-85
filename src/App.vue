<script setup lang="ts">
import { onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import ToastHost from '@/components/ToastHost.vue'
import { useSystemStore } from '@/stores/system'
import { useBlackoutStore } from '@/stores/blackout'
import { useAuthStore } from '@/stores/auth'

const system = useSystemStore()
const blackout = useBlackoutStore()
const auth = useAuthStore()

onMounted(() => {
  system.startClock()
  // 刷新后按持久化的停电事件同步书房状态
  for (const lib of system.libraries) {
    const e = blackout.activeOf(lib.id)
    if (e) system.setLibraryStatus(lib.id, e.earlyClose && e.phase !== 'closed' ? 'closing' : 'blackout')
  }
  void auth
})
</script>

<template>
  <RouterView v-slot="{ Component }">
    <template v-if="$route.meta.public">
      <component :is="Component" />
    </template>
    <AppLayout v-else>
      <component :is="Component" />
    </AppLayout>
  </RouterView>
  <ToastHost />
</template>
