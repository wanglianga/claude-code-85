import { computed, ref } from 'vue'
import type { Incident } from '@/types'
import { useIncidentStore } from '@/stores/incident'

// 全局事件抽屉：各页面只负责 open(id)，抽屉在布局中挂载一次，避免重复实例
const selectedId = ref<string | null>(null)

export function useIncidentViewer() {
  const incidentStore = useIncidentStore()
  const incident = computed<Incident | null>(
    () => (selectedId.value ? incidentStore.incidents.find((i) => i.id === selectedId.value) ?? null : null)
  )
  return {
    selectedId,
    incident,
    open: (id: string) => {
      selectedId.value = id
    },
    show: (inc: Incident) => {
      selectedId.value = inc.id
    },
    close: () => {
      selectedId.value = null
    }
  }
}
