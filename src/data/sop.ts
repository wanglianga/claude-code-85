import type { IncidentType, Role } from '@/types'
import { roleNames } from '@/stores/auth'

/** 各类事件的标准处置流程（SOP）：围绕同一事件，多角色按职责协同 */
export interface SopStep {
  owner: Role | 'street'
  action: string
}

export const incidentSop: Record<IncidentType, SopStep[]> = {
  stranded: [
    { owner: 'security', action: '闭馆后滞留扫描比对门禁出闸记录，立即到场寻人（卫生间、书架间、亲子区），确认人身安全，记录安保位置与到场时间' },
    { owner: 'service', action: '登记身份与门禁记录、记录读者解释；未成年读者必须立即联系监护人并保留沟通结果，通知监护人接回' },
    { owner: 'admin', action: '确认处置方式：劝离 / 特殊延时（安保看护）/ 报警（同步街道），记录决策' },
    { owner: 'security', action: '记录读者最终离馆时间与方式（自行/监护人接回/陪同/民警带离）；处置闭环并信用扣分后，人员交接方可签字' }
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
    { owner: 'security', action: '页面切换应急视图：确认门禁失效则立即到场，启用机械钥匙或临时开门人工放行（不能只依赖扫码出门），读者端展示疏散路线与集合点，组织有序疏散' },
    { owner: 'admin', action: '逐项核验受影响范围（门禁/应急照明/疏散指示/自助机/打印机/消防主机/烟感/摄像头/异常声音/空调新风）与分区在馆人数；空调停运超阈值评估提前闭馆并通知已预约读者' },
    { owner: 'security', action: '有人被困、消防通道被占、烟感离线或应急灯不亮，立即转紧急事件，同步街道值班与消防联系人，紧急事件未解除前巡检不允许完成' },
    { owner: 'service', action: '借还请求本地暂存（记录操作时间、设备编号、经办人与读者），饮水机/打印停用同步读者端；处置读者求助' },
    { owner: 'maintainer', action: '来电后设备自检：图书消磁、还书箱、自助机重新核验，故障设备生成工单进入跨日交接；借还按操作时间与设备编号补录，读者不计逾期/借阅失败' },
    { owner: 'street', action: '街道值班查看停电小区、影响书房、在馆人数与处置进展；夜间停电须逐项确认清场/门窗/消防通道/应急照明/门禁恢复/摄像头回传，未恢复前不得标记闭馆完成；复盘记录停电时间、影响范围、读者求助、处置责任与改进项' }
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
