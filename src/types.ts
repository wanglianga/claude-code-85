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
  | 'street' // 街道值班（跨书房应急联动/复盘监督）

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
  /** 所属街道/供电小区（街道值班视角的停电范围归集维度） */
  district: string
  powerCommunity: string
  /** 开馆/闭馆时间 HH:mm */
  openTime: string
  closeTime: string
  seatsTotal: number
  status: 'open' | 'closed' | 'closing' | 'blackout'
  /** 街道值班电话、安保调度电话、消防联系人电话 */
  streetDutyPhone: string
  securityDispatchPhone: string
  fireContactPhone: string
  /** 可派驻安保的值班位置 */
  securityPosts: string[]
  /** 机械钥匙保管位置与保管人（门禁失效时启用，不能只依赖扫码出门） */
  mechanicalKeyLocation: string
  mechanicalKeyHolder: string
  /** 停电疏散集合点 */
  assemblyPoint: string
  /** 疏散路线（从馆内到集合点） */
  evacuationRoutes: { zone: string; route: string }[]
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
  | 'elight' // 应急照明灯
  | 'exitsign' // 疏散指示标志灯
  | 'smoke' // 烟感探测器
  | 'vent' // 新风系统

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

/** 人工借还台账记录（设备停用期间兜底，后续补入系统） */
export interface ManualServiceRecord {
  id: string
  at: number
  /** 经办人 */
  operator: string
  /** 读者姓名/凭证 */
  readerName: string
  /** 图书条码 */
  bookBarcode: string
  kind: 'borrow' | 'return'
  note?: string
  /** 是否已补入自助系统 */
  backfilled: boolean
  backfilledAt?: number
  backfilledBy?: string
}

export interface ManualServiceSession {
  id: string
  startedAt: number
  startedBy: string
  reason: string
  status: 'active' | 'ended'
  records: ManualServiceRecord[]
  endedAt?: number
  endedBy?: string
}

/** 故障照片 */
export interface FaultPhoto {
  id: string
  name: string
  /** 图片（dataURL 或预置 svg URL） */
  dataUrl: string
  takenAt: number
  note?: string
}

/** 开馆前故障处置决策 */
export interface FaultOpenDecision {
  /** 继续停用 / 临时恢复 */
  decision: 'continue-closed' | 'temporary-recovery'
  decidedBy: string
  at: number
  note?: string
  /** 是否启动人工借还（继续停用借还机/打印机时） */
  manualService: boolean
}

/** 人工借还结束后补生成的设备故障说明 */
export interface DeviceFaultStatement {
  generatedAt: number
  generatedBy: string
  content: string
  recordCount: number
  borrowCount: number
  returnCount: number
}

export type FaultReportStatus =
  | 'open' // 当日故障未修复
  | 'carried-over' // 跨日交接
  | 'continue-closed' // 开馆前确认继续停用（人工借还兜底中）
  | 'temporary-recovery' // 开馆前确认临时恢复
  | 'repaired' // 已修复关闭

/** 设备故障工单（跨日交接的核心载体） */
export interface DeviceFaultReport {
  id: string
  no: string
  libraryId: string
  deviceId: string
  deviceName: string
  deviceType: DeviceType
  faultDesc: string
  /** 报修时间 */
  reportedAt: number
  reporter: string
  photos: FaultPhoto[]
  /** 影响读者（人次估计 + 说明） */
  affectedReaderCount: number
  affectedDesc: string
  /** 维修联系人 */
  maintainerName: string
  maintainerPhone: string
  maintainerCompany: string
  status: FaultReportStatus
  /** 跨日交接日期（YYYY-MM-DD，开馆后的营业日） */
  carriedToDate?: string
  /** 开馆前确认 */
  openDecision?: FaultOpenDecision
  /** 人工借还会话 */
  manualSession?: ManualServiceSession
  /** 人工借还结束后补生成的故障说明 */
  statement?: DeviceFaultStatement
  /** 修复信息 */
  repairedAt?: number
  repairedBy?: string
  repairNote?: string
  /** 关联事件 */
  incidentId?: string
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
  /** 随档案跨日移交的未修复设备故障工单 id（照片/报修时间/影响/联系人保留到次日） */
  carriedFaultIds: string[]
  /** 本夜间发生的停电应急处置单 id（复盘/跨日交接可追溯） */
  blackoutEventIds: string[]
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

// ============================================================
// 突发停电与门禁消防应急联动
// ============================================================

/** 停电应急阶段 */
export type BlackoutPhase =
  | 'idle' // 供电正常
  | 'blackout' // 停电中：应急视图
  | 'urgent' // 停电中且已升级为紧急事件（被困/通道被占/烟感离线/应急灯不亮）
  | 'recovered' // 来电：设备自检/恢复确认中
  | 'closed' // 本次停电处置已闭环（含复盘）

/** 门禁处置方式 */
export type GateFallback = 'none' | 'mechanical-key' | 'temp-open'

/** 应急影响项的状态（受影响矩阵逐项核验） */
export type ImpactState =
  | 'unknown' // 待核验
  | 'ok' // 正常/已点亮/UPS 支撑
  | 'affected' // 受影响（失效/离线/停止）
  | 'confirmed-on' // 已人工确认正常（应急灯点亮、消防主机正常等）
  | 'confirmed-off' // 已人工确认异常（应急灯不亮等，触发紧急升级）

export type ImpactKey =
  | 'gate' // 门禁是否失效
  | 'elight' // 应急照明
  | 'exitsign' // 疏散指示
  | 'kiosk' // 自助借还机
  | 'printer' // 打印机
  | 'firepanel' // 消防主机
  | 'smoke' // 烟感
  | 'camera' // 摄像头
  | 'audio' // 异常声音监测
  | 'ac' // 空调
  | 'vent' // 新风

/** 应急影响项 */
export interface BlackoutImpact {
  key: ImpactKey
  label: string
  /** 停电后理论状态：ups=UPS 应支撑，off=市电设备停止 */
  expect: 'ups' | 'off'
  state: ImpactState
  deviceIds: string[]
  /** 受影响说明（如“门禁失效，扫码不能出门”） */
  detail: string
  checkedBy?: string
  checkedAt?: number
}

/** 紧急事件升级原因 */
export type UrgentReason =
  | 'trapped' // 有人被困（电梯/卫生间/书库）
  | 'fire-exit-blocked' // 消防通道被占用
  | 'smoke-offline' // 烟感离线
  | 'elight-off' // 应急灯不亮

/** 紧急升级记录 */
export interface UrgentEscalation {
  reason: UrgentReason
  label: string
  detail: string
  at: number
  by: string
  streetNotified: boolean
  fireNotified: boolean
  resolved: boolean
  resolvedAt?: number
  resolvedBy?: string
  resolveNote?: string
  incidentId?: string
}

/** 停电期间读者求助 */
export interface BlackoutHelp {
  id: string
  at: number
  /** 求助读者（在馆为 visit，读者端匿名提交为姓名描述） */
  visitId?: string
  readerName: string
  zone: string
  kind: 'trapped' | 'injury' | 'separated' | 'route' | 'other'
  content: string
  status: 'new' | 'handling' | 'resolved'
  handledBy?: string
  handledAt?: number
  result?: string
}

/** 停电期间暂存的借还请求（本地暂存/待补录，不把读者算逾期或借阅失败） */
export interface PendingLoan {
  id: string
  /** 读者操作实际发生时间（补录按此时间，不按补录时刻） */
  opAt: number
  recordedAt: number
  operator: string
  readerName: string
  bookBarcode: string
  bookTitle: string
  kind: 'borrow' | 'return'
  /** 发生时设备编号（来电后按设备编号补回该设备流水） */
  deviceId: string
  deviceName: string
  zone: string
  note?: string
  /** 补录状态 */
  status: 'pending' | 'backfilled' | 'conflict'
  backfilledAt?: number
  backfilledBy?: string
}

/** 停电期间分区在馆人数清点 */
export interface BlackoutHeadcount {
  zone: string
  /** 系统在馆记录数 */
  systemCount: number
  /** 现场清点人数 */
  actualCount?: number
  countedBy?: string
  countedAt?: number
  note?: string
}

/** 夜间来电恢复逐项确认（人员清场/门窗/消防通道/应急照明/门禁恢复/摄像头回传） */
export type NightRecoverKey =
  | 'people-clear'
  | 'doors'
  | 'fire-exit'
  | 'elight'
  | 'gate-recover'
  | 'camera-back'

export interface NightRecoverItem {
  key: NightRecoverKey
  label: string
  state: 'pending' | 'ok' | 'abnormal'
  confirmedBy?: string
  confirmedAt?: number
  note?: string
}

/** 来电设备自检项 */
export type SelfTestKey =
  | 'demag' // 图书消磁
  | 'returnbox' // 还书箱
  | 'kiosk' // 自助机
  | 'gate' // 门禁
  | 'camera' // 摄像头回传
  | 'fire' // 消防/烟感联网
  | 'ac' // 空调新风
  | 'elight' // 应急照明退出应急

export interface BlackoutSelfTestItem {
  key: SelfTestKey
  label: string
  state: 'pending' | 'pass' | 'fail'
  checkedBy?: string
  checkedAt?: number
  note?: string
  /** 自检失败生成的跨日故障工单 id */
  faultId?: string
}

/** 停电复盘记录（停电时间、影响范围、读者求助、处置责任、改进项） */
export interface BlackoutReview {
  filledAt?: number
  filledBy?: string
  outageStart?: number
  outageEnd?: number
  durationMin?: number
  scope?: string
  helpSummary?: string
  responsibility?: string
  improvements: string[]
}

/** 一次突发停电的完整应急处置单（每馆同时仅一处于非闭环状态） */
export interface BlackoutEvent {
  id: string
  no: string
  libraryId: string
  /** 停电小区/供电范围 */
  community: string
  phase: BlackoutPhase
  startedAt: number
  /** 实际来电时间 */
  restoredAt?: number
  /** 闭环时间（复盘完成） */
  closedAt?: number
  night: boolean
  /** 受影响范围逐项核验 */
  impacts: BlackoutImpact[]
  /** 分区在馆人数清点 */
  headcounts: BlackoutHeadcount[]
  /** 门禁失效联动 */
  gateFailed: boolean
  gateNotifiedSecurityAt?: number
  gateFallback: GateFallback
  gateFallbackBy?: string
  gateFallbackAt?: number
  gateFallbackNote?: string
  /** 紧急升级（任一未解除即紧急事件，巡检不允许完成） */
  escalations: UrgentEscalation[]
  streetNotified: boolean
  streetNotifiedAt?: number
  fireNotified: boolean
  fireNotifiedAt?: number
  helps: BlackoutHelp[]
  pendingLoans: PendingLoan[]
  /** 空调停运计时 */
  acStoppedAt?: number
  /** 空调停运阈值（分钟），超过提醒评估提前闭馆 */
  acThresholdMin: number
  earlyCloseAssessed: boolean
  earlyClose: boolean
  earlyCloseBy?: string
  earlyCloseAt?: number
  reservationNotifiedAt?: number
  reservationNotifiedCount?: number
  /** 夜间停电恢复逐项确认 */
  nightItems: NightRecoverItem[]
  /** 来电自检 */
  selfTests: BlackoutSelfTestItem[]
  /** 自检失败进入跨日交接的故障工单 id */
  carriedFaultIds: string[]
  /** 关联的停电主事件 id */
  incidentId?: string
  /** 停电瞬间全部设备状态快照（来电后按快照并结合自检恢复，故障/离线不被掩盖） */
  deviceSnapshot: { id: string; status: DeviceStatus; note?: string; level?: number }[]
  /** 处置进展时间线 */
  logs: BlackoutLog[]
  review?: BlackoutReview
}

export interface BlackoutLog {
  at: number
  actor: string
  role: Role | 'system' | 'street'
  text: string
}

/** 街道值班视角下跨书房停电汇总行 */
export interface StreetBlackoutRow {
  event: BlackoutEvent
  libraryName: string
  address: string
  community: string
  people: number
  phase: BlackoutPhase
  urgent: boolean
  startedAt: number
}
