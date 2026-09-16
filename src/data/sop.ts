import type { IncidentType, Role } from '@/types'
import { roleNames } from '@/stores/auth'

/** 各类事件的标准处置流程（SOP）：围绕同一事件，多角色按职责协同 */
export interface SopStep {
  owner: Role | 'street'
  action: string
}

export const incidentSop: Record<IncidentType, SopStep[]> = {
  stranded: [
    { owner: 'security', action: '立即到场寻人（卫生间、书架间、亲子区），确认人身安全' },
    { owner: 'service', action: '登记身份、联系家属，必要时提供热水/休息' },
    { owner: 'admin', action: '夜间滞留按预案处置：劝离或安置，记录信用扣分' },
    { owner: 'security', action: '清场复核签字后闭馆；次日服务岗谈话跟进' }
  ],
  'demag-failed': [
    { owner: 'service', action: '安抚读者、人工暂扣图书并登记，开人工通道放行' },
    { owner: 'maintainer', action: '检修消磁线圈/自助机，恢复后重新消磁' },
    { owner: 'security', action: '核对门禁记录，确认无未消磁图书带出' },
    { owner: 'admin', action: '复核闭环，图书上架归档' }
  ],
  'box-full': [
    { owner: 'service', action: '张贴夜间还书提示，登记待清运' },
    { owner: 'admin', action: '联系物业/物流清运还书箱' },
    { owner: 'security', action: '夜间巡查确认箱门关闭、无外溢' }
  ],
  'gate-abnormal': [
    { owner: 'security', action: '现场查看门体、门磁、是否虚掩或被遮挡' },
    { owner: 'maintainer', action: '检修门禁控制器/读卡器/门磁' },
    { owner: 'admin', action: '修复前安排人工核验出入，事后复核' }
  ],
  'device-fault': [
    { owner: 'maintainer', action: '接单到场，排查修复并记录备件' },
    { owner: 'service', action: '现场张贴提示、引导读者改用备用设备' },
    { owner: 'admin', action: '未修复须遗留次日开馆继续督办' }
  ],
  'lost-item': [
    { owner: 'service', action: '登记失物特征、拍照入招领台账' },
    { owner: 'security', action: '协助调取监控查找失主' },
    { owner: 'service', action: '核验认领人身份后归还并关闭事件' }
  ],
  'light-ac-on': [
    { owner: 'security', action: '闭馆复核时关闭照明与空调（保留应急照明）' },
    { owner: 'maintainer', action: '检查定时控制/回路，防止再次发生' },
    { owner: 'admin', action: '能耗与责任记录，交接单签字' }
  ],
  'unmanned-access': [
    { owner: 'security', action: '远程喊话+录像固证，10 分钟内到场' },
    { owner: 'street', action: '同步街道值班，必要时拨打 110' },
    { owner: 'maintainer', action: '事后检修门禁与报警链路' }
  ],
  'camera-offline': [
    { owner: 'security', action: '调取相邻摄像头回溯，确认盲区时段' },
    { owner: 'maintainer', action: '检查网络/电源/录像主机，恢复在线' },
    { owner: 'street', action: '夜间离线超过 30 分钟报街道值班备案' }
  ],
  'fire-alarm': [
    { owner: 'security', action: '立即按消防预案处置、现场核查、必要时 119' },
    { owner: 'admin', action: '疏散在场读者并清点人数' },
    { owner: 'street', action: '上报街道值班室与物业消防值班' }
  ],
  'abnormal-sound': [
    { owner: 'security', action: '联动录像定位声源，到场巡查' },
    { owner: 'street', action: '疑似入侵立即转街道值班并报警' },
    { owner: 'maintainer', action: '排除设备误报，校准拾音灵敏度' }
  ],
  'help-request': [
    { owner: 'security', action: '一键求助 3 分钟内到场（夜间转值班手机）' },
    { owner: 'service', action: '联系读者、提供帮助与后续服务' },
    { owner: 'admin', action: '登记求助原因，改进服务' }
  ],
  blackout: [
    { owner: 'security', action: '启动应急照明/UPS，稳住读者情绪，防止踩踏' },
    { owner: 'admin', action: '广播说明、有序疏导，清点在馆人数' },
    { owner: 'maintainer', action: '联系供电与物业，确认电梯困人等次生风险' },
    { owner: 'street', action: '长时间停电上报街道值班，必要时提前闭馆' }
  ],
  complaint: [
    { owner: 'service', action: '当天联系读者，记录诉求并给出回复时限' },
    { owner: 'admin', action: '核实责任、落实整改并回访' }
  ],
  patrol: [
    { owner: 'volunteer', action: '志愿者记录巡馆路线与发现' },
    { owner: 'service', action: '服务岗核实一般问题并处置' },
    { owner: 'security', action: '安全类发现转安保现场处理' }
  ]
}

/** 各角色可执行的事件动作权限 */
export const actionPermissions: Record<Role | 'street', string[]> = {
  admin: ['ack', 'dispatch', 'notify', 'escalate', 'arrive', 'resolve', 'verify', 'close', 'transfer', 'comment'],
  security: ['ack', 'dispatch', 'escalate', 'arrive', 'resolve', 'verify', 'transfer', 'comment'],
  maintainer: ['ack', 'arrive', 'resolve', 'escalate', 'transfer', 'comment'],
  service: ['ack', 'notify', 'escalate', 'resolve', 'transfer', 'comment'],
  volunteer: ['comment'],
  street: ['arrive', 'resolve', 'comment']
}

export function canDo(role: Role | 'street' | null, action: string): boolean {
  if (!role) return false
  return actionPermissions[role]?.includes(action) ?? false
}

export const actionLabels: Record<string, string> = {
  ack: '受理',
  dispatch: '派单',
  notify: '通知',
  escalate: '上报',
  arrive: '到场',
  resolve: '处理完成',
  verify: '复核',
  close: '归档关闭',
  transfer: '转交',
  comment: '备注'
}

export function ownerName(owner: Role | 'street' | null): string {
  if (!owner) return '待受理'
  if (owner === 'street') return '街道值班'
  return roleNames[owner]
}
