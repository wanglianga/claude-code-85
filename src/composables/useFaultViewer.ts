import { computed, ref } from 'vue'
import { useFaultsStore } from '@/stores/faults'

// 全局设备故障工单抽屉
const faultId = ref<string | null>(null)
/** 新建工单时预选的设备 */
const createDeviceId = ref<string | null>(null)

export function useFaultViewer() {
  const faults = useFaultsStore()
  const fault = computed(() => (faultId.value ? faults.byId(faultId.value) ?? null : null))
  return {
    faultId,
    fault,
    open: (id: string) => {
      faultId.value = id
    },
    close: () => {
      faultId.value = null
    },
    createDeviceId,
    openCreate: (deviceId: string) => {
      createDeviceId.value = deviceId
    },
    closeCreate: () => {
      createDeviceId.value = null
    }
  }
}
