<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useSystemStore } from '@/stores/system'
import { useBranchStore } from '@/stores/branch'
import { useBlackoutStore, nightConfirmMeta } from '@/stores/blackout'
import { useAuthStore, roleNames } from '@/stores/auth'
import { useIncidentStore } from '@/stores/incident'
import { deviceTypeMeta, deviceStatusMeta } from '@/data/meta'
import { fmtDateTime, fmtDuration, fmtTime } from '@/utils/format'
import type { BlackoutCase, BlackoutDeviceEntry } from '@/types'
import { useToast } from '@/composables/useToast'
import { useIncidentViewer } from '@/composables/useIncidentViewer'
import { useBlackoutViewer } from '@/composables/useBlackoutViewer'
import BlackoutReviewDrawer from '@/components/BlackoutReviewDrawer.vue'

const router = useRouter()
const system = useSystemStore()
const branch = useBranchStore()
const bo = useBlackoutStore()
const auth = useAuthStore()
const incStore = useIncidentStore()
const toast = useToast()
const incidentViewer = useIncidentViewer()
const blackoutViewer = useBlackoutViewer()
const { now } = storeToRefs(system)

const me = computed(() => auth.account?.name ?? '值班人员')
const role = computed(() => auth.account?.role ?? null)
const canEdit = computed(() => role.value !== 'volunteer')
const lib = computed(() => system.currentLibrary)

const active = computed(() => bo.activeCase(lib.value.id))
const history = computed(() => bo.ofLibrary(lib.value.id).filter((c) => c.phase === 'reviewed'))

function incidentOf(c: BlackoutCase) {
  return incStore.incidents.find((i) => i.id === c.incidentId) ?? null
}

// ---------------- 启动停电 ----------------
const startGateFailed = ref(true)
function startBlackout() {
  const { case: c } = bo.beginBlackout(lib.value.id, now.value, { gateFailed: startGateFailed.value })
  toast.bad('⚡ 市电中断：已切换应急视图，受影响范围已生成，安保已通知到场')
  void c
}

// ---------------- 门禁/安保 ----------------
function arrive(c: BlackoutCase) {
  bo.securityArrive(c.id, me.value, now.value)
  toast.ok('安保到场已记录')
}
function mechKey(c: BlackoutCase) {
  const r = bo.useMechanicalKey(c.id, me.value, now.value)
  if (!r.ok) toast.bad(r.error!)
  else toast.ok('已启用机械钥匙，安保值守登记出入')
}
function tempOpenDoor(c: BlackoutCase) {
  const r = bo.tempOpen(c.id, me.value, now.value)
  if (!r.ok) toast.bad(r.error!)
  else toast.ok('已临时开门（专人值守、只出不进）')
}

// ---------------- 受影响范围核验 ----------------
function deviceLabel(e: BlackoutDeviceEntry) {
  return deviceTypeMeta[e.type]
}
function statusPill(e: BlackoutDeviceEntry) {
  const s = e.during
  if (s === 'normal' || s === 'online') return { cls: 'up', text: s === 'online' ? '在线/投切正常' : '正常（备用电源）' }
  if (s === 'offline') return { cls: 'down', text: '离线/中断' }
  if (s === 'off') return { cls: 'down', text: '停止运行' }
  if (s === 'alarm') return { cls: 'warn', text: '告警' }
  if (s === 'fault') return { cls: 'warn', text: '故障（停电前即异常）' }
  return { cls: 'info', text: deviceStatusMeta[s]?.label ?? s }
}
const abnormalDeviceNote = ref<BlackoutDeviceEntry | null>(null)
const abnormalNote = ref('')
function askAbnormal(e: BlackoutDeviceEntry) {
  abnormalDeviceNote.value = e
  abnormalNote.value = ''
}
function confirmAbnormal(c: BlackoutCase) {
  if (!abnormalDeviceNote.value) return
  bo.confirmDevice(c.id, abnormalDeviceNote.value.deviceId, me.value, now.value, true, abnormalNote.value || '现场核验异常')
  toast.bad('已记录异常；烟感离线/应急灯不亮已自动升级紧急事件')
  abnormalDeviceNote.value = null
  abnormalNote.value = ''
}
function confirmNormal(c: BlackoutCase, e: BlackoutDeviceEntry) {
  bo.confirmDevice(c.id, e.deviceId, me.value, now.value, false)
  toast.ok(`「${e.name}」已核验`)
}

// 分组
function group(c: BlackoutCase, types: string[]) {
  return c.devices.filter((d) => types.includes(d.type))
}
const GATE_GROUP = ['gate']
const EMERGENCY_GROUP = ['ups', 'exitlight']
const KIOSK_GROUP = ['selfkiosk', 'printer', 'water']
const FIRE_GROUP = ['fire', 'smoke']
const TECH_GROUP = ['camera', 'audio']
const HVAC_GROUP = ['ac', 'freshair']
const BOX_GROUP = ['returnbox', 'help', 'light']

// ---------------- 区域清点 ----------------
const zoneInputs = reactive<Record<string, number>>({})
function confirmZone(c: BlackoutCase, zone: string, expected: number) {
  const n = zoneInputs[zone]
  if (n === undefined || Number.isNaN(n)) {
    toast.bad('请填写现场清点人数')
    return
  }
  bo.confirmZone(c.id, zone, n, me.value, now.value)
  toast.ok(`${zone} 已清点 ${n} 人（登记 ${expected} 人）`)
  zoneInputs[zone] = undefined as unknown as number
}

// ---------------- 紧急事件 ----------------
function emergency(c: BlackoutCase, key: string) {
  bo.triggerEmergency(c.id, key, me.value, now.value)
  toast.bad('已升级紧急事件：同步街道值班与消防联系人，巡检状态已锁定')
}
function clearEmergency(c: BlackoutCase) {
  bo.clearEmergency(c.id, me.value, now.value)
  toast.ok('紧急险情已排除，巡检锁定解除')
}
function notifyStreet(c: BlackoutCase) {
  bo.notifyStreet(c.id, me.value, now.value)
  toast.ok('已同步街道值班室')
}
function notifyFire(c: BlackoutCase) {
  bo.notifyFire(c.id, me.value, now.value)
  toast.ok('已同步消防联系人')
}

// ---------------- 读者疏散 / 求助 ----------------
const activeVisits = computed(() => (active.value ? branch.activeVisits(active.value.libraryId) : []))
function evacuate(c: BlackoutCase, visitId: string) {
  bo.evacuateVisit(c.id, visitId, now.value)
  toast.ok('读者已沿疏散通道安全离馆')
}
const helpReader = ref('')
const helpZone = ref('一层阅览区')
const helpDesc = ref('')
function addHelp(c: BlackoutCase) {
  if (!helpDesc.value.trim()) {
    toast.bad('请填写求助情况')
    return
  }
  bo.addHelp(c.id, { readerName: helpReader.value || '匿名读者', zone: helpZone.value, desc: helpDesc.value.trim(), at: now.value })
  toast.bad('已登记读者求助并通知到场安保')
  helpReader.value = ''
  helpDesc.value = ''
}
function helpAction(c: BlackoutCase, helpId: string, status: string) {
  bo.resolveHelp(c.id, helpId, me.value, now.value)
  toast.ok(status === 'open' ? '安保已到场' : '求助已处置')
}

// ---------------- 借还暂存 ----------------
const txn = reactive({ readerName: '', readerCard: '', barcode: '', deviceNo: '人工服务台-T01', kind: 'borrow' as 'borrow' | 'return', zone: '借阅区人工台', opTime: '' })
function currentHhmm() {
  const d = new Date(now.value)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function opAtTs(c: BlackoutCase): number {
  if (!txn.opTime) return now.value
  const d = new Date(c.startedAt)
  const [h, m] = txn.opTime.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}
function addTxn(c: BlackoutCase) {
  const r = bo.addPendingTxn(c.id, {
    opAt: opAtTs(c),
    deviceNo: txn.deviceNo,
    operator: me.value,
    readerName: txn.readerName,
    readerCard: txn.readerCard,
    bookBarcode: txn.barcode,
    kind: txn.kind,
    zone: txn.zone
  })
  if (!r.ok) toast.bad(r.error!)
  else {
    toast.ok('借还请求已暂存（本地登记），来电按操作时间与设备编号补录')
    txn.readerName = txn.readerCard = txn.barcode = ''
  }
}
function backfillOne(c: BlackoutCase, id: string) {
  if (c.phase === 'active') {
    toast.bad('供电未恢复，不能补录（先完成来电设备自检）')
    return
  }
  bo.backfillTxn(c.id, id, me.value, now.value)
  toast.ok('已按实际操作时间与设备编号补入系统，不计逾期')
}
function backfillAll(c: BlackoutCase) {
  if (c.phase === 'active') {
    toast.bad('供电未恢复，不能补录')
    return
  }
  const n = bo.backfillAll(c.id, me.value, now.value)
  toast.ok(`已一键补录 ${n} 笔，按操作时间与设备编号写入`)
}

// ---------------- 空调阈值 / 提前闭馆 ----------------
function acMins(c: BlackoutCase) {
  return bo.acStoppedMin(c, now.value)
}
function remind(c: BlackoutCase) {
  bo.remindEarlyClose(c.id, me.value, now.value)
  toast.bad('已提醒管理员评估提前闭馆')
}
function earlyClose(c: BlackoutCase) {
  const n = bo.decideEarlyClose(c.id, me.value, now.value)
  toast.ok(`已决定提前闭馆，通知已预约读者 ${n} 人次，读者端同步停止服务通告`)
}

// ---------------- 来电恢复 / 自检 ----------------
function restore(c: BlackoutCase) {
  bo.restorePower(c.id, me.value, now.value)
  toast.ok('市电已恢复：开始逐项设备自检与消磁/还书箱核验')
}
const selfTestNoteTarget = ref<BlackoutDeviceEntry | null>(null)
const selfTestNote = ref('')
function askFault(c: BlackoutCase, e: BlackoutDeviceEntry) {
  void c
  selfTestNoteTarget.value = e
  selfTestNote.value = ''
}
function confirmSelfTestFault(c: BlackoutCase) {
  if (!selfTestNoteTarget.value) return
  const r = bo.runSelfTest(c.id, selfTestNoteTarget.value.deviceId, 'fault', me.value, now.value, selfTestNote.value)
  if (r.faultReportId) toast.bad(`自检失败，已开故障工单进入跨日交接`)
  selfTestNoteTarget.value = null
  selfTestNote.value = ''
}
function selfTestOk(c: BlackoutCase, e: BlackoutDeviceEntry) {
  bo.runSelfTest(c.id, e.deviceId, 'ok', me.value, now.value)
  toast.ok(`「${e.name}」自检通过`)
}
const pendingSelfTests = computed(() => (active.value ? bo.pendingSelfTestCount(active.value) : 0))
const pendingBackfill = computed(() => active.value?.pendingTxns.filter((t) => !t.backfilled).length ?? 0)
const nightConfirmedCount = computed(() =>
  active.value ? nightConfirmMeta.filter((m) => active.value!.nightConfirms[m.key]).length : 0
)

// ---------------- 夜间六项 ----------------
function confirmNight(c: BlackoutCase, key: typeof nightConfirmMeta[number]['key']) {
  bo.confirmNight(c.id, key, me.value, now.value, role.value ?? 'admin')
  toast.ok('夜间恢复项已逐项确认')
}

// ---------------- 复盘 ----------------
function openReview(c: BlackoutCase) {
  blackoutViewer.openReview(c.id)
}

function openReader() {
  router.push({ name: 'reader', query: { lib: lib.value.id } })
}
function back() {
  router.push('/dashboard')
}
function openIncident(id: string) {
  incidentViewer.open(id)
}
function actionRoleLabel(r: string): string {
  if (r === 'system') return '系统'
  if (r === 'street') return '街道值班'
  return roleNames[r as 'admin'] ?? r
}
</script>

<template>
  <div class="emergency-overlay">
    <!-- 顶部警报条 -->
    <div class="emg-head" :class="{ 'emergency-siren': active?.emergencyReasons.length }">
      <span style="font-size:26px">⚡</span>
      <div>
        <div class="emg-title">突发停电 · 门禁消防应急联动</div>
        <div class="small" style="color:#ffd7de">{{ lib.name }} · {{ lib.community }}</div>
      </div>
      <div class="spacer"></div>
      <div v-if="active" class="small" style="color:#ffe7ea">
        已停电 <b style="font-size:16px">{{ fmtDuration(active.startedAt, now) }}</b>
        <span class="emg-pill info" style="margin-left:8px">{{ active.night ? '🌙 夜间停电' : '☀️ 开放时段' }}</span>
        <span v-if="active.phase === 'power-restored'" class="emg-pill up" style="margin-left:6px">来电核验中</span>
        <span v-if="active.phase === 'reviewed'" class="emg-pill up" style="margin-left:6px">已复盘</span>
      </div>
      <div class="emg-clock">🕐 {{ fmtTime(now) }}</div>
      <button class="emg-btn amber sm" @click="openReader">📱 读者端通告屏</button>
      <button class="emg-btn sm" @click="back">返回工作台</button>
    </div>

    <div class="emg-body">
      <!-- 未发生停电：启动入口 -->
      <template v-if="!active">
        <div class="emg-card">
          <h3>⚡ 启动突发停电应急</h3>
          <p class="small" style="color:#c3d0e0;line-height:1.9">
            启动后页面立即切换应急视图并生成受影响范围：门禁是否失效、应急照明与疏散指示灯、自助借还机/打印机离线、
            消防主机与烟感、摄像头与异常声音监测、空调与新风、当前在馆人数与所在区域；
            门禁失效立即通知安保到场，读者端展示疏散路线与集合点。
          </p>
          <div class="row" style="margin-top:10px">
            <label class="row small" style="gap:6px;color:#e8eef7">
              <input type="checkbox" v-model="startGateFailed"> 门禁失效（电锁释放/无法刷卡，需机械钥匙或临时开门）
            </label>
            <div class="spacer"></div>
            <button class="emg-btn danger" @click="startBlackout" :disabled="!canEdit">⚡ 模拟突发停电</button>
          </div>
        </div>

        <div class="emg-card" v-if="history.length">
          <h3>📜 历史停电复盘档案</h3>
          <table class="tbl" style="background:transparent">
            <thead><tr><th>编号</th><th>停电时间</th><th>时长</th><th>紧急事件</th><th>暂存补录</th><th>自检失败</th><th></th></tr></thead>
            <tbody>
              <tr v-for="c in history" :key="c.id" style="color:#dfe7f1">
                <td>{{ c.no }}</td>
                <td class="small">{{ fmtDateTime(c.startedAt) }}</td>
                <td>{{ c.review?.durationMin }} 分钟</td>
                <td>{{ c.emergencyIncidentIds.length }} 起</td>
                <td>{{ c.pendingTxns.length }} 笔</td>
                <td>{{ c.devices.filter(d => d.faultReportId).length }} 台</td>
                <td class="right"><button class="emg-btn sm" @click="openReview(c)">复盘记录</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- 应急处置 -->
      <template v-else-if="active">
        <!-- 总览 KPI -->
        <div class="emg-grid emg-grid-3">
          <div class="emg-stat" :class="activeVisits.length ? 'warn' : 'ok'">
            <div class="lab">👥 当前在馆人数（须逐区清点）</div>
            <div class="val">{{ activeVisits.length }} 人</div>
            <div class="small" style="color:#9fb3cc;margin-top:4px">
              已清点 {{ active.zones.filter(z => z.checked).length }}/{{ active.zones.length }} 区
            </div>
          </div>
          <div class="emg-stat" :class="active.gateFailed ? 'bad' : 'ok'">
            <div class="lab">🚪 门禁</div>
            <div class="val">{{ active.gateFailed ? '失效' : '正常' }}</div>
            <div class="small" style="color:#9fb3cc;margin-top:4px">
              <template v-if="active.gateFailed">
                {{ active.securityArrived ? '安保已到场' : active.securityNotified ? '安保出动中' : '未通知' }}
                · <span :class="active.mechanicalKey ? 'good-text' : 'warn-text'">{{ active.mechanicalKey ? '机械钥匙已启用' : '' }}</span>
                <span :class="active.tempOpen ? 'good-text' : 'warn-text'">{{ active.tempOpen ? '临时开门中' : '' }}</span>
              </template>
              <template v-else>电锁/读卡器未受影响</template>
            </div>
          </div>
          <div class="emg-stat" :class="active.emergencyReasons.length ? 'bad' : 'ok'">
            <div class="lab">🚨 紧急事件</div>
            <div class="val">{{ active.emergencyReasons.length ? '已升级' : '无' }}</div>
            <div class="small" style="color:#9fb3cc;margin-top:4px">
              街道 {{ active.streetNotified ? '已同步' : '未同步' }} · 消防 {{ active.fireNotified ? '已同步' : '未同步' }}
            </div>
          </div>
        </div>

        <!-- 紧急升级条 -->
        <div v-if="active.emergencyReasons.length" class="emg-card" :class="active.emergencyCleared ? '' : 'emergency-siren'">
          <h3 :style="active.emergencyCleared ? 'color:#9fe6da' : 'color:#fff'">
            {{ active.emergencyCleared ? '✅ 紧急险情已排除 · 巡检锁定解除' : '🚨 紧急事件处置中 · 巡检状态已锁定，不允许完成' }}
          </h3>
          <div class="phase-ribbon">
            <span v-for="r in active.emergencyReasons" :key="r" class="emg-pill" :class="active.emergencyCleared ? 'up' : 'down'" style="font-size:12.5px">
              {{ active.emergencyCleared ? '✔' : '⚠️' }} {{ r }}
            </span>
          </div>
          <div class="small mt8" :style="active.emergencyCleared ? 'color:#9fe6da' : 'color:#ffe7ea'">
            已同步街道值班与消防联系人。险情排除（被困获救、通道畅通、烟感/应急灯恢复）并完成来电自检与夜间确认前，不得标记闭馆完成。
            <button v-if="active.emergencyIncidentIds[0]" class="emg-btn amber sm" style="margin-left:10px"
              @click="openIncident(active.emergencyIncidentIds[0])">打开紧急事件</button>
            <button v-if="!active.emergencyCleared" class="emg-btn ok sm" style="margin-left:8px" @click="clearEmergency(active)">
              ✅ 险情排除确认
            </button>
            <span v-if="active.emergencyCleared" class="small" style="margin-left:8px">确认人：{{ active.emergencyClearedBy }} · {{ fmtTime(active.emergencyClearedAt!) }}</span>
          </div>
        </div>

        <div class="emg-grid emg-grid-2">
          <!-- 门禁应急 -->
          <div class="emg-card">
            <h3>🚪 门禁失效应急 <span class="sub">不能只依赖扫码出门</span></h3>
            <div class="small" style="color:#c3d0e0;line-height:1.8;margin-bottom:10px">
              门禁失效已自动通知值班安保到场。读者疏散走机械钥匙/临时开门通道，读者端同步展示疏散路线与集合点。
            </div>
            <div class="row">
              <button class="emg-btn" :disabled="active.securityArrived || !canEdit" @click="arrive(active)">
                {{ active.securityArrived ? '✔ 安保已到场' : '🚶 安保到场确认' }}
              </button>
              <button class="emg-btn amber" :disabled="!active.gateFailed || active.mechanicalKey || !canEdit" @click="mechKey(active)">
                🔑 {{ active.mechanicalKey ? '机械钥匙已启用' : '启用机械钥匙' }}
              </button>
              <button class="emg-btn amber" :disabled="!active.gateFailed || active.tempOpen || !canEdit" @click="tempOpenDoor(active)">
                🚪 {{ active.tempOpen ? '临时开门中（只出不进）' : '临时开门（专人值守）' }}
              </button>
            </div>
            <div class="small mt8" style="color:#9fb3cc">安保调度：{{ lib.securityDispatchPhone }}</div>
          </div>

          <!-- 紧急事件触发 -->
          <div class="emg-card">
            <h3>🚨 紧急情况一键升级 <span class="sub">被困 / 通道被占 / 烟感离线 / 应急灯不亮</span></h3>
            <div class="row">
              <button class="emg-btn danger sm" :disabled="active.emergencyReasons.includes('有人被困（电梯/卫生间/书库）')"
                @click="emergency(active, 'trapped')">🧍 有人被困</button>
              <button class="emg-btn danger sm" :disabled="active.emergencyReasons.includes('消防通道被占用/堵塞')"
                @click="emergency(active, 'firelane-blocked')">🚧 消防通道被占</button>
              <button class="emg-btn danger sm" :disabled="active.emergencyReasons.includes('烟感离线')"
                @click="emergency(active, 'smoke-offline')">🔥 烟感离线</button>
              <button class="emg-btn danger sm" :disabled="active.emergencyReasons.includes('应急灯/疏散指示灯不亮')"
                @click="emergency(active, 'exitlight-off')">🔦 应急灯不亮</button>
            </div>
            <div class="row mt12">
              <button class="emg-btn sm" :disabled="active.streetNotified" @click="notifyStreet(active)">🏙️ 同步街道值班</button>
              <button class="emg-btn sm" :disabled="active.fireNotified" @click="notifyFire(active)">🚒 同步消防联系人</button>
              <span class="small" style="color:#9fb3cc">{{ lib.streetDutyPhone }} ｜ {{ lib.fireContactPhone }}</span>
            </div>
          </div>
        </div>

        <!-- 受影响范围逐项核验 -->
        <div class="emg-card">
          <h3>🔌 受影响范围现场核验 <span class="sub">逐项确认离线/点亮/正常，异常立即升级；来电后在此自检</span></h3>
          <div class="emg-grid emg-grid-3">
            <div v-for="(g, gi) in [
              { t: '门禁', list: group(active, GATE_GROUP) },
              { t: '应急照明 / 疏散指示', list: group(active, EMERGENCY_GROUP) },
              { t: '自助借还机 / 打印 / 饮水', list: group(active, KIOSK_GROUP) },
              { t: '消防主机 / 烟感', list: group(active, FIRE_GROUP) },
              { t: '摄像头 / 异常声音', list: group(active, TECH_GROUP) },
              { t: '空调 / 新风 / 照明 / 还书箱 / 求助', list: group(active, [...HVAC_GROUP, ...BOX_GROUP]) }
            ]" :key="gi" class="emg-stat" style="padding:10px 12px">
              <div class="lab" style="margin-bottom:6px">{{ g.t }}</div>
              <div v-for="e in g.list" :key="e.deviceId" class="affect-row">
                <span class="ico">{{ e.type === 'gate' ? '🚪' : e.type === 'ups' ? '🔋' : e.type === 'exitlight' ? '🔦' : e.type === 'selfkiosk' ? '🖥️' : e.type === 'printer' ? '🖨️' : e.type === 'water' ? '🚰' : e.type === 'fire' ? '🔥' : e.type === 'smoke' ? '💨' : e.type === 'camera' ? '📷' : e.type === 'audio' ? '🔊' : e.type === 'ac' ? '❄️' : e.type === 'freshair' ? '🌬️' : e.type === 'light' ? '💡' : e.type === 'returnbox' ? '📦' : '🆘' }}</span>
                <div class="grow">
                  <div class="nm small">{{ e.name }}</div>
                  <div class="loc">{{ e.location }}</div>
                </div>
                <span class="emg-pill" :class="statusPill(e).cls">{{ statusPill(e).text }}</span>
                <span v-if="e.check === 'confirmed'" class="emg-pill up">已核验</span>
                <span v-else-if="active.phase === 'active'" class="row" style="gap:4px">
                  <button class="emg-btn sm" style="padding:2px 7px" @click="confirmNormal(active, e)">正常</button>
                  <button class="emg-btn danger sm" style="padding:2px 7px" @click="askAbnormal(e)">异常</button>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="emg-grid emg-grid-2">
          <!-- 区域清点 -->
          <div class="emg-card">
            <h3>🧮 在馆人数与区域清点</h3>
            <div v-for="z in active.zones" :key="z.zone" class="affect-row">
              <span class="ico">📍</span>
              <div class="grow">
                <div class="nm small">{{ z.zone }}</div>
                <div class="loc">停电瞬间登记 {{ z.count }} 人<span v-if="z.checked"> · 现场清点 {{ z.checkedCount }} 人（{{ z.checkedBy }}）</span></div>
              </div>
              <template v-if="!z.checked && active.phase === 'active'">
                <input class="emg-input" style="width:70px" type="number" min="0" v-model.number="zoneInputs[z.zone]" placeholder="人数">
                <button class="emg-btn sm" @click="confirmZone(active, z.zone, z.count)">清点确认</button>
              </template>
              <span v-else class="emg-pill up">已清点</span>
            </div>
            <div v-if="!active.zones.length" class="small" style="color:#9fb3cc">停电瞬间在馆人数为 0。</div>
          </div>

          <!-- 空调阈值 / 提前闭馆 -->
          <div class="emg-card">
            <h3>❄️ 空调停运与提前闭馆评估</h3>
            <div class="small" style="color:#c3d0e0;line-height:1.9">
              空调/新风已停运 <b :class="acMins(active) >= active.acThresholdMin ? 'warn-text' : ''" style="font-size:17px">{{ acMins(active) }}</b> 分钟，
              阈值 <b>{{ active.acThresholdMin }}</b> 分钟。
              <span v-if="acMins(active) >= active.acThresholdMin && !active.acReminded" class="warn-text">已超阈值，请管理员评估！</span>
            </div>
            <div class="row mt8">
              <button class="emg-btn amber sm" :disabled="active.acReminded || active.phase !== 'active'" @click="remind(active)">⏰ 提醒管理员评估提前闭馆</button>
              <button class="emg-btn danger sm" :disabled="active.earlyClosed || active.phase !== 'active'" @click="earlyClose(active)">
                🏁 决定提前闭馆并通知预约读者
              </button>
            </div>
            <div class="small mt8" style="color:#9fb3cc" v-if="active.earlyClosed">
              ✔ 已提前闭馆，已通知预约读者 <b class="good-text">{{ active.reservationNotifiedCount }}</b> 人次；
              饮水机、打印设备停止服务通告已同步读者端。
            </div>
            <div class="small mt8" style="color:#9fb3cc">
              🚰 饮水机 / 🖨️ 打印设备停电即停止服务，读者端通告屏同步展示。
            </div>
          </div>
        </div>

        <div class="emg-grid emg-grid-2">
          <!-- 读者疏散 -->
          <div class="emg-card">
            <h3>🚶 读者疏散与签离 <span class="sub">沿疏散指示灯至集合点，禁乘电梯</span></h3>
            <div class="affect-row" v-for="v in activeVisits" :key="v.id">
              <span class="ico">{{ v.isChild ? '🧒' : '🧑' }}</span>
              <div class="grow"><div class="nm small">{{ v.readerName }}</div><div class="loc">{{ v.seatNo }} · {{ v.entryMethod === 'idcard' ? '身份证' : v.entryMethod === 'card' ? '借书证' : '预约码' }}</div></div>
              <button class="emg-btn ok sm" @click="evacuate(active, v.id)">引导疏散并签离</button>
            </div>
            <div v-if="!activeVisits.length" class="small good-text">✔ 在馆人员已全部疏散至集合点。</div>
            <div class="small mt8" style="color:#ffd166;line-height:1.7">
              集合点：{{ lib.assemblyPoint }}
            </div>
          </div>

          <!-- 读者求助 -->
          <div class="emg-card">
            <h3>🆘 停电期间读者求助</h3>
            <div class="row" style="gap:6px">
              <input class="emg-input" style="width:130px" v-model="helpReader" placeholder="读者称呼">
              <select class="emg-input" style="width:150px" v-model="helpZone">
                <option>一层阅览区</option><option>亲子阅览区</option><option>卫生间通道</option>
                <option>书库</option><option>二层阅览区</option><option>消防通道</option>
              </select>
            </div>
            <input class="emg-input mt8" v-model="helpDesc" placeholder="求助情况（如：读者行动不便、电梯困人、找不到孩子…）">
            <button class="emg-btn danger sm mt8" @click="addHelp(active)">登记求助并通知安保</button>
            <div class="mt8">
              <div v-for="h in active.helps" :key="h.id" class="affect-row">
                <span class="ico">🆘</span>
                <div class="grow"><div class="nm small">{{ h.readerName }} · {{ h.zone }}</div><div class="loc">{{ h.desc }} · {{ fmtTime(h.at) }}</div></div>
                <span v-if="h.status === 'resolved'" class="emg-pill up">已处置</span>
                <template v-else>
                  <button class="emg-btn sm" style="padding:2px 7px" @click="helpAction(active, h.id, h.status)">
                    {{ h.status === 'open' ? '安保到场' : '处置完成' }}
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- 借还暂存 -->
        <div class="emg-card">
          <h3>📋 借还请求暂存（本地兜底） <span class="sub">来电后按「操作时间 + 设备编号」补录，避免误算逾期/借阅失败</span></h3>
          <div class="emg-grid" style="grid-template-columns: 1fr 1fr 1.2fr 1.2fr .8fr auto;gap:8px" >
            <input class="emg-input" v-model="txn.readerName" placeholder="读者姓名">
            <input class="emg-input" v-model="txn.readerCard" placeholder="借书证号（选填）">
            <input class="emg-input" v-model="txn.barcode" placeholder="图书条码 / ISBN">
            <input class="emg-input" v-model="txn.deviceNo" placeholder="设备编号（如 人工服务台-T01）">
            <select class="emg-input" v-model="txn.kind"><option value="borrow">借出</option><option value="return">归还</option></select>
            <button class="emg-btn amber sm" @click="addTxn(active)">暂存</button>
          </div>
          <div class="row mt8 small" style="color:#9fb3cc;gap:16px">
            <label class="row" style="gap:5px">操作时间（补录锚点）
              <input class="emg-input" style="width:90px" type="time" v-model="txn.opTime" :placeholder="currentHhmm()">
            </label>
            <span>登记台：<input class="emg-input" style="width:170px;display:inline-block" v-model="txn.zone"></span>
          </div>
          <table class="tbl mt12" style="background:transparent">
            <thead><tr><th>操作时间</th><th>设备编号</th><th>读者</th><th>条码</th><th>类型</th><th>经办</th><th>补录状态</th><th class="right"></th></tr></thead>
            <tbody>
              <tr v-for="t in active.pendingTxns" :key="t.id" style="color:#dfe7f1">
                <td class="nowrap">{{ fmtDateTime(t.opAt) }} {{ fmtTime(t.opAt) }}</td>
                <td>{{ t.deviceNo }}</td>
                <td>{{ t.readerName }}</td>
                <td>{{ t.bookBarcode }}</td>
                <td>{{ t.kind === 'borrow' ? '借出' : '归还' }}</td>
                <td class="small">{{ t.operator }}</td>
                <td><span v-if="t.backfilled" class="emg-pill up">已补录 {{ fmtTime(t.backfilledAt) }}</span><span v-else class="emg-pill warn">待补录</span></td>
                <td class="right"><button class="emg-btn sm" style="padding:2px 7px" :disabled="t.backfilled || active.phase === 'active'" @click="backfillOne(active, t.id)">补录</button></td>
              </tr>
              <tr v-if="!active.pendingTxns.length"><td colspan="8" class="empty" style="color:#9fb3cc">暂无暂存借还</td></tr>
            </tbody>
          </table>
          <div class="row mt8">
            <button class="emg-btn ok sm" :disabled="active.phase === 'active' || !pendingBackfill" @click="backfillAll(active)">
              ⚡ 来电后一键补录（{{ pendingBackfill }} 笔，按操作时间+设备编号）
            </button>
            <span class="small" style="color:#9fb3cc" v-if="active.phase === 'active'">供电恢复并完成自检后开放补录，防止把设备离线期间的读者算作逾期或借阅失败。</span>
          </div>
        </div>

        <!-- 来电恢复（active 阶段） -->
        <div class="emg-card" v-if="active.phase === 'active'">
          <h3>🔌 来电处置</h3>
          <div class="row">
            <button class="emg-btn ok" @click="restore(active)" :disabled="!canEdit">🔌 确认市电恢复，进入设备自检核验</button>
            <span class="small" style="color:#9fb3cc">恢复后逐项自检：自助借还机（含图书消磁）、还书箱、门禁、摄像头、消防/烟感、空调新风；自检失败自动开工单进入跨日交接。</span>
          </div>
          <div class="mt8">
            <button class="emg-btn sm" @click="incidentOf(active) && openIncident(active.incidentId)">📄 打开停电事件（{{ incidentOf(active)?.no }}）</button>
          </div>
        </div>

        <!-- 来电自检 + 夜间确认（power-restored 阶段） -->
        <template v-if="active.phase === 'power-restored'">
          <div class="emg-card">
            <h3>✔️ 来电设备自检与重新核验 <span class="sub">待自检 {{ pendingSelfTests }} 台；重点：图书消磁、还书箱、自助机</span></h3>
            <div class="emg-grid emg-grid-3">
              <div v-for="e in active.devices" :key="e.deviceId" class="emg-stat" style="padding:10px 12px">
                <div class="row">
                  <div class="grow"><div class="nm small">{{ e.name }}</div><div class="loc" style="color:#9fb3cc">{{ deviceLabel(e) }} · {{ e.location }}</div></div>
                  <span v-if="e.selfTest === 'ok'" class="emg-pill up">自检通过</span>
                  <span v-else-if="e.selfTest === 'fault'" class="emg-pill down">自检失败·已开单</span>
                </div>
                <div class="row mt8" v-if="e.selfTest === 'pending'">
                  <button class="emg-btn ok sm" style="padding:3px 9px" @click="selfTestOk(active, e)">正常恢复</button>
                  <button class="emg-btn danger sm" style="padding:3px 9px" @click="askFault(active, e)">自检失败</button>
                </div>
                <div v-if="e.faultReportId" class="small mt8" style="color:#ffb3bc">已转故障工单（跨日交接）</div>
              </div>
            </div>
          </div>

          <!-- 夜间六项确认 -->
          <div class="emg-card" v-if="active.night">
            <h3>🌙 夜间停电恢复逐项确认 <span class="sub">管理员和安保逐项确认，未恢复前不得标记闭馆完成</span></h3>
            <div class="emg-grid emg-grid-3">
              <div v-for="m in nightConfirmMeta" :key="m.key" class="emg-stat" :class="active.nightConfirms[m.key] ? 'ok' : ''">
                <div class="small" style="color:#dfe7f1">{{ m.label }}</div>
                <div class="row mt8">
                  <span v-if="active.nightConfirms[m.key]" class="emg-pill up">✔ 已确认 · {{ active.nightConfirmedBy?.[m.key] }}</span>
                  <button v-else class="emg-btn amber sm" @click="confirmNight(active, m.key)">逐项确认</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 复盘入口 -->
          <div class="emg-card">
            <h3>📝 复盘归档</h3>
            <div class="row small" style="color:#c3d0e0;gap:18px">
              <span>设备自检：<b :class="pendingSelfTests ? 'warn-text' : 'good-text'">{{ active.devices.length - pendingSelfTests }}/{{ active.devices.length }}</b></span>
              <span>暂存补录：<b :class="pendingBackfill ? 'warn-text' : 'good-text'">{{ active.pendingTxns.length - pendingBackfill }}/{{ active.pendingTxns.length }}</b></span>
              <span v-if="active.night">夜间六项：<b :class="bo.nightConfirmedAll(active) ? 'good-text' : 'warn-text'">{{ nightConfirmedCount }}/6</b></span>
            </div>
            <button class="emg-btn amber mt12" @click="openReview(active)">📝 填写停电复盘记录并归档</button>
          </div>
        </template>

        <!-- 处置时间线 -->
        <div class="emg-card">
          <h3>🕘 应急处置留痕 <span class="sub">{{ active.actions.length }} 条，同步写入停电事件</span></h3>
          <div class="emg-timeline timeline">
            <div v-for="a in active.actions.slice(0, 30)" :key="a.id" class="tl-item" :class="{ sys: a.role === 'system' }">
              <div>
                <span class="tl-who">{{ a.actor }}</span>
                <span class="tag st-info" style="margin-left:6px">{{ actionRoleLabel(a.role) }}</span>
                <span class="tl-time">{{ fmtDateTime(a.at) }} {{ fmtTime(a.at) }}</span>
              </div>
              <div class="tl-text">{{ a.text }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 异常核验备注 -->
    <template v-if="abnormalDeviceNote">
      <div class="drawer-mask" @click="abnormalDeviceNote = null"></div>
      <div class="drawer" style="width:440px">
        <div class="drawer-hd"><h3>现场核验异常：{{ abnormalDeviceNote.name }}</h3></div>
        <div class="drawer-bd">
          <label class="field">异常情况（烟感离线/应急灯不亮等将自动升级紧急事件）
            <textarea class="input" rows="4" v-model="abnormalNote" placeholder="如：烟感备用电池耗尽已离线、疏散指示灯不亮…"></textarea>
          </label>
        </div>
        <div class="drawer-ft row">
          <button class="btn ghost" @click="abnormalDeviceNote = null">取消</button>
          <div class="spacer"></div>
          <button class="btn danger" @click="confirmAbnormal(active!)">确认异常</button>
        </div>
      </div>
    </template>

    <!-- 自检失败说明 -->
    <template v-if="selfTestNoteTarget">
      <div class="drawer-mask" @click="selfTestNoteTarget = null"></div>
      <div class="drawer" style="width:440px">
        <div class="drawer-hd"><h3>自检失败：{{ selfTestNoteTarget.name }}</h3></div>
        <div class="drawer-bd">
          <label class="field">故障现象（将自动开工单进入跨日交接）
            <textarea class="input" rows="4" v-model="selfTestNote" placeholder="如：自助机开机报警、消磁失败；门禁读卡器无响应…"></textarea>
          </label>
        </div>
        <div class="drawer-ft row">
          <button class="btn ghost" @click="selfTestNoteTarget = null">取消</button>
          <div class="spacer"></div>
          <button class="btn danger" @click="confirmSelfTestFault(active!)">确认失败并开故障工单</button>
        </div>
      </div>
    </template>

    <BlackoutReviewDrawer />
  </div>
</template>
