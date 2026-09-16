import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CheckKey, CheckState, IncidentSeverity, IncidentType, Inspection, Role } from '@/types'
import { buildTodayInspection, seedInspections } from '@/data/seed'
import { useIncidentStore } from '@/stores/incident'

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

/** 巡检项异常时自动生成的事件类型映射 */
const abnormalIncidentMap: Partial<
  Record<
    CheckKey,
    { type: IncidentType; severity: IncidentSeverity; title: string; detail: string }
  >
> = {
  people: { type: 'stranded', severity: 'high', title: '巡检发现仍有读者滞留', detail: '闭馆巡检“人员清场”项异常：仍有读者未离馆，立即按滞留预案处置。' },
  doors: { type: 'gate-abnormal', severity: 'high', title: '门窗检查异常', detail: '闭馆巡检“门窗”项异常：门/窗/门磁存在未锁闭或告警。' },
  fire: { type: 'fire-alarm', severity: 'urgent', title: '消防检查异常', detail: '闭馆巡检“消防”项异常：通道占用、灭火器封签破损或主机告警。' },
  ac: { type: 'light-ac-on', severity: 'low', title: '空调未关闭', detail: '闭馆巡检发现空调仍在运行。' },
  light: { type: 'light-ac-on', severity: 'low', title: '灯光未关闭', detail: '闭馆巡检发现照明未关（应急照明除外）。' },
  kiosk: { type: 'device-fault', severity: 'medium', title: '自助机状态异常', detail: '闭馆巡检发现自助机未正常关机/待机或有遗留打印件。' },
  returnbox: { type: 'box-full', severity: 'medium', title: '还书箱需清运', detail: '闭馆巡检确认还书箱容量偏高，需安排清运。' },
  gate: { type: 'unmanned-access', severity: 'high', title: '无人值守门禁布防异常', detail: '门禁无法布防或闯入测试失败。' },
  camera: { type: 'camera-offline', severity: 'high', title: '摄像头巡检异常', detail: '无人值守巡检发现摄像头离线或录像异常。' },
  firesys: { type: 'fire-alarm', severity: 'urgent', title: '消防系统联网异常', detail: '无人值守巡检发现烟感/消防主机离线。' },
  sound: { type: 'abnormal-sound', severity: 'medium', title: '异常声音监测未布防', detail: '拾音监测未进入布防状态。' },
  help: { type: 'help-request', severity: 'medium', title: '求助通道未转值班手机', detail: '一键求助夜间转接未配置。' }
}

export const useInspectionStore = defineStore('inspection', () => {
  const inspections = ref<Inspection[]>(clone(seedInspections))

  function ofDate(libraryId: string, date: string): Inspection {
    let insp = inspections.value.find((i) => i.libraryId === libraryId && i.date === date)
    if (!insp) {
      insp = buildTodayInspection(libraryId)
      insp.date = date
      inspections.value.push(insp)
    }
    return insp
  }

  function today(libraryId: string): Inspection {
    const date = new Date().toISOString().slice(0, 10)
    return ofDate(libraryId, date)
  }

  function start(insp: Inspection, at: number) {
    if (!insp.startedAt) insp.startedAt = at
  }

  const handoverKeys: CheckKey[] = ['people', 'doors', 'fire', 'ac', 'light', 'kiosk', 'returnbox']
  const unmannedKeys: CheckKey[] = ['gate', 'camera', 'firesys', 'sound', 'help']

  function setItem(
    insp: Inspection,
    key: CheckKey,
    state: CheckState,
    who: string,
    at: number,
    libraryId: string,
    remark?: string
  ) {
    const item = insp.items.find((i) => i.key === key)
    if (!item) return
    item.state = state
    item.confirmedBy = who
    item.confirmedAt = at
    item.remark = remark

    // 异常：自动创建事件，让管理员/安保/维护/读者服务围绕同一事件处理
    if (state === 'abnormal' && !item.incidentId) {
      const tpl = abnormalIncidentMap[key]
      if (tpl) {
        const incidentStore = useIncidentStore()
        const inc = incidentStore.create({
          libraryId,
          type: tpl.type,
          severity: tpl.severity,
          title: tpl.title,
          detail: remark ? `${tpl.detail} 备注：${remark}` : tpl.detail,
          at,
          night: true,
          owner: key === 'people' || key === 'help' ? 'security' : key === 'kiosk' || key === 'ac' || key === 'light' ? 'maintainer' : 'security'
        })
        item.incidentId = inc.id
      }
    }
  }

  function sign(insp: Inspection, domain: keyof Inspection['signatures'], who: string) {
    insp.signatures[domain] = who
  }

  function setAfterCloseCheck(insp: Inspection, ok: boolean) {
    insp.afterCloseCheck = ok
  }

  function handoverDone(insp: Inspection): boolean {
    return insp.items
      .filter((i) => i.scope === 'handover')
      .every((i) => i.state !== 'pending')
  }

  function progress(insp: Inspection): { done: number; total: number; abnormal: number } {
    const done = insp.items.filter((i) => i.state !== 'pending').length
    const abnormal = insp.items.filter((i) => i.state === 'abnormal').length
    return { done, total: insp.items.length, abnormal }
  }

  function canFinish(insp: Inspection): boolean {
    const allChecked = insp.items.every((i) => i.state !== 'pending')
    const signed = !!(insp.signatures.people && insp.signatures.books && insp.signatures.devices && insp.signatures.safety)
    return !!insp.startedAt && allChecked && signed && insp.afterCloseCheck === true
  }

  /** 完成闭馆交接：人员、图书、设备、公共安全全部交接；未结事件转遗留 */
  function finish(insp: Inspection, at: number, actor: string, libraryId: string): boolean {
    if (!canFinish(insp)) return false
    insp.finishedAt = at
    const incidentStore = useIncidentStore()
    incidentStore.markCarryOver(libraryId, at)
    void actor
    return true
  }

  function reopen(insp: Inspection) {
    insp.finishedAt = undefined
  }

  function reset(libraryId: string) {
    const date = new Date().toISOString().slice(0, 10)
    const idx = inspections.value.findIndex((i) => i.libraryId === libraryId && i.date === date)
    const fresh = buildTodayInspection(libraryId)
    if (idx >= 0) inspections.value[idx] = fresh
    else inspections.value.push(fresh)
  }

  /** 角色对交接域的建议签字范围（仅用于界面分组提示，不强制） */
  const signatureDomains: { key: keyof Inspection['signatures']; label: string; hint: string; role: Role }[] = [
    { key: 'people', label: '人员交接', hint: '在馆人数清零、滞留处置完成', role: 'security' },
    { key: 'books', label: '图书交接', hint: '借出/在馆图书台账一致、消磁失败已处理', role: 'admin' },
    { key: 'devices', label: '设备交接', hint: '自助机/空调/灯光关闭、故障有工单', role: 'maintainer' },
    { key: 'safety', label: '公共安全交接', hint: '门窗、消防、技防布防完成', role: 'security' }
  ]

  return {
    inspections,
    handoverKeys,
    unmannedKeys,
    ofDate,
    today,
    start,
    setItem,
    sign,
    setAfterCloseCheck,
    handoverDone,
    progress,
    canFinish,
    finish,
    reopen,
    reset,
    signatureDomains
  }
})
