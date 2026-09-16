import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Library } from '@/types'
import { seedLibraries } from '@/data/seed'

/** 以 base 所在的本地日期，组合 HH:mm 为时间戳（保证模拟跨日时倒计时仍正确） */
function hhmmOn(base: number, hhmm: string): number {
  const d = new Date(base)
  const [h, m] = hhmm.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

export const useSystemStore = defineStore('system', () => {
  const libraries = ref<Library[]>(JSON.parse(JSON.stringify(seedLibraries)))
  const currentLibraryId = ref<string>('lib-zhongshan')
  /** 全局当前时间（每秒走动；可由演示控制调整） */
  const now = ref(Date.now())
  /** 演示时间模式：非 null 时按模拟时钟自走，不被真实时间覆盖 */
  const simulated = ref(false)
  /** 演示快进倍率（如 60 = 每秒前进 1 分钟） */
  const scale = ref(1)
  /** 突发停电状态 */
  const blackout = ref(false)
  const blackoutAt = ref<number | undefined>(undefined)

  let timer: number | undefined
  function startClock() {
    if (timer) return
    timer = window.setInterval(() => {
      if (simulated.value) now.value += 1000 * scale.value
      else now.value = Date.now()
    }, 1000)
  }

  const currentLibrary = computed(
    () => libraries.value.find((l) => l.id === currentLibraryId.value) ?? libraries.value[0]
  )

  /** 当前书房闭馆时间戳（按当前时钟所在日期计算，跨日自动跟随） */
  const closeTs = computed(() => hhmmOn(now.value, currentLibrary.value.closeTime))
  const openTs = computed(() => hhmmOn(now.value, currentLibrary.value.openTime))

  const msToClose = computed(() => closeTs.value - now.value)
  const isAfterClose = computed(() => now.value >= closeTs.value)
  const isBeforeOpen = computed(() => now.value < openTs.value)
  const isNight = computed(() => isAfterClose.value || isBeforeOpen.value)

  function switchLibrary(id: string) {
    currentLibraryId.value = id
  }

  function setLibraryStatus(id: string, status: Library['status']) {
    const lib = libraries.value.find((l) => l.id === id)
    if (lib) lib.status = status
  }

  /** 演示：把时钟跳到某书房闭馆前 N 分钟，并按倍率自走 */
  function jumpBeforeClose(minutes: number, fastScale = 60) {
    now.value = hhmmOn(now.value, currentLibrary.value.closeTime) - minutes * 60_000
    simulated.value = true
    scale.value = fastScale
  }
  function jumpToAfterClose(minutes: number, fastScale = 60) {
    now.value = hhmmOn(now.value, currentLibrary.value.closeTime) + minutes * 60_000
    simulated.value = true
    scale.value = fastScale
  }
  /** 演示：把时钟跳到指定时间戳并进入模拟模式（按正常秒速自走） */
  function jumpToTimestamp(ts: number) {
    now.value = ts
    simulated.value = true
    scale.value = 1
  }

  function resumeRealTime() {
    simulated.value = false
    scale.value = 1
    now.value = Date.now()
  }

  function triggerBlackout() {
    blackout.value = true
    blackoutAt.value = now.value
  }
  function restorePower() {
    blackout.value = false
    blackoutAt.value = undefined
  }

  return {
    libraries,
    currentLibraryId,
    currentLibrary,
    now,
    simulated,
    scale,
    blackout,
    blackoutAt,
    closeTs,
    openTs,
    msToClose,
    isAfterClose,
    isBeforeOpen,
    isNight,
    startClock,
    switchLibrary,
    setLibraryStatus,
    jumpBeforeClose,
    jumpToAfterClose,
    jumpToTimestamp,
    resumeRealTime,
    triggerBlackout,
    restorePower
  }
})
