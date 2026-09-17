<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import ToastHost from '@/components/ToastHost.vue'
import IncidentDrawer from '@/components/IncidentDrawer.vue'
import HandoverArchiveDrawer from '@/components/HandoverArchiveDrawer.vue'
import StrandedDrawer from '@/components/StrandedDrawer.vue'
import FaultDrawer from '@/components/FaultDrawer.vue'
import FaultCreateDrawer from '@/components/FaultCreateDrawer.vue'
import { useSystemStore } from '@/stores/system'
import { useAuthStore } from '@/stores/auth'
import { useIncidentViewer } from '@/composables/useIncidentViewer'

const route = useRoute()
const system = useSystemStore()
const auth = useAuthStore()
const incidentViewer = useIncidentViewer()
const globalIncident = computed(() => incidentViewer.incident.value)

// 应急视图、街道值班台自带全屏布局，不套管理后台外壳
const bareRoutes = ['emergency', 'street']
const isBare = computed(() => bareRoutes.includes(route.name as string))

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
    <component :is="Component" v-else-if="isBare" />
    <AppLayout v-else>
      <component :is="Component" />
    </AppLayout>
  </RouterView>

  <!-- 全局抽屉在 App 层挂载一次：裸路由（应急视图/街道台）也能打开事件 -->
  <IncidentDrawer :incident="globalIncident" @close="incidentViewer.close()" />
  <HandoverArchiveDrawer />
  <StrandedDrawer />
  <FaultDrawer />
  <FaultCreateDrawer />
  <ToastHost />
</template>
