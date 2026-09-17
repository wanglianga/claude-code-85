<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore, roleNames } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'
import { useIncidentStore } from '@/stores/incident'
import { useBranchStore } from '@/stores/branch'
import { useBlackoutStore } from '@/stores/blackout'
import { fmtCountdown, fmtTime } from '@/utils/format'
import { resetDemoData } from '@/stores/persist'
import IncidentDrawer from '@/components/IncidentDrawer.vue'
import HandoverArchiveDrawer from '@/components/HandoverArchiveDrawer.vue'
import StrandedDrawer from '@/components/StrandedDrawer.vue'
import FaultDrawer from '@/components/FaultDrawer.vue'
import FaultCreateDrawer from '@/components/FaultCreateDrawer.vue'
import { useIncidentViewer } from '@/composables/useIncidentViewer'
import { useStrandedViewer } from '@/composables/useStrandedViewer'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const system = useSystemStore()
const incidents = useIncidentStore()
const branch = useBranchStore()
const blackout = useBlackoutStore()
const { now } = storeToRefs(system)
const incidentViewer = useIncidentViewer()
const globalIncident = incidentViewer.incident

const nav = computed(() => {
  const role = auth.account?.role
  const lib = system.currentLibraryId

  // 街道值班：聚焦跨书房停电应急联动（可看总览/事件/设备，不参与馆内操作）
  if (role === 'street') {
    return [
      { group: '应急联动', children: [
        { to: '/street', ico: '🏙️', label: '街道值班联动台' },
        { to: '/emergency', ico: '⚡', label: '停电应急指挥（只读）', badge: blackout.hasActiveAny ? blackout.streetRows.length : 0 },
        { to: '/reader/emergency', ico: '👁️', label: '读者应急端（预览）' }
      ]},
      { group: '查看', children: [
        { to: '/dashboard', ico: '🏠', label: '运行总览' },
        { to: '/incidents', ico: '🚨', label: '事件协同中心', badge: incidents.openCount(lib) },
        { to: '/devices', ico: '📹', label: '设备与技防' }
      ]}
    ]
  }

  const items = [
    { group: '运营总览', children: [
      { to: '/dashboard', ico: '🏠', label: '运行总览' },
      { to: '/service', ico: '🎫', label: '读者服务台' },
      { to: '/emergency', ico: '⚡', label: '停电应急联动', badge: blackout.activeOf(lib) ? 1 : 0 },
      { to: '/incidents', ico: '🚨', label: '事件协同中心', badge: incidents.openCount(lib) }
    ]},
    { group: '夜间闭馆', children: [
      { to: '/inspection', ico: '🌙', label: '闭馆巡检交接' },
      { to: '/devices', ico: '📹', label: '设备与无人技防' }
    ]},
    { group: '馆藏与读者', children: [
      { to: '/books', ico: '📚', label: '馆藏与调拨' },
      { to: '/readers', ico: '⭐', label: '读者信用' },
      { to: '/activities', ico: '👨‍👩‍👧', label: '亲子阅读活动' }
    ]}
  ] as { group: string; children: { to: string; ico: string; label: string; badge?: number; roles?: string[] }[] }[]
  if (role === 'volunteer' || role === 'admin') {
    items.push({ group: '志愿力量', children: [
      { to: '/volunteer', ico: '🧑‍🌾', label: '志愿者巡馆' }
    ]})
  }
  // 志愿者只保留巡馆与总览（只读）
  if (role === 'volunteer') {
    return [
      { group: '志愿力量', children: [{ to: '/volunteer', ico: '🧑‍🌾', label: '志愿者巡馆' }] },
      { group: '查看', children: [{ to: '/dashboard', ico: '🏠', label: '运行总览（只读）' }] }
    ]
  }
  return items
})

const activeVisits = computed(() => branch.activeVisits(system.currentLibraryId))
const boEvent = computed(() => blackout.activeOf(system.currentLibraryId))
const carryCount = computed(
  () => incidents.carryOverIncidents.filter((i) => i.libraryId === system.currentLibraryId).length
)

function logout() {
  auth.logout()
  router.push('/login')
}
function resetDemo() {
  if (window.confirm('确定要清空当前演示数据并恢复初始状态吗？')) resetDemoData()
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">📖</div>
        <div class="name">城市书房管理平台</div>
        <div class="sub">自助借阅 · 夜间闭馆巡检</div>
      </div>
      <nav class="nav-group">
        <template v-for="g in nav" :key="g.group">
          <div class="nav-title">{{ g.group }}</div>
          <RouterLink
            v-for="item in g.children"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ active: route.path.startsWith(item.to) }"
          >
            <span class="ico">{{ item.ico }}</span>
            <span>{{ item.label }}</span>
            <span v-if="item.badge" class="badge">{{ item.badge }}</span>
          </RouterLink>
        </template>
      </nav>
      <div class="sidebar-foot">
        <div style="margin-bottom:6px">
          <button class="mini-btn" style="width:100%" @click="resetDemo">↺ 恢复演示数据</button>
        </div>
        多书房协同 · 事件四方闭环
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div>
          <div class="page-title">{{ route.meta.title || '城市书房' }}</div>
        </div>
        <div class="library-switch">
          <button
            v-for="l in system.libraries"
            :key="l.id"
            class="lib-pill"
            :class="{ active: l.id === system.currentLibraryId }"
            @click="system.switchLibrary(l.id)"
          >
            <span class="dot" :class="blackout.activeOf(l.id) ? 'dot-blackout' : l.status === 'open' ? 'dot-open' : l.status === 'closing' ? 'dot-closing' : 'dot-closed'"></span>
            {{ l.name.replace('城市书房', '') }}
          </button>
        </div>
        <div class="spacer"></div>
        <div class="right">
          <div class="clock-big">🕐 {{ fmtTime(now) }}</div>
          <div class="small muted">
            闭馆 {{ system.currentLibrary.closeTime }} ·
            <span :class="{ 'bad-text': system.msToClose < 0 }">{{ fmtCountdown(system.msToClose) }}</span>
            · 当前 <b :class="activeVisits.length ? '' : 'muted'">{{ activeVisits.length }}</b> 人在馆
          </div>
        </div>
        <div style="border-left:1px solid var(--line); padding-left:14px; font-size:12.5px">
          <div><b>{{ auth.account?.name }}</b></div>
          <div class="muted">{{ roleNames[auth.account!.role] }}
            <a href="#" @click.prevent="logout" style="margin-left:8px">退出</a>
          </div>
        </div>
      </header>

      <main class="content">
        <div v-if="carryCount && route.path !== '/incidents'" class="banner warn">
          <span>🌅</span>
          <div>
            <b>次日开馆遗留提醒：</b>当前书房有 {{ carryCount }} 项未处理的故障 / 遗失物 / 投诉 / 巡检异常继续督办中，
            <RouterLink to="/incidents">前往事件中心处理 →</RouterLink>
          </div>
        </div>
        <div v-if="boEvent" class="banner" :class="boEvent.phase === 'urgent' ? 'blackout' : 'danger'">
          <span>⚡</span>
          <div>
            <b>{{ boEvent.phase === 'urgent' ? '停电紧急事件处置中' : '突发停电应急处置中' }}</b>
            （{{ boEvent.no }}）· 应急照明/UPS 已启动；在馆 <b>{{ blackout.peopleCount(boEvent) }}</b> 人 ·
            门禁{{ boEvent.gateFailed ? '已失效（机械钥匙/临时开门）' : 'UPS 维持' }}
            <span v-if="boEvent.escalations.some(e => !e.resolved)" class="pulse-dot"></span>
            <span v-if="boEvent.escalations.some(e => !e.resolved)" class="bad-text"><b>紧急事件未解除，巡检不允许完成</b></span>
          </div>
          <a class="btn ghost sm" :href="'#/reader/emergency'" target="_blank">👁️ 读者端</a>
          <RouterLink class="btn amber sm" to="/emergency">进入应急指挥 →</RouterLink>
        </div>
        <slot />
      </main>
    </div>

    <!-- 全局事件抽屉（页面通过 useIncidentViewer 打开） -->
    <IncidentDrawer :incident="globalIncident" @close="incidentViewer.close()" />
    <!-- 只读夜间交接档案抽屉 -->
    <HandoverArchiveDrawer />
    <!-- 夜间滞留处置抽屉 -->
    <StrandedDrawer />
    <!-- 设备故障工单抽屉 -->
    <FaultDrawer />
    <FaultCreateDrawer />
  </div>
</template>
