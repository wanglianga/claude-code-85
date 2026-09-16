import { computed, ref } from 'vue'
import type { Visit } from '@/types'
import { useBranchStore } from '@/stores/branch'

// 全局夜间滞留处置抽屉（巡检页/档案/总览均可打开，次日仍可追溯）
const visitId = ref<string | null>(null)

export function useStrandedViewer() {
  const branch = useBranchStore()
  const visit = computed<Visit | null>(
    () => (visitId.value ? branch.visits.find((v) => v.id === visitId.value) ?? null : null)
  )
  return {
    visit,
    open: (id: string) => {
      visitId.value = id
    },
    close: () => {
      visitId.value = null
    }
  }
}
