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

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const system = useSystemStore()
const incidents = useIncidentStore()
const branch = useBranchStore()
const blackout = useBlackoutStore()
const { now } = storeToRefs(system)

const nav = computed(() => {
  const role = auth.account?.role
  const lib = system.currentLibraryId
  const items = [
    { group: '运营总览', children: [
      { to: '/dashboard', ico: '🏠', label: '运行总览' },
      { to: '/service', ico: '🎫', label: '读者服务台' },
      { to: '/incidents', ico: '🚨', label: '事件协同中心', badge: incidents.openCount(lib) }
    ]},
    { group: '夜间闭馆 / 应急', children: [
      { to: '/inspection', ico: '🌙', label: '闭馆巡检交接' },
      { to: '/devices', ico: '📹', label: '设备与无人技防' },
      { to: '/emergency', ico: '⚡', label: '停电应急联动' },
      { to: '/street', ico: '🏙️', label: '街道值班总览' }
    ]},
    { group: '馆藏与读者', children: [
      { to: '/books', ico: '📚', label: '馆藏与调拨' },
      { to: '/readers', ico: '⭐', label: '读者信用' },
      { to: '/activities', ico: '👨‍👩‍👧', label: '亲子阅读活动' }
    ]}
  ] as { group: string; children: { to: string; ico: string; label: string; badge?: number }[] }[]
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
const carryCount = computed(
  () => incidents.carryOverIncidents.filter((i) => i.libraryId === system.currentLibraryId).length
)
const activeCase = computed(() => blackout.activeCase(system.currentLibraryId))

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
            <span class="dot" :class="system.blackout ? 'dot-blackout' : l.status === 'open' ? 'dot-open' : l.status === 'closing' ? 'dot-closing' : 'dot-closed'"></span>
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
        <div v-if="activeCase" class="banner blackout" :class="{ 'emergency-siren': activeCase.emergencyReasons.length }">
          <span>⚡</span>
          <div>
            <b>突发停电应急处置中{{ activeCase.emergencyReasons.length ? ' · 🚨 已升级紧急事件（巡检禁止完成）' : '' }}！</b>
            门禁{{ activeCase.gateFailed ? '失效（安保' + (activeCase.securityArrived ? '已到场' : '出动中') + '）' : '正常' }}
            · 在馆 {{ activeVisits.length }} 人 · 借还暂存 {{ activeCase.pendingTxns.length }} 笔
            <template v-if="activeCase.phase === 'power-restored'"> · 来电自检/夜间确认进行中</template>
            ，请进入应急指挥视图按预案处置。
          </div>
          <RouterLink class="btn amber sm" to="/emergency">进入应急指挥 →</RouterLink>
          <RouterLink class="btn ghost sm" to="/reader" target="_blank">读者端通告</RouterLink>
        </div>
        <slot />
      </main>
    </div>
  </div>
</template>
