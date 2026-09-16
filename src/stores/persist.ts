import type { PiniaPluginContext } from 'pinia'

// localStorage 持久化：按 store 白名单保存关键状态（演示数据可跨刷新保留）
const STORAGE_KEY = 'urban-studyroom-state-v3'

const PERSIST_KEYS: Record<string, string[]> = {
  auth: ['account'],
  system: ['currentLibraryId', 'blackout', 'blackoutAt'],
  branch: [
    'readers', 'visits', 'books', 'devices', 'usageLogs',
    'lostItems', 'complaints', 'patrols', 'transfers', 'creditRecords', 'activities'
  ],
  incident: ['incidents'],
  inspection: ['inspections', 'businessDay']
}

interface SavedState {
  [storeId: string]: Record<string, unknown>
}

function load(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedState) : {}
  } catch {
    return {}
  }
}

export function persistPlugin(context: PiniaPluginContext) {
  const keys = PERSIST_KEYS[context.store.$id]
  if (!keys) return
  const saved = load()[context.store.$id]
  if (saved) {
    const patch: Record<string, unknown> = {}
    for (const k of keys) {
      if (saved[k] !== undefined) patch[k] = saved[k]
    }
    context.store.$patch(patch as Record<string, unknown> as never)
  }
  context.store.$subscribe(
    () => {
      try {
        const all = load()
        const slice: Record<string, unknown> = {}
        for (const k of keys) slice[k] = (context.store.$state as Record<string, unknown>)[k]
        all[context.store.$id] = slice
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
      } catch {
        // 存储已满或被禁用时忽略
      }
    },
    { flush: 'sync' }
  )
}

export function resetDemoData() {
  localStorage.removeItem(STORAGE_KEY)
  location.reload()
}
