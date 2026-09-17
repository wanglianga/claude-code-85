import type {
  Account,
  Activity,
  Book,
  BookTransfer,
  Complaint,
  Device,
  Incident,
  Inspection,
  Library,
  LostItem,
  Reader,
  UsageLog,
  Visit,
  VolunteerPatrol
} from '@/types'
import { pad, uid } from '@/utils/format'

function localDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const now = Date.now()
const min = 60_000

export const seedLibraries: Library[] = [
  {
    id: 'lib-zhongshan',
    name: '中山中路城市书房',
    address: '中山中路 88 号',
    openTime: '08:30',
    closeTime: '21:00',
    seatsTotal: 60,
    status: 'open',
    community: '湖滨街道 · 中山中路片区',
    streetDutyPhone: '0571-88001100（湖滨街道值班）',
    securityDispatchPhone: '0571-88002200（安保调度中心）',
    fireContactPhone: '138****9119（湖滨消防救援站值班员）',
    assemblyPoint: '书房正门中山中路人行道安全集结区（雨棚东侧）',
    evacuationRoutes: [
      '阅览区 → 正门（主出口）：沿地面绿色疏散指示灯直行 20 米出正门',
      '少儿区/书库 → 后门消防通道：沿指示灯至一层后门，推开防火门至室外集合点',
      '二层 → 封闭楼梯间下行至一层正门集合点（停电时禁止使用电梯）'
    ],
    securityPosts: ['正门安保岗', '一层值班台', '夜间巡逻岗（馆内）', '安保调度中心（3 公里外）']
  },
  {
    id: 'lib-yunhe',
    name: '运河公园城市书房',
    address: '运河公园北侧 2 号',
    openTime: '09:00',
    closeTime: '20:30',
    seatsTotal: 40,
    status: 'open',
    community: '小河街道 · 运河公园片区',
    streetDutyPhone: '0571-88003300（小河街道值班）',
    securityDispatchPhone: '0571-88002200（安保调度中心）',
    fireContactPhone: '138****9120（小河消防救援站值班员）',
    assemblyPoint: '书房外运河公园广场旗杆下集合点',
    evacuationRoutes: [
      '阅览区 → 正门：沿疏散指示灯穿过门厅出正门，至公园广场集合点',
      '饮水角/多功能间 → 侧门消防通道：推防火门至室外，绕行至广场集合点'
    ],
    securityPosts: ['正门安保岗', '服务台值班岗', '夜间巡逻岗（馆内）', '安保调度中心（4 公里外）']
  },
  {
    id: 'lib-jiangnan',
    name: '江南里城市书房',
    address: '江南里邻里中心 1 层',
    openTime: '08:00',
    closeTime: '22:00',
    seatsTotal: 80,
    status: 'closed',
    community: '江南街道 · 江南里邻里片区',
    streetDutyPhone: '0571-88004400（江南街道值班）',
    securityDispatchPhone: '0571-88002200（安保调度中心）',
    fireContactPhone: '138****9121（江南消防救援站值班员）',
    assemblyPoint: '邻里中心一层中庭南门外广场集合点',
    evacuationRoutes: [
      '全馆 → 邻里中心南门：沿一层走廊疏散指示灯至南门集合点',
      '书库 → 东侧消防通道：推防火门至室外，绕行至南门广场'
    ],
    securityPosts: ['正门安保岗', '一层值班台', '安保调度中心（2.5 公里外）']
  }
]

export const seedAccounts: Account[] = [
  { username: 'admin', password: 'admin123', name: '王管（管理员）', role: 'admin' },
  { username: 'security', password: 'sec123', name: '李安保（值班安保）', role: 'security' },
  { username: 'fix', password: 'fix123', name: '赵工（设备维护）', role: 'maintainer' },
  { username: 'service', password: 'svc123', name: '陈服（读者服务）', role: 'service' },
  { username: 'volunteer', password: 'vol123', name: '周志愿者', role: 'volunteer', libraryId: 'lib-zhongshan' },
  { username: 'street', password: 'street123', name: '街道值班员（湖滨街道）', role: 'street' }
]

export const seedReaders: Reader[] = [
  { id: 'r-001', name: '张明', idCard: '330106199203152211', cardNo: 'LS20210001', phone: '138****1001', age: 33, isChild: false, credit: 96 },
  { id: 'r-002', name: '刘芳', idCard: '330106198907224422', cardNo: 'LS20210002', phone: '139****1002', age: 36, isChild: false, credit: 88 },
  { id: 'r-003', name: '孙小磊', idCard: '330106201505106633', cardNo: 'LS20220103', phone: '（家长手机）', age: 10, isChild: true, credit: 100, guardian: '孙建国', guardianPhone: '137****2003' },
  { id: 'r-004', name: '周婷', idCard: '330106200111028844', cardNo: 'LS20200045', phone: '136****1004', age: 24, isChild: false, credit: 65 },
  { id: 'r-005', name: '吴浩', idCard: '330106197801010055', cardNo: 'LS20190078', phone: '135****1005', age: 47, isChild: false, credit: 42 },
  { id: 'r-006', name: '林囡囡', idCard: '330106201709090066', cardNo: 'LS20230210', phone: '（家长手机）', age: 8, isChild: true, credit: 95, guardian: '林慧', guardianPhone: '138****2006' },
  { id: 'r-007', name: '郑凯', idCard: '330106199506153377', cardNo: 'LS20210311', phone: '150****1007', age: 30, isChild: false, credit: 78 }
]

function book(
  id: string,
  isbn: string,
  title: string,
  author: string,
  libraryId: string,
  location: string,
  status: Book['status'] = 'on-shelf',
  extra: Partial<Book> = {}
): Book {
  return { id, isbn, title, author, libraryId, location, status, ...extra }
}

export const seedBooks: Book[] = [
  book('b-001', '9787020008735', '红楼梦（上）', '曹雪芹', 'lib-zhongshan', 'A区-03排-11格', 'borrowed', {
    borrowerId: 'r-001', borrowAt: now - 20 * 24 * 60 * min, dueAt: now - 6 * 24 * 60 * min
  }),
  book('b-002', '9787544253994', '解忧杂货店', '东野圭吾', 'lib-zhongshan', 'B区-01排-04格', 'borrowed', {
    borrowerId: 'r-005', borrowAt: now - 35 * 24 * 60 * min, dueAt: now - 21 * 24 * 60 * min
  }),
  book('b-003', '9787544270878', '海边的卡夫卡', '村上春树', 'lib-zhongshan', 'B区-02排-07格', 'returned'),
  book('b-004', '9787521736618', '人类简史', '尤瓦尔·赫拉利', 'lib-zhongshan', 'C区-05排-02格', 'demag-failed', {
    borrowerId: 'r-004', borrowAt: now - 10 * 24 * 60 * min
  }),
  book('b-005', '9787020138011', '三国演义（连环画版）', '罗贯中', 'lib-zhongshan', '少儿区-矮架-01', 'on-shelf'),
  book('b-006', '9787559620620', '窗边的小豆豆', '黑柳彻子', 'lib-zhongshan', '少儿区-矮架-02', 'borrowed', {
    borrowerId: 'r-006', borrowAt: now - 5 * 24 * 60 * min, dueAt: now + 25 * 24 * 60 * min
  }),
  book('b-007', '9787111407010', '深入理解计算机系统', 'Bryant', 'lib-yunhe', 'D区-01排-09格', 'on-shelf'),
  book('b-008', '9787115546081', '算法图解', 'Aditya Bhargava', 'lib-yunhe', 'D区-02排-03格', 'in-transfer', {
    transferTo: 'lib-zhongshan'
  }),
  book('b-009', '9787544291170', '百年孤独', '加西亚·马尔克斯', 'lib-yunhe', 'B区-04排-12格', 'borrowed', {
    borrowerId: 'r-007', borrowAt: now - 15 * 24 * 60 * min, dueAt: now + 5 * 24 * 60 * min
  }),
  book('b-010', '9787020042487', '水浒传（下）', '施耐庵', 'lib-jiangnan', 'A区-01排-01格', 'lost'),
  book('b-011', '9787513334118', '中国古代文化常识', '王力', 'lib-jiangnan', 'A区-06排-05格', 'on-shelf'),
  book('b-012', '9787559444517', '给孩子的宇宙', '霍金', 'lib-zhongshan', '少儿区-矮架-03', 'on-shelf')
]

function dev(
  id: string,
  libraryId: string,
  type: Device['type'],
  name: string,
  location: string,
  status: Device['status'],
  extra: Partial<Device> = {}
): Device {
  return { id, libraryId, type, name, location, status, lastCheck: now - 30 * min, ...extra }
}

export const seedDevices: Device[] = [
  // 中山中路书房（当前主书房）
  dev('d-gate-1', 'lib-zhongshan', 'gate', '入口门禁闸机', '一层正门', 'normal'),
  dev('d-gate-2', 'lib-zhongshan', 'gate', '消防通道门磁', '一层后门', 'alarm', { note: '门磁信号间歇丢失' }),
  dev('d-kiosk-1', 'lib-zhongshan', 'selfkiosk', '1号自助借还机', '借阅区', 'fault', { note: '消磁器报错 E17' }),
  dev('d-kiosk-2', 'lib-zhongshan', 'selfkiosk', '2号自助借还机', '借阅区', 'normal'),
  dev('d-print-1', 'lib-zhongshan', 'printer', '自助打印机', '服务区', 'normal', { level: 40 }),
  dev('d-water-1', 'lib-zhongshan', 'water', '直饮饮水机', '饮水角', 'normal'),
  dev('d-cam-1', 'lib-zhongshan', 'camera', '摄像头-正门', '一层正门', 'online'),
  dev('d-cam-2', 'lib-zhongshan', 'camera', '摄像头-阅览区', '阅览区吊顶', 'offline', { note: '昨夜 02:14 离线' }),
  dev('d-cam-3', 'lib-zhongshan', 'camera', '摄像头-书库', '书库通道', 'online'),
  dev('d-fire-1', 'lib-zhongshan', 'fire', '消防主机', '值班室', 'normal'),
  dev('d-ac-1', 'lib-zhongshan', 'ac', '中央空调', '全楼', 'normal'),
  dev('d-light-1', 'lib-zhongshan', 'light', '阅览区照明', '阅览区', 'normal'),
  dev('d-box-1', 'lib-zhongshan', 'returnbox', '24小时还书箱', '外墙侧', 'full', { level: 96, note: '容量 96%，需清运' }),
  dev('d-audio-1', 'lib-zhongshan', 'audio', '异常声音监测', '全楼拾音', 'alarm', { note: '凌晨 02:41 拾取玻璃异响' }),
  dev('d-help-1', 'lib-zhongshan', 'help', '一键求助按钮', '卫生间通道', 'normal'),
  dev('d-ups-1', 'lib-zhongshan', 'ups', '应急照明/UPS', '配电间', 'normal'),
  dev('d-smoke-1', 'lib-zhongshan', 'smoke', '烟感-阅览区', '阅览区吊顶', 'normal'),
  dev('d-smoke-2', 'lib-zhongshan', 'smoke', '烟感-书库', '书库通道', 'normal'),
  dev('d-smoke-3', 'lib-zhongshan', 'smoke', '烟感-少儿区', '少儿区吊顶', 'normal'),
  dev('d-fresh-1', 'lib-zhongshan', 'freshair', '新风机组', '屋面设备间', 'normal'),
  dev('d-exit-1', 'lib-zhongshan', 'exitlight', '疏散指示灯-正门通道', '一层主通道', 'normal'),
  dev('d-exit-2', 'lib-zhongshan', 'exitlight', '疏散指示灯-消防通道', '一层后门', 'normal'),
  // 运河公园书房
  dev('d-gate-3', 'lib-yunhe', 'gate', '入口门禁闸机', '正门', 'normal'),
  dev('d-kiosk-3', 'lib-yunhe', 'selfkiosk', '1号自助借还机', '借阅区', 'normal'),
  dev('d-water-2', 'lib-yunhe', 'water', '直饮饮水机', '饮水角', 'fault', { note: '不出热水' }),
  dev('d-cam-4', 'lib-yunhe', 'camera', '摄像头-全景', '吊顶', 'online'),
  dev('d-fire-2', 'lib-yunhe', 'fire', '消防主机', '值班室', 'normal'),
  dev('d-ac-2', 'lib-yunhe', 'ac', '分体空调', '阅览区', 'normal'),
  dev('d-light-2', 'lib-yunhe', 'light', 'LED 照明', '全馆', 'normal'),
  dev('d-box-2', 'lib-yunhe', 'returnbox', '还书箱', '门厅', 'normal', { level: 35 }),
  dev('d-audio-2', 'lib-yunhe', 'audio', '异常声音监测', '全楼拾音', 'normal'),
  dev('d-help-2', 'lib-yunhe', 'help', '一键求助按钮', '门厅', 'normal'),
  dev('d-ups-2', 'lib-yunhe', 'ups', 'UPS', '配电间', 'normal'),
  dev('d-smoke-4', 'lib-yunhe', 'smoke', '烟感-阅览区', '阅览区吊顶', 'normal'),
  dev('d-fresh-2', 'lib-yunhe', 'freshair', '新风系统', '设备间', 'normal'),
  dev('d-exit-3', 'lib-yunhe', 'exitlight', '疏散指示灯-正门', '门厅通道', 'normal'),
  dev('d-printer-2', 'lib-yunhe', 'printer', '自助打印机', '门厅', 'normal', { level: 30 }),
  // 江南里书房（已闭馆，遗留故障）
  dev('d-gate-4', 'lib-jiangnan', 'gate', '入口门禁闸机', '正门', 'fault', { note: '读卡器无响应' }),
  dev('d-kiosk-4', 'lib-jiangnan', 'selfkiosk', '自助借还机', '借阅区', 'normal'),
  dev('d-cam-5', 'lib-jiangnan', 'camera', '摄像头-正门', '正门', 'online'),
  dev('d-fire-3', 'lib-jiangnan', 'fire', '消防主机', '值班室', 'normal'),
  dev('d-ac-3', 'lib-jiangnan', 'ac', '中央空调', '全楼', 'off'),
  dev('d-light-3', 'lib-jiangnan', 'light', '照明回路', '全馆', 'off'),
  dev('d-box-3', 'lib-jiangnan', 'returnbox', '还书箱', '门厅', 'normal', { level: 20 }),
  dev('d-audio-3', 'lib-jiangnan', 'audio', '异常声音监测', '全楼拾音', 'normal'),
  dev('d-help-3', 'lib-jiangnan', 'help', '一键求助按钮', '门厅', 'normal'),
  dev('d-ups-3', 'lib-jiangnan', 'ups', 'UPS', '配电间', 'normal'),
  dev('d-water-3', 'lib-jiangnan', 'water', '直饮饮水机', '饮水角', 'normal'),
  dev('d-smoke-5', 'lib-jiangnan', 'smoke', '烟感-阅览区', '阅览区吊顶', 'normal'),
  dev('d-fresh-3', 'lib-jiangnan', 'freshair', '新风系统', '设备间', 'off'),
  dev('d-exit-4', 'lib-jiangnan', 'exitlight', '疏散指示灯-南门通道', '一层走廊', 'normal'),
  dev('d-printer-3', 'lib-jiangnan', 'printer', '自助打印机', '门厅', 'off', { level: 20 })
]

export const seedVisits: Visit[] = [
  {
    id: uid('v'), libraryId: 'lib-zhongshan', readerId: 'r-001', readerName: '张明', isChild: false,
    entryMethod: 'idcard', entryNo: '330106********2211', seatNo: 'A-12', enterAt: now - 95 * min
  },
  {
    id: uid('v'), libraryId: 'lib-zhongshan', readerId: 'r-002', readerName: '刘芳', isChild: false,
    entryMethod: 'card', entryNo: 'LS20210002', seatNo: 'B-04', enterAt: now - 70 * min
  },
  {
    id: uid('v'), libraryId: 'lib-zhongshan', readerId: 'r-003', readerName: '孙小磊（儿童）', isChild: true,
    entryMethod: 'reservation', entryNo: 'YY20260916-08', seatNo: '亲子-02', enterAt: now - 40 * min,
    note: '亲子阅读，家长孙建国陪同'
  },
  {
    id: uid('v'), libraryId: 'lib-zhongshan', readerId: 'r-004', readerName: '周婷', isChild: false,
    entryMethod: 'idcard', entryNo: '330106********8844', seatNo: 'A-21', enterAt: now - 150 * min
  },
  {
    id: uid('v'), libraryId: 'lib-yunhe', readerId: 'r-007', readerName: '郑凯', isChild: false,
    entryMethod: 'card', entryNo: 'LS20210311', seatNo: 'C-08', enterAt: now - 55 * min
  },
  // 夜间滞留（江南里书房昨晚闭馆后发现，已完成处置但服务跟进事件遗留）
  (() => {
    const found = now - 11 * 60 * min
    const dispatched = now - 10.8 * 60 * min
    const arrived = now - 10.5 * 60 * min
    const decided = now - 10.2 * 60 * min
    const left = now - 10 * 60 * min
    const v: Visit = {
      id: uid('v'), libraryId: 'lib-jiangnan', readerId: 'r-005', readerName: '吴浩', isChild: false,
      entryMethod: 'idcard', entryNo: '330106********0055', seatNo: 'B-17',
      enterAt: now - 20 * 60 * min, leaveAt: left, stranded: true, resolved: true,
      note: '昨晚 22:05 清场发现伏案熟睡；本人解释加班后疲惫睡着，已劝离。读者服务今日谈话跟进',
      strandedHandling: {
        status: 'left',
        discoveredAt: found,
        zone: '一层阅览区 B 区（B-17 座位）',
        gateRecords: [
          { at: now - 20 * 60 * min, gate: '正门闸机', event: '刷身份证入馆，分配座位 B-17' },
          { at: now - 11.2 * 60 * min, gate: '正门闸机', event: '闭馆后门禁布防，无该读者出闸记录' }
        ],
        securityName: '夜班安保 马强',
        securityPost: '夜间巡逻岗（馆内）',
        securityEtaMin: 3,
        securityPhone: '139****8856',
        dispatchedAt: dispatched,
        arrivedAt: arrived,
        readerReason: '在互联网公司加班多日，太累看着书睡着了，没有听到闭馆广播。',
        decision: 'persuade-leave',
        decidedAt: decided,
        decidedBy: '王管（管理员）',
        decisionNote: '身体状况正常、无饮酒，予以劝离；登记滞留 1 次，次日读者服务谈话并信用扣分。',
        leftAt: left,
        leaveMethod: 'staff-escort',
        incidentId: undefined,
        logs: [
          { at: found, actor: '系统', role: 'system', text: '闭馆清场扫描：B-17 座位发现读者未离馆，生成夜间滞留处置' },
          { at: dispatched, actor: '王管', role: 'admin', text: '通知夜间巡逻岗安保马强到场（预计 3 分钟）' },
          { at: arrived, actor: '马强', role: 'security', text: '到场确认：读者生命体征正常、意识清醒' },
          { at: decided, actor: '王管', role: 'admin', text: '管理员确认处置方式：劝离（非未成年人，无需联系监护人）' },
          { at: left, actor: '马强', role: 'security', text: '22:16 陪同读者从正门离馆，门禁恢复布防，最终离馆时间已记录' }
        ]
      }
    }
    return v
  })()
]

export const seedUsageLogs: UsageLog[] = [
  { id: uid('u'), libraryId: 'lib-zhongshan', readerId: 'r-001', readerName: '张明', kind: 'borrow', detail: '借出《三体》1 册', at: now - 80 * min },
  { id: uid('u'), libraryId: 'lib-zhongshan', readerId: 'r-002', readerName: '刘芳', kind: 'print', detail: '自助打印 6 页（黑白）', at: now - 50 * min },
  { id: uid('u'), libraryId: 'lib-zhongshan', readerId: 'r-001', readerName: '张明', kind: 'water', detail: '饮水机接水 350ml', at: now - 30 * min },
  { id: uid('u'), libraryId: 'lib-zhongshan', readerId: 'r-004', readerName: '周婷', kind: 'return', detail: '还《人类简史》——消磁失败 E17', at: now - 20 * min },
  { id: uid('u'), libraryId: 'lib-zhongshan', readerId: 'r-003', readerName: '孙小磊（儿童）', kind: 'kiosk', detail: '自助机查询少儿绘本', at: now - 12 * min },
  { id: uid('u'), libraryId: 'lib-yunhe', readerId: 'r-007', readerName: '郑凯', kind: 'borrow', detail: '借出《百年孤独》1 册', at: now - 40 * min }
]

function mkIncident(partial: Partial<Incident> & Pick<Incident, 'libraryId' | 'type' | 'title' | 'detail'>): Incident {
  return {
    id: uid('inc'),
    no: `EV-${(now % 100000).toString().padStart(5, '0')}-${Math.floor(Math.random() * 900 + 100)}`,
    severity: 'medium',
    status: 'open',
    owner: null,
    night: false,
    createdAt: now - 30 * min,
    actions: [],
    ...partial
  }
}

export const seedIncidents: Incident[] = [
  // —— 当日未结事件 ——
  mkIncident({
    libraryId: 'lib-zhongshan', type: 'demag-failed', severity: 'high', night: false,
    title: '《人类简史》还书消磁失败', readerId: 'r-004', bookId: 'b-004', deviceId: 'd-kiosk-1',
    detail: '读者周婷在 1 号自助机还书，消磁器报错 E17，图书防盗磁条未解除，无法通过门禁。需设备维护检查消磁线圈，读者服务人工核验登记后放行。',
    createdAt: now - 20 * min, owner: 'maintainer',
    actions: [
      { id: uid('a'), at: now - 20 * min, role: 'system', actor: '自助借还机', type: 'notify', text: '自动上报：消磁失败，图书 b-004 暂扣在人工台' },
      { id: uid('a'), at: now - 18 * min, role: 'service', actor: '陈服', type: 'ack', text: '已受理，安排读者在服务区等候，人工核验身份' }
    ]
  }),
  mkIncident({
    libraryId: 'lib-zhongshan', type: 'box-full', severity: 'medium', night: false,
    title: '24小时还书箱已满（96%）', deviceId: 'd-box-1',
    detail: '外墙还书箱容量 96%，夜间还书将无法投入。需读者服务/物业安排清运并空箱复位。',
    createdAt: now - 45 * min, owner: 'service',
    actions: [{ id: uid('a'), at: now - 45 * min, role: 'system', actor: '还书箱传感器', type: 'notify', text: '容量超过 95% 阈值' }]
  }),
  mkIncident({
    libraryId: 'lib-zhongshan', type: 'device-fault', severity: 'medium', night: false,
    title: '1号自助借还机故障 E17', deviceId: 'd-kiosk-1',
    detail: '消磁器故障导致借还机部分功能不可用，与消磁失败事件关联。',
    createdAt: now - 22 * min, owner: 'maintainer',
    actions: [{ id: uid('a'), at: now - 22 * min, role: 'admin', actor: '王管', type: 'dispatch', text: '派单给设备维护赵工' }]
  }),
  mkIncident({
    libraryId: 'lib-zhongshan', type: 'gate-abnormal', severity: 'high', night: false,
    title: '消防通道门磁信号间歇丢失', deviceId: 'd-gate-2',
    detail: '后门消防通道门磁 5 分钟内 3 次上报异常开闭。需安保现场查看是否虚掩或被遮挡，维护检查门磁。',
    createdAt: now - 12 * min, owner: 'security',
    actions: []
  }),
  mkIncident({
    libraryId: 'lib-zhongshan', type: 'lost-item', severity: 'low', night: false,
    title: '拾获蓝色保温杯一个', readerId: 'r-002',
    detail: '读者刘芳在 B-04 座位拾获蓝色保温杯，已交服务台登记招领。',
    createdAt: now - 60 * min, owner: 'service',
    actions: [{ id: uid('a'), at: now - 60 * min, role: 'service', actor: '陈服', type: 'ack', text: '已登记入库（失物 LW-009）' }]
  }),
  mkIncident({
    libraryId: 'lib-yunhe', type: 'device-fault', severity: 'low', night: false,
    title: '饮水机不出热水', deviceId: 'd-water-2',
    detail: '运河公园书房饮水机热水口不出水，读者已反映两次。',
    createdAt: now - 100 * min, owner: 'maintainer', actions: []
  }),

  // —— 夜间无人值守事件（昨晚，已处置中） ——
  mkIncident({
    libraryId: 'lib-zhongshan', type: 'camera-offline', severity: 'high', night: true,
    title: '阅览区摄像头夜间离线', deviceId: 'd-cam-2',
    detail: '昨夜 02:14 阅览区摄像头离线，02:41 异常声音监测拾取玻璃异响。两项技防告警需安保联动调取正门/书库摄像头回溯，并转街道值班备查。',
    createdAt: now - 6 * 60 * min, owner: 'security',
    actions: [
      { id: uid('a'), at: now - 6 * 60 * min, role: 'system', actor: '技防平台', type: 'notify', text: '摄像头离线告警' },
      { id: uid('a'), at: now - 5.5 * 60 * min, role: 'security', actor: '李安保', type: 'ack', text: '已收到，远程调取相邻摄像头' }
    ]
  }),
  mkIncident({
    libraryId: 'lib-zhongshan', type: 'abnormal-sound', severity: 'urgent', night: true,
    title: '凌晨异常声音（玻璃异响）', deviceId: 'd-audio-1',
    detail: '02:41 拾音系统判定玻璃敲击/破碎异响，持续约 20 秒。已联动录像。需安保到场巡查并上报街道值班，必要时报警。',
    createdAt: now - 5.2 * 60 * min, owner: 'security',
    actions: [
      { id: uid('a'), at: now - 5.2 * 60 * min, role: 'system', actor: '声音监测', type: 'escalate', text: '自动升级：紧急，建议 10 分钟内到场' }
    ]
  }),

  // —— 次日遗留事件（江南里书房昨晚） ——
  mkIncident({
    libraryId: 'lib-jiangnan', type: 'stranded', severity: 'high', night: true, carryOver: true,
    title: '闭馆清场发现读者滞留', readerId: 'r-005',
    detail: '昨晚 22:05 清场在 B-17 发现读者吴浩伏案熟睡。安保叫醒并陪同带离，身体无异常。该读者有 2 次滞留记录，需读者服务跟进谈话与信用扣分。',
    createdAt: now - 11 * 60 * min, owner: 'service',
    actions: [
      { id: uid('a'), at: now - 11 * 60 * min, role: 'security', actor: '夜班安保', type: 'arrive', text: '22:08 到场，确认读者生命体征正常' },
      { id: uid('a'), at: now - 10.8 * 60 * min, role: 'security', actor: '夜班安保', type: 'resolve', text: '22:16 陪同读者从正门离馆，门禁恢复正常' }
    ]
  }),
  mkIncident({
    libraryId: 'lib-jiangnan', type: 'device-fault', severity: 'medium', night: true, carryOver: true,
    title: '门禁读卡器无响应（未修复）', deviceId: 'd-gate-4',
    detail: '今晨发现正门门禁读卡器无响应，昨晚靠人工核验出入。设备维护尚未到场，今日开馆前必须修复。',
    createdAt: now - 9 * 60 * min, owner: 'maintainer', actions: []
  }),
  mkIncident({
    libraryId: 'lib-jiangnan', type: 'light-ac-on', severity: 'low', night: true, carryOver: true,
    title: '闭馆后阅览区空调未关',
    detail: '昨晚巡检复核发现阅览区 2 号空调持续运行至今晨 06:30，物业巡检发现后关闭。需排查定时控制并在交接单记录。',
    createdAt: now - 4 * 60 * min, owner: 'admin',
    actions: [{ id: uid('a'), at: now - 3 * 60 * min, role: 'admin', actor: '早班管理员', type: 'ack', text: '已确认关闭，等待维护检查定时器' }]
  }),
  mkIncident({
    libraryId: 'lib-zhongshan', type: 'complaint', severity: 'low', night: false, carryOver: true,
    title: '读者投诉：座位预约被占', readerId: 'r-007',
    detail: '郑凯反映昨晚预约的座位被他人占用且无人协调。要求今日回复处理结果。',
    createdAt: now - 14 * 60 * min, owner: 'service', actions: []
  })
]

function faultPhoto(label: string, color: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200'><rect width='320' height='200' fill='${color}'/><text x='160' y='95' font-size='18' fill='#fff' text-anchor='middle' font-family='sans-serif'>${label}</text><text x='160' y='125' font-size='12' fill='#e8eef5' text-anchor='middle' font-family='sans-serif'>设备故障现场照片（演示）</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const seedFaultReports: import('@/types').DeviceFaultReport[] = [
  {
    id: uid('fr'),
    no: 'WX-20260916-001',
    libraryId: 'lib-zhongshan',
    deviceId: 'd-kiosk-1',
    deviceName: '1号自助借还机',
    deviceType: 'selfkiosk',
    faultDesc: '消磁器报错 E17，还书时图书磁条无法解除，借还机消磁通道停用；打印凭条功能正常。',
    reportedAt: now - 22 * min,
    reporter: '陈服（读者服务）',
    photos: [
      { id: uid('p'), name: '消磁器报错E17.jpg', dataUrl: faultPhoto('消磁器报错 E17', '#5a2b31'), takenAt: now - 22 * min, note: '屏幕报错特写' },
      { id: uid('p'), name: '设备铭牌.jpg', dataUrl: faultPhoto('1号自助借还机', '#2a4d78'), takenAt: now - 21 * min, note: '设备编号铭牌' }
    ],
    affectedReaderCount: 6,
    affectedDesc: '截至闭馆前 6 名读者还书受影响，其中 1 册《人类简史》已人工暂扣；晚间读者无法自助借还。',
    maintainerName: '赵工（设备维护）',
    maintainerPhone: '138****6677',
    maintainerCompany: '市图书馆设备运维中心（24 小时报修）',
    status: 'open',
    incidentId: seedIncidents.find((i) => i.deviceId === 'd-kiosk-1' && i.type === 'device-fault')?.id
  },
  {
    id: uid('fr'),
    no: 'WX-20260915-007',
    libraryId: 'lib-jiangnan',
    deviceId: 'd-gate-4',
    deviceName: '入口门禁闸机',
    deviceType: 'gate',
    faultDesc: '正门门禁读卡器无响应，昨晚靠人工核验出入，今日开馆前必须确认停用/恢复。',
    reportedAt: now - 9 * 60 * min,
    reporter: '夜班管理员',
    photos: [
      { id: uid('p'), name: '读卡器无响应.jpg', dataUrl: faultPhoto('门禁读卡器无响应', '#5a2b31'), takenAt: now - 9 * 60 * min }
    ],
    affectedReaderCount: 0,
    affectedDesc: '影响次日开馆入馆核验效率',
    maintainerName: '门禁厂商 王工',
    maintainerPhone: '400-820-1166',
    maintainerCompany: '安行门禁维保',
    status: 'carried-over',
    carriedToDate: new Date(now).toISOString().slice(0, 10)
  }
]

export function buildTodayInspection(libraryId: string): Inspection {
  const items: Inspection['items'] = [
    { key: 'people', label: '人员清场（含卫生间/书架间/亲子区逐一核查）', scope: 'handover', state: 'pending' },
    { key: 'doors', label: '门窗（正门、消防通道、窗户门磁）', scope: 'handover', state: 'pending' },
    { key: 'fire', label: '消防（通道无占用、灭火器封签、主机无告警）', scope: 'handover', state: 'pending' },
    { key: 'ac', label: '空调关闭', scope: 'handover', state: 'pending' },
    { key: 'light', label: '灯光关闭（保留应急照明）', scope: 'handover', state: 'pending' },
    { key: 'kiosk', label: '自助机关机/待机、打印纸与遗留打印件', scope: 'handover', state: 'pending' },
    { key: 'returnbox', label: '还书箱容量与清运安排', scope: 'handover', state: 'pending' },
    { key: 'gate', label: '无人值守：门禁布防、闯入告警测试', scope: 'unmanned', state: 'pending' },
    { key: 'camera', label: '无人值守：摄像头全部在线、录像正常', scope: 'unmanned', state: 'pending' },
    { key: 'firesys', label: '无人值守：消防/烟感系统联网正常', scope: 'unmanned', state: 'pending' },
    { key: 'sound', label: '无人值守：异常声音监测布防', scope: 'unmanned', state: 'pending' },
    { key: 'help', label: '无人值守：读者求助通道转值班手机', scope: 'unmanned', state: 'pending' }
  ]
  return {
    id: uid('insp'),
    libraryId,
    date: localDate(now),
    signatures: {},
    items
  }
}

export const seedInspections: Inspection[] = [
  buildTodayInspection('lib-zhongshan'),
  buildTodayInspection('lib-yunhe')
]

export const seedLostItems: LostItem[] = [
  { id: 'lw-009', libraryId: 'lib-zhongshan', name: '蓝色保温杯', desc: '象印牌 350ml，杯底贴有“小磊”贴纸', foundAt: now - 60 * min, location: 'B-04 座位', status: 'kept', incidentId: undefined },
  { id: 'lw-008', libraryId: 'lib-zhongshan', name: '黑色折叠伞', desc: '无品牌标识，伞骨有一处弯折', foundAt: now - 26 * 60 * min, location: '门禁旁伞架', status: 'kept' },
  { id: 'lw-007', libraryId: 'lib-yunhe', name: '读者证', desc: '姓名王秀兰，证号 LS20180412', foundAt: now - 30 * 60 * min, location: '自助机台面', status: 'claimed', claimant: '王秀兰本人' }
]

export const seedComplaints: Complaint[] = [
  { id: uid('c'), libraryId: 'lib-zhongshan', readerName: '郑凯', content: '昨晚预约座位被占，现场无人协调。希望加强预约座位管理。', at: now - 14 * 60 * min, status: 'open' },
  { id: uid('c'), libraryId: 'lib-yunhe', readerName: '匿名读者', content: '周末亲子活动音响声音过大，影响阅览区。', at: now - 2 * 24 * 60 * min, status: 'replied', reply: '已调整活动区域至多功能间并关闭隔断门。' }
]

export const seedPatrols: VolunteerPatrol[] = [
  {
    id: uid('vp'), libraryId: 'lib-zhongshan', volunteer: '周志愿者', at: now - 180 * min,
    route: '正门→借阅区→少儿区→饮水角→消防通道', findings: '整体正常；少儿区绘本两册放错架，已归位；提醒 1 名读者保持安静。'
  }
]

export const seedTransfers: BookTransfer[] = [
  {
    id: uid('t'), bookId: 'b-008', bookTitle: '算法图解', fromLibraryId: 'lib-yunhe', toLibraryId: 'lib-zhongshan',
    qty: 1, reason: '中山中路书房计算机类复本不足，读者预约 3 人次', status: 'shipping',
    createdAt: now - 1 * 24 * 60 * min, handledBy: '王管'
  }
]

export const seedCreditRecords: import('@/types').CreditRecord[] = [
  { id: uid('cr'), readerId: 'r-005', readerName: '吴浩', delta: -10, reason: '图书逾期 21 天', at: now - 2 * 24 * 60 * min },
  { id: uid('cr'), readerId: 'r-001', readerName: '张明', delta: 2, reason: '按时还书', at: now - 3 * 24 * 60 * min },
  { id: uid('cr'), readerId: 'r-003', readerName: '孙小磊（儿童）', delta: 5, reason: '参加亲子阅读活动全勤', at: now - 5 * 24 * 60 * min }
]

export const seedActivities: Activity[] = [
  {
    id: uid('act'), libraryId: 'lib-zhongshan', title: '周末亲子绘本共读：《团圆》', date: '2026-09-19', time: '10:00-11:00',
    ageRange: '5-9 岁', capacity: 15, enrolled: 12, host: '陈服 + 志愿者周老师', status: 'open',
    families: [
      { parent: '孙建国', child: '孙小磊', childAge: 10, phone: '137****2003' },
      { parent: '林慧', child: '林囡囡', childAge: 8, phone: '138****2006' }
    ]
  },
  {
    id: uid('act'), libraryId: 'lib-yunhe', title: '亲子科学故事会', date: '2026-09-20', time: '14:30-15:30',
    ageRange: '6-10 岁', capacity: 10, enrolled: 10, host: '小河街道社工', status: 'full', families: []
  }
]
