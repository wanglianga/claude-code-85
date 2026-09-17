import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  Incident,
  IncidentAction,
  IncidentType,
  IncidentSeverity,
  Role
} from '@/types'
import { seedIncidents } from '@/data/seed'
import { uid } from '@/utils/format'
import { incidentSop } from '@/data/sop'
import { roleNames } from '@/stores/auth'

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

export const useIncidentStore = defineStore('incident', () => {
  const incidents = ref<Incident[]>(clone(seedIncidents))

  function ofLibrary(libraryId: string): Incident[] {
    return incidents.value.filter((i) => i.libraryId === libraryId)
  }

  function byLibraryAndNight(libraryId: string, night: boolean): Incident[] {
    return ofLibrary(libraryId).filter((i) => i.night === night && i.status !== 'closed')
  }

  const openIncidents = computed(() =>
    incidents.value.filter((i) => i.status === 'open' || i.status === 'handling')
  )

  /** 次日开馆继续提示：未处理/未关闭的遗留事件、投诉 */
  const carryOverIncidents = computed(() =>
    incidents.value.filter(
      (i) => i.carryOver && i.status !== 'closed'
    )
  )

  /** 某档案随交接移交的遗留事件 */
  function incidentsOfArchive(archiveId: string): Incident[] {
    return incidents.value.filter((i) => i.handoverArchiveId === archiveId)
  }

  /** 某档案随交接移交且次日仍未闭环的遗留事件（供新营业日待办回链） */
  function openCarryOfArchive(archiveId: string): Incident[] {
    return incidents.value.filter((i) => i.handoverArchiveId === archiveId && i.status !== 'closed')
  }

  function openCount(libraryId: string): number {
    return ofLibrary(libraryId).filter((i) => i.status !== 'closed').length
  }

  /** 高危事件数量（用于总览/夜间大屏） */
  function dangerCount(libraryId: string): number {
    return ofLibrary(libraryId).filter(
      (i) => i.status !== 'closed' && (i.severity === 'high' || i.severity === 'urgent')
    ).length
  }

  const seqMap: Record<string, number> = {}
  function makeNo(): string {
    const d = new Date()
    const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    seqMap[key] = (seqMap[key] ?? 100) + 1
    return `EV-${key}-${seqMap[key]}`
  }

  function create(input: {
    libraryId: string
    type: IncidentType
    severity: IncidentSeverity
    title: string
    detail: string
    at: number
    night?: boolean
    owner?: Role | 'street'
    deviceId?: string
    readerId?: string
    bookId?: string
    blackout?: boolean
    carryOver?: boolean
  }): Incident {
    const inc: Incident = {
      id: uid('inc'),
      no: makeNo(),
      libraryId: input.libraryId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      detail: input.detail,
      createdAt: input.at,
      status: 'open',
      owner: input.owner ?? null,
      night: !!input.night,
      deviceId: input.deviceId,
      readerId: input.readerId,
      bookId: input.bookId,
      blackout: input.blackout,
      carryOver: input.carryOver,
      actions: [
        {
          id: uid('a'),
          at: input.at,
          role: 'system',
          actor: '系统',
          type: 'notify',
          text: `事件已创建：${input.title}`
        }
      ]
    }
    incidents.value.unshift(inc)
    return inc
  }

  /** 追加处置动作（多角色围绕同一事件协同的留痕） */
  function act(
    incidentId: string,
    payload: {
      role: Role | 'system' | 'street'
      actor: string
      type: IncidentAction['type']
      text: string
      at: number
      /** 转交/派单/上报时的新责任方 */
      newOwner?: Role | 'street'
    }
  ) {
    const inc = incidents.value.find((i) => i.id === incidentId)
    if (!inc) return
    inc.actions.push({
      id: uid('a'),
      at: payload.at,
      role: payload.role,
      actor: payload.actor,
      type: payload.type,
      text: payload.text
    })
    if (payload.newOwner) inc.owner = payload.newOwner
    if (payload.type === 'ack') inc.status = 'handling'
    if (payload.type === 'resolve') inc.status = 'resolved'
    if (payload.type === 'verify' && inc.status === 'resolved') inc.status = 'resolved'
    if (payload.type === 'close') inc.status = 'closed'
  }

  /** 夜间快速转交安保调度/街道值班 */
  function escalate(
    incidentId: string,
    target: 'security-dispatch' | 'street',
    actor: string,
    role: Role | 'street',
    at: number
  ) {
    const inc = incidents.value.find((i) => i.id === incidentId)
    if (!inc) return
    inc.owner = target === 'street' ? 'street' : 'security'
    inc.status = 'handling'
    inc.actions.push({
      id: uid('a'),
      at,
      role,
      actor,
      type: 'escalate',
      text:
        target === 'street'
          ? `已一键转街道值班室（电话见书房信息），请求协同处置`
          : `已一键转安保调度中心，请求就近派勤`
    })
  }

  /**
   * 闭馆交接固化时调用：把本馆当前未闭环事件挂接到指定夜间交接档案（仅挂接一次）。
   * - 已挂接到其它档案或已挂接本档案的事件不重复挂接、不重复发通知；
   * - 事件本身不被关闭/重置，次日开馆后继续作为遗留待办，可回链原档案。
   */
  function attachToArchive(libraryId: string, archiveId: string, archiveDate: string, at: number): string[] {
    const ids: string[] = []
    for (const inc of ofLibrary(libraryId)) {
      if (inc.status === 'closed') continue
      if (inc.handoverArchiveId) continue // 已随更早的档案移交，不重复通知
      inc.handoverArchiveId = archiveId
      inc.handoverArchiveDate = archiveDate
      inc.carryOver = true
      ids.push(inc.id)
      inc.actions.push({
        id: uid('a'),
        at,
        role: 'system',
        actor: '系统',
        type: 'notify',
        text: `夜间交接（${archiveDate}）已固化：事件随档案移交，次日开馆继续督办，可从事件详情回查该交接档案。`
      })
    }
    return ids
  }

  /** 次日开馆确认（管理员）：取消遗留提示但未关闭的仍显示 */
  function acknowledgeCarryOver(incidentId: string, actor: string, at: number) {
    const inc = incidents.value.find((i) => i.id === incidentId)
    if (!inc) return
    inc.actions.push({
      id: uid('a'),
      at,
      role: 'admin',
      actor,
      type: 'ack',
      text: '次日开馆已阅知，继续督办'
    })
  }

  function sopOf(type: IncidentType) {
    return incidentSop[type]
  }

  function roleLabel(role: Role | 'system' | 'street'): string {
    if (role === 'system') return '系统'
    if (role === 'street') return '街道值班'
    return roleNames[role]
  }

  return {
    incidents,
    openIncidents,
    carryOverIncidents,
    ofLibrary,
    byLibraryAndNight,
    openCount,
    dangerCount,
    create,
    act,
    escalate,
    attachToArchive,
    incidentsOfArchive,
    openCarryOfArchive,
    acknowledgeCarryOver,
    sopOf,
    roleLabel
  }
})
