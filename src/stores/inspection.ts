import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  CheckKey,
  CheckState,
  HandoverSnapshot,
  IncidentSeverity,
  IncidentType,
  Inspection,
  Role
} from '@/types'
import { buildTodayInspection, seedInspections } from '@/data/seed'
import { useIncidentStore } from '@/stores/incident'
import { useBranchStore } from '@/stores/branch'
import { useSystemStore } from '@/stores/system'
import { useStrandedStore } from '@/stores/stranded'
import { fmtDate } from '@/utils/format'

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

/** 次日开馆结果 */
export interface OpenDayResult {
  /** 是否本次实际切换（false=已是该营业日，幂等无副作用） */
  switched: boolean
  newDate: string
  archive: Inspection | null
  /** 新日继续待办、可回链前夜档案的遗留事件数 */
  carryCount: number
}

export const useInspectionStore = defineStore('inspection', () => {
  const inspections = ref<Inspection[]>(clone(seedInspections))
  /** 各书房当前营业日 YYYY-MM-DD（次日开馆只推进它，绝不改写历史档案） */
  const businessDay = ref<Record<string, string>>({})

  function currentDate(libraryId: string): string {
    if (!businessDay.value[libraryId]) {
      businessDay.value[libraryId] = fmtDate(Date.now())
    }
    return businessDay.value[libraryId]
  }

  function ofDate(libraryId: string, date: string): Inspection {
    let insp = inspections.value.find((i) => i.libraryId === libraryId && i.date === date)
    if (!insp) {
      insp = buildTodayInspection(libraryId)
      insp.date = date
      inspections.value.push(insp)
    }
    return insp
  }

  /** 当前营业日的巡检单（次日开馆后是全新空白单，不会是前夜“进行中”的旧单） */
  function current(libraryId: string): Inspection {
    return ofDate(libraryId, currentDate(libraryId))
  }

  function today(libraryId: string): Inspection {
    return current(libraryId)
  }

  /** 已固化的夜间交接档案（按完成时间倒序） */
  function archives(libraryId: string): Inspection[] {
    return inspections.value
      .filter((i) => i.libraryId === libraryId && i.frozen && i.archive)
      .sort((a, b) => (b.archive?.finishedAt ?? 0) - (a.archive?.finishedAt ?? 0))
  }

  function archiveById(id: string): Inspection | undefined {
    return inspections.value.find((i) => i.id === id && i.frozen)
  }

  function start(insp: Inspection, at: number) {
    if (insp.frozen) return
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
    if (insp.frozen) return // 档案只读
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
    if (insp.frozen) return
    insp.signatures[domain] = who
  }

  function setAfterCloseCheck(insp: Inspection, ok: boolean) {
    if (insp.frozen) return
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

  /**
   * 闭馆完成前置条件：12 项检完、四方签字、灯光空调复核；
   * 且夜间滞留读者必须全部完成处置（有决策 + 最终离馆时间，未成年人已通知监护人）。
   */
  function blockedReasons(insp: Inspection): string[] {
    const reasons: string[] = []
    if (!insp.startedAt) reasons.push('巡检尚未开始')
    const pending = insp.items.filter((i) => i.state === 'pending')
    if (pending.length) reasons.push(`仍有 ${pending.length} 项未检查`)
    const domains: (keyof Inspection['signatures'])[] = ['people', 'books', 'devices', 'safety']
    const unsigned = domains.filter((d) => !insp.signatures[d])
    if (unsigned.length) reasons.push(`交接签字未完成（${unsigned.length} 方）`)
    if (insp.afterCloseCheck !== true) reasons.push('未完成闭馆后灯光空调复核')
    const branch = useBranchStore()
    const stillHere = branch.activeVisits(insp.libraryId)
    if (stillHere.length) {
      reasons.push(`仍有 ${stillHere.length} 名读者在馆，请先执行闭馆后滞留扫描并完成处置或签离`)
    }
    const stranded = useStrandedStore().unresolved(insp.libraryId)
    if (stranded.length) {
      reasons.push(
        `仍有 ${stranded.length} 名夜间滞留读者未完成处置（须安保到场、管理员劝离/延时/报警决策、记录最终离馆时间；未成年人须先通知监护人）`
      )
    }
    return reasons
  }

  function canFinish(insp: Inspection): boolean {
    if (insp.frozen) return false
    return blockedReasons(insp).length === 0
  }

  /**
   * 完成闭馆交接：把当前营业日巡检单固化为「夜间交接档案」。
   * 固化后该 Inspection 永久只读：含 12 项结果、异常关联事件、四方签字、灯光空调复核、
   * 完成时间、闭馆结论与随档案移交的遗留事件清单。任何开馆/重置操作都不得改写。
   */
  function finish(insp: Inspection, at: number, actor: string, libraryId: string, conclusion = ''): HandoverSnapshot | null {
    if (!canFinish(insp)) return null
    const incidentStore = useIncidentStore()
    const strandedStore = useStrandedStore()
    const carryIds = incidentStore.attachToArchive(libraryId, insp.id, insp.date, at)
    const strandedVisitIds = strandedStore
      .strandedVisits(libraryId)
      .filter((v) => v.strandedHandling!.discoveredAt <= at)
      .map((v) => v.id)
    const snapshot: HandoverSnapshot = {
      finishedAt: at,
      items: clone(insp.items),
      signatures: clone(insp.signatures),
      afterCloseCheck: !!insp.afterCloseCheck,
      closedBy: actor,
      conclusion: conclusion || '人员、图书、设备、公共安全四方交接完成，书房转入夜间无人值守模式。',
      carryIncidentIds: carryIds,
      strandedVisitIds
    }
    insp.finishedAt = at
    insp.archive = snapshot
    insp.frozen = true
    return snapshot
  }

  function nextDateStr(date: string): string {
    const d = new Date(`${date}T00:00:00`)
    d.setDate(d.getDate() + 1)
    return fmtDate(d.getTime())
  }

  /**
   * 次日开馆（幂等）：
   * 1) 找到本馆最近一份已固化档案作为前夜档案，不触碰其任何内容；
   * 2) 营业日推进到次日，为新营业日创建全新巡检单（不显示为旧巡检“进行中”）；
   * 3) 仅恢复可运营设备（闭馆时关闭的 ac/light/selfkiosk、夜间布防态等），
   *    故障/告警/离线/满箱一律保留，继续作为遗留待办；
   * 4) 书房状态置为开放；模拟时钟跳到次日开馆时间；
   * 5) 重复点击：若当前已是目标营业日，直接返回 switched=false，不重复生成遗留通知、不改档案。
   */
  function openNextDay(libraryId: string): OpenDayResult {
    const system = useSystemStore()
    const branch = useBranchStore()
    const incidentStore = useIncidentStore()
    const lib = system.libraries.find((l) => l.id === libraryId)

    const currentD = currentDate(libraryId)
    const lastArchive = archives(libraryId)[0] ?? null
    const carryOf = (a: Inspection | null) => (a ? incidentStore.openCarryOfArchive(a.id).length : 0)

    // 仅当“当前营业日已完成闭馆交接”才允许开下一日；否则无副作用返回
    if (!lastArchive || lastArchive.date !== currentD) {
      return { switched: false, newDate: currentD, archive: lastArchive, carryCount: carryOf(lastArchive) }
    }

    const newDate = nextDateStr(currentD)

    // 幂等：营业日已推进到次日（前夜档案日期早于当前营业日），重复点击不再产生任何副作用
    if (currentD === newDate || businessDay.value[libraryId] === newDate) {
      return { switched: false, newDate, archive: lastArchive, carryCount: carryOf(lastArchive) }
    }

    businessDay.value[libraryId] = newDate
    // 创建新营业日的空白巡检单（历史档案保持 frozen，不被修改）
    ofDate(libraryId, newDate)

    // 仅恢复可运营设备：只动“闭馆关闭/off”的设备；故障/告警/离线/满箱保留
    for (const d of branch.devicesOf(libraryId)) {
      if (d.status === 'off') {
        if (d.type === 'camera') branch.setDeviceStatus(d.id, 'online', '次日开馆恢复')
        else branch.setDeviceStatus(d.id, 'normal', '次日开馆恢复')
      }
    }

    if (lib) system.setLibraryStatus(libraryId, 'open')

    // 演示时钟跳到次日开馆时间（若早于当前模拟时间则不回拨）
    const openHhmm = lib?.openTime ?? '08:30'
    const [h, m] = openHhmm.split(':').map(Number)
    const openTs = new Date(`${newDate}T00:00:00`).setHours(h, m, 0, 0)
    if (openTs > system.now) {
      system.jumpToTimestamp(openTs)
    }

    return {
      switched: true,
      newDate,
      archive: lastArchive,
      carryCount: lastArchive ? incidentStore.openCarryOfArchive(lastArchive.id).length : 0
    }
  }

  /** 仅允许重置当前营业日且未固化的巡检单；历史档案永不允许重置 */
  function resetCurrent(libraryId: string) {
    const date = currentDate(libraryId)
    const idx = inspections.value.findIndex((i) => i.libraryId === libraryId && i.date === date)
    const target = idx >= 0 ? inspections.value[idx] : undefined
    if (target?.frozen) return
    const fresh = buildTodayInspection(libraryId)
    fresh.date = date
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
    businessDay,
    handoverKeys,
    unmannedKeys,
    currentDate,
    ofDate,
    current,
    today,
    archives,
    archiveById,
    start,
    setItem,
    sign,
    setAfterCloseCheck,
    handoverDone,
    progress,
    canFinish,
    blockedReasons,
    finish,
    openNextDay,
    resetCurrent,
    signatureDomains
  }
})
