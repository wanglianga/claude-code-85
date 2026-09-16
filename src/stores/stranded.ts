import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  GateRecord,
  Role,
  StrandedDecision,
  StrandedHandling,
  StrandedLog,
  Visit
} from '@/types'
import { useBranchStore } from '@/stores/branch'
import { useIncidentStore } from '@/stores/incident'
import { useSystemStore } from '@/stores/system'

export interface DiscoverInput {
  visitId: string
  zone?: string
  at: number
}

export interface DispatchInput {
  visitId: string
  securityName: string
  securityPost: string
  etaMin: number
  phone?: string
  at: number
}

export interface DecideInput {
  visitId: string
  decision: StrandedDecision
  decidedBy: string
  note: string
  at: number
  /** 特殊延时分钟数 */
  extensionMinutes?: number
  /** 报警回执号 */
  policeNo?: string
}

export interface LeaveInput {
  visitId: string
  method: 'self' | 'guardian-pickup' | 'police' | 'staff-escort'
  at: number
  actor: string
}

function logOf(h: StrandedHandling, at: number, actor: string, role: Role | 'system', text: string) {
  const entry: StrandedLog = { at, actor, role, text }
  h.logs.push(entry)
}

export const useStrandedStore = defineStore('stranded', () => {
  const branch = useBranchStore()
  const incStore = useIncidentStore()
  const system = useSystemStore()

  /** 本馆全部夜间滞留记录（含已离馆，用于次日追溯），按发现时间倒序 */
  function strandedVisits(libraryId: string): Visit[] {
    return branch.visits
      .filter((v) => v.libraryId === libraryId && v.stranded && v.strandedHandling)
      .sort((a, b) => (b.strandedHandling!.discoveredAt - a.strandedHandling!.discoveredAt))
  }

  /** 尚未完成处置（读者未最终离馆）的滞留——闭馆完成交接的硬门槛 */
  function unresolved(libraryId: string): Visit[] {
    return strandedVisits(libraryId).filter(
      (v) => v.strandedHandling!.status !== 'left'
    )
  }

  /** 已作出决策但读者尚未离馆 */
  function decidedButHere(libraryId: string): Visit[] {
    return unresolved(libraryId).filter((v) => v.strandedHandling!.decision)
  }

  const hasUnresolved = computed(() => (libraryId: string) => unresolved(libraryId).length > 0)

  function readerOf(visit: Visit) {
    return branch.readers.find((r) => r.id === visit.readerId)
  }

  function zoneOf(visit: Visit): string {
    if (visit.seatNo.startsWith('亲子')) return `亲子阅览区（${visit.seatNo} 座位）`
    if (visit.seatNo.startsWith('A')) return `一层阅览区 A 区（${visit.seatNo} 座位）`
    if (visit.seatNo.startsWith('B')) return `一层阅览区 B 区（${visit.seatNo} 座位）`
    if (visit.seatNo.startsWith('C')) return `二层阅览区 C 区（${visit.seatNo} 座位）`
    return `${visit.seatNo} 座位区域`
  }

  /** 门禁记录快照：入闸 + 闭馆后无出闸 */
  function buildGateRecords(visit: Visit, discoveredAt: number): GateRecord[] {
    const methodText = visit.entryMethod === 'idcard' ? '刷身份证' : visit.entryMethod === 'card' ? '刷借书证' : '扫预约码'
    return [
      { at: visit.enterAt, gate: '正门闸机', event: `${methodText}入馆（${visit.entryNo}），分配座位 ${visit.seatNo}` },
      { at: discoveredAt, gate: '正门闸机/消防通道门磁', event: '闭馆后门禁已布防，系统未检出该读者出闸记录' }
    ]
  }

  /** 闭馆后扫描发现滞留：建立处置单、关联事件 */
  function discover(input: DiscoverInput): Visit | null {
    const visit = branch.visits.find((v) => v.id === input.visitId)
    if (!visit) return null
    if (visit.strandedHandling) return visit
    visit.stranded = true
    const zone = input.zone ?? zoneOf(visit)
    const h: StrandedHandling = {
      status: 'discovered',
      discoveredAt: input.at,
      zone,
      gateRecords: buildGateRecords(visit, input.at),
      securityName: '',
      securityPost: '',
      logs: []
    }
    logOf(h, input.at, '系统', 'system', `闭馆清场扫描：${zone}发现读者${visit.readerName}未离馆，生成夜间滞留处置单`)
    const reader = readerOf(visit)
    if (reader?.isChild) {
      logOf(h, input.at, '系统', 'system', `该读者为未成年人（${reader.age} 岁），处置必须联系监护人 ${reader.guardian} ${reader.guardianPhone}，并保留沟通结果`)
    }
    visit.strandedHandling = h

    const inc = incStore.create({
      libraryId: visit.libraryId,
      type: 'stranded',
      severity: 'high',
      title: `夜间滞留处置：${visit.readerName}（${zone}）`,
      detail:
        `闭馆后清场发现读者${visit.readerName}仍滞留于${zone}。` +
        (reader?.isChild
          ? `该读者为未成年人（${reader.age} 岁），须立即联系监护人 ${reader.guardian}（${reader.guardianPhone}）并记录沟通结果。`
          : '成年人读者，按劝离 / 特殊延时 / 报警流程处置。') +
        '页面已展示读者身份、所在区域、门禁记录与可派驻安保位置；处置需记录安保到场、读者解释与最终离馆时间，完成后方可闭馆交接。',
      at: input.at,
      night: true,
      owner: 'security',
      readerId: visit.readerId
    })
    h.incidentId = inc.id
    return visit
  }

  /** 派安保（选择值班位置） */
  function dispatchSecurity(input: DispatchInput): boolean {
    const visit = branch.visits.find((v) => v.id === input.visitId)
    const h = visit?.strandedHandling
    if (!visit || !h || h.status === 'left') return false
    h.securityName = input.securityName
    h.securityPost = input.securityPost
    h.securityEtaMin = input.etaMin
    h.securityPhone = input.phone
    h.dispatchedAt = input.at
    h.status = h.arrivedAt ? 'onscene' : 'dispatched'
    logOf(h, input.at, input.securityName, 'security', `安保自「${input.securityPost}」出动，预计 ${input.etaMin} 分钟到场${input.phone ? '，电话 ' + input.phone : ''}`)
    if (h.incidentId) {
      incStore.act(h.incidentId, {
        role: 'security', actor: '安保调度', type: 'dispatch',
        text: `派 ${input.securityName}（${input.securityPost}）前往处置，预计 ${input.etaMin} 分钟到场`,
        at: input.at, newOwner: 'security'
      })
    }
    return true
  }

  /** 安保到场 */
  function arrive(visitId: string, actor: string, at: number): boolean {
    const visit = branch.visits.find((v) => v.id === visitId)
    const h = visit?.strandedHandling
    if (!h || h.status === 'left') return false
    h.arrivedAt = at
    h.status = 'onscene'
    logOf(h, at, actor || h.securityName, 'security', '安保到场：核实读者身份与身体/精神状况，开始现场沟通')
    if (h.incidentId) {
      incStore.act(h.incidentId, {
        role: 'security', actor: actor || h.securityName, type: 'arrive',
        text: '已到达滞留读者所在区域，现场确认安全', at
      })
    }
    return true
  }

  /** 记录读者解释 */
  function recordReason(visitId: string, reason: string, at: number): boolean {
    const visit = branch.visits.find((v) => v.id === visitId)
    const h = visit?.strandedHandling
    if (!h || h.status === 'left') return false
    h.readerReason = reason
    logOf(h, at, visit!.readerName, 'service', `读者解释：${reason}`)
    if (h.incidentId) {
      incStore.act(h.incidentId, {
        role: 'service', actor: '读者服务', type: 'comment',
        text: `记录读者解释：${reason}`, at
      })
    }
    return true
  }

  /** 管理员处置决策：劝离 / 特殊延时 / 报警 */
  function decide(input: DecideInput): { ok: boolean; error?: string } {
    const visit = branch.visits.find((v) => v.id === input.visitId)
    const h = visit?.strandedHandling
    if (!visit || !h) return { ok: false, error: '无滞留处置单' }
    if (h.status === 'left') return { ok: false, error: '读者已离馆' }
    if (!h.arrivedAt) return { ok: false, error: '安保尚未到场，不能作出处置决策' }
    const reader = readerOf(visit)
    if (reader?.isChild && !h.guardianNotified) {
      return { ok: false, error: '未成年读者必须先联系监护人并记录沟通结果' }
    }
    h.decision = input.decision
    h.decidedAt = input.at
    h.decidedBy = input.decidedBy
    h.decisionNote = input.note
    h.status = 'decided'
    const label = input.decision === 'persuade-leave' ? '劝离' : input.decision === 'extended-stay' ? '特殊延时' : '报警处置'
    let detail = `管理员${input.decidedBy}确认处置方式：${label}`
    if (input.decision === 'extended-stay' && input.extensionMinutes) {
      h.extensionUntil = input.at + input.extensionMinutes * 60_000
      detail += `，延时至 ${new Date(h.extensionUntil).toTimeString().slice(0, 5)}（${input.extensionMinutes} 分钟），延时期间安保看护`
    }
    if (input.decision === 'police') {
      h.policeAt = input.at
      h.policeNo = input.policeNo
      detail += `，已拨打 110${input.policeNo ? '，回执号 ' + input.policeNo : ''}，同步街道值班`
    }
    if (input.note) detail += `。说明：${input.note}`
    logOf(h, input.at, input.decidedBy, 'admin', detail)
    if (h.incidentId) {
      incStore.act(h.incidentId, {
        role: 'admin', actor: input.decidedBy, type: input.decision === 'police' ? 'escalate' : 'dispatch',
        text: detail, at: input.at,
        newOwner: input.decision === 'police' ? 'security' : input.decision === 'extended-stay' ? 'security' : 'security'
      })
      if (input.decision === 'police') {
        incStore.escalate(h.incidentId, 'street', input.decidedBy, 'admin', input.at)
      }
    }
    return { ok: true }
  }

  /** 联系监护人（未成年人），保留沟通结果 */
  function notifyGuardian(
    visitId: string,
    payload: { result: string; willPickup: boolean; at: number; actor: string }
  ): { ok: boolean; error?: string } {
    const visit = branch.visits.find((v) => v.id === visitId)
    const h = visit?.strandedHandling
    const reader = visit ? readerOf(visit) : undefined
    if (!h || !visit) return { ok: false, error: '无滞留处置单' }
    if (!reader?.isChild) return { ok: false, error: '该读者不是未成年人' }
    h.guardianNotified = true
    h.guardianNotifiedAt = payload.at
    h.guardianContactResult = payload.result
    h.guardianWillPickup = payload.willPickup
    const text =
      `已联系监护人 ${reader.guardian}（${reader.guardianPhone}），沟通结果：${payload.result}` +
      (payload.willPickup ? '；监护人将到馆接回' : '；监护人委托工作人员劝其自行离馆')
    logOf(h, payload.at, payload.actor, 'service', text)
    if (h.incidentId) {
      incStore.act(h.incidentId, {
        role: 'service', actor: payload.actor, type: 'notify', text, at: payload.at
      })
    }
    return { ok: true }
  }

  /** 确认读者最终离馆（记录最终离馆时间）；处置闭环的唯一出口 */
  function confirmLeave(input: LeaveInput): { ok: boolean; error?: string } {
    const visit = branch.visits.find((v) => v.id === input.visitId)
    const h = visit?.strandedHandling
    if (!visit || !h) return { ok: false, error: '无滞留处置单' }
    if (h.status === 'left') return { ok: false, error: '已确认离馆' }
    if (!h.decision) return { ok: false, error: '管理员尚未作出处置决策（劝离/延时/报警）' }
    const reader = readerOf(visit)
    if (reader?.isChild && !h.guardianNotified) {
      return { ok: false, error: '未成年读者离馆前必须完成监护人沟通并记录结果' }
    }
    h.leftAt = input.at
    h.leaveMethod = input.method
    h.status = 'left'
    visit.leaveAt = input.at
    const methodText = {
      self: '自行离馆',
      'guardian-pickup': '监护人到馆接回',
      police: '民警带离',
      'staff-escort': '工作人员陪同离馆'
    }[input.method]
    const text = `最终离馆：${new Date(input.at).toTimeString().slice(0, 5)}，${methodText}；滞留处置闭环`
    logOf(h, input.at, input.actor, 'security', text)
    if (h.incidentId) {
      incStore.act(h.incidentId, {
        role: 'security', actor: input.actor, type: 'resolve', text, at: input.at
      })
    }
    // 夜间滞留信用扣分（成年人/未成年人均记录，未成年人侧重教育）
    if (reader) {
      branch.adjustCredit(reader, reader.isChild ? -2 : -8, '夜间闭馆滞留（已闭环处置）', input.at)
    }
    return { ok: true }
  }

  /** 当前书房可选安保与值班位置 */
  function securityPosts(libraryId: string) {
    return system.libraries.find((l) => l.id === libraryId)?.securityPosts ?? []
  }

  return {
    strandedVisits,
    unresolved,
    decidedButHere,
    hasUnresolved,
    readerOf,
    zoneOf,
    discover,
    dispatchSecurity,
    arrive,
    recordReason,
    decide,
    notifyGuardian,
    confirmLeave,
    securityPosts
  }
})
