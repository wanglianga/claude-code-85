import type {
  BookStatus,
  DeviceStatus,
  DeviceType,
  EntryMethod,
  IncidentSeverity,
  IncidentType,
  ServiceKind
} from '@/types'

export const incidentTypeMeta: Record<IncidentType, { label: string; icon: string; tone: 'danger' | 'warn' | 'info' | 'ok' }> = {
  stranded: { label: '读者夜间滞留', icon: '🧍', tone: 'danger' },
  'demag-failed': { label: '图书消磁失败', icon: '📕', tone: 'warn' },
  'box-full': { label: '还书箱已满', icon: '📦', tone: 'warn' },
  'gate-abnormal': { label: '门禁异常', icon: '🚪', tone: 'danger' },
  'device-fault': { label: '设备故障', icon: '🛠️', tone: 'warn' },
  'lost-item': { label: '遗失物品', icon: '🔑', tone: 'info' },
  'light-ac-on': { label: '灯光空调未关', icon: '💡', tone: 'warn' },
  'unmanned-access': { label: '无人时段门禁闯入', icon: '🚨', tone: 'danger' },
  'camera-offline': { label: '摄像头离线', icon: '📷', tone: 'danger' },
  'fire-alarm': { label: '消防告警', icon: '🔥', tone: 'danger' },
  'abnormal-sound': { label: '异常声音', icon: '🔊', tone: 'danger' },
  'help-request': { label: '读者求助', icon: '🆘', tone: 'danger' },
  blackout: { label: '突发停电', icon: '⚡', tone: 'danger' },
  complaint: { label: '读者投诉', icon: '📝', tone: 'info' },
  patrol: { label: '巡馆上报', icon: '🧑‍🌾', tone: 'info' }
}

export const severityMeta: Record<IncidentSeverity, { label: string; cls: string }> = {
  low: { label: '低', cls: 'sev-low' },
  medium: { label: '中', cls: 'sev-medium' },
  high: { label: '高', cls: 'sev-high' },
  urgent: { label: '紧急', cls: 'sev-urgent' }
}

export const deviceTypeMeta: Record<DeviceType, string> = {
  gate: '门禁闸机',
  selfkiosk: '自助借还机',
  printer: '打印机',
  water: '饮水机',
  camera: '摄像头',
  fire: '消防主机',
  smoke: '烟感',
  ac: '空调',
  freshair: '新风系统',
  light: '灯光',
  exitlight: '疏散指示灯',
  returnbox: '还书箱',
  audio: '异常声音监测',
  help: '求助按钮',
  ups: '应急电源'
}

export const deviceStatusMeta: Record<DeviceStatus, { label: string; cls: string }> = {
  normal: { label: '正常', cls: 'st-ok' },
  online: { label: '在线', cls: 'st-ok' },
  off: { label: '已关闭', cls: 'st-off' },
  fault: { label: '故障', cls: 'st-bad' },
  full: { label: '已满', cls: 'st-warn' },
  offline: { label: '离线', cls: 'st-bad' },
  alarm: { label: '告警', cls: 'st-bad' }
}

export const serviceKindMeta: Record<ServiceKind, { label: string; icon: string }> = {
  borrow: { label: '借书', icon: '📖' },
  return: { label: '还书', icon: '↩️' },
  print: { label: '打印', icon: '🖨️' },
  water: { label: '饮水机', icon: '🚰' },
  kiosk: { label: '自助设备', icon: '🖥️' }
}

export const entryMethodMeta: Record<EntryMethod, string> = {
  idcard: '身份证',
  card: '借书证',
  reservation: '预约码'
}

export const bookStatusMeta: Record<BookStatus, { label: string; cls: string }> = {
  'on-shelf': { label: '在架', cls: 'st-ok' },
  borrowed: { label: '借出未还', cls: 'st-warn' },
  returned: { label: '已还待上架', cls: 'st-info' },
  'demag-failed': { label: '消磁失败', cls: 'st-bad' },
  'in-transfer': { label: '调拨中', cls: 'st-info' },
  lost: { label: '遗失', cls: 'st-bad' }
}
