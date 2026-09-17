import { computed, ref } from 'vue'
import { useBlackoutStore } from '@/stores/blackout'

// 全局停电复盘抽屉：应急视图/档案中打开
const reviewCaseId = ref<string | null>(null)

export function useBlackoutViewer() {
  const store = useBlackoutStore()
  const reviewCase = computed(() => (reviewCaseId.value ? store.byId(reviewCaseId.value) ?? null : null))
  return {
    reviewCaseId,
    reviewCase,
    openReview: (id: string) => {
      reviewCaseId.value = id
    },
    closeReview: () => {
      reviewCaseId.value = null
    }
  }
}
