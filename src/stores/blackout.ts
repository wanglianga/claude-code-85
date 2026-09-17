import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  BlackoutEvent,
  BlackoutHeadcount,
  BlackoutImpact,
  BlackoutLog,
  BlackoutSelfTestItem,
  Device,
  DeviceType,
  ImpactKey,
  ImpactState,
  NightRecoverItem,
  NightRecoverKey,
  PendingLoan,
  Role,
  UrgentReason,
  UrgentEscalation
} from '@/types'
import { uid } from '@/utils/format'
import { useSystemStore } from '@/stores/system'
import { useBranchStore } from '@/stores/branch'
import { useIncidentStore } from '@/stores/incident'
import { useFaultsStore } from '@/stores/faults'

/** 空调停运提前闭馆评估阈值（分钟） */
export const AC_THRESHOLD_MIN = 30
/** UPS 续航提示（分钟） */
export const UPS_ENDURANCE_MIN = 90

const URGENT_META: Record<UrgentReason, { label: string; detail: string; incidentType: 'help-request' | 'fire-alarm' | 'camera-offline' }> = {
  trapped: {
    label: '有人被困',
    detail: '停电后有读者/人员被困电梯、卫生间或书库，需立即安保到场解救并视情拨打 119/110。',
    incidentType: 'help-request'
  },
  'fire-exit-blocked': {
    label: '消防通道被占用',
    detail: '停电疏散中发现消防通道被占用/堵塞，疏散受阻，必须立即清理并上报街道与消防联系人。',
    incidentType: 'fire-alarm'
  },
  'smoke-offline': {
    label: '烟感离线',
    detail: '停电后烟感探测器离线，火灾探测盲区，须同步街道值班与消防联系人，现场人工看护。',
    incidentType: 'fire-alarm'
  },
  'elight-off': {
    label: '应急灯不亮',
    detail: '应急照明/疏散指示灯未点亮，疏散无照明，存在踩踏风险，立即就地引导并同步街道、消防。',
    incidentType: 'fire-alarm'
  }
}

/** 座位号 -> 疏散分区 */
export function zoneOfSeat(seatNo: string): string {
  if (seatNo.startsWith('亲子')) return '少儿亲子区'
  if (seatNo.startsWith('A')) return '一层阅览区 A 区'
  if (seatNo.startsWith('B')) return '一层阅览区 B 区'
  if (seatNo.startsWith('C') || seatNo.startsWith('D')) return '阅览区 C/D 区'
  return '其他区域（书库/通道/饮水角）'
}

export const useBlackoutStore = defineStore('blackout', () => {
  const events = ref<BlackoutEvent[]>([])

  function byLibrary(libraryId: string): BlackoutEvent[] {
    return events.value
      .filter((e) => e.libraryId === libraryId)
      .sort((a, b) => b.startedAt - a.startedAt)
  }

  /** 当前在馆未闭环（停电中/紧急/来电恢复中）的停电事件 */
  const activeMap = computed<Record<string, BlackoutEvent | undefined>>(() => {
    const m: Record<string, BlackoutEvent | undefined> = {}
    for (const e of events.value) {
      if (e.phase !== 'closed' && !m[e.libraryId]) m[e.libraryId] = e
    }
    return m
  })

  function activeOf(libraryId: string): BlackoutEvent | undefined {
    return activeMap.value[libraryId]
  }

  const hasActiveAny = computed(() =>
    events.value.some((e) => e.phase === 'blackout' || e.phase === 'urgent' || e.phase === 'recovered')
  )

  function byId(id: string): BlackoutEvent | undefined {
    return events.value.find((e) => e.id === id)
  }

  function pushLog(e: BlackoutEvent, actor: string, role: BlackoutLog['role'], text: string, at: number) {
    e.logs.unshift({ at, actor, role, text })
  }

  function nextNo(at: number): string {
    const d = new Date(at)
    const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const n = events.value.filter((e) => e.no.includes(key)).length + 1
    return `TD-${key}-${String(n).padStart(3, '0')}`
  }

  function buildImpacts(devices: Device[]): BlackoutImpact[] {
    const find = (type: Device['type']) => devices.filter((d) => d.type === type).map((d) => d.id)
    const defs: { key: ImpactKey; label: string; expect: 'ups' | 'off'; types: DeviceType[]; detail: string }[] = [
      { key: 'gate', label: '门禁是否失效', expect: 'ups', types: ['gate'], detail: '断电后门禁/闸机状态：失效时扫码不能出门，须立即通知安保到场并启用机械钥匙或临时开门' },
      { key: 'elight', label: '应急照明是否点亮', expect: 'ups', types: ['elight'], detail: '应急照明灯组应由 UPS/蓄电池自动点亮，续航≥90 分钟；不亮立即升级紧急事件' },
      { key: 'exitsign', label: '疏散指示灯是否点亮', expect: 'ups', types: ['exitsign'], detail: '疏散指示标志灯应持续点亮，指引读者沿疏散路线撤离' },
      { key: 'kiosk', label: '自助借还机是否离线', expect: 'off', types: ['selfkiosk'], detail: '自助借还机市电停止，借还请求转人工暂存，来电按操作时间与设备编号补录' },
      { key: 'printer', label: '打印机是否离线', expect: 'off', types: ['printer'], detail: '自助打印机停止服务，读者端同步公告' },
      { key: 'firepanel', label: '消防主机是否正常', expect: 'ups', types: ['fire'], detail: '消防主机应由 UPS 继续联网，异常立即转消防联系人' },
      { key: 'smoke', label: '烟感是否正常', expect: 'ups', types: ['smoke'], detail: '烟感探测器应保持在线；离线即火灾探测盲区，升级紧急事件' },
      { key: 'camera', label: '摄像头是否中断', expect: 'ups', types: ['camera'], detail: '摄像头在 UPS 支撑下应继续回传，超过续航会中断' },
      { key: 'audio', label: '异常声音监测是否中断', expect: 'ups', types: ['audio'], detail: '异常声音监测应继续布防，断电中断需人工巡查补位' },
      { key: 'ac', label: '空调是否停止', expect: 'off', types: ['ac'], detail: '空调市电停止；停运超过阈值管理员评估是否提前闭馆并通知已预约读者' },
      { key: 'vent', label: '新风是否停止', expect: 'off', types: ['vent'], detail: '新风系统市电停止，长时间闷热需纳入提前闭馆评估' }
    ]
    return defs.map((d) => {
      const ids = d.types.flatMap((t) => find(t))
      // 初始自动判定
      let state: ImpactState = 'unknown'
      const relevant = devices.filter((x) => ids.includes(x.id))
      if (relevant.length) {
        const bad = relevant.some((x) => x.status === 'off' || x.status === 'offline' || x.status === 'fault')
        const allGood = relevant.every((x) => x.status === 'normal' || x.status === 'online')
        state = d.expect === 'off' ? (bad ? 'affected' : 'unknown') : allGood ? 'ok' : bad ? 'affected' : 'unknown'
      }
      return { key: d.key, label: d.label, expect: d.expect, state, deviceIds: ids, detail: d.detail }
    })
  }

  function buildHeadcounts(libraryId: string, devices: { zone: string }[] | null, visits: { seatNo: string }[]): BlackoutHeadcount[] {
    const zones: { zone: string; systemCount: number }[] = []
    for (const v of visits) {
      const z = zoneOfSeat(v.seatNo)
      const row = zones.find((x) => x.zone === z)
      if (row) row.systemCount += 1
      else zones.push({ zone: z, systemCount: 1 })
    }
    void devices
    return zones.map((z) => ({ zone: z.zone, systemCount: z.systemCount }))
  }

  function buildNightItems(): NightRecoverItem[] {
    const defs: { key: NightRecoverKey; label: string }[] = [
      { key: 'people-clear', label: '人员清场（分区清点，确认无人被困/滞留）' },
      { key: 'doors', label: '门窗（正门、后门、窗户关闭上锁）' },
      { key: 'fire-exit', label: '消防通道（无占用、可正常开启）' },
      { key: 'elight', label: '应急照明（恢复后退出应急、蓄电池复检）' },
      { key: 'gate-recover', label: '门禁恢复（在线、布防正常、机械钥匙归位铅封）' },
      { key: 'camera-back', label: '摄像头回传（全部在线、录像连续无缺口）' }
    ]
    return defs.map((d) => ({ key: d.key, label: d.label, state: 'pending' }))
  }

  function buildSelfTests(): BlackoutSelfTestItem[] {
    const defs: { key: BlackoutSelfTestItem['key']; label: string }[] = [
      { key: 'demag', label: '图书消磁通道（借还机消磁线圈自检）' },
      { key: 'returnbox', label: '还书箱（门锁、容量传感器、联网）' },
      { key: 'kiosk', label: '自助借还机（开机、读卡、凭条、磁条激活）' },
      { key: 'gate', label: '门禁（闸机、读卡器、消防联动）' },
      { key: 'camera', label: '摄像头回传（在线率、录像完整性）' },
      { key: 'fire', label: '消防主机/烟感联网状态' },
      { key: 'ac', label: '空调/新风重启与运行' },
      { key: 'elight', label: '应急照明/疏散指示退出应急并复检蓄电池' }
    ]
    return defs.map((d) => ({ key: d.key, label: d.label, state: 'pending' }))
  }

  /** 触发突发停电：快照设备、切换受影响状态、建应急单与主事件、门禁失效自动通知安保 */
  function trigger(libraryId: string, at: number, opts?: { gateFails?: boolean }): BlackoutEvent {
    const system = useSystemStore()
    const branch = useBranchStore()
    const incStore = useIncidentStore()
    const lib = system.libraries.find((l) => l.id === libraryId)!

    const existing = activeOf(libraryId)
    if (existing) return existing

    const devices = branch.devicesOf(libraryId)
    // 1) 设备快照
    const snapshot = devices.map((d) => ({ id: d.id, status: d.status, note: d.note, level: d.level }))

    // 2) 切换市电/UPS 设备状态（原本已故障/告警的设备保持，不被停电掩盖）
    let gateFailed = false
    for (const d of devices) {
      if (['selfkiosk', 'printer', 'water', 'ac', 'light', 'vent'].includes(d.type)) {
        if (d.status !== 'fault' && d.status !== 'alarm') {
          branch.setDeviceStatus(d.id, 'off', '突发停电，市电中断设备停止')
        }
      } else if (d.type === 'camera' || d.type === 'audio') {
        if (d.status !== 'fault' && d.status !== 'alarm') {
          branch.setDeviceStatus(d.id, 'offline', '突发停电，UPS 续航内可能中断')
        }
      } else if (d.type === 'elight' || d.type === 'exitsign') {
        if (d.status === 'normal' || d.status === 'online') {
          branch.setDeviceStatus(d.id, 'online', '停电应急点亮（UPS/蓄电池供电）')
        }
      } else if (d.type === 'gate') {
        const willFail = opts?.gateFails ?? true
        // 已故障/告警的门（如门磁告警）保持原状，不被停电状态掩盖；主闸机失效即判定门禁失效
        if (d.status !== 'fault' && d.status !== 'alarm') {
          if (willFail) {
            branch.setDeviceStatus(d.id, 'offline', '突发停电，门禁失效（扫码不能出门）')
          } else {
            branch.setDeviceStatus(d.id, 'online', '停电，UPS 维持门禁供电')
          }
        }
        if (willFail) gateFailed = true
      }
    }

    // 3) 分区在馆人数
    const visits = branch.activeVisits(libraryId)
    const headcounts = buildHeadcounts(libraryId, null, visits.map((v) => ({ seatNo: v.seatNo })))
    const impacts = buildImpacts(branch.devicesOf(libraryId))

    const night = system.isNight
    const inc = incStore.create({
      libraryId,
      type: 'blackout',
      severity: 'urgent',
      title: `突发停电应急处置（${lib.powerCommunity}）`,
      detail:
        `${lib.name} 突发市电中断，页面已切换应急视图。` +
        `先核验受影响范围：门禁、应急照明/疏散指示、自助借还机/打印机、消防主机/烟感、摄像头/异常声音、空调/新风，以及当前在馆人数与所在区域。` +
        `门禁失效立即通知安保到场，启用机械钥匙或临时开门，读者端展示疏散路线与集合点，不能只依赖扫码出门；` +
        `有人被困、消防通道被占、烟感离线或应急灯不亮立即转紧急事件，同步街道值班与消防联系人。` +
        `停电期间借还请求暂存本地、来电按操作时间与设备编号补录，不得把读者算逾期或借阅失败。`,
      at,
      night,
      owner: 'security',
      blackout: true
    })

    const event: BlackoutEvent = {
      id: uid('bo'),
      no: nextNo(at),
      libraryId,
      community: lib.powerCommunity,
      phase: 'blackout',
      startedAt: at,
      night,
      impacts,
      headcounts,
      gateFailed,
      gateFallback: 'none',
      escalations: [],
      streetNotified: false,
      fireNotified: false,
      helps: [],
      pendingLoans: [],
      acStoppedAt: devices.some((d) => d.type === 'ac') ? at : undefined,
      acThresholdMin: AC_THRESHOLD_MIN,
      earlyCloseAssessed: false,
      earlyClose: false,
      nightItems: night ? buildNightItems() : [],
      selfTests: [],
      carriedFaultIds: [],
      incidentId: inc.id,
      deviceSnapshot: snapshot,
      logs: [],
      review: undefined
    }
    events.value.unshift(event)
    system.setLibraryStatus(libraryId, 'blackout')

    pushLog(event, '系统', 'system', `监测到${lib.powerCommunity}市电中断，应急照明/UPS 自动投入，页面切换应急视图`, at)

    // 4) 门禁失效：立即通知安保到场
    if (gateFailed) {
      event.gateNotifiedSecurityAt = at
      pushLog(event, '系统', 'system', '门禁失效：已立即推送安保调度与值班安保到场处置（不能只依赖扫码出门）', at)
      incStore.act(inc.id, {
        role: 'system', actor: '门禁联动', type: 'notify', at,
        text: `门禁因停电失效，已自动通知安保到场（${lib.securityDispatchPhone}），提示启用机械钥匙（${lib.mechanicalKeyLocation}，保管人：${lib.mechanicalKeyHolder}）或临时开门；读者端已展示疏散路线与集合点（${lib.assemblyPoint}）。`
      })
    }

    return event
  }

  // ---------------- 影响范围人工核验 ----------------

  function setImpact(eventId: string, key: ImpactKey, state: ImpactState, by: string, at: number) {
    const e = byId(eventId)
    if (!e || e.phase === 'closed') return
    const item = e.impacts.find((i) => i.key === key)
    if (!item) return
    item.state = state
    item.checkedBy = by
    item.checkedAt = at
    const labelMap: Record<string, string> = {
      ok: '确认正常', 'confirmed-on': '确认正常（人工复核）', affected: '确认受影响', 'confirmed-off': '确认异常（人工复核）', unknown: '待核验'
    }
    pushLog(e, by, roleOf(by), `受影响范围核验：${item.label} → ${labelMap[state] ?? state}`, at)

    // 关键异常自动升级紧急事件
    if (state === 'confirmed-off' || (state === 'affected' && (key === 'elight' || key === 'smoke'))) {
      if (key === 'elight') escalate(e.id, 'elight-off', `${by} 现场确认应急照明灯未点亮`, by, at, { auto: true })
      if (key === 'smoke') escalate(e.id, 'smoke-offline', `${by} 现场确认烟感离线`, by, at, { auto: true })
    }
    if ((state === 'confirmed-off' || state === 'affected') && key === 'gate' && !e.gateFailed) {
      e.gateFailed = true
      e.gateNotifiedSecurityAt = at
      pushLog(e, by, 'security', '核验确认门禁失效：已通知安保到场，启用机械钥匙/临时开门流程', at)
    }
  }

  // ---------------- 门禁消防联动 ----------------

  function securityArrived(eventId: string, by: string, at: number) {
    const e = byId(eventId)
    if (!e) return
    pushLog(e, by, 'security', `安保已到场：${by} 抵达正门/疏散通道组织人工放行与疏散引导`, at)
    if (e.incidentId) {
      useIncidentStore().act(e.incidentId, { role: 'security', actor: by, type: 'arrive', at, text: '停电门禁失效，安保到场组织人工放行' })
    }
  }

  function applyGateFallback(eventId: string, mode: 'mechanical-key' | 'temp-open', by: string, at: number, note: string) {
    const e = byId(eventId)
    if (!e || !e.gateFailed) return
    e.gateFallback = mode
    e.gateFallbackBy = by
    e.gateFallbackAt = at
    e.gateFallbackNote = note
    const text = mode === 'mechanical-key'
      ? `已启用机械钥匙人工开门（钥匙位置/保管人按预案，登记取用）：${note}`
      : `已启用临时开门（安保/工作人员现场值守，只出不进、逐人登记）：${note}`
    pushLog(e, by, 'security', text, at)
    if (e.incidentId) {
      useIncidentStore().act(e.incidentId, {
        role: 'security', actor: by, type: 'comment', at,
        text: `${text}。读者疏散不依赖扫码出门，行动不便者由专人引导。`
      })
    }
  }

  // ---------------- 紧急事件升级 ----------------

  function escalate(
    eventId: string,
    reason: UrgentReason,
    detail: string,
    by: string,
    at: number,
    opts?: { auto?: boolean }
  ): UrgentEscalation | undefined {
    const e = byId(eventId)
    if (!e) return
    const exist = e.escalations.find((x) => x.reason === reason && !x.resolved)
    if (exist) return exist
    const meta = URGENT_META[reason]
    const incStore = useIncidentStore()
    const inc = incStore.create({
      libraryId: e.libraryId,
      type: meta.incidentType,
      severity: 'urgent',
      title: `停电紧急事件：${meta.label}`,
      detail: `停电应急单 ${e.no} 下升级：${meta.detail} 现场说明：${detail}`,
      at,
      night: e.night,
      owner: 'security',
      blackout: true
    })
    const esc: UrgentEscalation = {
      reason,
      label: meta.label,
      detail,
      at,
      by,
      streetNotified: false,
      fireNotified: false,
      resolved: false,
      incidentId: inc.id
    }
    e.escalations.push(esc)
    e.phase = 'urgent'
    // 转紧急事件即自动同步街道值班与消防联系人（平台推送 + 电话确认留痕）
    if (!e.streetNotified) {
      e.streetNotified = true
      e.streetNotifiedAt = at
    }
    if (!e.fireNotified) {
      e.fireNotified = true
      e.fireNotifiedAt = at
    }
    esc.streetNotified = true
    esc.fireNotified = true
    pushLog(e, opts?.auto ? '系统' : by, opts?.auto ? 'system' : roleOf(by), `⛔ 升级紧急事件：${meta.label}（${detail}）；已自动同步街道值班与消防联系人，巡检状态不允许完成`, at)
    if (e.incidentId) {
      incStore.act(e.incidentId, {
        role: 'security', actor: by, type: 'escalate', at,
        text: `停电处置升级为紧急事件：${meta.label}，同步街道值班与消防联系人前不得闭环。`
      })
    }
    return esc
  }

  function resolveEscalation(eventId: string, reason: UrgentReason, by: string, at: number, note: string) {
    const e = byId(eventId)
    if (!e || e.phase === 'closed') return
    const esc = e.escalations.find((x) => x.reason === reason && !x.resolved)
    if (!esc) return
    esc.resolved = true
    esc.resolvedAt = at
    esc.resolvedBy = by
    esc.resolveNote = note
    pushLog(e, by, roleOf(by), `紧急事件解除：${esc.label}（${note}）`, at)
    if (esc.incidentId) {
      useIncidentStore().act(esc.incidentId, {
        role: roleOf(by), actor: by, type: 'resolve', at,
        text: `现场确认解除：${note}`
      })
    }
    if (!e.escalations.some((x) => !x.resolved) && e.phase === 'urgent') {
      e.phase = 'blackout'
      pushLog(e, '系统', 'system', '全部紧急事件已解除，应急单回到停电处置阶段', at)
    }
  }

  function notifyStreet(eventId: string, by: string, at: number) {
    const e = byId(eventId)
    if (!e || e.streetNotified) return
    e.streetNotified = true
    e.streetNotifiedAt = at
    for (const esc of e.escalations) if (!esc.resolved) esc.streetNotified = true
    pushLog(e, by, roleOf(by), `已一键同步街道值班室（停电小区、影响书房、在馆人数、处置进展同步推送）`, at)
    if (e.incidentId) {
      const r = roleOf(by)
      useIncidentStore().escalate(e.incidentId, 'street', by, r === 'system' ? 'admin' : r, at)
    }
  }

  function notifyFire(eventId: string, by: string, at: number) {
    const e = byId(eventId)
    if (!e || e.fireNotified) return
    e.fireNotified = true
    e.fireNotifiedAt = at
    for (const esc of e.escalations) if (!esc.resolved) esc.fireNotified = true
    const lib = useSystemStore().libraries.find((l) => l.id === e.libraryId)
    pushLog(e, by, roleOf(by), `已联系消防联系人（${lib?.fireContactPhone ?? '119'}），通报停电与紧急情况`, at)
    if (e.incidentId) {
      useIncidentStore().act(e.incidentId, {
        role: 'security', actor: by, type: 'escalate', at,
        text: `已联系消防联系人（${lib?.fireContactPhone ?? '119'}）。`
      })
    }
  }

  // ---------------- 读者求助 ----------------

  function addHelp(input: {
    eventId?: string
    libraryId: string
    at: number
    visitId?: string
    readerName: string
    zone: string
    kind: BlackoutEvent['helps'][number]['kind']
    content: string
  }): BlackoutEvent | undefined {
    const system = useSystemStore()
    const lib = system.libraries.find((l) => l.id === input.libraryId)
    let e = input.eventId ? byId(input.eventId) : activeOf(input.libraryId)
    if (!e) {
      // 读者端在停电中提交：理论上必有应急单
      e = trigger(input.libraryId, input.at)
    }
    const help = {
      id: uid('bh'),
      at: input.at,
      visitId: input.visitId,
      readerName: input.readerName,
      zone: input.zone,
      kind: input.kind,
      content: input.content,
      status: 'new' as const
    }
    e.helps.unshift(help)
    pushLog(e, input.readerName, 'service', `读者求助：【${helpZoneLabel(input.kind)}】${input.zone} · ${input.content}`, input.at)
    // 被困自动升级紧急事件
    if (input.kind === 'trapped') {
      escalate(e.id, 'trapped', `${input.readerName} 在${input.zone}求助：${input.content}`, input.readerName, input.at)
    }
    void lib
    return e
  }

  function handleHelp(eventId: string, helpId: string, by: string, at: number, result: string, resolved: boolean) {
    const e = byId(eventId)
    const h = e?.helps.find((x) => x.id === helpId)
    if (!e || !h) return
    h.status = resolved ? 'resolved' : 'handling'
    h.handledBy = by
    h.handledAt = at
    h.result = result
    pushLog(e, by, roleOf(by), resolved ? `读者求助已处置：${h.readerName}（${result}）` : `读者求助处理中：${h.readerName}（${result}）`, at)
  }

  // ---------------- 借还暂存 / 补录 ----------------

  function addPendingLoan(input: {
    eventId?: string
    libraryId: string
    at: number
    operator: string
    readerName: string
    bookBarcode: string
    bookTitle: string
    kind: 'borrow' | 'return'
    deviceId: string
    zone: string
    note?: string
  }): PendingLoan | undefined {
    let e = input.eventId ? byId(input.eventId) : activeOf(input.libraryId)
    if (!e) return undefined
    const branch = useBranchStore()
    const device = branch.devices.find((d) => d.id === input.deviceId)
    const loan: PendingLoan = {
      id: uid('pl'),
      opAt: input.at,
      recordedAt: input.at,
      operator: input.operator,
      readerName: input.readerName.trim(),
      bookBarcode: input.bookBarcode.trim(),
      bookTitle: input.bookTitle.trim() || input.bookBarcode,
      kind: input.kind,
      deviceId: input.deviceId,
      deviceName: device?.name ?? input.deviceId,
      zone: input.zone,
      note: input.note,
      status: 'pending'
    }
    e.pendingLoans.unshift(loan)
    pushLog(e, input.operator, 'service', `借还请求本地暂存：${loan.kind === 'borrow' ? '借出' : '归还'}《${loan.bookTitle}》条码 ${loan.bookBarcode}（读者 ${loan.readerName}，设备 ${loan.deviceName}，按实际操作时间留痕，来电补录，不计逾期/借阅失败）`, input.at)
    return loan
  }

  function backfillLoan(eventId: string, loanId: string, by: string, at: number): boolean {
    const e = byId(eventId)
    const loan = e?.pendingLoans.find((x) => x.id === loanId)
    if (!e || !loan || loan.status === 'backfilled') return false
    const branch = useBranchStore()
    const reader = branch.readers.find((r) => r.name === loan.readerName)
    // 按“实际操作时间 + 设备编号”补入自助流水（at 用 opAt，不用补录时刻）
    branch.usageLogs.unshift({
      id: uid('u'),
      libraryId: e.libraryId,
      readerId: reader?.id ?? 'manual',
      readerName: loan.readerName,
      kind: loan.kind === 'borrow' ? 'borrow' : 'return',
      detail: `【停电暂存·来电补录】《${loan.bookTitle}》条码 ${loan.bookBarcode}，${loan.kind === 'borrow' ? '人工借出' : '人工归还'}；操作时间 ${new Date(loan.opAt).toLocaleString('zh-CN')}，设备编号 ${loan.deviceId}（${loan.deviceName}），经办 ${loan.operator}，补录 ${by}；停电期间不计逾期、不作借阅失败`,
      at: loan.opAt
    })
    loan.status = 'backfilled'
    loan.backfilledAt = at
    loan.backfilledBy = by
    pushLog(e, by, roleOf(by), `借还补录入系统：《${loan.bookTitle}》按操作时间 ${new Date(loan.opAt).toLocaleTimeString('zh-CN')} 与设备编号 ${loan.deviceId} 补入`, at)
    return true
  }

  function backfillAll(eventId: string, by: string, at: number): number {
    const e = byId(eventId)
    if (!e) return 0
    let n = 0
    for (const loan of [...e.pendingLoans].reverse()) {
      if (loan.status === 'pending' && backfillLoan(eventId, loan.id, by, at)) n++
    }
    if (n && e.incidentId) {
      useIncidentStore().act(e.incidentId, {
        role: 'service', actor: by, type: 'comment', at,
        text: `停电期间暂存借还已全部补录（${n} 笔），均按实际操作时间与设备编号写入流水，读者不计逾期/借阅失败。`
      })
    }
    return n
  }

  // ---------------- 分区清点 ----------------

  function countZone(eventId: string, zone: string, actualCount: number, by: string, at: number, note?: string) {
    const e = byId(eventId)
    const row = e?.headcounts.find((h) => h.zone === zone)
    if (!e || !row) return
    row.actualCount = actualCount
    row.countedBy = by
    row.countedAt = at
    row.note = note
    pushLog(e, by, roleOf(by), `分区清点：${zone} 实到 ${actualCount} 人（系统在馆记录 ${row.systemCount} 人）${note ? `；${note}` : ''}`, at)
  }

  const peopleCount = (e: BlackoutEvent): number =>
    e.headcounts.some((h) => h.actualCount !== undefined)
      ? e.headcounts.reduce((s, h) => s + (h.actualCount ?? h.systemCount), 0)
      : e.headcounts.reduce((s, h) => s + h.systemCount, 0)

  // ---------------- 空调停运 / 提前闭馆 ----------------

  function acStoppedMin(e: BlackoutEvent, nowTs: number): number {
    if (!e.acStoppedAt || e.phase === 'closed') return 0
    const end = e.restoredAt ?? nowTs
    return Math.max(0, Math.round((end - e.acStoppedAt) / 60000))
  }

  function assessEarlyClose(eventId: string, earlyClose: boolean, by: string, at: number, note: string) {
    const e = byId(eventId)
    if (!e) return
    e.earlyCloseAssessed = true
    e.earlyClose = earlyClose
    e.earlyCloseBy = by
    e.earlyCloseAt = at
    const branch = useBranchStore()
    if (earlyClose) {
      // 通知已预约/报名读者（演示：统计当日活动报名家庭数 + 在馆预约入馆）
      const activities = branch.activities.filter((a) => a.libraryId === e.libraryId)
      const reserveCount = activities.reduce((s, a) => s + a.enrolled, 0)
      e.reservationNotifiedAt = at
      e.reservationNotifiedCount = reserveCount
      useSystemStore().setLibraryStatus(e.libraryId, 'closing')
      pushLog(e, by, 'admin', `评估决定提前闭馆：空调/新风停运超阈值（${e.acThresholdMin} 分钟），已通知 ${reserveCount} 名已预约/报名读者改期，在馆读者有序疏散（${note}）`, at)
      if (e.incidentId) {
        useIncidentStore().act(e.incidentId, {
          role: 'admin', actor: by, type: 'notify', at,
          text: `空调停运 ${acStoppedMin(e, at)} 分钟超阈值，管理员决定提前闭馆；已通过短信/公众号通知 ${reserveCount} 名预约读者，饮水机/打印停止服务公告已同步读者端。`
        })
      }
    } else {
      pushLog(e, by, 'admin', `评估暂不提前闭馆：维持应急开放与疏散值守，继续观察温度与 UPS 续航（${note}）`, at)
    }
  }

  // ---------------- 夜间来电恢复逐项确认 ----------------

  function setNightItem(eventId: string, key: NightRecoverKey, state: 'ok' | 'abnormal', by: string, at: number, note?: string) {
    const e = byId(eventId)
    const item = e?.nightItems.find((i) => i.key === key)
    if (!e || !item) return
    item.state = state
    item.confirmedBy = by
    item.confirmedAt = at
    item.note = note
    pushLog(e, by, roleOf(by), `夜间停电恢复确认：${item.label} → ${state === 'ok' ? '已确认' : '异常（继续处置，未确认前不得闭馆）'}${note ? `；${note}` : ''}`, at)
    if (state === 'abnormal') {
      // 命中四类紧急条件的夜间异常同步升级；其余（门窗/门禁/摄像头）仅记录并阻塞闭馆完成
      if (key === 'people-clear') escalate(e.id, 'trapped', `夜间清场确认异常：${note ?? '可能有人员滞留/被困，需立即分区排查'}`, by, at)
      if (key === 'fire-exit') escalate(e.id, 'fire-exit-blocked', `夜间恢复确认：${note ?? '消防通道异常'}`, by, at)
      if (key === 'elight') escalate(e.id, 'elight-off', `夜间恢复确认：${note ?? '应急照明异常'}`, by, at)
    }
  }

  function nightAllConfirmed(e: BlackoutEvent): boolean {
    if (!e.night) return true
    return e.nightItems.length > 0 && e.nightItems.every((i) => i.state === 'ok')
  }

  // ---------------- 来电恢复 / 自检 ----------------

  function restorePower(eventId: string, at: number, by: string) {
    const e = byId(eventId)
    if (!e || e.phase === 'recovered' || e.phase === 'closed') return
    const branch = useBranchStore()
    const system = useSystemStore()
    e.restoredAt = at
    e.phase = 'recovered'

    // 来电恢复策略：
    // - 有自检项的设备（自助机/还书箱/门禁/摄像头/消防/烟感/空调/新风/应急照明/疏散指示）保持停用/离线，逐项自检通过才恢复，失败转故障工单；
    // - 无自检项的设备（普通照明/饮水机/打印机/求助按钮/UPS/异常声音）按停电前快照恢复；
    // - 停电中新出现 fault/alarm/offline 的设备一律保留，不被掩盖。
    const pendingSelfTestTypes: Device['type'][] = [
      'selfkiosk', 'returnbox', 'gate', 'camera', 'fire', 'smoke', 'ac', 'vent', 'elight', 'exitsign'
    ]
    for (const snap of e.deviceSnapshot) {
      const d = branch.devices.find((x) => x.id === snap.id)
      if (!d) continue
      const discoveredFault =
        (d.status === 'fault' || d.status === 'alarm' || d.status === 'offline') &&
        (snap.status === 'normal' || snap.status === 'online')
      if (discoveredFault) continue // 停电中新发现故障，保留待报修
      if (pendingSelfTestTypes.includes(d.type)) {
        // 等待自检：市电设备保持 off、UPS 技防设备保持 offline，直到对应自检项通过
        continue
      }
      branch.updateDevice(d.id, { status: snap.status, note: snap.note, level: snap.level, lastCheck: at })
    }
    e.selfTests = buildSelfTests()
    pushLog(e, by, roleOf(by), '来电：市电恢复，设备按停电前状态自检重启；故障/离线设备保留待检，暂不开放服务', at)
    if (e.incidentId) {
      useIncidentStore().act(e.incidentId, {
        role: 'maintainer', actor: by, type: 'comment', at,
        text: '市电恢复，开始设备自检：消磁、还书箱、自助机、门禁、摄像头、消防/烟感、空调新风、应急照明逐项核验；故障设备进入跨日交接。'
      })
    }
    void system
  }

  /** 自检项通过/失败后需要一并处理的设备类型 */
  const SELFTEST_RESTORE_TYPES: Record<BlackoutSelfTestItem['key'], Device['type'][]> = {
    demag: ['selfkiosk'],
    returnbox: ['returnbox'],
    kiosk: ['selfkiosk'],
    gate: ['gate'],
    camera: ['camera'],
    fire: ['fire', 'smoke'],
    ac: ['ac', 'vent'],
    elight: ['elight', 'exitsign']
  }

  function setSelfTest(eventId: string, key: BlackoutSelfTestItem['key'], pass: boolean, by: string, at: number, note: string) {
    const e = byId(eventId)
    const item = e?.selfTests.find((i) => i.key === key)
    if (!e || !item || item.state !== 'pending') return
    item.state = pass ? 'pass' : 'fail'
    item.checkedBy = by
    item.checkedAt = at
    item.note = note
    const branch = useBranchStore()
    const faults = useFaultsStore()

    if (pass) {
      pushLog(e, by, 'maintainer', `设备自检通过：${item.label}${note ? `；${note}` : ''}`, at)
      // 恢复关联设备（仅当其当前因停电离线/关闭；已故障的不动）
      for (const type of SELFTEST_RESTORE_TYPES[key]) {
        branch.devicesOf(e.libraryId).filter((d) => d.type === type).forEach((d) => {
          if (d.status === 'off' || d.status === 'offline') {
            branch.setDeviceStatus(d.id, d.type === 'camera' || d.type === 'smoke' ? 'online' : 'normal', `来电自检通过：${note || '恢复正常'}`)
          }
        })
      }
    } else {
      // 自检失败：停电导致停用/离线的相关设备转故障；无工单的建新工单，已有工单的复用并纳入跨日交接
      const relatedTypes = SELFTEST_RESTORE_TYPES[key]
      const relatedDevices = branch.devicesOf(e.libraryId).filter((d) => relatedTypes.includes(d.type))
      const failedNames: string[] = []
      const relatedFaultIds: string[] = []
      for (const d of relatedDevices) {
        if (d.status === 'off' || d.status === 'offline') {
          branch.setDeviceStatus(d.id, 'fault', `来电自检失败：${item.label}（${note || '未通过'}）`)
        }
        failedNames.push(d.name)
        const existed = faults.faultOfDevice(d.id)
        if (existed) {
          relatedFaultIds.push(existed.id)
        } else if (d.status === 'fault') {
          const r = faults.report({
            libraryId: e.libraryId,
            deviceId: d.id,
            faultDesc: `来电自检失败：${item.label}。${note}`,
            photos: [],
            affectedReaderCount: e.pendingLoans.length,
            affectedDesc: `突发停电（${e.no}）后自检发现，影响借还/入馆/安全技防，已进入跨日交接。`,
            maintainerName: '市图书馆设备运维中心（24h）',
            maintainerPhone: '400-820-0000',
            maintainerCompany: '设备运维中心/原厂商维保',
            reporter: by,
            at
          })
          relatedFaultIds.push(r.id)
        }
      }
      if (relatedFaultIds.length) {
        item.faultId = relatedFaultIds[0]
        for (const id of relatedFaultIds) if (!e.carriedFaultIds.includes(id)) e.carriedFaultIds.push(id)
      }
      pushLog(e, by, 'maintainer', `⛔ 设备自检失败：${item.label}（涉及设备：${failedNames.join('、')}；${note || '未通过'}），相关故障工单进入跨日交接`, at)
    }
  }

  // ---------------- 读者端停用公告 ----------------

  /** 读者端可见的停电服务停用公告 */
  function readerNotices(libraryId: string): { icon: string; text: string }[] {
    const e = activeOf(libraryId)
    if (!e || e.phase === 'closed') return []
    const out: { icon: string; text: string }[] = []
    const branch = useBranchStore()
    const devs = branch.devicesOf(libraryId)
    if (devs.some((d) => d.type === 'selfkiosk' && (d.status === 'off' || d.status === 'offline' || d.status === 'fault'))) {
      out.push({ icon: '🖥️', text: '自助借还机暂停使用，借还请找工作人员人工登记，来电后统一补录，不计逾期' })
    }
    if (devs.some((d) => d.type === 'printer' && (d.status === 'off' || d.status === 'offline' || d.status === 'fault'))) {
      out.push({ icon: '🖨️', text: '自助打印暂停服务' })
    }
    if (devs.some((d) => d.type === 'water' && (d.status === 'off' || d.status === 'fault'))) {
      out.push({ icon: '🚰', text: '饮水机暂停服务，请勿空烧接水' })
    }
    if (devs.some((d) => d.type === 'ac' && d.status === 'off')) {
      out.push({ icon: '🌡️', text: '空调/新风停运，请注意通风，必要时按引导提前离馆' })
    }
    return out
  }

  // ---------------- 复盘 / 闭环 ----------------

  function blockedCloseReasons(e: BlackoutEvent): string[] {
    const reasons: string[] = []
    if (e.phase !== 'recovered') reasons.push('市电尚未恢复/尚未进入来电自检阶段')
    const unresolved = e.escalations.filter((x) => !x.resolved)
    if (unresolved.length) reasons.push(`仍有 ${unresolved.length} 起紧急事件未解除（${unresolved.map((x) => x.label).join('、')}）`)
    // 只要升级过紧急事件，闭环前必须已同步街道值班与消防联系人
    if (e.escalations.length && !e.streetNotified) reasons.push('紧急事件未同步街道值班')
    if (e.escalations.length && !e.fireNotified) reasons.push('紧急事件未联系消防联系人')
    if (e.night && !nightAllConfirmed(e)) {
      const n = e.nightItems.filter((i) => i.state !== 'ok').length
      reasons.push(`夜间停电恢复 ${n} 项未逐项确认（人员清场/门窗/消防通道/应急照明/门禁恢复/摄像头回传），未恢复前不得标记闭馆完成`)
    }
    const pendingTests = e.selfTests.filter((s) => s.state === 'pending')
    if (pendingTests.length) reasons.push(`仍有 ${pendingTests.length} 项来电设备自检未完成`)
    const pendingLoans = e.pendingLoans.filter((l) => l.status === 'pending')
    if (pendingLoans.length) reasons.push(`仍有 ${pendingLoans.length} 笔停电期间借还未补录入系统`)
    return reasons
  }

  function saveReview(
    eventId: string,
    payload: {
      by: string
      at: number
      scope: string
      helpSummary: string
      responsibility: string
      improvements: string[]
    }
  ): { ok: boolean; error?: string } {
    const e = byId(eventId)
    if (!e) return { ok: false, error: '应急单不存在' }
    const block = blockedCloseReasons(e)
    if (block.length) return { ok: false, error: block.join('；') }
    e.review = {
      filledAt: payload.at,
      filledBy: payload.by,
      outageStart: e.startedAt,
      outageEnd: e.restoredAt,
      durationMin: e.restoredAt ? Math.round((e.restoredAt - e.startedAt) / 60000) : undefined,
      scope: payload.scope,
      helpSummary: payload.helpSummary,
      responsibility: payload.responsibility,
      improvements: payload.improvements.filter((x) => x.trim())
    }
    e.phase = 'closed'
    e.closedAt = payload.at
    pushLog(e, payload.by, 'admin', `停电应急处置闭环，复盘已归档：停电 ${e.review.durationMin} 分钟；改进项 ${e.review.improvements.length} 条`, payload.at)
    const system = useSystemStore()
    if (e.night || e.earlyClose) system.setLibraryStatus(e.libraryId, 'closed')
    else system.setLibraryStatus(e.libraryId, 'open')
    if (e.incidentId) {
      const incStore = useIncidentStore()
      incStore.act(e.incidentId, {
        role: 'admin', actor: payload.by, type: 'resolve', at: payload.at,
        text: `停电处置闭环并完成复盘：影响范围“${payload.scope}”；读者求助 ${e.helps.length} 起；处置责任：${payload.responsibility}；改进项 ${e.review.improvements.length} 条。`
      })
    }
    return { ok: true }
  }

  /** 街道值班视角：跨书房停电汇总 */
  const streetRows = computed(() => {
    const system = useSystemStore()
    return events.value
      .filter((e) => e.phase !== 'closed')
      .map((e) => {
        const lib = system.libraries.find((l) => l.id === e.libraryId)
        return {
          event: e,
          libraryName: lib?.name ?? e.libraryId,
          address: lib?.address ?? '',
          community: e.community,
          people: peopleCount(e),
          phase: e.phase,
          urgent: e.phase === 'urgent' || e.escalations.some((x) => !x.resolved),
          startedAt: e.startedAt
        }
      })
      .sort((a, b) => (a.urgent === b.urgent ? b.startedAt - a.startedAt : a.urgent ? -1 : 1))
  })

  function streetGuidance(eventId: string, by: string, at: number, text: string) {
    const e = byId(eventId)
    if (!e || !text.trim()) return
    pushLog(e, by, 'street', `街道值班指导：${text.trim()}`, at)
    if (e.incidentId) {
      useIncidentStore().act(e.incidentId, {
        role: 'street', actor: by, type: 'comment', at,
        text: `街道值班：${text.trim()}`
      })
    }
  }

  return {
    events,
    activeMap,
    hasActiveAny,
    byLibrary,
    activeOf,
    byId,
    trigger,
    setImpact,
    securityArrived,
    applyGateFallback,
    escalate,
    resolveEscalation,
    notifyStreet,
    notifyFire,
    addHelp,
    handleHelp,
    addPendingLoan,
    backfillLoan,
    backfillAll,
    countZone,
    peopleCount,
    acStoppedMin,
    assessEarlyClose,
    setNightItem,
    nightAllConfirmed,
    restorePower,
    setSelfTest,
    readerNotices,
    blockedCloseReasons,
    saveReview,
    streetRows,
    streetGuidance
  }
})

function helpZoneLabel(kind: BlackoutEvent['helps'][number]['kind']): string {
  return {
    trapped: '被困求助',
    injury: '身体不适/受伤',
    separated: '与同行人失散',
    route: '询问疏散路线',
    other: '其他求助'
  }[kind]
}

/** 演示：按经办人姓名猜测角色（街道/安保/维护/服务/管理员） */
function roleOf(name: string): BlackoutLog['role'] {
  if (name.includes('街道') || name.includes('沈')) return 'street'
  if (name.includes('安保') || name.includes('李') || name.includes('马')) return 'security'
  if (name.includes('工') || name.includes('赵') || name.includes('维护')) return 'maintainer'
  if (name.includes('陈') || name.includes('服')) return 'service'
  return 'admin'
}
