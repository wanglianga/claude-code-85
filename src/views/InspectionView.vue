<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { useInspectionStore } from '@/stores/inspection'
import { useIncidentStore } from '@/stores/incident'
import { useBranchStore } from '@/stores/branch'
import { useAuthStore } from '@/stores/auth'
import { fmtCountdown, fmtDateTime, fmtTime } from '@/utils/format'
import { incidentTypeMeta, severityMeta } from '@/data/meta'
import { useIncidentViewer } from '@/composables/useIncidentViewer'
import { useArchiveViewer } from '@/composables/useArchiveViewer'
import { useStrandedViewer } from '@/composables/useStrandedViewer'
import { useStrandedStore } from '@/stores/stranded'
import { useToast } from '@/composables/useToast'
import type { CheckItem, CheckState, Incident, Visit } from '@/types'

const system = useSystemStore()
const inspStore = useInspectionStore()
const incStore = useIncidentStore()
const branch = useBranchStore()
const auth = useAuthStore()
const toast = useToast()
const { now } = storeToRefs(system)
const incidentViewer = useIncidentViewer()
const archiveViewer = useArchiveViewer()
const strandedViewer = useStrandedViewer()
const strandedStore = useStrandedStore()

const lib = computed(() => system.currentLibrary)
/** 当前营业日巡检单（次日开馆后为新日期的新单，绝不是旧单“进行中”） */
const insp = computed(() => inspStore.current(lib.value.id))
const prog = computed(() => inspStore.progress(insp.value))
const archiveList = computed(() => inspStore.archives(lib.value.id))

const activeVisits = computed(() => branch.activeVisits(lib.value.id))
/** 闭馆后发现、尚未闭环的夜间滞留 */
const pendingStranded = computed(() => strandedStore.unresolved(lib.value.id))
/** 本夜已闭环的滞留处置（随档案留存，次日可查） */
const handledStranded = computed(() =>
  strandedStore.strandedVisits(lib.value.id).filter((v) => v.strandedHandling!.status === 'left')
)
const strandedVisits = computed(() => strandedStore.strandedVisits(lib.value.id))

/** 闭馆后一键扫描：把仍在馆的读者全部登记为夜间滞留 */
function scanStranded() {
  const here = activeVisits.value
  if (!here.length) {
    toast.ok('扫描完成：在馆人员已清零')
    return
  }
  for (const v of here) {
    strandedStore.discover({ visitId: v.id, at: now.value })
  }
  toast.bad(`扫描发现 ${here.length} 名读者闭馆后未离馆，已生成夜间滞留处置单`)
}

function openStranded(v: Visit) {
  strandedViewer.open(v.id)
}

const handoverItems = computed(() => insp.value.items.filter((i) => i.scope === 'handover'))
const unmannedItems = computed(() => insp.value.items.filter((i) => i.scope === 'unmanned'))

const remarking = ref<CheckItem | null>(null)
const remarkText = ref('')
const afterClose = ref(false)
const finishNote = ref('')

function startInspection() {
  inspStore.start(insp.value, now.value)
  system.setLibraryStatus(lib.value.id, 'closing')
  toast.ok('闭馆巡检已开始，书房进入“闭馆准备”状态')
}

function setCheck(item: CheckItem, state: CheckState) {
  if (insp.value.frozen) return
  if (state === 'abnormal') {
    remarking.value = item
    remarkText.value = item.remark ?? ''
    return
  }
  inspStore.setItem(insp.value, item.key, state, auth.account?.name ?? '', now.value, lib.value.id)
  if (state === 'normal') toast.ok(`「${item.label.slice(0, 12)}…」确认正常`)
  syncDevices(item.key, state)
}

function confirmAbnormal() {
  if (!remarking.value) return
  const item = remarking.value
  inspStore.setItem(
    insp.value, item.key, 'abnormal',
    auth.account?.name ?? '', now.value, lib.value.id,
    remarkText.value || '巡检异常'
  )
  toast.bad(`「${item.label.slice(0, 12)}…」标记异常，已自动创建协同事件`)
  const created = item.incidentId ? incStore.incidents.find((i) => i.id === item.incidentId) : null
  if (created) incidentViewer.show(created)
  remarking.value = null
  remarkText.value = ''
  syncDevices(item.key, 'abnormal')
}

/** 巡检操作与设备状态联动 */
function syncDevices(key: string, state: CheckState) {
  const devs = branch.devicesOf(lib.value.id)
  if (state === 'abnormal') {
    if (key === 'light') devs.filter((d) => d.type === 'light').forEach((d) => branch.setDeviceStatus(d.id, 'alarm', '巡检发现照明未关'))
    if (key === 'ac') devs.filter((d) => d.type === 'ac').forEach((d) => branch.setDeviceStatus(d.id, 'alarm', '巡检发现空调未关'))
    return
  }
  if (state !== 'normal') return
  if (key === 'ac') devs.filter((d) => d.type === 'ac').forEach((d) => branch.setDeviceStatus(d.id, 'off', '闭馆巡检关闭'))
  if (key === 'light') devs.filter((d) => d.type === 'light').forEach((d) => branch.setDeviceStatus(d.id, 'off', '闭馆巡检关闭（应急照明保留）'))
  if (key === 'kiosk') devs.filter((d) => d.type === 'selfkiosk' && d.status !== 'fault').forEach((d) => branch.setDeviceStatus(d.id, 'off', '闭馆待机'))
  if (key === 'returnbox') devs.filter((d) => d.type === 'returnbox').forEach((d) => branch.setDeviceStatus(d.id, d.level && d.level >= 90 ? 'full' : 'normal'))
  if (key === 'gate') devs.filter((d) => d.type === 'gate' && d.status !== 'fault' && d.status !== 'alarm').forEach((d) => branch.setDeviceStatus(d.id, 'normal', '夜间布防'))
}

function evacuate(visitId: string, name: string) {
  const visit = branch.visits.find((v) => v.id === visitId)
  const reader = visit ? branch.readers.find((r) => r.id === visit.readerId) : null
  branch.checkOut(visitId, now.value)
  if (reader) branch.adjustCredit(reader, -5, '闭馆清场滞留（经提醒后离馆）', now.value)
  toast.ok(`${name} 已清场离馆并记录`)
}

function createStrandedIncident(visitId: string) {
  const v = branch.visits.find((x) => x.id === visitId)
  if (!v) return
  if (!v.strandedHandling) strandedStore.discover({ visitId, at: now.value })
  strandedViewer.open(visitId)
}

// 签字
const signatureNames: Record<string, string> = {
  people: '安保（人员清场）', books: '管理员（图书台账）', devices: '设备维护（设备关闭/工单）', safety: '安保（公共安全/技防布防）'
}
function doSign(domain: 'people' | 'books' | 'devices' | 'safety') {
  inspStore.sign(insp.value, domain, `${auth.account?.name} 代${signatureNames[domain]}`)
  toast.ok(`${signatureNames[domain]} 已签字交接`)
}

function toggleAfterClose(v: boolean) {
  afterClose.value = v
  inspStore.setAfterCloseCheck(insp.value, v)
  if (v) toast.ok('闭馆 30 分钟后复核：灯光/空调均已关闭')
}

function finishHandover() {
  const reasons = inspStore.blockedReasons(insp.value)
  if (reasons.length) {
    toast.bad(`不能完成交接：${reasons.join('；')}`)
    return
  }
  const snapshot = inspStore.finish(insp.value, now.value, auth.account?.name ?? '', lib.value.id, finishNote.value)
  if (!snapshot) {
    toast.bad('交接条件未满足')
    return
  }
  system.setLibraryStatus(lib.value.id, 'closed')
  finishNote.value = ''
  afterClose.value = false
  toast.ok(`✅ ${insp.value.date} 夜间交接档案已固化：人员、图书、设备、公共安全完成交接；${snapshot.strandedVisitIds.length} 条滞留处置已归档，${snapshot.carryIncidentIds.length} 件未结事件随档案移交次日督办`)
  archiveViewer.open(insp.value.id)
}

/** 次日开馆：切换到新营业日；对旧档案零改写；重复点击幂等 */
function openNextDay() {
  const result = inspStore.openNextDay(lib.value.id)
  if (!result.switched) {
    toast.info(`已是营业日 ${result.newDate}，开馆操作不重复执行（前夜档案与遗留通知保持不变）`)
    if (result.archive) archiveViewer.open(result.archive.id)
    return
  }
  afterClose.value = false
  toast.ok(`🌅 ${result.newDate} 开馆：前夜交接档案保持只读，${result.carryCount} 件遗留待办继续督办（可回链档案）`)
  if (result.archive) archiveViewer.open(result.archive.id)
}

function resetInspection() {
  if (insp.value.frozen) {
    toast.bad('已固化档案不可重置')
    return
  }
  if (window.confirm('重置当前营业日巡检单？（不影响已创建事件与历史档案）')) {
    inspStore.resetCurrent(lib.value.id)
    afterClose.value = false
  }
}

const openIncidents = computed(() =>
  incStore.ofLibrary(lib.value.id).filter((i) => i.status !== 'closed')
)
const itemIncident = (item: CheckItem): Incident | null =>
  item.incidentId ? incStore.incidents.find((i) => i.id === item.incidentId) ?? null : null

function openItemIncident(item: CheckItem) {
  const inc = itemIncident(item)
  if (inc) incidentViewer.show(inc)
}
</script>

<template>
  <div>
    <!-- 顶部状态 -->
    <div :class="['banner', system.isNight ? 'night' : 'warn']">
      <span style="font-size:22px">{{ system.isNight ? '🌙' : '⏰' }}</span>
      <div>
        <b>{{ lib.name }} · 营业日 {{ inspStore.currentDate(lib.id) }} · {{ system.isNight ? '夜间闭馆/无人值守时段' : '闭馆倒计时' }}</b>
        <div class="countdown" :class="{ over: system.isNight }" style="font-size:18px; margin-top:2px">
          {{ fmtCountdown(system.msToClose) }}
        </div>
      </div>
      <div class="spacer"></div>
      <div class="metric-strip" style="color:inherit">
        <span><b style="color:inherit">{{ activeVisits.length }}</b> 人未清场</span>
        <span><b style="color:inherit">{{ prog.done }}/{{ prog.total }}</b> 巡检项</span>
        <span><b style="color:inherit">{{ prog.abnormal }}</b> 异常</span>
        <span><b style="color:inherit">{{ openIncidents.length }}</b> 未结事件</span>
      </div>
    </div>

    <div v-if="system.blackout" class="banner danger">
      <span>⚡</span>
      <div><b>停电期间巡检：</b>先完成人员疏散与清点（UPS 仅保障应急照明/技防），供电恢复后补检设备项；必要时提前闭馆并上报街道。</div>
    </div>

    <!-- 历史交接档案条 -->
    <div class="card" v-if="archiveList.length">
      <div class="card-hd">
        <h3>📜 夜间交接档案</h3>
        <span class="sub">已固化、永久只读，可供管理员/安保/设备维护/街道追溯</span>
      </div>
      <div class="card-bd flush">
        <table class="tbl">
          <thead><tr><th>营业日</th><th>完成时间</th><th>12 项结果</th><th>四方签字</th><th>灯光空调复核</th><th>移交遗留</th><th class="right">操作</th></tr></thead>
          <tbody>
            <tr v-for="a in archiveList" :key="a.id" class="clickable" @click="archiveViewer.open(a.id)">
              <td><b>{{ a.date }}</b><div class="small muted">{{ a.archive?.closedBy }}</div></td>
              <td class="small nowrap">{{ fmtDateTime(a.archive!.finishedAt) }} {{ fmtTime(a.archive!.finishedAt) }}</td>
              <td class="small">
                <span class="tag st-ok">正常 {{ a.items.filter(i => i.state === 'normal' || i.state === 'na').length }}</span>
                <span class="tag st-bad" v-if="a.items.some(i => i.state === 'abnormal')">异常 {{ a.items.filter(i => i.state === 'abnormal').length }}</span>
              </td>
              <td class="small">
                <span :class="a.archive!.signatures.people ? 'good-text' : 'bad-text'">人员●</span>
                <span :class="a.archive!.signatures.books ? 'good-text' : 'bad-text'">图书●</span>
                <span :class="a.archive!.signatures.devices ? 'good-text' : 'bad-text'">设备●</span>
                <span :class="a.archive!.signatures.safety ? 'good-text' : 'bad-text'">安全●</span>
              </td>
              <td><span class="tag" :class="a.archive!.afterCloseCheck ? 'st-ok' : 'st-bad'">{{ a.archive!.afterCloseCheck ? '已复核' : '未复核' }}</span></td>
              <td class="small">
                <span class="tag" :class="incStore.openCarryOfArchive(a.id).length ? 'sev-high' : 'st-ok'">
                  未闭环 {{ incStore.openCarryOfArchive(a.id).length }}
                </span>
              </td>
              <td class="right"><button class="mini-btn" @click.stop="archiveViewer.open(a.id)">📜 查看档案</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 巡检操作条 -->
    <div class="card">
      <div class="card-bd row">
        <template v-if="insp.frozen">
          <span class="tag st-ok">🔒 {{ insp.date }} 交接档案已固化</span>
          <span class="small muted">完成于 {{ fmtDateTime(insp.archive!.finishedAt) }} {{ fmtTime(insp.archive!.finishedAt) }}，结果只读，开馆不会改写本档案。</span>
          <div class="spacer"></div>
          <button class="btn ghost sm" @click="archiveViewer.open(insp.id)">📜 查看本档案</button>
          <button class="btn amber" @click="openNextDay">🌅 次日开馆（进入新营业日）</button>
        </template>
        <template v-else-if="!insp.startedAt">
          <button class="btn amber" @click="startInspection">🌙 开始 {{ insp.date }} 闭馆巡检（书房转入闭馆准备）</button>
          <span class="small muted">建议闭馆前 30 分钟开始；可在总览用“演示控制”快速跳到该时间点。</span>
        </template>
        <template v-else>
          <span class="tag st-warn">巡检进行中（营业日 {{ insp.date }}）</span>
          <span class="small muted">开始于 {{ fmtDateTime(insp.startedAt) }} {{ fmtTime(insp.startedAt) }}</span>
          <div class="spacer"></div>
          <button class="btn ghost sm" @click="resetInspection">重置当前巡检单</button>
          <button class="btn" @click="finishHandover">✅ 完成闭馆交接并固化档案</button>
        </template>
        <button v-if="!insp.frozen" class="btn amber sm" @click="openNextDay">🌅 次日开馆（新营业日，不改前夜档案）</button>
      </div>
      <div class="card-bd" style="padding-top:0">
        <div class="progress" style="height:10px">
          <div :class="prog.abnormal ? 'warn' : 'good'" :style="{ width: (prog.done / prog.total) * 100 + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 人员清场 -->
    <div class="card">
      <div class="card-hd">
        <h3>🧍 人员清场（人员交接的前提）</h3>
        <span class="sub">逐一核查阅览区、卫生间、书架间、亲子区</span>
        <div class="spacer"></div>
        <button class="btn danger sm" @click="scanStranded">📡 闭馆后滞留扫描（比对门禁出闸记录）</button>
      </div>
      <div class="card-bd flush">
        <table class="tbl">
          <thead><tr><th>读者</th><th>座位/区域</th><th>入馆时间</th><th>类型</th><th class="right">处置</th></tr></thead>
          <tbody>
            <tr v-for="v in activeVisits" :key="v.id">
              <td>{{ v.readerName }}<span v-if="v.isChild" class="tag st-info" style="margin-left:4px">儿童·须联系监护人</span></td>
              <td>{{ v.seatNo }}</td>
              <td class="nowrap">{{ fmtTime(v.enterAt) }}</td>
              <td><span v-if="v.stranded" class="tag st-bad">滞留</span><span v-else class="tag st-ok">在馆</span></td>
              <td class="right row" style="justify-content:flex-end">
                <button class="mini-btn" @click="evacuate(v.id, v.readerName)">提醒并签离</button>
                <button class="mini-btn" style="border-color:#e6aab3;color:var(--bad)" @click="createStrandedIncident(v.id)">夜间滞留→处置单</button>
              </td>
            </tr>
            <tr v-if="!activeVisits.length"><td colspan="5" class="empty">✅ 在馆人员已清零（历史滞留记录：{{ strandedVisits.length }} 条，见下方处置面板）</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 夜间滞留处置 -->
    <div class="card" :class="{ }" v-if="pendingStranded.length || handledStranded.length">
      <div class="card-hd">
        <h3>🌙 夜间滞留处置</h3>
        <span class="sub">展示身份、区域、门禁记录与安保位置；劝离/延时/报警决策后才可完成交接；未成年人先联系监护人</span>
      </div>
      <div class="card-bd flush">
        <table class="tbl">
          <thead><tr><th>读者</th><th>发现区域/时间</th><th>安保</th><th>决策</th><th>监护人</th><th>最终离馆</th><th class="right">操作</th></tr></thead>
          <tbody>
            <tr v-for="v in strandedVisits" :key="v.id" :style="v.strandedHandling!.status !== 'left' ? 'background:#fff8f9' : ''">
              <td>
                <b>{{ v.readerName }}</b>
                <span v-if="v.isChild" class="tag st-info" style="margin-left:4px">未成年</span>
              </td>
              <td class="small">{{ v.strandedHandling!.zone }}<div class="muted">{{ fmtDateTime(v.strandedHandling!.discoveredAt) }} {{ fmtTime(v.strandedHandling!.discoveredAt) }}</div></td>
              <td class="small">
                <template v-if="v.strandedHandling!.arrivedAt">
                  <span class="tag st-ok">已到场</span> {{ v.strandedHandling!.securityName }}
                </template>
                <template v-else-if="v.strandedHandling!.dispatchedAt">
                  <span class="tag st-warn">出动中</span> {{ v.strandedHandling!.securityPost }}
                </template>
                <template v-else><span class="tag st-bad">未派出</span></template>
              </td>
              <td class="small">
                <span v-if="v.strandedHandling!.decision === 'persuade-leave'" class="tag st-ok">劝离</span>
                <span v-else-if="v.strandedHandling!.decision === 'extended-stay'" class="tag st-warn">延时至 {{ v.strandedHandling!.extensionUntil ? fmtTime(v.strandedHandling!.extensionUntil) : '' }}</span>
                <span v-else-if="v.strandedHandling!.decision === 'police'" class="tag st-bad">已报警</span>
                <span v-else class="muted">未决策</span>
              </td>
              <td class="small">
                <template v-if="v.isChild">
                  <span v-if="v.strandedHandling!.guardianNotified" class="good-text">✔ 已通知</span>
                  <span v-else class="bad-text"><span class="pulse-dot"></span>必须联系</span>
                </template>
                <span v-else class="muted">成年人</span>
              </td>
              <td class="small">
                <span v-if="v.strandedHandling!.leftAt" class="good-text">{{ fmtTime(v.strandedHandling!.leftAt) }}</span>
                <span v-else class="bad-text">未离馆</span>
              </td>
              <td class="right">
                <button class="mini-btn" @click="openStranded(v)">
                  {{ v.strandedHandling!.status === 'left' ? '查看处置记录' : '处置 →' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="pendingStranded.length" class="card-bd" style="background:#fdf1f3;border-top:1px solid #f0c6cd">
          <b class="bad-text">⛔ 尚有 {{ pendingStranded.length }} 名滞留读者未记录最终离馆时间，闭馆巡检不允许完成。</b>
          <span class="small muted">处置顺序：派安保→到场→读者解释→（未成年人联系监护人）→管理员劝离/延时/报警→确认离馆。</span>
        </div>
      </div>
    </div>

    <div class="grid grid-2">
      <!-- 闭馆交接 7 项 -->
      <div class="card">
        <div class="card-hd"><h3>🔒 闭馆交接巡检（逐项确认）</h3></div>
        <div class="card-bd">
          <div v-for="item in handoverItems" :key="item.key" class="check-item" :class="{ abnormal: item.state === 'abnormal', done: item.state === 'normal' }">
            <span class="check-ico">
              {{ item.state === 'normal' ? '✅' : item.state === 'abnormal' ? '⚠️' : item.state === 'na' ? '➖' : '⬜' }}
            </span>
            <div>
              <div style="font-weight:600">{{ item.label }}</div>
              <div class="small muted mt8" v-if="item.confirmedBy">
                {{ item.confirmedBy }} 于 {{ fmtTime(item.confirmedAt) }} 确认
                <template v-if="item.remark">：{{ item.remark }}</template>
              </div>
              <button v-if="item.incidentId" class="mini-btn mt8" style="border-color:#e6aab3;color:var(--bad)"
                @click="openItemIncident(item)">
                🔗 关联事件（{{ itemIncident(item)?.title }}）
              </button>
            </div>
            <div class="check-state">
              <button class="mini-btn" :class="{ 'on-normal': item.state === 'normal' }" @click="setCheck(item, 'normal')">正常</button>
              <button class="mini-btn" :class="{ 'on-abnormal': item.state === 'abnormal' }" @click="setCheck(item, 'abnormal')">异常</button>
              <button class="mini-btn" :class="{ 'on-na': item.state === 'na' }" @click="setCheck(item, 'na')">不适用</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 无人值守 5 项 -->
      <div>
        <div class="card">
          <div class="card-hd"><h3>📹 无人值守时段技防巡检</h3>
            <span class="sub">门禁 / 摄像头 / 消防 / 异常声音 / 读者求助</span>
          </div>
          <div class="card-bd">
            <div v-for="item in unmannedItems" :key="item.key" class="check-item" :class="{ abnormal: item.state === 'abnormal', done: item.state === 'normal' }">
              <span class="check-ico">
                {{ item.state === 'normal' ? '✅' : item.state === 'abnormal' ? '⚠️' : item.state === 'na' ? '➖' : '⬜' }}
              </span>
              <div>
                <div style="font-weight:600">{{ item.label }}</div>
                <div class="small muted mt8" v-if="item.confirmedBy">{{ item.confirmedBy }} · {{ fmtTime(item.confirmedAt) }}<template v-if="item.remark">：{{ item.remark }}</template></div>
                <button v-if="item.incidentId" class="mini-btn mt8" style="border-color:#e6aab3;color:var(--bad)"
                  @click="openItemIncident(item)">🔗 关联夜间事件</button>
              </div>
              <div class="check-state">
                <button class="mini-btn" :class="{ 'on-normal': item.state === 'normal' }" @click="setCheck(item, 'normal')">正常</button>
                <button class="mini-btn" :class="{ 'on-abnormal': item.state === 'abnormal' }" @click="setCheck(item, 'abnormal')">异常</button>
                <button class="mini-btn" :class="{ 'on-na': item.state === 'na' }" @click="setCheck(item, 'na')">不适用</button>
              </div>
            </div>
            <div class="small muted" style="line-height:1.8">
              夜间技防告警自动汇入事件中心；紧急事件可在事件详情一键转
              <b>安保调度（{{ lib.securityDispatchPhone }}）</b>或<b>街道值班（{{ lib.streetDutyPhone }}）</b>。
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 四方交接签字 -->
    <div class="card">
      <div class="card-hd"><h3>✍️ 闭馆交接签字</h3>
        <span class="sub">夜间闭馆不仅是关门——人员、图书、设备、公共安全必须完成四方交接，完成后随档案固化</span>
      </div>
      <div class="card-bd">
        <div class="grid grid-4">
          <div v-for="d in inspStore.signatureDomains" :key="d.key" class="sig-box" :class="{ signed: !!insp.signatures[d.key] }">
            <div class="small muted">{{ d.label }}</div>
            <div class="sig-name mt8">{{ insp.signatures[d.key] || '待签字' }}</div>
            <div class="small muted mt8">{{ d.hint }}</div>
            <button class="btn ghost sm mt8" :disabled="!!insp.signatures[d.key]" @click="doSign(d.key)">
              {{ insp.signatures[d.key] ? '已交接' : `确认签字（${d.label}）` }}
            </button>
          </div>
        </div>

        <label class="field mt12" style="max-width:520px">闭馆结论备注（可选，将写入交接档案）
          <input class="input" v-model="finishNote" placeholder="如：一切正常；异常事项已建单移交">
        </label>

        <label class="row mt12 small" style="gap:8px">
          <input type="checkbox" :checked="insp.afterCloseCheck === true"
            @change="toggleAfterClose(($event.target as HTMLInputElement).checked)">
          <b>闭馆 30 分钟后灯光空调复核：</b>已远程/现场复查照明与空调全部关闭，仅保留应急照明，无“闭馆后灯光空调未关”情况。
        </label>

        <div class="mt12 small muted" v-if="openIncidents.length">
          ⚠️ 当前仍有 <b class="bad-text">{{ openIncidents.length }}</b> 件未结事件，完成交接后将随
          <b>{{ insp.date }} 夜间交接档案</b>移交（仅挂接一次），次日开馆继续提示管理员督办并可回链本档案：
          <span v-for="i in openIncidents.slice(0,5)" :key="i.id" class="tag" style="margin:2px"
            :class="severityMeta[i.severity].cls">{{ incidentTypeMeta[i.type].icon }} {{ i.title }}</span>
        </div>

        <!-- 完成交接前置条件 -->
        <div class="mt12 card" style="box-shadow:none" :style="inspStore.blockedReasons(insp).length ? 'background:#fdf4f6;border-color:#eabcc5' : 'background:#f3faf7;border-color:#bfe2d8'">
          <div class="card-bd small">
            <b>完成交接前置条件：</b>
            <ul style="padding-left:18px;margin-top:4px;line-height:1.9">
              <li :class="insp.startedAt ? 'good-text' : 'bad-text'">{{ insp.startedAt ? '✔' : '✗' }} 已开始巡检</li>
              <li :class="prog.done === prog.total ? 'good-text' : 'bad-text'">{{ prog.done === prog.total ? '✔' : '✗' }} 12 项巡检全部完成（{{ prog.done }}/{{ prog.total }}）</li>
              <li :class="['people','books','devices','safety'].every(d => insp.signatures[d as 'people']) ? 'good-text' : 'bad-text'">
                {{ ['people','books','devices','safety'].every(d => insp.signatures[d as 'people']) ? '✔' : '✗' }} 人员/图书/设备/公共安全四方签字齐全
              </li>
              <li :class="insp.afterCloseCheck ? 'good-text' : 'bad-text'">{{ insp.afterCloseCheck ? '✔' : '✗' }} 闭馆后灯光空调复核</li>
              <li :class="pendingStranded.length ? 'bad-text' : 'good-text'">
                {{ pendingStranded.length ? '✗' : '✔' }} 夜间滞留处置全部闭环（{{ pendingStranded.length }} 人未离馆；未成年人须已通知监护人）
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- 异常备注弹层 -->
    <template v-if="remarking">
      <div class="drawer-mask" @click="remarking = null"></div>
      <div class="drawer" style="width:460px">
        <div class="drawer-hd"><h3>异常情况说明：{{ remarking.label }}</h3></div>
        <div class="drawer-bd">
          <label class="field">异常详情（将自动创建协同事件并分派责任方）
            <textarea class="input" rows="5" v-model="remarkText" placeholder="如：后门门磁松动、3 号烟感离线、还书箱已 96%……"></textarea>
          </label>
        </div>
        <div class="drawer-ft row">
          <button class="btn ghost" @click="remarking = null">取消</button>
          <div class="spacer"></div>
          <button class="btn danger" @click="confirmAbnormal">确认异常并创建事件</button>
        </div>
      </div>
    </template>
  </div>
</template>
