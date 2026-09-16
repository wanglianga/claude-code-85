import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  Activity,
  Book,
  BookTransfer,
  Complaint,
  Device,
  EntryMethod,
  Reader,
  ServiceKind,
  UsageLog,
  Visit,
  VolunteerPatrol
} from '@/types'
import {
  seedActivities,
  seedBooks,
  seedComplaints,
  seedCreditRecords,
  seedDevices,
  seedLostItems,
  seedPatrols,
  seedReaders,
  seedTransfers,
  seedUsageLogs,
  seedVisits
} from '@/data/seed'
import type { LostItem, CreditRecord } from '@/types'
import { uid } from '@/utils/format'

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

export const useBranchStore = defineStore('branch', () => {
  const readers = ref<Reader[]>(clone(seedReaders))
  const visits = ref<Visit[]>(clone(seedVisits))
  const books = ref<Book[]>(clone(seedBooks))
  const devices = ref<Device[]>(clone(seedDevices))
  const usageLogs = ref<UsageLog[]>(clone(seedUsageLogs))
  const lostItems = ref<LostItem[]>(clone(seedLostItems))
  const complaints = ref<Complaint[]>(clone(seedComplaints))
  const patrols = ref<VolunteerPatrol[]>(clone(seedPatrols))
  const transfers = ref<BookTransfer[]>(clone(seedTransfers))
  const creditRecords = ref<CreditRecord[]>(clone(seedCreditRecords))
  const activities = ref<Activity[]>(clone(seedActivities))

  // ---------------- 读者/入馆 ----------------
  function findReader(keyword: string): Reader | undefined {
    const k = keyword.trim()
    return readers.value.find(
      (r) => r.idCard === k || r.cardNo === k || r.cardNo.toLowerCase() === k.toLowerCase()
    )
  }

  /** 预约码查询（演示：YY 开头或读者证均可） */
  function findByReservation(code: string): Reader | undefined {
    const c = code.trim()
    if (/^YY/i.test(c)) {
      // 演示：预约码固定对应儿童读者 r-003
      return readers.value.find((r) => r.id === 'r-003')
    }
    return findReader(c)
  }

  function activeVisits(libraryId: string): Visit[] {
    return visits.value.filter((v) => v.libraryId === libraryId && !v.leaveAt && !v.resolved)
  }

  function activeVisitOfReader(readerId: string): Visit | undefined {
    return visits.value.find((v) => v.readerId === readerId && !v.leaveAt && !v.resolved)
  }

  function occupiedSeats(libraryId: string): string[] {
    return activeVisits(libraryId).map((v) => v.seatNo)
  }

  function checkIn(payload: {
    libraryId: string
    reader: Reader
    method: EntryMethod
    entryNo: string
    seatNo: string
    at: number
    note?: string
  }): Visit {
    const visit: Visit = {
      id: uid('v'),
      libraryId: payload.libraryId,
      readerId: payload.reader.id,
      readerName: payload.reader.isChild ? `${payload.reader.name}（儿童）` : payload.reader.name,
      isChild: payload.reader.isChild,
      entryMethod: payload.method,
      entryNo: payload.entryNo,
      seatNo: payload.seatNo,
      enterAt: payload.at,
      note: payload.note
    }
    visits.value.unshift(visit)
    return visit
  }

  function checkOut(visitId: string, at: number) {
    const v = visits.value.find((x) => x.id === visitId)
    if (v) v.leaveAt = at
  }

  function markStrandedResolved(visitId: string, resolved: boolean) {
    const v = visits.value.find((x) => x.id === visitId)
    if (v) v.resolved = resolved
  }

  // ---------------- 服务使用记录 ----------------
  function logUsage(
    libraryId: string,
    reader: Reader,
    kind: ServiceKind,
    detail: string,
    at: number
  ) {
    usageLogs.value.unshift({
      id: uid('u'),
      libraryId,
      readerId: reader.id,
      readerName: reader.name,
      kind,
      detail,
      at
    })
  }

  // ---------------- 图书借阅/归还 ----------------
  function borrowBook(book: Book, reader: Reader, at: number, dueDays = 30) {
    book.status = 'borrowed'
    book.borrowerId = reader.id
    book.borrowAt = at
    book.dueAt = at + dueDays * 86400_000
  }

  /** 还书：返回是否消磁成功（模拟：1 号自助机故障或手工指定失败） */
  function returnBook(book: Book, demagOk: boolean, at: number) {
    if (demagOk) {
      book.status = 'returned'
      book.borrowerId = undefined
      book.borrowAt = undefined
      book.dueAt = undefined
    } else {
      book.status = 'demag-failed'
    }
    void at
  }

  function reshelve(book: Book) {
    book.status = 'on-shelf'
    book.borrowerId = undefined
    book.borrowAt = undefined
    book.dueAt = undefined
  }

  const unreturnedBooks = computed(() =>
    books.value.filter((b) => b.status === 'borrowed' || b.status === 'demag-failed')
  )

  function overdueBooks(libraryId: string, nowTs: number): Book[] {
    return books.value.filter(
      (b) => b.libraryId === libraryId && b.status === 'borrowed' && b.dueAt !== undefined && b.dueAt < nowTs
    )
  }

  // ---------------- 设备 ----------------
  function devicesOf(libraryId: string): Device[] {
    return devices.value.filter((d) => d.libraryId === libraryId)
  }

  function updateDevice(id: string, patch: Partial<Device>) {
    const d = devices.value.find((x) => x.id === id)
    if (d) Object.assign(d, patch)
  }

  function setDeviceStatus(id: string, status: Device['status'], note?: string) {
    const d = devices.value.find((x) => x.id === id)
    if (!d) return
    d.status = status
    d.lastCheck = Date.now()
    if (note !== undefined) d.note = note
  }

  const faultDevices = computed(() =>
    devices.value.filter((d) => d.status === 'fault' || d.status === 'alarm' || d.status === 'offline')
  )

  // ---------------- 失物 / 投诉 / 巡馆 / 调拨 / 信用 / 活动 ----------------
  function addLostItem(item: Omit<LostItem, 'id' | 'status'>) {
    lostItems.value.unshift({ ...item, id: uid('lw'), status: 'kept' })
  }
  function claimLostItem(id: string, claimant: string) {
    const it = lostItems.value.find((x) => x.id === id)
    if (it) {
      it.status = 'claimed'
      it.claimant = claimant
    }
  }

  function addComplaint(libraryId: string, readerName: string, content: string, at: number) {
    complaints.value.unshift({ id: uid('c'), libraryId, readerName, content, at, status: 'open' })
  }
  function replyComplaint(id: string, reply: string) {
    const c = complaints.value.find((x) => x.id === id)
    if (c) {
      c.status = 'replied'
      c.reply = reply
    }
  }
  function closeComplaint(id: string) {
    const c = complaints.value.find((x) => x.id === id)
    if (c) c.status = 'closed'
  }

  function addPatrol(p: Omit<VolunteerPatrol, 'id'>) {
    patrols.value.unshift({ ...p, id: uid('vp') })
  }

  function requestTransfer(input: {
    bookId: string
    toLibraryId: string
    qty: number
    reason: string
    at: number
    handler: string
  }) {
    const b = books.value.find((x) => x.id === input.bookId)
    if (!b) return
    const t: BookTransfer = {
      id: uid('t'),
      bookId: b.id,
      bookTitle: b.title,
      fromLibraryId: b.libraryId,
      toLibraryId: input.toLibraryId,
      qty: input.qty,
      reason: input.reason,
      status: 'requested',
      createdAt: input.at,
      handledBy: input.handler
    }
    transfers.value.unshift(t)
  }
  function setTransferStatus(id: string, status: BookTransfer['status'], handler?: string) {
    const t = transfers.value.find((x) => x.id === id)
    if (!t) return
    t.status = status
    if (handler) t.handledBy = handler
    const b = books.value.find((x) => x.id === t.bookId)
    if (!b) return
    if (status === 'approved' || status === 'shipping') {
      b.status = 'in-transfer'
      b.transferTo = t.toLibraryId
    } else if (status === 'received') {
      b.libraryId = t.toLibraryId
      b.status = 'on-shelf'
      b.location = '新书待编/调拨专架'
      b.transferTo = undefined
    } else if (status === 'rejected') {
      b.status = 'on-shelf'
      b.transferTo = undefined
    }
  }

  function adjustCredit(reader: Reader, delta: number, reason: string, at: number) {
    reader.credit = Math.max(0, Math.min(100, reader.credit + delta))
    creditRecords.value.unshift({
      id: uid('cr'),
      readerId: reader.id,
      readerName: reader.name,
      delta,
      reason,
      at
    })
  }

  function enrollActivity(
    activityId: string,
    family: Activity['families'][number]
  ): boolean {
    const a = activities.value.find((x) => x.id === activityId)
    if (!a || a.enrolled >= a.capacity) return false
    a.families.push(family)
    a.enrolled += 1
    if (a.enrolled >= a.capacity) a.status = 'full'
    return true
  }

  return {
    readers,
    visits,
    books,
    devices,
    usageLogs,
    lostItems,
    complaints,
    patrols,
    transfers,
    creditRecords,
    activities,
    findReader,
    findByReservation,
    activeVisits,
    activeVisitOfReader,
    occupiedSeats,
    checkIn,
    checkOut,
    markStrandedResolved,
    logUsage,
    borrowBook,
    returnBook,
    reshelve,
    unreturnedBooks,
    overdueBooks,
    devicesOf,
    updateDevice,
    setDeviceStatus,
    faultDevices,
    addLostItem,
    claimLostItem,
    addComplaint,
    replyComplaint,
    closeComplaint,
    addPatrol,
    requestTransfer,
    setTransferStatus,
    adjustCredit,
    enrollActivity
  }
})
