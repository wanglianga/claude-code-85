<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useSystemStore } from '@/stores/system'
import { useBranchStore } from '@/stores/branch'
import { useIncidentStore } from '@/stores/incident'
import { useInspectionStore } from '@/stores/inspection'
import { useAuthStore } from '@/stores/auth'
import { incidentTypeMeta, severityMeta, deviceTypeMeta } from '@/data/meta'
import { ownerName } from '@/data/sop'
import { fmtCountdown, fmtDuration, fmtTime, todayStr } from '@/utils/format'
import type { Incident } from '@/types'
import IncidentDrawer from '@/components/IncidentDrawer.vue'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const system = useSystemStore()
const branch = useBranchStore()
const incStore = useIncidentStore()
const inspStore = useInspectionStore()
const auth = useAuthStore()
const toast = useToast()
const { now } = storeToRefs(system)

const selected = ref<Incident | null>(null)

const lib = computed(() => system.currentLibrary)
const visits = computed(() => branch.activeVisits(lib.value.id))
const childVisits = computed(() => visits.value.filter((v) => v.isChild))
const seatsUsed = computed(() => visits.value.length)
const seatRate = computed(() => Math.round((seatsUsed.value / lib.value.seatsTotal) * 100))
const occupiedSet = computed(() => new Set(visits.value.map((v) => v.seatNo)))

const devices = computed(() => branch.devicesOf(lib.value.id))
const abnormalDevices = computed(() =>
  devices.value.filter((d) => ['fault', 'alarm', 'offline'].includes(d.status))
)
const box = computed(() => devices.value.find((d) => d.type === 'returnbox'))

const unreturned = computed(() =>
  branch.unreturnedBooks.filter((b) => b.libraryId === lib.value.id)
)
const overdue = computed(() => branch.overdueBooks(lib.value.id, now.value))

const incidents = computed(() =>
  incStore.ofLibrary(lib.value.id)
    .filter((i) => i.status !== 'closed')
    .sort((a, b) => b.createdAt - a.createdAt)
)
const carryOvers = computed(() =>
  incStore.carryOverIncidents.filter((i) => i.libraryId === lib.value.id)
)

const inspection = computed(() => inspStore.ofDate(lib.value.id, todayStr()))
const inspProgress = computed(() => inspStore.progress(inspection.value))

// 座位图（演示 60 个座位号，实际以在馆记录为准）
const seatNumbers = computed(() => {
  const total = Math.max(lib.value.seatsTotal, 60)
  return Array.from({ length: total }, (_, i) => {
    const zone = i < 24 ? 'A' : i < 48 ? 'B' : '亲子'
    const no = zone === '亲子' ? `亲子-${String(i - 47).padStart(2, '0')}` : `${zone}-${String((i % 24) + 1).padStart(2, '0')}`
    return no
  })
})
function visitAtSeat(seat: string) {
  return visits.value.find((v) => v.seatNo === seat)
}

function openIncident(id: string) {
  selected.value = incStore.incidents.find((i) => i.id === id) ?? null
}

function triggerBlackout() {
  if (system.blackout) {
    system.restorePower()
    toast.ok('供电已恢复，设备陆续重启')
    return
  }
  system.triggerBlackout()
  const inc = incStore.create({
    libraryId: lib.value.id,
    type: 'blackout',
    severity: 'urgent',
    title: '突发停电应急处置',
    detail:
      '书房突发市电中断，应急照明/UPS 自动投入。需立即：1) 广播安抚并清点在馆人数；2) 检查电梯困人等次生风险；3) 联系供电与物业；4) 超过 30 分钟未恢复则上报街道值班并视情提前闭馆。',
    at: system.now,
    night: system.isNight,
    owner: 'security',
    blackout: true
  })
  // 停电导致部分设备离线
  for (const d of devices.value) {
    if (['selfkiosk', 'printer', 'camera', 'ac', 'light'].includes(d.type) && d.status !== 'fault') {
      branch.setDeviceStatus(d.id, d.type === 'camera' ? 'offline' : 'off')
    }
  }
  selected.value = inc
}

function jumpClose() {
  system.jumpBeforeClose(30, 60)
  toast.info('已进入演示时钟：现在是闭馆前 30 分钟，时间以 60 倍速流动')
}
function jumpNight() {
  system.jumpToAfterClose(35, 60)
  toast.info('已进入夜间无人值守时段（闭馆后 35 分钟，60 倍速）')
}
function resume() {
  system.resumeRealTime()
  toast.ok('已恢复真实时间')
}

const nightDevices = computed(() =>
  devices.value.filter((d) =>
    ['gate', 'camera', 'fire', 'audio', 'help', 'ups'].includes(d.type)
  )
)
</script>

<template>
  <div>
    <!-- 状态横幅 -->
    <div v-if="system.isNight" class="banner night">
      <span style="font-size:20px">🌙</span>
      <div>
        <b>夜间时段</b> · 书房已进入闭馆/无人值守模式，门禁、摄像头、消防、异常声音与读者求助已纳入夜间巡检，
        异常可一键转安保调度与街道值班。
      </div>
    </div>
    <div v-else-if="system.msToClose < 30 * 60_000" class="banner warn">
      <span style="font-size:20px">⏰</span>
      <div><b>即将闭馆</b>，请开始提醒读者、设备归位并准备闭馆巡检。</div>
      <RouterLink class="btn amber sm" to="/inspection">开始闭馆巡检</RouterLink>
    </div>

    <!-- KPI -->
    <div class="grid grid-4 mb16">
      <div class="kpi">
        <div class="k-ico">👥</div>
        <div class="k-label">当前在馆人数</div>
        <div class="k-value">{{ visits.length }} <span class="k-unit">/ {{ lib.seatsTotal }} 座</span></div>
        <div class="progress mt8"><div :class="seatRate > 85 ? 'bad' : seatRate > 60 ? 'warn' : ''" :style="{ width: seatRate + '%' }"></div></div>
      </div>
      <div class="kpi" :class="{ alert: childVisits.length }">
        <div class="k-ico">🧒</div>
        <div class="k-label">儿童读者在馆</div>
        <div class="k-value">{{ childVisits.length }} <span class="k-unit">人（需家长陪同关注）</span></div>
        <div class="small muted mt8" v-if="childVisits.length">
          {{ childVisits.map((v) => v.readerName).join('、') }}
        </div>
      </div>
      <div class="kpi night">
        <div class="k-ico" style="opacity:.9">🌙</div>
        <div class="k-label">距 {{ lib.closeTime }} 闭馆</div>
        <div class="countdown" :class="{ over: system.isNight }">{{ fmtCountdown(system.msToClose) }}</div>
        <div class="small mt8" style="color:#a9bdd4">开馆 {{ lib.openTime }} · 今日 {{ todayStr() }}</div>
      </div>
      <div class="kpi" :class="{ alert: abnormalDevices.length }">
        <div class="k-ico">🛠️</div>
        <div class="k-label">设备异常 / 告警</div>
        <div class="k-value">{{ abnormalDevices.length }} <span class="k-unit">项</span></div>
        <div class="small muted mt8" v-if="box">还书箱 {{ box.level ?? 0 }}%
          <span v-if="(box.level ?? 0) >= 90" class="bad-text">· 需立即清运</span>
        </div>
      </div>
    </div>

    <div class="grid grid-4 mb16">
      <div class="kpi" :class="{ alert: unreturned.length }">
        <div class="k-ico">📕</div>
        <div class="k-label">未归还图书（本馆）</div>
        <div class="k-value">{{ unreturned.length }} <span class="k-unit">册</span></div>
        <div class="small mt8"><span :class="overdue.length ? 'bad-text' : 'muted'">逾期 {{ overdue.length }} 册</span></div>
      </div>
      <div class="kpi" :class="{ alert: incidents.length }">
        <div class="k-ico">🚨</div>
        <div class="k-label">未闭环事件</div>
        <div class="k-value">{{ incidents.length }} <span class="k-unit">件</span></div>
        <div class="small muted mt8">高风险 {{ incStore.dangerCount(lib.id) }} 件</div>
      </div>
      <div class="kpi">
        <div class="k-ico">✅</div>
        <div class="k-label">今日闭馆巡检</div>
        <div class="k-value">{{ inspProgress.done }}<span class="k-unit">/{{ inspProgress.total }}</span></div>
        <div class="small mt8"><span :class="inspProgress.abnormal ? 'bad-text' : 'muted'">异常 {{ inspProgress.abnormal }} 项</span></div>
      </div>
      <div class="kpi" :class="{ alert: carryOvers.length }">
        <div class="k-ico">🌅</div>
        <div class="k-label">次日遗留督办</div>
        <div class="k-value">{{ carryOvers.length }} <span class="k-unit">件</span></div>
        <div class="small muted mt8">未修复故障 / 失物 / 投诉 / 巡检异常</div>
      </div>
    </div>

    <!-- 演示控制 -->
    <div class="card" v-if="auth.account?.role === 'admin'">
      <div class="card-hd">
        <h3>🎬 场景演示控制</h3>
        <span class="sub">模拟夜间闭馆流程与突发停电（时间为模拟时钟，不影响真实数据）</span>
      </div>
      <div class="card-bd row">
        <span class="small muted">当前时钟：<b>{{ fmtTime(now) }}</b>
          <span v-if="system.simulated" class="tag sev-medium" style="margin-left:6px">模拟 {{ system.scale }}× 速</span>
        </span>
        <button class="btn ghost sm" @click="jumpClose">⏩ 跳到闭馆前 30 分钟</button>
        <button class="btn ghost sm" @click="jumpNight">🌃 进入夜间无人时段</button>
        <button class="btn ghost sm" :disabled="!system.simulated" @click="resume">恢复真实时间</button>
        <div class="spacer"></div>
        <button class="btn" :class="system.blackout ? '' : 'danger'" @click="triggerBlackout">
          {{ system.blackout ? '🔌 恢复供电' : '⚡ 模拟突发停电' }}
        </button>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: 1.5fr 1fr">
      <!-- 在馆读者 + 座位图 -->
      <div class="card">
        <div class="card-hd">
          <h3>座位占用与在馆读者</h3>
          <span class="sub">入馆时记录入馆时间 / 座位 / 入馆方式</span>
          <div class="spacer"></div>
          <RouterLink class="btn ghost sm" to="/service">读者服务台 →</RouterLink>
        </div>
        <div class="card-bd">
          <div class="row mb12 small">
            <span class="seat legend">空闲</span>
            <span class="seat legend busy">占用</span>
            <span class="seat legend child">亲子/儿童</span>
            <span class="muted">点击可看在馆详情（仅列出演示 60 座）</span>
          </div>
          <div class="seat-map mb16">
            <template v-for="s in seatNumbers" :key="s">
              <div v-if="occupiedSet.has(s)" class="seat" :class="visitAtSeat(s)?.isChild ? 'child' : 'busy'" :title="visitAtSeat(s)?.readerName">
                {{ s }}<br />{{ visitAtSeat(s)?.readerName.slice(0, 4) }}
              </div>
              <div v-else class="seat">{{ s }}</div>
            </template>
          </div>

          <table class="tbl">
            <thead><tr><th>读者</th><th>入馆方式</th><th>座位</th><th>入馆时间</th><th>在馆时长</th><th></th></tr></thead>
            <tbody>
              <tr v-for="v in visits" :key="v.id">
                <td>
                  {{ v.readerName }}
                  <span v-if="v.isChild" class="tag st-info" style="margin-left:4px">儿童</span>
                </td>
                <td class="small">{{ v.entryMethod === 'idcard' ? '身份证' : v.entryMethod === 'card' ? '借书证' : '预约码' }}</td>
                <td>{{ v.seatNo }}</td>
                <td class="nowrap">{{ fmtTime(v.enterAt) }}</td>
                <td class="small muted">{{ fmtDuration(v.enterAt, now) }}</td>
                <td class="right">
                  <button class="mini-btn" @click="branch.checkOut(v.id, now); toast.ok(`${v.readerName} 已签离`)" :disabled="auth.account?.role === 'volunteer'">签离</button>
                </td>
              </tr>
              <tr v-if="!visits.length"><td colspan="6" class="empty">当前无人在馆</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 右栏：事件 + 技防 -->
      <div>
        <div class="card">
          <div class="card-hd"><h3>🚨 待处置事件</h3>
            <span class="tag st-bad" v-if="incidents.length">{{ incidents.length }}</span>
            <div class="spacer"></div>
            <RouterLink class="small" to="/incidents">事件中心 →</RouterLink>
          </div>
          <div class="card-bd flush">
            <table class="tbl">
              <tbody>
                <tr v-for="i in incidents.slice(0, 6)" :key="i.id" class="clickable" @click="openIncident(i.id)">
                  <td style="width:34px; font-size:18px">{{ incidentTypeMeta[i.type].icon }}</td>
                  <td>
                    <div style="font-weight:600">{{ i.title }}</div>
                    <div class="small muted">
                      <span class="tag" :class="severityMeta[i.severity].cls">{{ severityMeta[i.severity].label }}</span>
                      <span v-if="i.night" class="tag st-info">夜间</span>
                      <span v-if="i.carryOver" class="tag sev-high">遗留</span>
                      · {{ ownerName(i.owner) }} · {{ fmtTime(i.createdAt) }}
                    </div>
                  </td>
                </tr>
                <tr v-if="!incidents.length"><td class="empty">暂无未闭环事件</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-hd"><h3>📹 夜间无人技防状态</h3>
            <div class="spacer"></div>
            <RouterLink class="small" to="/devices">详情 →</RouterLink>
          </div>
          <div class="card-bd flush">
            <table class="tbl">
              <tbody>
                <tr v-for="d in nightDevices" :key="d.id">
                  <td>{{ deviceTypeMeta[d.type] }}</td>
                  <td class="small muted">{{ d.location }}</td>
                  <td class="right">
                    <span class="tag" :class="d.status === 'online' || d.status === 'normal' ? 'st-ok' : d.status === 'off' ? 'st-off' : 'st-bad'">
                      {{ d.status === 'online' ? '在线' : d.status === 'normal' ? '正常' : d.status === 'alarm' ? '告警' : d.status === 'offline' ? '离线' : '故障' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <IncidentDrawer :incident="selected" @close="selected = null" />
  </div>
</template>
