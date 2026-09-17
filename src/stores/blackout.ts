import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  BlackoutAction,
  BlackoutActionType,
  BlackoutCase,
  BlackoutDeviceEntry,
  BlackoutHelpRequest,
  BlackoutNightConfirmKey,
  BlackoutPendingTxn,
  BlackoutReview,
  BlackoutZoneCount,
  Device,
  DeviceStatus,
  DeviceType,
  Role
} from '@/types'
import { uid } from '@/utils/format'
import { fmtDate } from '@/utils/format'
import { useBranchStore } from '@/stores/branch'
import { useIncidentStore } from '@/stores/incident'
import { useSystemStore } from '@/stores/system'
import { useFaultsStore } from '@/stores/faults'

/** 市电中断即受影响（离线/停止/失效）的设备 */
const POWER_DOWN_TYPES: DeviceType[] = [
  'gate', 'selfkiosk', 'printer', 'camera', 'audio', 'ac', 'freshair', 'water', 'light'
]
/** UPS / 消防备用电池保障，停电后仍需逐项核验的设备 */
const BACKUP_TYPES: DeviceType[] = ['ups', 'exitlight', 'fire', 'smoke', 'help', 'returnbox']

/** 停电期间设备联动状态（原本即故障/告警/离线的保持原状，不因停电“洗白”） */
function duringStatus(d: Device): DeviceStatus {
  if (d.status === 'fault' || d.status === 'alarm' || d.status === 'offline') return d.status
  switch (d.type) {
    case 'gate':
    case 'selfkiosk':
    case 'printer':
    case 'camera':
    case 'audio':
      return 'offline' // 失效 / 离线 / 监测中断
    case 'ac':
    case 'freshair':
    case 'water':
    case 'light':
      return 'off' // 停止运行 / 停止服务
    case 'ups':
    case 'exitlight':
    case 'fire':
    case 'smoke':
    case 'help':
      return 'normal' // UPS/应急照明/疏散指示灯/消防主机/烟感由备用电源投切
    default:
      return d.status
  }
}

function zoneOfSeat(seatNo: string): string {
  if (seatNo.startsWith('亲子')) return '亲子阅览区'
  if (seatNo.startsWith('A')) return '一层阅览区 A 区'
  if (seatNo.startsWith('B')) return '一层阅览区 B 区'
  if (seatNo.startsWith('C')) return '二层阅览区 C 区'
  return '其他区域（卫生间/书库/通道）'
}

const NIGHT_KEYS: BlackoutNightConfirmKey[] = [
  'people', 'doors', 'firelane', 'emergency-light', 'gate-restore', 'camera-restore'
]
export const nightConfirmKeys = NIGHT_KEYS

export const nightConfirmMeta: { key: BlackoutNightConfirmKey; label: string }[] = [
  { key: 'people', label: '人员清场（在馆人数清零，无被困人员）' },
  { key: 'doors', label: '门窗（正门/后门/窗户全部锁闭）' },
  { key: 'firelane', label: '消防通道（无占用、防火门闭合）' },
  { key: 'emergency-light', label: '应急照明（恢复后常规照明正常、应急灯回充）' },
  { key: 'gate-restore', label: '门禁恢复（刷卡/电锁/门磁全部恢复，撤销机械开门）' },
  { key: 'camera-restore', label: '摄像头回传（全部在线、录像连贯无断档）' }
]

export interface BeginResult {
  case: BlackoutCase
  incidentId: string
}

export const useBlackoutStore = defineStore('blackout', () => {
  const cases = ref<BlackoutCase[]>([])

  const branch = useBranchStore()
  const incStore = useIncidentStore()
  const system = useSystemStore()
  const faults = useFaultsStore()

  // ---------------- 查询 ----------------

  function ofLibrary(libraryId: string): BlackoutCase[] {
    return cases.value
      .filter((c) => c.libraryId === libraryId)
      .sort((a, b) => b.startedAt - a.startedAt)
  }

  /** 当前书房最近一次停电（含已复盘，供追溯） */
  function latest(libraryId: string): BlackoutCase | undefined {
    return ofLibrary(libraryId)[0]
  }

  /** 当前书房进行中的停电（未复盘） */
  function activeCase(libraryId: string): BlackoutCase | undefined {
    return ofLibrary(libraryId).find((c) => c.phase !== 'reviewed')
  }

  /** 全部进行中的停电（街道值班跨书房总览） */
  const activeCases = computed(() =>
    cases.value.filter((c) => c.phase !== 'reviewed').sort((a, b) => b.startedAt - a.startedAt)
  )

  /** 已复盘档案 */
  function reviews(libraryId: string): BlackoutCase[] {
    return ofLibrary(libraryId).filter((c) => c.phase === 'reviewed')
  }

  function byId(id: string): BlackoutCase | undefined {
    return cases.value.find((c) => c.id === id)
  }

  /**
   * 停电是否阻塞当前书房闭馆完成。任一未复盘的停电处置均阻塞：
   * - 停电中（供电未恢复）；
   * - 来电后：紧急险情未排除、设备自检未完成、暂存借还未补录、夜间六项未逐项确认。
   */
  function blocksInspection(libraryId: string): BlackoutCase | null {
    const c = activeCase(libraryId)
    if (!c) return null
    if (c.phase === 'active') return c
    if (c.emergencyReasons.length && !c.emergencyCleared) return c
    if (pendingSelfTestCount(c) > 0) return c
    if (c.pendingTxns.some((t) => !t.backfilled)) return c
    if (c.night && !nightConfirmedAll(c)) return c
    return null
  }

  function nightConfirmedAll(c: BlackoutCase): boolean {
    return NIGHT_KEYS.every((k) => c.nightConfirms[k])
  }

  /** 待来电自检的设备项数 */
  function pendingSelfTestCount(c: BlackoutCase): number {
    return c.phase === 'power-restored' ? c.devices.filter((d) => d.selfTest === 'pending').length : 0
  }

  // ---------------- 动作留痕 ----------------

  function log(c: BlackoutCase, at: number, role: Role | 'system', actor: string, type: BlackoutActionType, text: string) {
    const a: BlackoutAction = { id: uid('ba'), at, role, actor, type, text }
    c.actions.unshift(a)
    // 同步到停电事件留痕；系统动作已在事件创建时记录，不重复写入
    if (role !== 'system' && c.incidentId) {
      incStore.act(c.incidentId, { role, actor, type: 'comment', text, at })
    }
  }

  function nextNo(at: number): string {
    const d = new Date(at)
    const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const n = cases.value.filter((c) => c.no.includes(key)).length + 1
    return `BO-${key}-${String(n).padStart(3, '0')}`
  }

  // ---------------- 1. 停电开始：切换应急视图、受影响范围 ----------------

  function beginBlackout(libraryId: string, at: number, opts?: { gateFailed?: boolean }): BeginResult {
    const existed = activeCase(libraryId)
    if (existed) return { case: existed, incidentId: existed.incidentId }

    const lib = system.libraries.find((l) => l.id === libraryId)
    const devs = branch.devicesOf(libraryId)

    // 先快照停电前状态，再联动改变设备状态（顺序不可颠倒，否则 before 会被污染）
    const deviceEntries: BlackoutDeviceEntry[] = devs.map((d) => {
      const before = d.status
      const during = duringStatus(d)
      return {
        deviceId: d.id,
        type: d.type,
        name: d.name,
        location: d.location,
        before,
        during,
        affected: POWER_DOWN_TYPES.includes(d.type),
        check: 'pending',
        selfTest: 'pending' as const
      }
    })
    for (const e of deviceEntries) {
      branch.setDeviceStatus(e.deviceId, e.during, duringNote(e.type, e.during))
    }

    // 区域人员清点（按在馆记录座位汇总）
    const visits = branch.activeVisits(libraryId)
    const zoneMap = new Map<string, number>()
    for (const v of visits) {
      const z = zoneOfSeat(v.seatNo)
      zoneMap.set(z, (zoneMap.get(z) ?? 0) + 1)
    }
    const allZones = ['一层阅览区 A 区', '一层阅览区 B 区', '亲子阅览区', '二层阅览区 C 区', '其他区域（卫生间/书库/通道）']
    const zones: BlackoutZoneCount[] = allZones
      .map((zone) => ({ zone, count: zoneMap.get(zone) ?? 0, checked: false }))
      .filter((z) => z.count > 0)

    const gateFailed = opts?.gateFailed ?? true
    const night = system.isNight

    const inc = incStore.create({
      libraryId,
      type: 'blackout',
      severity: 'urgent',
      title: `突发停电应急处置（${lib?.name ?? libraryId}）`,
      detail:
        `${new Date(at).toLocaleString('zh-CN')} 书房市电中断，页面已切换应急视图。` +
        `受影响范围：门禁${gateFailed ? '失效' : '正常'}、应急照明/疏散指示由 UPS 投切、自助借还机/打印机离线、` +
        `消防主机/烟感备用电池供电、摄像头/异常声音监测中断、空调/新风停止；当前在馆 ${visits.length} 人。` +
        `门禁失效立即通知安保到场（机械钥匙/临时开门），读者端展示疏散路线与集合点；` +
        `借还请求暂存（记录操作时间与设备编号），来电补录；空调停运超时评估提前闭馆；` +
        `出现被困/通道被占/烟感离线/应急灯不亮立即升级紧急事件并同步街道值班与消防联系人。`,
      at,
      night,
      owner: 'security',
      blackout: true
    })

    const c: BlackoutCase = {
      id: uid('bo'),
      no: nextNo(at),
      libraryId,
      community: lib?.community ?? '—',
      startedAt: at,
      night,
      phase: 'active',
      incidentId: inc.id,
      emergencyIncidentIds: [],
      gateFailed,
      securityNotified: false,
      securityArrived: false,
      mechanicalKey: false,
      tempOpen: false,
      emergencyReasons: [],
      emergencyCleared: false,
      streetNotified: false,
      fireNotified: false,
      acThresholdMin: 30,
      acReminded: false,
      earlyClosed: false,
      reservationNotifiedCount: 0,
      zones,
      devices: deviceEntries,
      pendingTxns: [],
      helps: [],
      nightConfirms: {
        people: false, doors: false, firelane: false,
        'emergency-light': false, 'gate-restore': false, 'camera-restore': false
      },
      nightConfirmedAt: undefined,
      nightConfirmedBy: undefined,
      inspectionBlocked: true,
      actions: []
    }
    cases.value.unshift(c)

    system.triggerBlackout()
    system.setLibraryStatus(libraryId, 'blackout')

    log(c, at, 'system', '系统', 'start', `突发停电：应急视图已切换，受影响范围已生成（${deviceEntries.filter((d) => d.affected).length} 台市电设备受影响，在馆 ${visits.length} 人，${night ? '夜间' : '开放'}时段）。读者端已展示疏散路线与集合点。`)

    // 门禁失效：页面立即通知安保到场
    if (gateFailed) {
      c.securityNotified = true
      c.securityNotifiedAt = at
      log(c, at, 'system', '系统', 'notify-security', '门禁失效：已立即通知值班安保到场处置（读者不能只依赖扫码出门，准备机械钥匙/临时开门）。')
    }

    return { case: c, incidentId: inc.id }
  }

  function duringNote(type: DeviceType, during: DeviceStatus): string {
    if (during === 'offline') return '市电中断，设备离线/监测中断'
    if (during === 'off') return '市电中断，设备停止运行'
    if (type === 'ups') return '市电中断，应急电源/UPS 已投入'
    if (type === 'exitlight') return '市电中断，疏散指示灯由应急电源点亮'
    if (type === 'fire' || type === 'smoke') return '消防备用电池供电，待现场核验'
    return during === 'normal' ? '备用电源投切，待现场核验' : ''
  }

  // ---------------- 2. 门禁应急：安保到场 / 机械钥匙 / 临时开门 ----------------

  function securityArrive(caseId: string, actor: string, at: number) {
    const c = byId(caseId)
    if (!c || c.securityArrived) return
    c.securityArrived = true
    c.securityArrivedAt = at
    log(c, at, 'security', actor, 'dispatch', '安保已到场：在正门/消防通道值守，引导读者疏散，核验机械钥匙与临时开门条件。')
  }

  function useMechanicalKey(caseId: string, actor: string, at: number): { ok: boolean; error?: string } {
    const c = byId(caseId)
    if (!c) return { ok: false, error: '无停电处置单' }
    if (!c.gateFailed) return { ok: false, error: '门禁未失效，无需启用机械钥匙' }
    c.mechanicalKey = true
    c.mechanicalKeyAt = at
    c.mechanicalKeyBy = actor
    log(c, at, 'security', actor, 'mechanical-key', '已启用机械钥匙开启正门/消防通道，读者沿疏散指示撤离，安保值守登记出入人员。')
    return { ok: true }
  }

  function tempOpen(caseId: string, actor: string, at: number): { ok: boolean; error?: string } {
    const c = byId(caseId)
    if (!c) return { ok: false, error: '无停电处置单' }
    if (!c.gateFailed) return { ok: false, error: '门禁未失效，无需临时开门' }
    c.tempOpen = true
    c.tempOpenAt = at
    c.tempOpenBy = actor
    log(c, at, 'security', actor, 'temp-open', '已执行临时开门（专人值守、只出不进），读者无需扫码即可撤离；来电门禁恢复前持续值守。')
    return { ok: true }
  }

  // ---------------- 3. 受影响范围现场逐项核验 ----------------

  function confirmDevice(caseId: string, deviceId: string, by: string, at: number, abnormal = false, note = '') {
    const c = byId(caseId)
    const e = c?.devices.find((d) => d.deviceId === deviceId)
    if (!c || !e) return
    e.check = 'confirmed'
    e.checkedBy = by
    e.checkedAt = at
    e.note = note
    if (abnormal) {
      const bad: DeviceStatus = ['camera', 'audio', 'gate', 'smoke'].includes(e.type) ? 'offline' : 'alarm'
      branch.setDeviceStatus(e.deviceId, bad, note || '停电期间现场核验异常')
      e.during = bad
      // 烟感离线 / 应急灯（疏散指示灯）不亮 → 紧急事件
      if (e.type === 'smoke' || e.type === 'exitlight' || e.type === 'ups') {
        const reason =
          e.type === 'smoke' ? '烟感离线（消防备用电池失效或设备故障）'
          : e.type === 'exitlight' ? '疏散指示灯/应急照明不亮'
          : '应急电源/UPS 供电异常，应急照明可能失效'
        ensureEmergency(c, at, by, reason)
      }
      log(c, at, by === '街道值班' ? 'street' : 'admin', by, 'check', `现场核验「${e.name}」异常：${note || '状态不正常'}，已升级处置。`)
    } else {
      log(c, at, by === '街道值班' ? 'street' : 'admin', by, 'check', `现场核验「${e.name}」${e.affected ? '确已离线/停止' : '状态正常（备用电源投切正常）'}。`)
    }
  }

  /** 按区域清点人数 */
  function confirmZone(caseId: string, zone: string, checkedCount: number, by: string, at: number) {
    const c = byId(caseId)
    const z = c?.zones.find((x) => x.zone === zone)
    if (!c || !z) return
    z.checked = true
    z.checkedCount = checkedCount
    z.checkedBy = by
    z.checkedAt = at
    log(c, at, by === '街道值班' ? 'street' : 'admin', by, 'check', `区域清点：${zone} 现场 ${checkedCount} 人（停电瞬间登记 ${z.count} 人），已引导疏散。`)
  }

  // ---------------- 4. 紧急事件：被困 / 通道被占 / 烟感离线 / 应急灯不亮 ----------------

  const emergencyReasonMeta: { key: string; label: string }[] = [
    { key: 'trapped', label: '有人被困（电梯/卫生间/书库）' },
    { key: 'firelane-blocked', label: '消防通道被占用/堵塞' },
    { key: 'smoke-offline', label: '烟感离线' },
    { key: 'exitlight-off', label: '应急灯/疏散指示灯不亮' }
  ]

  function ensureEmergency(c: BlackoutCase, at: number, actor: string, reason: string) {
    if (!c.emergencyReasons.includes(reason)) c.emergencyReasons.push(reason)
    if (!c.emergencyIncidentIds.length) {
      const inc = incStore.create({
        libraryId: c.libraryId,
        type: 'fire-alarm',
        severity: 'urgent',
        title: `⚡🚨 停电紧急事件：${c.community}`,
        detail:
          `停电处置 ${c.no} 升级为紧急事件。触发原因：${reason}。` +
          `已同步街道值班与消防联系人，按紧急预案处置（必要时 119/110），巡检状态不允许完成，直至险情排除并逐项复核。`,
        at,
        night: c.night,
        owner: 'security',
        blackout: true
      })
      c.emergencyIncidentIds.push(inc.id)
      log(c, at, 'security', actor, 'escalate-emergency', `升级为紧急事件（${inc.no}）：${reason}。巡检状态已锁定，不允许完成。`)
    } else {
      const incId = c.emergencyIncidentIds[0]
      incStore.act(incId, { role: 'security', actor, type: 'comment', text: `追加紧急情况：${reason}`, at })
      log(c, at, 'security', actor, 'escalate-emergency', `紧急事件追加情况：${reason}`)
    }
  }

  function triggerEmergency(caseId: string, reasonKey: string, actor: string, at: number) {
    const c = byId(caseId)
    if (!c) return
    const meta = emergencyReasonMeta.find((m) => m.key === reasonKey)
    if (!meta) return
    if (c.emergencyReasons.includes(meta.label)) return
    ensureEmergency(c, at, actor, meta.label)
    // 自动同步街道值班与消防联系人
    notifyStreet(caseId, actor, at, true)
    notifyFire(caseId, actor, at, true)
  }

  /** 险情排除确认（被困获救/通道畅通/烟感与应急灯恢复）：解除巡检锁定，允许继续闭馆/复盘 */
  function clearEmergency(caseId: string, actor: string, at: number, note = '') {
    const c = byId(caseId)
    if (!c || !c.emergencyReasons.length || c.emergencyCleared) return
    c.emergencyCleared = true
    c.emergencyClearedAt = at
    c.emergencyClearedBy = actor
    log(c, at, 'security', actor, 'escalate-emergency',
      `紧急险情已排除（${c.emergencyReasons.join('、')}），人员安全、消防通道畅通、烟感/应急照明恢复正常${note ? '：' + note : ''}。巡检锁定解除。`)
    for (const id of c.emergencyIncidentIds) {
      incStore.act(id, { role: 'security', actor, type: 'resolve', text: `停电紧急险情已排除：${c.emergencyReasons.join('、')}`, at })
    }
  }

  function notifyStreet(caseId: string, actor: string, at: number, silent = false) {
    const c = byId(caseId)
    const lib = system.libraries.find((l) => l.id === c?.libraryId)
    if (!c || c.streetNotified) return
    c.streetNotified = true
    c.streetNotifiedAt = at
    incStore.escalate(c.incidentId, 'street', actor, 'admin', at)
    log(c, at, 'admin', actor, 'notify-street', `已同步街道值班室（${lib?.streetDutyPhone ?? '—'}）：报告停电小区、影响书房、在馆人数与处置进展。`)
    if (!silent) log(c, at, 'system', '系统', 'comment', '街道值班端已可看到该停电小区、影响书房、在馆人数与处置进展。')
  }

  function notifyFire(caseId: string, actor: string, at: number, silent = false) {
    const c = byId(caseId)
    const lib = system.libraries.find((l) => l.id === c?.libraryId)
    if (!c || c.fireNotified) return
    c.fireNotified = true
    c.fireNotifiedAt = at
    log(c, at, 'security', actor, 'notify-fire', `已同步消防联系人（${lib?.fireContactPhone ?? '119'}），报告烟感/应急照明/被困情况，必要时请求救援。`)
    void silent
  }

  // ---------------- 5. 借还暂存（本地兜底）与来电补录 ----------------

  function addPendingTxn(
    caseId: string,
    input: {
      opAt?: number
      deviceNo: string
      operator: string
      readerName: string
      readerCard?: string
      bookBarcode: string
      kind: 'borrow' | 'return'
      zone: string
      note?: string
    }
  ): { ok: boolean; error?: string } {
    const c = byId(caseId)
    if (!c) return { ok: false, error: '无停电处置单' }
    if (!input.readerName.trim() || !input.bookBarcode.trim() || !input.deviceNo.trim()) {
      return { ok: false, error: '读者、图书条码/设备编号必填' }
    }
    const t: BlackoutPendingTxn = {
      id: uid('bt'),
      opAt: input.opAt ?? system.now,
      deviceNo: input.deviceNo.trim(),
      operator: input.operator,
      readerName: input.readerName.trim(),
      readerCard: input.readerCard?.trim(),
      bookBarcode: input.bookBarcode.trim(),
      kind: input.kind,
      zone: input.zone,
      note: input.note,
      backfilled: false
    }
    c.pendingTxns.unshift(t)
    log(c, t.opAt, 'service', input.operator, 'txn-pending',
      `借还请求暂存（本地兜底）：${input.readerName} ${input.kind === 'borrow' ? '借' : '还'}《条码 ${input.bookBarcode}》，设备编号 ${input.deviceNo}，操作时间 ${new Date(t.opAt).toTimeString().slice(0, 5)}，待来电补录。`)
    return { ok: true }
  }

  /** 按条码模糊匹配馆藏（isbn / id / 书名） */
  function findBook(c: BlackoutCase, barcode: string) {
    const k = barcode.trim()
    return branch.books.find(
      (b) => b.libraryId === c.libraryId &&
        (b.isbn === k || b.id === k || b.title.includes(k) || k.includes(b.title))
    )
  }

  /** 单笔补入系统：保留真实操作时间，避免设备离线导致逾期/借阅失败误判 */
  function backfillTxn(caseId: string, txnId: string, by: string, at: number): boolean {
    const c = byId(caseId)
    const t = c?.pendingTxns.find((x) => x.id === txnId)
    if (!c || !t || t.backfilled) return false
    t.backfilled = true
    t.backfilledAt = at
    t.backfilledBy = by
    const book = findBook(c, t.bookBarcode)
    const reader = branch.readers.find((r) => r.name === t.readerName || r.cardNo === t.readerCard)
    // 流水按真实操作时间写入
    branch.usageLogs.unshift({
      id: uid('u'),
      libraryId: c.libraryId,
      readerId: reader?.id ?? 'manual',
      readerName: t.readerName,
      kind: t.kind === 'borrow' ? 'borrow' : 'return',
      detail: `【停电暂存·来电补录】条码 ${t.bookBarcode}（${t.kind === 'borrow' ? '借出' : '归还'}，设备编号 ${t.deviceNo}，经办 ${t.operator}，实际操作 ${new Date(t.opAt).toLocaleString('zh-CN')}）`,
      at: t.opAt
    })
    // 同步图书在借状态与时间锚点：归还按操作时间置回、借阅按操作时间重算到期日
    if (book) {
      if (t.kind === 'return') {
        if (book.status === 'borrowed' || book.status === 'demag-failed') {
          book.status = 'returned'
          book.borrowerId = undefined
          book.borrowAt = undefined
          book.dueAt = undefined
        }
      } else if (t.kind === 'borrow' && book.status === 'on-shelf') {
        book.status = 'borrowed'
        book.borrowerId = reader?.id
        book.borrowAt = t.opAt
        book.dueAt = t.opAt + 30 * 86400_000
      }
    }
    log(c, at, 'service', by, 'backfill',
      `补录 1 笔：${t.readerName} ${t.kind === 'borrow' ? '借' : '还'}《条码 ${t.bookBarcode}》，按操作时间 ${new Date(t.opAt).toTimeString().slice(0, 5)} 与设备编号 ${t.deviceNo} 写入系统${book ? '，馆藏状态已同步' : '（未匹配到具体馆藏，仅入流水）'}，不计逾期、不记借阅失败。`)
    return true
  }

  function backfillAll(caseId: string, by: string, at: number): number {
    const c = byId(caseId)
    if (!c) return 0
    let n = 0
    for (const t of [...c.pendingTxns].reverse()) {
      if (!t.backfilled && backfillTxn(caseId, t.id, by, at)) n++
    }
    if (n) log(c, at, 'service', by, 'backfill', `一键补录完成：共 ${n} 笔停电暂存借还全部按操作时间与设备编号补入系统。`)
    return n
  }

  // ---------------- 6. 空调停运阈值 / 提前闭馆 / 通知预约读者 ----------------

  function acStoppedMin(c: BlackoutCase, now: number): number {
    return Math.floor((now - c.startedAt) / 60_000)
  }

  function remindEarlyClose(caseId: string, actor: string, at: number) {
    const c = byId(caseId)
    if (!c || c.acReminded) return
    c.acReminded = true
    log(c, at, 'system', actor || '系统', 'comment', `空调/新风已停运超过阈值 ${c.acThresholdMin} 分钟，请管理员评估馆内温湿度与读者体验，决定是否提前闭馆并通知已预约读者。`)
  }

  function decideEarlyClose(caseId: string, actor: string, at: number): number {
    const c = byId(caseId)
    if (!c || c.earlyClosed) return 0
    c.earlyClosed = true
    c.earlyClosedAt = at
    system.setLibraryStatus(c.libraryId, 'blackout')
    // 通知本馆当日/未来活动已报名（预约）读者
    const today = fmtDate(at)
    let n = 0
    const lines: string[] = []
    for (const a of branch.activities.filter((x) => x.libraryId === c.libraryId && x.date >= today)) {
      n += a.families.length + (a.enrolled - a.families.length)
      if (a.families.length) lines.push(`《${a.title}》（${a.date} ${a.time}）已报名家庭 ${a.families.length} 户`)
    }
    c.reservationNotifiedCount = n
    log(c, at, 'admin', actor, 'early-close',
      `管理员决定提前闭馆：已停止入馆、组织读者疏散；通知已预约读者 ${n} 人次${lines.length ? '（' + lines.join('；') + '）' : ''}，改约/顺延另行通知；饮水机、打印设备停止服务通告已同步读者端。`)
    log(c, at, 'service', actor, 'notify-readers', `读者端已推送：提前闭馆通知、饮水/打印停止服务、疏散路线与集合点。`)
    return n
  }

  // ---------------- 7. 读者求助（停电期间） ----------------

  function addHelp(caseId: string, input: { readerName: string; zone: string; desc: string; at: number }): BlackoutHelpRequest {
    const c = byId(caseId)!
    const h: BlackoutHelpRequest = {
      id: uid('bh'),
      at: input.at,
      readerName: input.readerName || '匿名读者',
      zone: input.zone,
      desc: input.desc,
      status: 'open'
    }
    c.helps.unshift(h)
    log(c, input.at, 'service', h.readerName, 'help', `读者求助：${input.zone} — ${input.desc}（已通知到场安保）。`)
    const incId = c.emergencyIncidentIds[0] ?? c.incidentId
    incStore.act(incId, { role: 'service', actor: h.readerName, type: 'notify', text: `读者求助：${input.zone} — ${input.desc}`, at: input.at })
    return h
  }

  function resolveHelp(caseId: string, helpId: string, handler: string, at: number) {
    const c = byId(caseId)
    const h = c?.helps.find((x) => x.id === helpId)
    if (!c || !h || h.status === 'resolved') return
    h.status = h.status === 'open' ? 'arrived' : 'resolved'
    if (h.status === 'resolved') {
      h.resolvedAt = at
      h.handler = handler
      log(c, at, 'security', handler, 'help', `读者求助已处置（${h.zone}：${h.desc.slice(0, 20)}…），读者已安全疏散/离馆。`)
    } else {
      h.handler = handler
      log(c, at, 'security', handler, 'arrive', `安保已到达求助读者位置：${h.zone}`)
    }
  }

  /** 读者疏散签离（停电期间离馆，门禁失效走机械钥匙/临时开门通道） */
  function evacuateVisit(caseId: string, visitId: string, at: number) {
    const c = byId(caseId)
    if (!c) return
    branch.checkOut(visitId, at)
    log(c, at, 'security', '值班人员', 'reader-evac', '一名读者经应急疏散通道安全离馆（机械钥匙/临时开门通道，非扫码出门）。')
  }

  // ---------------- 8. 来电恢复 + 设备自检/消磁/还书箱核验 ----------------

  function restorePower(caseId: string, actor: string, at: number) {
    const c = byId(caseId)
    if (!c || c.phase !== 'active') return
    c.phase = 'power-restored'
    c.restoredAt = at
    system.restorePower()
    log(c, at, 'maintainer', actor, 'restore',
      '市电恢复：开始设备自检与重新核验——自助借还机（含图书消磁）、还书箱、门禁、摄像头、消防/烟感、空调新风逐项核验；故障设备转入故障工单并进入跨日交接。')
    if (!c.night) system.setLibraryStatus(c.libraryId, 'open')
    else system.setLibraryStatus(c.libraryId, 'closing')
  }

  /**
   * 来电设备自检。
   * @param result ok=恢复停电前状态；fault=自检失败，自动开故障工单进入跨日交接
   * @param demagOk 自助借还机自检时的图书消磁核验结果
   */
  function runSelfTest(
    caseId: string,
    deviceId: string,
    result: 'ok' | 'fault',
    by: string,
    at: number,
    note = ''
  ): { ok: boolean; faultReportId?: string } {
    const c = byId(caseId)
    const e = c?.devices.find((d) => d.deviceId === deviceId)
    if (!c || !e || c.phase !== 'power-restored') return { ok: false }
    e.selfTest = result
    e.selfTestAt = at
    e.selfTestBy = by

    if (result === 'ok') {
      const target: DeviceStatus =
        e.type === 'camera' ? 'online'
        : e.type === 'audio' ? 'online'
        : (e.before === 'fault' || e.before === 'alarm' || e.before === 'offline') ? e.before
        : 'normal'
      branch.setDeviceStatus(e.deviceId, target, `来电自检通过，恢复${target === 'online' ? '在线' : target === 'normal' ? '正常' : '原状态'}`)
      let extra = ''
      if (e.type === 'selfkiosk') extra = '；图书消磁通道重新核验通过，停电期间暂存借还可正常补录。'
      if (e.type === 'returnbox') extra = '；还书箱投箱/满箱检测核验正常，停电期间投入图书已登记。'
      if (e.type === 'gate') extra = '；门禁电锁、读卡器、门磁恢复正常，机械钥匙已收回、临时开门撤销。'
      log(c, at, 'maintainer', by, 'self-test', `「${e.name}」自检通过，状态恢复。${extra}${note ? ' 备注：' + note : ''}`)
      return { ok: true }
    }

    // 自检失败 → 故障设备，开工单（跨日交接）
    branch.setDeviceStatus(e.deviceId, 'fault', `来电自检失败：${note || '未恢复'}`)
    const visits = branch.activeVisits(c.libraryId).length
    const existing = faults.faultOfDevice(e.deviceId)
    let reportId = existing?.id
    if (!existing) {
      const r = faults.report({
        libraryId: c.libraryId,
        deviceId: e.deviceId,
        faultDesc: `市电恢复后设备自检未通过：${note || '设备未恢复正常'}（停电事件 ${c.no}）`,
        photos: [],
        affectedReaderCount: visits,
        affectedDesc: `停电 ${c.no} 来电自检失败，影响读者自助服务，已转入跨日交接待维修。`,
        maintainerName: '待派单（设备运维）',
        maintainerPhone: '见设备维保合同',
        maintainerCompany: '市图书馆设备运维中心（24 小时报修）',
        reporter: by,
        at
      })
      reportId = r.id
    }
    e.faultReportId = reportId
    log(c, at, 'maintainer', by, 'self-test', `「${e.name}」自检失败：${note || '未恢复'}，已开故障工单（${reportId}）进入跨日交接，修复前继续停用/人工兜底。`)
    return { ok: true, faultReportId: reportId }
  }

  // ---------------- 9. 夜间停电逐项确认（未恢复不得闭馆） ----------------

  function confirmNight(caseId: string, key: BlackoutNightConfirmKey, by: string, at: number, role: Role = 'admin') {
    const c = byId(caseId)
    if (!c || c.nightConfirms[key]) return
    c.nightConfirms[key] = true
    if (!c.nightConfirmedAt) c.nightConfirmedAt = {}
    if (!c.nightConfirmedBy) c.nightConfirmedBy = {}
    c.nightConfirmedAt[key] = at
    c.nightConfirmedBy[key] = by
    const label = nightConfirmMeta.find((m) => m.key === key)?.label ?? key
    log(c, at, role, by, 'night-confirm', `夜间停电恢复确认：${label} —— 已确认。`)
    if (nightConfirmedAll(c)) {
      c.inspectionBlocked = false
      log(c, at, role, by, 'night-confirm', '夜间六项（人员清场、门窗、消防通道、应急照明、门禁恢复、摄像头回传）已由管理员和安保逐项确认完毕，闭馆巡检方可继续完成。')
    }
  }

  // ---------------- 10. 复盘 ----------------

  function submitReview(caseId: string, payload: Omit<BlackoutReview, 'durationMin'>, at: number): { ok: boolean; error?: string } {
    const c = byId(caseId)
    if (!c) return { ok: false, error: '无停电处置单' }
    if (c.phase === 'active') return { ok: false, error: '尚未恢复供电，不能复盘' }
    if (c.emergencyReasons.length && !c.emergencyCleared) {
      return { ok: false, error: '紧急险情尚未排除（被困/通道被占/烟感离线/应急灯不亮），不能复盘' }
    }
    if (c.night && !nightConfirmedAll(c)) return { ok: false, error: '夜间六项确认未完成，不能复盘/闭馆' }
    const pending = pendingSelfTestCount(c)
    if (pending > 0) return { ok: false, error: `仍有 ${pending} 台设备未完成来电自检` }
    const pendingTxn = c.pendingTxns.filter((t) => !t.backfilled).length
    if (pendingTxn > 0) return { ok: false, error: `仍有 ${pendingTxn} 笔停电暂存借还未补录` }

    c.phase = 'reviewed'
    c.inspectionBlocked = false
    c.review = {
      ...payload,
      durationMin: Math.round(((c.restoredAt ?? at) - c.startedAt) / 60_000)
    }
    log(c, at, 'admin', payload.reviewedBy, 'review',
      `停电复盘已记录：停电时长 ${c.review.durationMin} 分钟；影响范围：${payload.affectedScope}；读者求助：${payload.readerHelps}；处置责任：${payload.responsibilities}；改进项：${payload.improvements}。`)
    incStore.act(c.incidentId, {
      role: 'admin', actor: payload.reviewedBy, type: 'resolve',
      text: `停电事件复盘归档：历时 ${c.review.durationMin} 分钟，紧急事件 ${c.emergencyIncidentIds.length} 起，暂存补录 ${c.pendingTxns.length} 笔，自检失败转跨日工单 ${c.devices.filter((d) => d.faultReportId).length} 台。`,
      at
    })
    // 恢复书房运营状态
    system.restorePower()
    system.setLibraryStatus(c.libraryId, c.night ? 'closed' : 'open')
    return { ok: true }
  }

  return {
    cases,
    activeCases,
    ofLibrary,
    latest,
    activeCase,
    reviews,
    byId,
    blocksInspection,
    nightConfirmedAll,
    pendingSelfTestCount,
    acStoppedMin,
    emergencyReasonMeta,
    nightConfirmMeta,
    beginBlackout,
    securityArrive,
    useMechanicalKey,
    tempOpen,
    confirmDevice,
    confirmZone,
    triggerEmergency,
    clearEmergency,
    notifyStreet,
    notifyFire,
    addPendingTxn,
    backfillTxn,
    backfillAll,
    remindEarlyClose,
    decideEarlyClose,
    addHelp,
    resolveHelp,
    evacuateVisit,
    restorePower,
    runSelfTest,
    confirmNight,
    submitReview
  }
})
