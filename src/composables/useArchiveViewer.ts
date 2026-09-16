import { computed, ref } from 'vue'
import type { Inspection } from '@/types'
import { useInspectionStore } from '@/stores/inspection'

// 全局只读交接档案抽屉
const archiveId = ref<string | null>(null)

export function useArchiveViewer() {
  const inspStore = useInspectionStore()
  const archive = computed<Inspection | null>(
    () => (archiveId.value ? inspStore.archiveById(archiveId.value) ?? null : null)
  )
  return {
    archiveId,
    archive,
    open: (id: string) => {
      archiveId.value = id
    },
    close: () => {
      archiveId.value = null
    }
  }
}
