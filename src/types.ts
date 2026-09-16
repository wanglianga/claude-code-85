// ============================================================
// 城市书房自助借阅与夜间闭馆巡检平台 —— 领域类型定义
// ============================================================

/** 登录角色：覆盖同一事件协同的四方 + 志愿者 */
export type Role =
  | 'admin' // 管理员（读者服务/统筹）
  | 'security' // 安保
  | 'maintainer' // 设备维护
  | 'service' // 读者服务
  | 'volunteer' // 志愿者（巡馆）

export interface Account {
  username: string
  password: string
  name: string
  role: Role
  /** 志愿者仅能操作自己负责的书房 */
  libraryId?: string
}

export interface Library {
  id: string
  name: string
  address: string
  /** 开馆/闭馆时间 HH:mm */
  openTime: string
  closeTime: string
  seatsTotal: number
  status: 'open' | 'closed' | 'closing' | 'blackout'
  /** 街道值班电话、安保调度电话 */
  streetDutyPhone: string
  securityDispatchPhone: string
  /** 可派驻安保的值班位置 */
  securityPosts: string[]
}

export type EntryMethod = 'idcard' | 'card' | 'reservation'

/** 夜间滞留处置决策：劝离 / 特殊延时 / 报警 */
export type StrandedDecision = 'persuade-leave' | 'extended-stay' | 'police'
export type StrandedStatus =
  | 'discovered' // 已发现滞留
  | 'dispatched' // 已派安保
  | 'onscene' // 安保到场
  | 'decided' // 管理员已作出处置决策
  | 'left' // 读者最终离馆

export interface StrandedLog {
  at: number
  actor: string
  role: Role | 'system'
  text: string
}

export interface GateRecord {
  at: number
  gate: string
  event: string
}

/** 夜间滞留处置全流程留痕（随在馆记录永久保存，次日可查、随档案移交） */
export interface StrandedHandling {
  status: StrandedStatus
  discoveredAt: number
  /** 发现时所在区域 */
  zone: string
  /** 门禁/闸机记录快照 */
  gateRecords: GateRecord[]
  /** 处置安保与其位置 */
  securityName: string
  securityPost: string
  securityEtaMin?: number
  securityPhone?: string
  dispatchedAt?: number
  arrivedAt?: number
  /** 读者解释 */
  readerReason?: string
  /** 管理员决策 */
  decision?: StrandedDecision
  decidedAt?: number
  decidedBy?: string
  decisionNote?: string
  /** 特殊延时截止时间 */
  extensionUntil?: number
  /** 报警信息 */
  policeAt?: number
  policeNo?: string
  /** 未成年人监护人沟通 */
  guardianNotified?: boolean
  guardianNotifiedAt?: number
  guardianContactResult?: string
  guardianWillPickup?: boolean
  /** 最终离馆 */
  leftAt?: number
  leaveMethod?: 'self' | 'guardian-pickup' | 'police' | 'staff-escort'
  /** 关联滞留事件 */
  incidentId?: string
  logs: StrandedLog[]
}

/** 读者档案 */
export interface Reader {
  id: string
  name: string
  /** 身份证号（演示数据脱敏） */
  idCard: string
  cardNo: string
  phone: string
  age: number
  isChild: boolean
  /** 信用分 0-100 */
  credit: number
  /** 家长姓名/电话（儿童读者） */
  guardian?: string
  guardianPhone?: string
}

/** 在馆记录（入馆登记） */
export interface Visit {
  id: string
  libraryId: string
  readerId: string
  readerName: string
  isChild: boolean
  entryMethod: EntryMethod
  entryNo: string
  seatNo: string
  enterAt: number
  leaveAt?: number
  /** 夜间滞留标记（闭馆时仍在馆） */
  stranded?: boolean
  resolved?: boolean
  note?: string
  /** 夜间滞留处置记录（发现后创建；含身份、区域、门禁、安保到场、解释、决策、监护人沟通、最终离馆时间） */
  strandedHandling?: StrandedHandling
}

export type BookStatus =
  | 'on-shelf' // 在架
  | 'borrowed' // 借出未还
  | 'returned' // 已还入还书箱（待上架）
  | 'demag-failed' // 消磁失败待处理
  | 'in-transfer' // 调拨中
  | 'lost' // 遗失

export interface Book {
  id: string
  isbn: string
  title: string
  author: string
  libraryId: string
  location: string
  status: BookStatus
  borrowerId?: string
  borrowAt?: number
  dueAt?: number
  /** 调拨目标书房 */
  transferTo?: string
}

export type DeviceType =
  | 'gate' // 门禁闸机
  | 'selfkiosk' // 自助借还机
  | 'printer' // 打印机
  | 'water' // 饮水机
  | 'camera' // 摄像头
  | 'fire' // 消防主机
  | 'ac' // 空调
  | 'light' // 灯光
  | 'returnbox' // 还书箱
  | 'audio' // 异常声音监测
  | 'help' // 读者求助按钮
  | 'ups' // 应急电源/UPS

export type DeviceStatus = 'normal' | 'fault' | 'off' | 'full' | 'online' | 'offline' | 'alarm'

export interface Device {
  id: string
  libraryId: string
  type: DeviceType
  name: string
  location: string
  status: DeviceStatus
  /** 0-100 还书箱容量等 */
  level?: number
  lastCheck?: number
  note?: string
}

export type ServiceKind = 'borrow' | 'return' | 'print' | 'water' | 'kiosk'

export interface UsageLog {
  id: string
  libraryId: string
  readerId: string
  readerName: string
  kind: ServiceKind
  detail: string
  at: number
}

// ---------------- 事件中心（同一事件多方协同） ----------------

export type IncidentType =
  | 'stranded' // 读者夜间滞留
  | 'demag-failed' // 图书消磁失败
  | 'box-full' // 还书箱满
  | 'gate-abnormal' // 门禁异常
  | 'device-fault' // 设备故障
  | 'lost-item' // 读者遗失物品
  | 'light-ac-on' // 闭馆后灯光空调未关
  | 'unmanned-access' // 无人值守时段门禁异常
  | 'camera-offline' // 摄像头离线
  | 'fire-alarm' // 消防告警
  | 'abnormal-sound' // 异常声音
  | 'help-request' // 读者求助
  | 'blackout' // 突发停电
  | 'complaint' // 读者投诉
  | 'patrol' // 志愿者巡馆上报

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'urgent'

/** 事件处置动作类型 */
export type ActionType =
  | 'ack' // 受理
  | 'dispatch' // 派单
  | 'notify' // 通知（读者/物业）
  | 'escalate' // 上报（安保调度/街道值班）
  | 'arrive' // 到场
  | 'resolve' // 处理完成
  | 'verify' // 复核
  | 'close' // 归档关闭
  | 'transfer' // 转交
  | 'comment' // 备注

export interface IncidentAction {
  id: string
  at: number
  role: Role | 'system' | 'street'
  actor: string
  type: ActionType
  text: string
}

export interface Incident {
  id: string
  no: string
  libraryId: string
  type: IncidentType
  severity: IncidentSeverity
  title: string
  detail: string
  createdAt: number
  status: 'open' | 'handling' | 'resolved' | 'closed'
  /** 当前负责角色 */
  owner: Role | 'street' | null
  /** 是否夜间（闭馆后）事件 */
  night: boolean
  /** 关联设备/读者/图书 */
  deviceId?: string
  readerId?: string
  bookId?: string
  /** 未处理遗留到次日开馆 */
  carryOver?: boolean
  /** 闭馆交接时挂接的夜间交接档案 id（仅挂接一次，供次日待办回链追溯） */
  handoverArchiveId?: string
  handoverArchiveDate?: string
  /** 停电事件下的应急处置标记 */
  blackout?: boolean
  actions: IncidentAction[]
}

// ---------------- 闭馆巡检 ----------------

export type CheckKey =
  | 'people' // 人员清场
  | 'doors' // 门窗
  | 'fire' // 消防
  | 'ac' // 空调
  | 'light' // 灯光
  | 'kiosk' // 自助机
  | 'returnbox' // 还书箱
  // 无人值守时段技防巡检
  | 'gate' // 门禁
  | 'camera' // 摄像头
  | 'firesys' // 消防系统
  | 'sound' // 异常声音
  | 'help' // 读者求助通道

export type CheckState = 'pending' | 'normal' | 'abnormal' | 'na'

export interface CheckItem {
  key: CheckKey
  label: string
  scope: 'handover' | 'unmanned'
  state: CheckState
  confirmedBy?: string
  confirmedAt?: number
  remark?: string
  /** 异常时自动生成的事件 id */
  incidentId?: string
}

/** 闭馆交接档案快照（完成交接时固化，此后任何操作不可改写） */
export interface HandoverSnapshot {
  /** 完成时间（固化） */
  finishedAt: number
  /** 固化时逐项结果快照 */
  items: CheckItem[]
  /** 四方签字快照 */
  signatures: NonNullable<Inspection['signatures']>
  /** 闭馆后灯光空调复核 */
  afterCloseCheck: boolean
  /** 完成交接的操作者 */
  closedBy: string
  /** 闭馆结论备注 */
  conclusion: string
  /** 随档案移交、需要次日继续督办的未闭环事件 */
  carryIncidentIds: string[]
  /** 本夜间完成的滞留处置记录（在馆记录 id，处置详情在 visits 中永久保存） */
  strandedVisitIds: string[]
}

export interface Inspection {
  id: string
  libraryId: string
  /** 巡检归属日期 YYYY-MM-DD（营业日） */
  date: string
  startedAt?: number
  finishedAt?: number
  /** 完成交接签字（人员/图书/设备/公共安全） */
  signatures: {
    people?: string
    books?: string
    devices?: string
    safety?: string
  }
  items: CheckItem[]
  /** 闭馆后灯光空调复核 */
  afterCloseCheck?: boolean
  /** 已固化为夜间交接档案：此后为只读历史，任何开馆/重置操作都不得改写 */
  frozen?: boolean
  /** 交接档案快照（与完成时内容一致，独立留存供追溯） */
  archive?: HandoverSnapshot
}

// ---------------- 志愿者巡馆 / 调拨 / 信用 / 活动 ----------------

export interface VolunteerPatrol {
  id: string
  libraryId: string
  volunteer: string
  at: number
  route: string
  findings: string
  /** 是否产生事件 */
  incidentId?: string
}

export type TransferStatus = 'requested' | 'approved' | 'shipping' | 'received' | 'rejected'

export interface BookTransfer {
  id: string
  bookId: string
  bookTitle: string
  fromLibraryId: string
  toLibraryId: string
  qty: number
  reason: string
  status: TransferStatus
  createdAt: number
  handledBy?: string
}

export interface CreditRecord {
  id: string
  readerId: string
  readerName: string
  delta: number
  reason: string
  at: number
}

export interface Activity {
  id: string
  libraryId: string
  title: string
  date: string
  time: string
  ageRange: string
  capacity: number
  enrolled: number
  host: string
  status: 'open' | 'full' | 'done'
  families: { parent: string; child: string; childAge: number; phone: string }[]
}

/** 投诉建议（次日继续提示） */
export interface Complaint {
  id: string
  libraryId: string
  readerName: string
  content: string
  at: number
  status: 'open' | 'replied' | 'closed'
  reply?: string
}

/** 遗失物品招领 */
export interface LostItem {
  id: string
  libraryId: string
  name: string
  desc: string
  foundAt: number
  location: string
  status: 'kept' | 'claimed'
  claimant?: string
  incidentId?: string
}
