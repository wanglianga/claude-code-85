<script setup lang="ts">
import { onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import ToastHost from '@/components/ToastHost.vue'
import { useSystemStore } from '@/stores/system'
import { useAuthStore } from '@/stores/auth'

const system = useSystemStore()
const auth = useAuthStore()

onMounted(() => {
  system.startClock()
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
