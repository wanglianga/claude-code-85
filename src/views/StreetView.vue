<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { useBranchStore } from '@/stores/branch'
import { useBlackoutStore } from '@/stores/blackout'
import { useIncidentStore } from '@/stores/incident'
import { fmtDateTime, fmtDuration, fmtTime } from '@/utils/format'
import { useBlackoutViewer } from '@/composables/useBlackoutViewer'
import { useIncidentViewer } from '@/composables/useIncidentViewer'
import BlackoutReviewDrawer from '@/components/BlackoutReviewDrawer.vue'
import type { BlackoutCase } from '@/types'

const router = useRouter()
const system = useSystemStore()
const branch = useBranchStore()
const bo = useBlackoutStore()
const incStore = useIncidentStore()
const reviewViewer = useBlackoutViewer()
const incidentViewer = useIncidentViewer()
const { now } = storeToRefs(system)

const activeCases = computed(() => bo.activeCases)

/** 按停电小区/片区聚合 */
const communities = computed(() => {
  const map = new Map<string, { community: string; libs: { libId: string; case: BlackoutCase }[] }>()
  for (const c of activeCases.value) {
    const key = c.community
    if (!map.has(key)) map.set(key, { community: key, libs: [] })
    map.get(key)!.libs.push({ libId: c.libraryId, case: c })
  }
  return [...map.values()]
})

const totalHere = computed(() =>
  activeCases.value.reduce((s, c) => s + branch.activeVisits(c.libraryId).length, 0)
)
const emergencyCount = computed(() => activeCases.value.reduce((s, c) => s + c.emergencyIncidentIds.length, 0))
const reviewed = computed(() =>
  bo.cases
    .slice()
    .filter((c) => c.phase === 'reviewed')
    .sort((a, b) => (b.review?.reviewedAt ?? 0) - (a.review?.reviewedAt ?? 0))
)

function libName(id: string) {
  return system.libraries.find((l) => l.id === id)?.name ?? id
}
function libOf(id: string) {
  return system.libraries.find((l) => l.id === id)
}
function progressOf(c: BlackoutCase): { done: number; total: number; label: string }[] {
  const total = c.devices.length
  const checked = c.devices.filter((d) => d.check === 'confirmed').length
  const zones = c.zones.length
  const zonesDone = c.zones.filter((z) => z.checked).length
  const rows = [
    { done: checked, total, label: '受影响设备核验' },
    { done: zonesDone, total: Math.max(zones, 1), label: '区域人员清点' }
  ]
  if (c.phase !== 'active') {
    rows.push({ done: c.devices.filter((d) => d.selfTest !== 'pending').length, total, label: '来电设备自检' })
  }
  if (c.night) {
    rows.push({ done: bo.nightConfirmMeta.filter((m) => c.nightConfirms[m.key]).length, total: 6, label: '夜间六项确认' })
  }
  return rows
}
function openReview(c: BlackoutCase) {
  reviewViewer.openReview(c.id)
}
function openIncident(id?: string) {
  if (id) incidentViewer.open(id)
}
function logout() {
  router.push('/login')
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" style="width:200px;flex-basis:200px">
      <div class="brand">
        <div class="logo">🏙️</div>
        <div class="name">街道值班应急台</div>
        <div class="sub">停电小区 · 影响书房 · 处置进展</div>
      </div>
      <nav class="nav-group" style="padding:14px">
        <div class="nav-item active">⚡ 停电应急总览</div>
        <div class="nav-item" @click="router.push('/reader')" style="cursor:pointer">📱 读者应急通告屏</div>
      </nav>
      <div class="sidebar-foot">
        <div style="margin-bottom:8px">🕐 {{ fmtTime(now) }}</div>
        <a href="#" @click.prevent="logout" style="color:#9fb3cc">退出值班台</a>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="page-title">街道值班 · 突发停电应急联动总览</div>
        <div class="spacer"></div>
        <div class="small muted">跨书房实时汇总（停电小区 / 在馆人数 / 处置进展 / 复盘记录）</div>
      </header>

      <main class="content">
        <!-- KPI -->
        <div class="grid grid-4 mb16">
          <div class="kpi" :class="{ alert: activeCases.length }">
            <div class="k-ico">⚡</div>
            <div class="k-label">进行中停电（书房）</div>
            <div class="k-value">{{ activeCases.length }} <span class="k-unit">座 / {{ communities.length }} 片区</span></div>
          </div>
          <div class="kpi" :class="{ alert: totalHere }">
            <div class="k-ico">👥</div>
            <div class="k-label">受影响在馆人数</div>
            <div class="k-value">{{ totalHere }} <span class="k-unit">人</span></div>
          </div>
          <div class="kpi" :class="{ alert: emergencyCount }">
            <div class="k-ico">🚨</div>
            <div class="k-label">紧急事件</div>
            <div class="k-value">{{ emergencyCount }} <span class="k-unit">起（被困/通道/烟感/应急灯）</span></div>
          </div>
          <div class="kpi">
            <div class="k-ico">📜</div>
            <div class="k-label">已复盘停电</div>
            <div class="k-value">{{ reviewed.length }} <span class="k-unit">起</span></div>
          </div>
        </div>

        <!-- 无停电 -->
        <div v-if="!activeCases.length" class="card">
          <div class="card-bd" style="text-align:center;padding:48px 0">
            <div style="font-size:40px">✅</div>
            <h3 class="mt8">辖区书房供电正常，无进行中停电事件</h3>
            <div class="small muted mt8">停电发生时，这里将自动按停电小区聚合：影响书房、在馆人数、门禁/消防/设备状态与各方处置进展。</div>
          </div>
        </div>

        <!-- 按小区聚合 -->
        <div v-for="g in communities" :key="g.community" class="card">
          <div class="card-hd" style="background:#fdf4f6">
            <h3>⚡ 停电小区：{{ g.community }}</h3>
            <span class="tag st-bad">{{ g.libs.length }} 座书房受影响</span>
            <div class="spacer"></div>
            <span class="small muted">辖区在馆 {{ g.libs.reduce((s, x) => s + branch.activeVisits(x.libId).length, 0) }} 人</span>
          </div>
          <div class="card-bd">
            <div v-for="x in g.libs" :key="x.libId" class="street-lib-row blackout">
              <div style="flex:1;min-width:260px">
                <div class="row">
                  <b>{{ libName(x.libId) }}</b>
                  <span class="tag st-bad" v-if="x.case.phase === 'active'">停电中 {{ fmtDuration(x.case.startedAt, now) }}</span>
                  <span class="tag st-warn" v-else-if="x.case.phase === 'power-restored'">来电核验中</span>
                  <span class="tag st-info" v-if="x.case.night">🌙 夜间</span>
                  <span class="tag sev-urgent" v-if="x.case.emergencyReasons.length">🚨 紧急 {{ x.case.emergencyReasons.length }}</span>
                </div>
                <div class="small muted mt8">
                  {{ fmtDateTime(x.case.startedAt) }} 起
                  · 门禁 <b :class="x.case.gateFailed ? 'bad-text' : 'good-text'">{{ x.case.gateFailed ? '失效' : '正常' }}</b>
                  · 安保 {{ x.case.securityArrived ? '已到场' : x.case.securityNotified ? '出动中' : '—' }}
                  · 街道 {{ x.case.streetNotified ? '已同步' : '未同步' }}
                  · 消防 {{ x.case.fireNotified ? '已同步' : '未同步' }}
                  · 在馆 <b>{{ branch.activeVisits(x.libId).length }}</b> 人
                </div>
                <div v-if="x.case.emergencyReasons.length" class="small mt8">
                  <span v-for="r in x.case.emergencyReasons" :key="r" class="tag st-bad" style="margin:2px">⚠️ {{ r }}</span>
                </div>
                <div class="small muted mt8" v-if="libOf(x.libId)">
                  街道值班：{{ libOf(x.libId)!.streetDutyPhone }} ｜ 消防联系人：{{ libOf(x.libId)!.fireContactPhone }} ｜ 安保调度：{{ libOf(x.libId)!.securityDispatchPhone }}
                </div>
              </div>

              <div style="width:280px">
                <div v-for="(p, i) in progressOf(x.case)" :key="i" class="mb8">
                  <div class="row small" style="justify-content:space-between">
                    <span class="muted">{{ p.label }}</span>
                    <span :class="p.done >= p.total ? 'good-text' : 'warn-text'"><b>{{ p.done }}/{{ p.total }}</b></span>
                  </div>
                  <div class="progress mt8"><div :class="p.done >= p.total ? 'good' : 'warn'" :style="{ width: (p.done / p.total * 100) + '%' }"></div></div>
                </div>
                <div class="small muted mt8" v-if="x.case.earlyClosed">
                  🏁 已提前闭馆，通知预约读者 {{ x.case.reservationNotifiedCount }} 人次
                </div>
                <div class="small muted mt8">
                  借还暂存 {{ x.case.pendingTxns.length }} 笔（待补 {{ x.case.pendingTxns.filter(t => !t.backfilled).length }}）
                  · 读者求助 {{ x.case.helps.filter(h => h.status !== 'resolved').length }} 未处置
                </div>
              </div>

              <div style="width:130px;text-align:right">
                <button class="mini-btn" style="display:block;width:100%;margin-bottom:6px" @click="openIncident(x.case.incidentId)">停电事件</button>
                <button v-if="x.case.emergencyIncidentIds[0]" class="mini-btn" style="display:block;width:100%;margin-bottom:6px;border-color:#e6aab3;color:var(--bad)"
                  @click="openIncident(x.case.emergencyIncidentIds[0])">紧急事件</button>
                <button class="mini-btn" style="display:block;width:100%" @click="openReview(x.case)">处置/复盘</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 复盘档案 -->
        <div class="card" v-if="reviewed.length">
          <div class="card-hd">
            <h3>📜 停电复盘档案</h3>
            <span class="sub">记录停电时间、影响范围、读者求助、处置责任与改进项</span>
          </div>
          <div class="card-bd flush">
            <table class="tbl">
              <thead><tr><th>编号</th><th>书房/小区</th><th>停电时间</th><th>时长</th><th>在馆峰值</th><th>紧急</th><th>求助</th><th>暂存补录</th><th>自检失败</th><th>改进项</th><th class="right"></th></tr></thead>
              <tbody>
                <tr v-for="c in reviewed" :key="c.id" class="clickable" @click="openReview(c)">
                  <td class="small">{{ c.no }}</td>
                  <td><b>{{ libName(c.libraryId) }}</b><div class="small muted">{{ c.community }}</div></td>
                  <td class="small nowrap">{{ fmtDateTime(c.startedAt) }}{{ c.night ? ' 🌙' : '' }}</td>
                  <td>{{ c.review?.durationMin }} 分</td>
                  <td>{{ c.zones.reduce((s, z) => s + z.count, 0) }} 人</td>
                  <td><span :class="c.emergencyIncidentIds.length ? 'bad-text' : 'muted'">{{ c.emergencyIncidentIds.length }}</span></td>
                  <td>{{ c.helps.length }} 起</td>
                  <td>{{ c.pendingTxns.length }} 笔</td>
                  <td>{{ c.devices.filter(d => d.faultReportId).length }} 台</td>
                  <td class="small muted" style="max-width:240px">{{ c.review?.improvements }}</td>
                  <td class="right"><button class="mini-btn" @click.stop="openReview(c)">查看复盘</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>

    <BlackoutReviewDrawer />
  </div>
</template>
