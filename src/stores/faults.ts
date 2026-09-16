import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  DeviceFaultReport,
  FaultPhoto,
  Incident,
  ManualServiceRecord,
  ManualServiceSession
} from '@/types'
import { seedFaultReports } from '@/data/seed'
import { uid } from '@/utils/format'
import { useBranchStore } from '@/stores/branch'
import { useIncidentStore } from '@/stores/incident'

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

/** 需要人工借还兜底的设备类型 */
export const MANUAL_SERVICE_TYPES = ['selfkiosk', 'printer'] as const

export interface ReportInput {
  libraryId: string
  deviceId: string
  faultDesc: string
  photos: FaultPhoto[]
  affectedReaderCount: number
  affectedDesc: string
  maintainerName: string
  maintainerPhone: string
  maintainerCompany: string
  reporter: string
  at: number
  incidentId?: string
}

export const useFaultsStore = defineStore('faults', () => {
  const reports = ref<DeviceFaultReport[]>(clone(seedFaultReports))

  function ofLibrary(libraryId: string): DeviceFaultReport[] {
    return reports.value
      .filter((r) => r.libraryId === libraryId)
      .sort((a, b) => b.reportedAt - a.reportedAt)
  }

  function faultOfDevice(deviceId: string): DeviceFaultReport | undefined {
    return reports.value.find((r) => r.deviceId === deviceId && r.status !== 'repaired')
  }
  function byId(id: string): DeviceFaultReport | undefined {
    return reports.value.find((r) => r.id === id)
  }

  /** 未修复（含停用/临时恢复/跨日）工单 */
  const openReports = computed(() =>
    reports.value.filter((r) => r.status !== 'repaired')
  )

  /** 开馆前等待管理员确认的跨日故障 */
  function pendingOpenDecision(libraryId: string): DeviceFaultReport[] {
    return reports.value.filter(
      (r) => r.libraryId === libraryId && r.status === 'carried-over' && !r.openDecision
    )
  }

  /** 继续停用中的故障（人工借还可能进行中） */
  function continueClosed(libraryId: string): DeviceFaultReport[] {
    return reports.value.filter(
      (r) => r.libraryId === libraryId && r.status === 'continue-closed'
    )
  }

  /** 人工借还进行中的工单 */
  function activeManualReports(libraryId: string): DeviceFaultReport[] {
    return reports.value.filter(
      (r) => r.libraryId === libraryId && r.manualSession?.status === 'active'
    )
  }

  function nextNo(): string {
    const d = new Date()
    const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const n = reports.value.filter((r) => r.no.includes(key)).length + 1
    return `WX-${key}-${String(n).padStart(3, '0')}`
  }

  /** 上报故障（从设备页发起；未提供事件时自动生成设备故障事件并互相关联） */
  function report(input: ReportInput): DeviceFaultReport {
    const branch = useBranchStore()
    const incStore = useIncidentStore()
    const device = branch.devices.find((d) => d.id === input.deviceId)

    let incidentId = input.incidentId
    if (!incidentId) {
      const inc = incStore.create({
        libraryId: input.libraryId,
        type: 'device-fault',
        severity: 'medium',
        title: `设备故障：${device?.name ?? input.deviceId}`,
        detail:
          `报修人 ${input.reporter}：${input.faultDesc}。影响：${input.affectedDesc || '待评估'}` +
          `（约 ${input.affectedReaderCount} 人次）。维修联系人：${input.maintainerName} ${input.maintainerPhone}（${input.maintainerCompany}）。`,
        at: input.at,
        owner: 'maintainer',
        deviceId: input.deviceId
      })
      incidentId = inc.id
    }

    const r: DeviceFaultReport = {
      id: uid('fr'),
      no: nextNo(),
      libraryId: input.libraryId,
      deviceId: input.deviceId,
      deviceName: device?.name ?? input.deviceId,
      deviceType: device?.type ?? 'selfkiosk',
      faultDesc: input.faultDesc,
      reportedAt: input.at,
      reporter: input.reporter,
      photos: input.photos,
      affectedReaderCount: input.affectedReaderCount,
      affectedDesc: input.affectedDesc,
      maintainerName: input.maintainerName,
      maintainerPhone: input.maintainerPhone,
      maintainerCompany: input.maintainerCompany,
      status: 'open',
      incidentId
    }
    reports.value.unshift(r)
    branch.setDeviceStatus(input.deviceId, 'fault', input.faultDesc)
    return r
  }

  /**
   * 闭馆交接、次日开馆时调用：未修复工单跨日保留（照片/报修时间/影响读者/维修联系人不变）。
   * 幂等：已挂到该日期或已有开馆决策的工单不重复处理。
   */
  function carryOver(libraryId: string, nextBusinessDate: string): string[] {
    const ids: string[] = []
    for (const r of reports.value) {
      if (r.libraryId !== libraryId || r.status === 'repaired') continue
      if (r.carriedToDate === nextBusinessDate) continue
      r.status = 'carried-over'
      r.carriedToDate = nextBusinessDate
      ids.push(r.id)
    }
    return ids
  }

  /** 开馆前管理员确认：继续停用（可启动人工借还）或临时恢复 */
  function confirmOpen(
    reportId: string,
    payload: {
      decision: 'continue-closed' | 'temporary-recovery'
      decidedBy: string
      note: string
      manualService: boolean
      at: number
    }
  ): { ok: boolean; error?: string; report?: DeviceFaultReport } {
    const r = reports.value.find((x) => x.id === reportId)
    if (!r) return { ok: false, error: '工单不存在' }
    const branch = useBranchStore()
    const incStore = useIncidentStore()

    r.openDecision = {
      decision: payload.decision,
      decidedBy: payload.decidedBy,
      at: payload.at,
      note: payload.note,
      manualService: payload.manualService
    }

    if (payload.decision === 'temporary-recovery') {
      r.status = 'temporary-recovery'
      branch.setDeviceStatus(r.deviceId, 'normal', `开馆前确认临时恢复：${payload.note || '可降级使用'}`)
      if (r.incidentId) {
        incStore.act(r.incidentId, {
          role: 'admin', actor: payload.decidedBy, type: 'comment',
          text: `开馆前确认设备临时恢复使用（故障工单 ${r.no} 继续挂账待维修）：${payload.note || '降级使用，注意观察'}`,
          at: payload.at
        })
      }
    } else {
      r.status = 'continue-closed'
      branch.setDeviceStatus(r.deviceId, 'fault', `继续停用：${payload.note || r.faultDesc}`)
      const needManual = MANUAL_SERVICE_TYPES.includes(r.deviceType as (typeof MANUAL_SERVICE_TYPES)[number])
      if (payload.manualService && needManual) {
        startManualSession(reportId, payload.decidedBy, '开馆前确认设备继续停用，启用人工借还/登记兜底', payload.at)
      }
      if (r.incidentId) {
        incStore.act(r.incidentId, {
          role: 'admin', actor: payload.decidedBy, type: 'comment',
          text:
            `开馆前确认设备继续停用（工单 ${r.no}）。` +
            (payload.manualService && needManual
              ? '已启用人工借还兜底，读者图书业务转服务台办理，事后补入系统。'
              : '请引导读者使用备用设备。') +
            (payload.note ? ` 说明：${payload.note}` : ''),
          at: payload.at
        })
      }
    }
    return { ok: true, report: r }
  }

  // ---------------- 人工借还 ----------------

  function manualCapable(r: DeviceFaultReport): boolean {
    return MANUAL_SERVICE_TYPES.includes(r.deviceType as (typeof MANUAL_SERVICE_TYPES)[number])
  }

  function startManualSession(reportId: string, operator: string, reason: string, at: number) {
    const r = reports.value.find((x) => x.id === reportId)
    if (!r) return
    if (r.manualSession?.status === 'active') return
    const session: ManualServiceSession = {
      id: uid('ms'),
      startedAt: at,
      startedBy: operator,
      reason,
      status: 'active',
      records: []
    }
    r.manualSession = session
    r.status = 'continue-closed'
    const incStore = useIncidentStore()
    if (r.incidentId) {
      incStore.act(r.incidentId, {
        role: 'service', actor: operator, type: 'dispatch',
        text: `故障设备继续停用，人工借还开始（服务台兜底，登记经办人与图书条码，事后补入系统）`,
        at
      })
    }
  }

  function addManualRecord(
    reportId: string,
    input: { operator: string; readerName: string; bookBarcode: string; kind: 'borrow' | 'return'; note?: string; at: number }
  ): { ok: boolean; error?: string; record?: ManualServiceRecord } {
    const r = reports.value.find((x) => x.id === reportId)
    if (!r) return { ok: false, error: '工单不存在' }
    if (r.manualSession?.status !== 'active') return { ok: false, error: '人工借还未开始或已结束' }
    if (!input.readerName.trim() || !input.bookBarcode.trim()) return { ok: false, error: '读者与图书条码必填' }
    const rec: ManualServiceRecord = {
      id: uid('mr'),
      at: input.at,
      operator: input.operator,
      readerName: input.readerName.trim(),
      bookBarcode: input.bookBarcode.trim(),
      kind: input.kind,
      note: input.note,
      backfilled: false
    }
    r.manualSession.records.unshift(rec)
    return { ok: true, record: rec }
  }

  /** 单笔补入系统：写回自助流水 */
  function backfillRecord(reportId: string, recordId: string, by: string, at: number): boolean {
    const r = reports.value.find((x) => x.id === reportId)
    const rec = r?.manualSession?.records.find((x) => x.id === recordId)
    if (!r || !rec || rec.backfilled) return false
    rec.backfilled = true
    rec.backfilledAt = at
    rec.backfilledBy = by
    const branch = useBranchStore()
    const reader = branch.readers.find((x) => x.name === rec.readerName)
    branch.usageLogs.unshift({
      id: uid('u'),
      libraryId: r.libraryId,
      readerId: reader?.id ?? 'manual',
      readerName: rec.readerName,
      kind: rec.kind === 'borrow' ? 'borrow' : 'return',
      detail: `【人工借还补入系统】条码 ${rec.bookBarcode}（${rec.kind === 'borrow' ? '人工借出' : '人工归还'}，经办人 ${rec.operator}）`,
      at
    })
    return true
  }

  /** 一键补录全部未补入记录 */
  function backfillAll(reportId: string, by: string, at: number): number {
    const r = reports.value.find((x) => x.id === reportId)
    if (!r?.manualSession) return 0
    let n = 0
    for (const rec of r.manualSession.records) {
      if (!rec.backfilled && backfillRecord(reportId, rec.id, by, at)) n++
    }
    return n
  }

  /**
   * 人工借还结束：补生成设备故障说明（笔数/经办人/条码清单/补录情况），
   * 写入工单永久留存并同步关联事件。
   */
  function endManualSession(
    reportId: string,
    payload: { operator: string; at: number; summary?: string }
  ): { ok: boolean; error?: string; pendingBackfill?: number } {
    const r = reports.value.find((x) => x.id === reportId)
    if (!r?.manualSession || r.manualSession.status !== 'active') return { ok: false, error: '没有进行中的人工借还' }
    const records = r.manualSession.records
    const pending = records.filter((x) => !x.backfilled).length
    const session = r.manualSession
    session.status = 'ended'
    session.endedAt = payload.at
    session.endedBy = payload.operator

    const borrowN = records.filter((x) => x.kind === 'borrow').length
    const returnN = records.filter((x) => x.kind === 'return').length
    const lines = [
      `设备故障说明（人工借还兜底）：${r.deviceName}（${r.no}）因“${r.faultDesc}”继续停用。`,
      `人工借还时段 ${new Date(session.startedAt).toLocaleString('zh-CN')} — ${new Date(payload.at).toLocaleString('zh-CN')}，共处理 ${records.length} 笔（借出 ${borrowN}、归还 ${returnN}），已补入系统 ${records.length - pending} 笔，待补 ${pending} 笔。`,
      ...records.map((x) => `${x.kind === 'borrow' ? '借出' : '归还'}｜条码 ${x.bookBarcode}｜读者 ${x.readerName}｜经办 ${x.operator}${x.backfilled ? '｜已补录' : '｜待补录'}`)
    ]
    if (payload.summary) lines.push(`备注：${payload.summary}`)
    r.statement = {
      generatedAt: payload.at,
      generatedBy: payload.operator,
      content: lines.join('\n'),
      recordCount: records.length,
      borrowCount: borrowN,
      returnCount: returnN
    }

    const incStore = useIncidentStore()
    if (r.incidentId) {
      incStore.act(r.incidentId, {
        role: 'service', actor: payload.operator, type: 'comment',
        text: `人工借还结束，系统已补生成设备故障说明：共 ${records.length} 笔（借出 ${borrowN}/归还 ${returnN}），待补录 ${pending} 笔。`,
        at: payload.at
      })
    }
    return { ok: true, pendingBackfill: pending }
  }

  /** 修复关闭工单 */
  function repair(reportId: string, payload: { by: string; note: string; at: number }): boolean {
    const r = reports.value.find((x) => x.id === reportId)
    if (!r || r.status === 'repaired') return false
    r.status = 'repaired'
    r.repairedAt = payload.at
    r.repairedBy = payload.by
    r.repairNote = payload.note
    const branch = useBranchStore()
    branch.setDeviceStatus(r.deviceId, 'normal', `已修复：${payload.note}`)
    const incStore = useIncidentStore()
    if (r.incidentId) {
      incStore.act(r.incidentId, {
        role: 'maintainer', actor: payload.by, type: 'resolve',
        text: `设备修复完成，工单 ${r.no} 关闭：${payload.note}`, at: payload.at
      })
    }
    return true
  }

  /** 为设备页“上报异常”补充关联事件 */
  function attachIncident(reportId: string, incident: Incident) {
    const r = reports.value.find((x) => x.id === reportId)
    if (r && !r.incidentId) r.incidentId = incident.id
  }

  function needsManualNow(libraryId: string): boolean {
    return activeManualReports(libraryId).length > 0
  }

  return {
    reports,
    openReports,
    ofLibrary,
    faultOfDevice,
    byId,
    pendingOpenDecision,
    continueClosed,
    activeManualReports,
    manualCapable,
    report,
    carryOver,
    confirmOpen,
    startManualSession,
    addManualRecord,
    backfillRecord,
    backfillAll,
    endManualSession,
    repair,
    attachIncident,
    needsManualNow
  }
})
