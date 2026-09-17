<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { useBlackoutStore } from '@/stores/blackout'
import { useBranchStore } from '@/stores/branch'
import { useAuthStore, roleNames } from '@/stores/auth'
import { useIncidentViewer } from '@/composables/useIncidentViewer'
import { useFaultViewer } from '@/composables/useFaultViewer'
import { useToast } from '@/composables/useToast'
import { fmtDateTime, fmtDuration, fmtTime } from '@/utils/format'
import type { BlackoutEvent, ImpactKey, ImpactState, NightRecoverKey, SelfTestKey, UrgentReason } from '@/types'

const props = defineProps<{ event: BlackoutEvent; showBack?: boolean }>()
const emit = defineEmits<{ back: [] }>()
const system = useSystemStore()
const blackout = useBlackoutStore()
const branch = useBranchStore()
const auth = useAuthStore()
const toast = useToast()
const incidentViewer = useIncidentViewer()
const faultViewer = useFaultViewer()
const { now } = storeToRefs(system)

const event = computed(() => props.event)
const lib = computed(() => system.libraries.find((l) => l.id === event.value.libraryId) ?? system.currentLibrary)
const me = computed(() => auth.account?.name ?? '')
const readOnly = computed(() => auth.account?.role === 'volunteer' || auth.account?.role === 'street' || event.value.phase === 'closed')

const impactStateMeta: Record<ImpactState, { label: string; cls: string }> = {
  unknown: { label: '待核验', cls: 'st-off' },
  ok: { label: '正常', cls: 'st-ok' },
  affected: { label: '受影响', cls: 'st-bad' },
  'confirmed-on': { label: '已确认正常', cls: 'st-ok' },
  'confirmed-off': { label: '已确认异常', cls: 'sev-urgent' }
}

const urgentMeta: { key: UrgentReason; label: string; icon: string }[] = [
  { key: 'trapped', label: '有人被困', icon: '🛗' },
  { key: 'fire-exit-blocked', label: '消防通道被占', icon: '🚧' },
  { key: 'smoke-offline', label: '烟感离线', icon: '🔥' },
  { key: 'elight-off', label: '应急灯不亮', icon: '🔦' }
]

const helpKindMeta: Record<string, string> = {
  trapped: '被困求助', injury: '身体不适/受伤', separated: '与同行人失散', route: '询问疏散路线', other: '其他求助'
}

function setImpact(key: ImpactKey, state: ImpactState) {
  blackout.setImpact(event.value.id, key, state, me.value, now.value)
  toast.ok('影响范围核验已记录')
}

const countInputs = ref<Record<string, number>>({})
const countNotes = ref<Record<string, string>>({})
function saveCount(zone: string) {
  const n = Number(countInputs.value[zone])
  if (Number.isNaN(n) || n < 0) { toast.bad('请输入有效人数'); return }
  blackout.countZone(event.value.id, zone, n, me.value, now.value, countNotes.value[zone])
  toast.ok(`${zone} 清点 ${n} 人`)
}
const totalSystem = computed(() => event.value.headcounts.reduce((s, h) => s + h.systemCount, 0))
const totalActual = computed(() => blackout.peopleCount(event.value))

const gateMode = ref<'mechanical-key' | 'temp-open'>('mechanical-key')
const gateNote = ref('')
function securityArrived() { blackout.securityArrived(event.value.id, me.value, now.value); toast.ok('已记录安保到场') }
function applyGateFallback() {
  blackout.applyGateFallback(event.value.id, gateMode.value, me.value, now.value, gateNote.value || '按预案执行')
  toast.ok(gateMode.value === 'mechanical-key' ? '已启用机械钥匙人工开门' : '已启用临时开门值守')
  gateNote.value = ''
}

function escalate(reason: UrgentReason) {
  const detail = window.prompt(`报告「${urgentMeta.find((u) => u.key === reason)?.label}」现场情况：`, '')
  if (detail === null) return
  blackout.escalate(event.value.id, reason, detail || '现场确认', me.value, now.value)
  toast.bad('已升级紧急事件，请立即同步街道值班与消防联系人')
}
function resolveEsc(reason: UrgentReason) {
  const note = window.prompt('紧急事件解除说明：', '')
  if (note === null) return
  blackout.resolveEscalation(event.value.id, reason, me.value, now.value, note || '现场确认解除')
  toast.ok('紧急事件已解除')
}
function notifyStreet() { blackout.notifyStreet(event.value.id, me.value, now.value); toast.ok('已同步街道值班室') }
function notifyFire() { blackout.notifyFire(event.value.id, me.value, now.value); toast.ok('已联系消防联系人') }

const kioskDevices = computed(() => branch.devicesOf(lib.value.id).filter((d) => d.type === 'selfkiosk'))
const loanForm = ref({ readerName: '', bookBarcode: '', bookTitle: '', kind: 'borrow' as 'borrow' | 'return', deviceId: '', zone: '一层阅览区 A 区', note: '' })
function resetLoanForm() { loanForm.value = { readerName: '', bookBarcode: '', bookTitle: '', kind: 'borrow', deviceId: '', zone: '一层阅览区 A 区', note: '' } }
function addLoan() {
  if (!loanForm.value.readerName.trim() || !loanForm.value.bookBarcode.trim()) { toast.bad('读者姓名与图书条码必填'); return }
  const deviceId = loanForm.value.deviceId || kioskDevices.value[0]?.id || ''
  blackout.addPendingLoan({
    eventId: event.value.id, libraryId: lib.value.id, at: now.value, operator: me.value,
    readerName: loanForm.value.readerName, bookBarcode: loanForm.value.bookBarcode,
    bookTitle: loanForm.value.bookTitle || loanForm.value.bookBarcode, kind: loanForm.value.kind,
    deviceId, zone: loanForm.value.zone, note: loanForm.value.note
  })
  toast.ok('借还请求已本地暂存，将按实际操作时间与设备编号补录')
  resetLoanForm()
}
function backfillOne(id: string) { blackout.backfillLoan(event.value.id, id, me.value, now.value); toast.ok('已按操作时间与设备编号补录入系统') }
function backfillAll() { const n = blackout.backfillAll(event.value.id, me.value, now.value); toast.ok(`已补录 ${n} 笔，均按实际操作时间写入流水`) }

function handleHelp(id: string, resolved: boolean) {
  const result = window.prompt(resolved ? '处置结果（将标记已解决）：' : '当前处置进展：', '')
  if (result === null) return
  blackout.handleHelp(event.value.id, id, me.value, now.value, result || '已到场处理', resolved)
  toast.ok(resolved ? '求助已闭环' : '已标记处置中')
}

const acMin = computed(() => blackout.acStoppedMin(event.value, now.value))
const acOver = computed(() => acMin.value >= event.value.acThresholdMin)
const earlyNote = ref('')
function assess(early: boolean) {
  blackout.assessEarlyClose(event.value.id, early, me.value, now.value, earlyNote.value || '按预案评估')
  earlyNote.value = ''
  toast.ok(early ? '已决定提前闭馆并通知预约读者' : '已记录：暂不提前闭馆')
}

function setNight(key: NightRecoverKey, state: 'ok' | 'abnormal') {
  const note = state === 'abnormal' ? window.prompt('异常情况说明：', '') || '异常待处理' : ''
  blackout.setNightItem(event.value.id, key, state, me.value, now.value, note)
  toast.ok(state === 'ok' ? '已逐项确认' : '已标记异常并升级处置')
}

function restore() {
  if (!window.confirm('确认市电已来电？系统将按停电前快照恢复设备并启动逐项自检。')) return
  blackout.restorePower(event.value.id, now.value, me.value)
  toast.ok('市电恢复，设备开始自检')
}
function selfTest(key: SelfTestKey, pass: boolean) {
  const note = pass ? '' : window.prompt('自检失败现象（将生成故障工单进入跨日交接）：', '') || '自检未通过'
  blackout.setSelfTest(event.value.id, key, pass, me.value, now.value, note)
  toast.ok(pass ? '自检通过' : '自检失败，已转故障工单')
}

const review = ref({ scope: '', helpSummary: '', responsibility: '', improvement: '', improvements: [] as string[] })
function addImprovement() {
  const t = review.value.improvement.trim()
  if (!t) return
  review.value.improvements.push(t)
  review.value.improvement = ''
}
function closeEvent() {
  const block = blackout.blockedCloseReasons(event.value)
  if (block.length) { toast.bad(`暂不能闭环：${block.join('；')}`); return }
  if (!review.value.scope.trim() || !review.value.responsibility.trim()) { toast.bad('请先填写影响范围与处置责任'); return }
  const r = blackout.saveReview(event.value.id, {
    by: me.value, at: now.value, scope: review.value.scope,
    helpSummary: review.value.helpSummary || `共接到读者求助 ${event.value.helps.length} 起，均已处置`,
    responsibility: review.value.responsibility, improvements: review.value.improvements
  })
  if (!r.ok) { toast.bad(r.error ?? '闭环失败'); return }
  toast.ok('停电应急处置已闭环，复盘已归档')
}

const phaseMeta = computed(() => {
  switch (event.value.phase) {
    case 'blackout': return { label: '停电处置中', cls: 'sev-high', icon: '⚡' }
    case 'urgent': return { label: '紧急事件处置中', cls: 'sev-urgent', icon: '⛔' }
    case 'recovered': return { label: '来电恢复自检中', cls: 'st-info', icon: '🔌' }
    case 'closed': return { label: '已闭环复盘', cls: 'st-ok', icon: '✅' }
    default: return { label: '应急处置', cls: 'sev-high', icon: '⚡' }
  }
})

const unresolvedEsc = computed(() => event.value.escalations.filter((e) => !e.resolved))
const pendingLoans = computed(() => event.value.pendingLoans.filter((l) => l.status === 'pending'))
const backfilledLoans = computed(() => event.value.pendingLoans.filter((l) => l.status === 'backfilled'))
const newHelps = computed(() => event.value.helps.filter((h) => h.status !== 'resolved'))
const closedReview = computed(() => event.value.phase === 'closed' ? event.value.review : undefined)

function openIncident() { if (event.value.incidentId) incidentViewer.open(event.value.incidentId) }
function openFault(id?: string) { if (id) faultViewer.open(id) }
</script>

<template>
  <div>
    <!-- 应急状态头 -->
    <div :class="['banner', event.phase === 'urgent' ? 'blackout' : 'danger']">
      <span style="font-size:24px">{{ phaseMeta.icon }}</span>
      <div>
        <div class="row" style="gap:8px">
          <b style="font-size:16px">{{ phaseMeta.label }}</b>
          <span class="tag" :class="phaseMeta.cls">{{ event.no }}</span>
          <span class="tag st-off">{{ event.community }}</span>
          <span v-if="event.night" class="tag st-info">🌙 夜间停电</span>
        </div>
        <div class="small mt8">
          {{ lib.name }} · 停电于 {{ fmtDateTime(event.startedAt) }} {{ fmtTime(event.startedAt) }} ·
          已持续 <b>{{ fmtDuration(event.startedAt, event.restoredAt ?? now) }}</b> ·
          当前在馆 <b>{{ totalActual }}</b> 人（系统记录 {{ totalSystem }}）
        </div>
      </div>
      <div class="spacer"></div>
      <div class="row">
        <button v-if="showBack" class="btn ghost sm" @click="emit('back')">↩ 返回列表</button>
        <RouterLink class="btn amber sm" to="/reader/emergency" target="_blank">👁️ 读者端视图</RouterLink>
        <button class="btn ghost sm" @click="openIncident">事件留痕</button>
        <button v-if="event.phase !== 'recovered' && event.phase !== 'closed' && !readOnly" class="btn sm" @click="restore">🔌 确认来电</button>
      </div>
    </div>

    <!-- 紧急升级横幅 -->
    <div v-if="unresolvedEsc.length" class="banner blackout">
      <span>⛔</span>
      <div>
        <b>紧急事件（{{ unresolvedEsc.length }}）：</b>
        <span v-for="e in unresolvedEsc" :key="e.reason" class="tag sev-urgent" style="margin-right:6px">{{ e.label }}</span>
        <div class="small">在紧急事件解除、街道值班与消防联系人同步前，闭馆巡检状态不允许完成。</div>
      </div>
    </div>

    <div class="grid grid-4 mb16">
      <div class="kpi" :class="{ alert: event.gateFailed }">
        <div class="k-ico">🚪</div>
        <div class="k-label">门禁</div>
        <div class="k-value" style="font-size:19px">{{ event.gateFailed ? '已失效' : 'UPS 维持' }}</div>
        <div class="small mt8" :class="event.gateFallback !== 'none' ? 'good-text' : 'bad-text'">
          {{ event.gateFallback === 'mechanical-key' ? '机械钥匙开门' : event.gateFallback === 'temp-open' ? '临时开门值守' : '待安保处置' }}
        </div>
      </div>
      <div class="kpi" :class="{ alert: unresolvedEsc.length }">
        <div class="k-ico">⛔</div>
        <div class="k-label">紧急事件</div>
        <div class="k-value">{{ unresolvedEsc.length }}</div>
        <div class="small muted mt8">已升级 {{ event.escalations.length }} 起</div>
      </div>
      <div class="kpi" :class="{ alert: pendingLoans.length }">
        <div class="k-ico">📝</div>
        <div class="k-label">借还暂存待补录</div>
        <div class="k-value">{{ pendingLoans.length }}<span class="k-unit">/{{ event.pendingLoans.length }}</span></div>
        <div class="small muted mt8">来电按操作时间+设备编号补录</div>
      </div>
      <div class="kpi night">
        <div class="k-ico">🌡️</div>
        <div class="k-label">空调/新风停运</div>
        <div class="k-value" style="font-size:22px">{{ acMin }}<span class="k-unit"> 分钟</span></div>
        <div class="small mt8" :style="acOver ? 'color:#ffd166' : 'color:#a9bdd4'">阈值 {{ event.acThresholdMin }} 分钟{{ acOver ? '·需评估闭馆' : '' }}</div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: 1.35fr 1fr">
      <div>
        <!-- 受影响范围矩阵 -->
        <div class="card">
          <div class="card-hd">
            <h3>🔦 受影响范围（逐项核验）</h3>
            <span class="sub">UPS 项应保持、市电项将停止；人工复核结果优先于自动判定</span>
          </div>
          <div class="card-bd flush">
            <table class="tbl">
              <thead><tr><th>核验项</th><th>供电</th><th>状态</th><th class="right">人工确认</th></tr></thead>
              <tbody>
                <tr v-for="im in event.impacts" :key="im.key" :style="im.state === 'confirmed-off' ? 'background:#fdf1f3' : ''">
                  <td>
                    <b>{{ im.label }}</b>
                    <div class="small muted">{{ im.detail }}</div>
                  </td>
                  <td><span class="tag" :class="im.expect === 'ups' ? 'st-info' : 'st-off'">{{ im.expect === 'ups' ? 'UPS/蓄电池' : '市电停止' }}</span></td>
                  <td>
                    <span class="tag" :class="impactStateMeta[im.state].cls">{{ impactStateMeta[im.state].label }}</span>
                    <div v-if="im.checkedBy" class="small muted mt8">{{ im.checkedBy }} · {{ fmtTime(im.checkedAt) }}</div>
                  </td>
                  <td class="right" v-if="!readOnly">
                    <template v-if="im.expect === 'ups'">
                      <button class="mini-btn" style="margin:2px" @click="setImpact(im.key, 'confirmed-on')">✔ 正常/点亮</button>
                      <button class="mini-btn on-abnormal" style="margin:2px" @click="setImpact(im.key, 'confirmed-off')">✗ 异常</button>
                    </template>
                    <template v-else>
                      <button class="mini-btn on-abnormal" style="margin:2px" @click="setImpact(im.key, 'affected')">已离线/停止</button>
                      <button class="mini-btn" style="margin:2px" @click="setImpact(im.key, 'ok')">仍可用</button>
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 在馆分区清点 -->
        <div class="card">
          <div class="card-hd"><h3>👥 当前在馆人数与所在区域</h3><span class="sub">分区清点，与系统在馆记录比对，防止漏人</span></div>
          <div class="card-bd flush">
            <table class="tbl">
              <thead><tr><th>区域</th><th>系统记录</th><th>现场清点</th><th>备注/操作</th></tr></thead>
              <tbody>
                <tr v-for="h in event.headcounts" :key="h.zone">
                  <td><b>{{ h.zone }}</b></td>
                  <td>{{ h.systemCount }} 人</td>
                  <td>
                    <span v-if="h.actualCount !== undefined" class="tag" :class="h.actualCount === h.systemCount ? 'st-ok' : 'st-warn'">{{ h.actualCount }} 人</span>
                    <span v-else class="tag st-off">未清点</span>
                    <div v-if="h.countedBy" class="small muted mt8">{{ h.countedBy }} · {{ fmtTime(h.countedAt) }}</div>
                  </td>
                  <td class="row" v-if="!readOnly">
                    <input class="input" style="width:74px" type="number" min="0" v-model.number="countInputs[h.zone]" :placeholder="String(h.systemCount)">
                    <input class="input" style="width:150px" v-model="countNotes[h.zone]" placeholder="备注（如多/少 1 人）">
                    <button class="mini-btn" @click="saveCount(h.zone)">清点</button>
                  </td>
                  <td v-else class="small muted">{{ h.note || '—' }}</td>
                </tr>
                <tr v-if="!event.headcounts.length"><td colspan="4" class="empty">停电时在馆人数为 0</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 右栏 -->
      <div>
        <div class="card">
          <div class="card-hd"><h3>🚪 门禁失效应急联动</h3></div>
          <div class="card-bd">
            <div class="small" style="line-height:1.9">
              <div>● 安保到场通知：
                <b :class="event.gateNotifiedSecurityAt ? 'good-text' : 'bad-text'">{{ event.gateNotifiedSecurityAt ? '已推送 ' + fmtTime(event.gateNotifiedSecurityAt) : '未通知' }}</b>
              </div>
              <div>● 机械钥匙：{{ lib.mechanicalKeyLocation }}（保管人：{{ lib.mechanicalKeyHolder }}）</div>
              <div>● 集合点：<b>{{ lib.assemblyPoint }}</b></div>
              <div class="mt8" v-for="r in lib.evacuationRoutes" :key="r.zone">
                <span class="tag st-info">{{ r.zone }}</span> <span class="muted">{{ r.route }}</span>
              </div>
            </div>
            <div class="row mt12" v-if="event.gateFailed && !readOnly">
              <button class="btn ghost sm" @click="securityArrived">🚶 安保到场</button>
              <select class="input" style="width:auto" v-model="gateMode">
                <option value="mechanical-key">启用机械钥匙</option>
                <option value="temp-open">临时开门（只出不进）</option>
              </select>
              <input class="input" style="flex:1;min-width:140px" v-model="gateNote" placeholder="钥匙编号/值守安排">
              <button class="btn amber sm" @click="applyGateFallback">执行</button>
            </div>
            <div v-if="event.gateFallback !== 'none'" class="small good-text mt12">
              ✔ {{ event.gateFallback === 'mechanical-key' ? '机械钥匙已启用' : '临时开门已执行' }}（{{ event.gateFallbackBy }} · {{ fmtTime(event.gateFallbackAt) }}）{{ event.gateFallbackNote }}
            </div>
            <div class="small muted mt12">读者端已展示疏散路线与集合点，疏散<b>不能只依赖扫码出门</b>。<RouterLink to="/reader/emergency" target="_blank">打开读者端 →</RouterLink></div>
          </div>
        </div>

        <div class="card">
          <div class="card-hd"><h3>⛔ 紧急事件升级与上报</h3><span class="sub">命中任一条件即转紧急事件</span></div>
          <div class="card-bd">
            <div class="row" v-if="!readOnly">
              <button v-for="u in urgentMeta" :key="u.key" class="mini-btn on-abnormal" @click="escalate(u.key)">
                {{ u.icon }} {{ u.label }}
              </button>
            </div>
            <div v-for="esc in event.escalations" :key="esc.reason" class="check-item abnormal mt8">
              <span class="check-ico">{{ esc.resolved ? '✅' : '🚨' }}</span>
              <div>
                <b>{{ esc.label }}</b>
                <div class="small mt8">{{ esc.detail }}</div>
                <div class="small mt8">
                  <span class="tag" :class="esc.streetNotified ? 'st-ok' : 'st-bad'">街道 {{ esc.streetNotified ? '已同步' : '未同步' }}</span>
                  <span class="tag" :class="esc.fireNotified ? 'st-ok' : 'st-bad'" style="margin-left:4px">消防 {{ esc.fireNotified ? '已联系' : '未联系' }}</span>
                </div>
              </div>
              <div class="check-state" v-if="!esc.resolved && !readOnly">
                <button class="mini-btn on-normal" @click="resolveEsc(esc.reason)">确认解除</button>
              </div>
            </div>
            <div class="row mt12">
              <button class="btn urgent sm" :disabled="event.streetNotified || readOnly" @click="notifyStreet">
                🏙️ 同步街道值班{{ event.streetNotified ? '（' + fmtTime(event.streetNotifiedAt) + '）' : '' }}
              </button>
              <button class="btn danger sm" :disabled="event.fireNotified || readOnly" @click="notifyFire">
                📞 联系消防{{ event.fireNotified ? '（' + fmtTime(event.fireNotifiedAt) + '）' : '' }}
              </button>
            </div>
            <div class="small muted mt8">街道：{{ lib.streetDutyPhone }} ｜ 消防：{{ lib.fireContactPhone }} ｜ 调度：{{ lib.securityDispatchPhone }}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-hd"><h3>🌡️ 空调停运与提前闭馆评估</h3></div>
          <div class="card-bd">
            <div :class="acOver ? 'banner danger' : ''" style="margin-bottom:10px">
              <div class="small">空调/新风已停运 <b>{{ acMin }}</b> 分钟，阈值 {{ event.acThresholdMin }} 分钟。
                <span v-if="acOver" class="bad-text"><b>超过阈值：管理员须评估是否提前闭馆并通知已预约读者。</b></span>
              </div>
            </div>
            <input class="input mb8" v-model="earlyNote" placeholder="评估说明（温度、通风、读者状况）" :disabled="readOnly">
            <div class="row" v-if="!readOnly">
              <button class="btn danger sm" :disabled="event.earlyClose" @click="assess(true)">提前闭馆并通知预约读者</button>
              <button class="btn ghost sm" @click="assess(false)">维持开放继续观察</button>
            </div>
            <div v-if="event.earlyCloseAssessed" class="small mt8">
              <span :class="event.earlyClose ? 'tag st-bad' : 'tag st-ok'">{{ event.earlyClose ? `已提前闭馆（通知 ${event.reservationNotifiedCount ?? 0} 名预约读者）` : '已评估暂不闭馆' }}</span>
              <span class="muted"> · {{ event.earlyCloseBy }} · {{ fmtTime(event.earlyCloseAt) }}</span>
            </div>
            <div class="small muted mt8">饮水机、打印设备停止服务公告已实时同步读者端。</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 借还暂存与补录 -->
    <div class="card">
      <div class="card-hd">
        <h3>📝 停电期间借还暂存（本地登记，来电补录）</h3>
        <span class="sub">按读者实际操作时间与设备编号补入系统，停电期间不计逾期、不作借阅失败</span>
        <div class="spacer"></div>
        <button v-if="event.phase === 'recovered' && pendingLoans.length && !readOnly" class="btn amber sm" @click="backfillAll">⚡ 一键按时间顺序全部补录（{{ pendingLoans.length }}）</button>
      </div>
      <div class="card-bd">
        <div class="grid grid-4" v-if="!readOnly">
          <label class="field" style="margin:0">读者姓名<input class="input" v-model="loanForm.readerName" placeholder="如 张明"></label>
          <label class="field" style="margin:0">图书条码<input class="input" v-model="loanForm.bookBarcode" placeholder="如 9787020008735"></label>
          <label class="field" style="margin:0">书名<input class="input" v-model="loanForm.bookTitle" placeholder="选填，默认取条码"></label>
          <label class="field" style="margin:0">类型
            <select class="input" v-model="loanForm.kind"><option value="borrow">借出</option><option value="return">归还</option></select>
          </label>
          <label class="field" style="margin:0">发生设备
            <select class="input" v-model="loanForm.deviceId">
              <option v-for="d in kioskDevices" :key="d.id" :value="d.id">{{ d.name }}（{{ d.id }}）</option>
            </select>
          </label>
          <label class="field" style="margin:0">所在区域<input class="input" v-model="loanForm.zone"></label>
          <label class="field" style="margin:0;grid-column:span 2">备注<input class="input" v-model="loanForm.note" placeholder="如：读者承诺来电后取凭证"></label>
        </div>
        <div class="mt8" v-if="!readOnly"><button class="btn sm" @click="addLoan">＋ 暂存这笔借还（操作时间 {{ fmtTime(now) }}）</button></div>
      </div>
      <div class="card-bd flush">
        <table class="tbl">
          <thead><tr><th>操作时间</th><th>读者</th><th>类型</th><th>图书/条码</th><th>设备编号</th><th>经办</th><th>状态</th><th class="right">补录</th></tr></thead>
          <tbody>
            <tr v-for="l in event.pendingLoans" :key="l.id">
              <td class="nowrap">{{ fmtDateTime(l.opAt) }} {{ fmtTime(l.opAt) }}</td>
              <td>{{ l.readerName }}</td>
              <td><span :class="l.kind === 'borrow' ? 'tag st-warn' : 'tag st-info'">{{ l.kind === 'borrow' ? '借出' : '归还' }}</span></td>
              <td class="small">{{ l.bookTitle }}<div class="muted">{{ l.bookBarcode }}</div></td>
              <td class="small">{{ l.deviceName }}<div class="muted">{{ l.deviceId }}</div></td>
              <td class="small">{{ l.operator }}</td>
              <td>
                <span v-if="l.status === 'backfilled'" class="tag st-ok">已补录 {{ fmtTime(l.backfilledAt) }}</span>
                <span v-else class="tag st-bad">待补录</span>
              </td>
              <td class="right">
                <button v-if="l.status === 'pending' && event.phase === 'recovered' && !readOnly" class="mini-btn" @click="backfillOne(l.id)">按操作时间补录</button>
                <span v-else-if="l.status === 'pending'" class="small muted">来电后可补录</span>
              </td>
            </tr>
            <tr v-if="!event.pendingLoans.length"><td colspan="8" class="empty">暂无暂存借还</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 读者求助 -->
    <div class="card">
      <div class="card-hd"><h3>🆘 停电期间读者求助</h3><span class="sub">含读者端应急页提交；“被困”自动升级紧急事件</span>
        <span v-if="newHelps.length" class="tag st-bad">{{ newHelps.length }} 待处置</span>
      </div>
      <div class="card-bd flush">
        <table class="tbl">
          <thead><tr><th>时间</th><th>读者</th><th>类型/区域</th><th>内容</th><th>状态</th><th class="right">操作</th></tr></thead>
          <tbody>
            <tr v-for="h in event.helps" :key="h.id">
              <td class="nowrap">{{ fmtTime(h.at) }}</td>
              <td>{{ h.readerName }}</td>
              <td class="small">{{ helpKindMeta[h.kind] }}<div class="muted">{{ h.zone }}</div></td>
              <td class="small">{{ h.content }}</td>
              <td class="small">
                <span :class="h.status === 'resolved' ? 'tag st-ok' : h.status === 'handling' ? 'tag st-warn' : 'tag st-bad'">
                  {{ h.status === 'resolved' ? '已解决' : h.status === 'handling' ? '处置中' : '新求助' }}
                </span>
                <div v-if="h.result" class="muted mt8">{{ h.result }}</div>
              </td>
              <td class="right" v-if="!readOnly">
                <button class="mini-btn" @click="handleHelp(h.id, false)">处置中</button>
                <button class="mini-btn on-normal" style="margin-left:4px" @click="handleHelp(h.id, true)">已解决</button>
              </td>
            </tr>
            <tr v-if="!event.helps.length"><td colspan="6" class="empty">暂无读者求助</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 夜间来电恢复六项 -->
    <div class="card" v-if="event.night">
      <div class="card-hd"><h3>🌙 夜间停电恢复逐项确认</h3>
        <span class="sub">管理员和安保逐项确认，未全部确认前不得标记闭馆完成</span>
      </div>
      <div class="card-bd">
        <div v-for="item in event.nightItems" :key="item.key" class="check-item" :class="{ abnormal: item.state === 'abnormal', done: item.state === 'ok' }">
          <span class="check-ico">{{ item.state === 'ok' ? '✅' : item.state === 'abnormal' ? '⚠️' : '⬜' }}</span>
          <div>
            <div style="font-weight:600">{{ item.label }}</div>
            <div class="small muted mt8" v-if="item.confirmedBy">{{ item.confirmedBy }} · {{ fmtTime(item.confirmedAt) }}<template v-if="item.note">：{{ item.note }}</template></div>
          </div>
          <div class="check-state" v-if="!readOnly">
            <button class="mini-btn on-normal" @click="setNight(item.key, 'ok')">确认</button>
            <button class="mini-btn on-abnormal" @click="setNight(item.key, 'abnormal')">异常</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 来电自检 -->
    <div class="card" v-if="event.phase === 'recovered'">
      <div class="card-hd"><h3>🔧 来电设备自检与跨日交接</h3>
        <span class="sub">图书消磁、还书箱、自助机状态重新核验；自检失败设备生成故障工单进入跨日交接</span>
      </div>
      <div class="card-bd flush">
        <table class="tbl">
          <thead><tr><th>自检项</th><th>结果</th><th>检查人/时间</th><th class="right">操作</th></tr></thead>
          <tbody>
            <tr v-for="t in event.selfTests" :key="t.key">
              <td><b>{{ t.label }}</b><div v-if="t.faultId" class="small bad-text">已生成跨日故障工单</div></td>
              <td>
                <span v-if="t.state === 'pass'" class="tag st-ok">通过</span>
                <span v-else-if="t.state === 'fail'" class="tag st-bad">失败</span>
                <span v-else class="tag st-off">待自检</span>
                <div v-if="t.note" class="small muted mt8">{{ t.note }}</div>
              </td>
              <td class="small muted">{{ t.checkedBy ? `${t.checkedBy} · ${fmtTime(t.checkedAt)}` : '—' }}</td>
              <td class="right" v-if="!readOnly">
                <button class="mini-btn on-normal" :disabled="t.state !== 'pending'" @click="selfTest(t.key, true)">通过</button>
                <button class="mini-btn on-abnormal" style="margin-left:4px" :disabled="t.state !== 'pending'" @click="selfTest(t.key, false)">失败建单</button>
                <button v-if="t.faultId" class="mini-btn" style="margin-left:4px" @click="openFault(t.faultId)">工单</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 处置时间线 -->
    <div class="card">
      <div class="card-hd"><h3>🕓 处置进展时间线</h3><span class="sub">同步给街道值班；共 {{ event.logs.length }} 条</span></div>
      <div class="card-bd">
        <div class="timeline">
          <div v-for="(l, i) in event.logs" :key="i" class="tl-item" :class="{ sys: l.role === 'system' }">
            <div>
              <span class="tl-who">{{ l.actor }}</span>
              <span class="tag" style="margin-left:6px">{{ l.role === 'system' ? '系统' : l.role === 'street' ? '街道值班' : roleNames[l.role] }}</span>
              <span class="tl-time">{{ fmtDateTime(l.at) }} {{ fmtTime(l.at) }}</span>
            </div>
            <div class="tl-text">{{ l.text }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 复盘闭环 -->
    <div class="card" v-if="event.phase === 'recovered'">
      <div class="card-hd"><h3>📋 停电复盘与闭环</h3><span class="sub">记录停电时间、影响范围、读者求助、处置责任和改进项</span></div>
      <div class="card-bd">
        <div class="grid grid-2">
          <label class="field">影响范围（停电小区/书房/设备/人数）
            <textarea class="input" rows="2" v-model="review.scope" :disabled="readOnly" placeholder="如：湖滨片区中山线停电，中山中路书房全馆市电中断，在馆 4 人……"></textarea>
          </label>
          <label class="field">读者求助汇总
            <textarea class="input" rows="2" v-model="review.helpSummary" :disabled="readOnly" :placeholder="`共 ${event.helps.length} 起求助及处置结果`"></textarea>
          </label>
          <label class="field">处置责任（安保/管理员/维护/街道）
            <textarea class="input" rows="2" v-model="review.responsibility" :disabled="readOnly" placeholder="如：安保李安保到场放行，管理员王管统筹，赵工自检……"></textarea>
          </label>
          <div class="field">改进项
            <div class="row">
              <input class="input" v-model="review.improvement" placeholder="如：增配阅览室应急灯、月度切换演练" :disabled="readOnly" @keyup.enter="addImprovement">
              <button class="btn ghost sm" @click="addImprovement" :disabled="readOnly">添加</button>
            </div>
            <div class="mt8">
              <span v-for="(im, i) in review.improvements" :key="i" class="tag st-warn" style="margin:2px">{{ im }} ✕</span>
            </div>
          </div>
        </div>

        <div class="mt12 card" style="box-shadow:none" :style="blackout.blockedCloseReasons(event).length ? 'background:#fdf4f6;border-color:#eabcc5' : 'background:#f3faf7;border-color:#bfe2d8'">
          <div class="card-bd small">
            <b>闭环前置条件：</b>
            <ul style="padding-left:18px;margin-top:4px;line-height:1.9">
              <li :class="!unresolvedEsc.length ? 'good-text' : 'bad-text'">{{ !unresolvedEsc.length ? '✔' : '✗' }} 紧急事件全部解除（{{ unresolvedEsc.length }} 起未解除）</li>
              <li v-if="event.escalations.length" :class="event.streetNotified ? 'good-text' : 'bad-text'">{{ event.streetNotified ? '✔' : '✗' }} 已同步街道值班</li>
              <li v-if="event.escalations.length" :class="event.fireNotified ? 'good-text' : 'bad-text'">{{ event.fireNotified ? '✔' : '✗' }} 已联系消防联系人</li>
              <li :class="(!event.night || blackout.nightAllConfirmed(event)) ? 'good-text' : 'bad-text'">{{ (!event.night || blackout.nightAllConfirmed(event)) ? '✔' : '✗' }} 夜间恢复六项逐项确认（{{ event.nightItems.filter(i => i.state === 'ok').length }}/{{ event.nightItems.length }}）</li>
              <li :class="event.selfTests.every(t => t.state !== 'pending') ? 'good-text' : 'bad-text'">{{ event.selfTests.every(t => t.state !== 'pending') ? '✔' : '✗' }} 来电设备自检全部完成（{{ event.selfTests.filter(t => t.state !== 'pending').length }}/{{ event.selfTests.length }}）</li>
              <li :class="!pendingLoans.length ? 'good-text' : 'bad-text'">{{ !pendingLoans.length ? '✔' : '✗' }} 暂存借还全部补录（{{ pendingLoans.length }} 笔待补）</li>
            </ul>
          </div>
        </div>

        <div class="row mt12" v-if="!readOnly">
          <button class="btn amber" @click="closeEvent">✅ 完成复盘并闭环（故障设备已进入跨日交接）</button>
          <span class="small muted">已补录 {{ backfilledLoans.length }} 笔 · 跨日故障工单 {{ event.carriedFaultIds.length }} 起</span>
        </div>
      </div>
    </div>

    <!-- 已闭环复盘摘要 -->
    <div class="card" v-if="closedReview">
      <div class="card-hd"><h3>✅ 复盘已归档（{{ event.no }}）</h3></div>
      <div class="card-bd small" style="line-height:2">
        <div>● 停电时长：<b>{{ closedReview.durationMin ?? '—' }}</b> 分钟（{{ fmtDateTime(closedReview.outageStart) }} → {{ fmtDateTime(closedReview.outageEnd) }}）</div>
        <div>● 影响范围：{{ closedReview.scope }}</div>
        <div>● 读者求助：{{ closedReview.helpSummary }}</div>
        <div>● 处置责任：{{ closedReview.responsibility }}</div>
        <div>● 改进项：
          <template v-if="closedReview.improvements.length">
            <span v-for="(im, i) in closedReview.improvements" :key="i" class="tag st-warn" style="margin:2px">{{ im }}</span>
          </template>
          <span v-else class="muted">无</span>
        </div>
      </div>
    </div>
  </div>
</template>
