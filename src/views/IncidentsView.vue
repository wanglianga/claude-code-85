<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useIncidentStore } from '@/stores/incident'
import { useSystemStore } from '@/stores/system'
import { useAuthStore, roleNames } from '@/stores/auth'
import { incidentTypeMeta, severityMeta } from '@/data/meta'
import { ownerName } from '@/data/sop'
import { fmtTime } from '@/utils/format'
import type { Incident, IncidentSeverity, IncidentType } from '@/types'
import IncidentDrawer from '@/components/IncidentDrawer.vue'
import { useToast } from '@/composables/useToast'

const incStore = useIncidentStore()
const system = useSystemStore()
const auth = useAuthStore()
const toast = useToast()
const { now } = storeToRefs(system)

const selected = ref<Incident | null>(null)
const filterNight = ref<'all' | 'day' | 'night' | 'carry'>('all')
const filterStatus = ref<'open' | 'all' | 'closed'>('open')
const filterType = ref<IncidentType | ''>('')

const list = computed(() => {
  return incStore
    .ofLibrary(system.currentLibraryId)
    .filter((i) => {
      if (filterStatus.value === 'open' && i.status === 'closed') return false
      if (filterStatus.value === 'closed' && i.status !== 'closed') return false
      if (filterNight.value === 'day' && i.night) return false
      if (filterNight.value === 'night' && !i.night) return false
      if (filterNight.value === 'carry' && !(i.carryOver && i.status !== 'closed')) return false
      if (filterType.value && i.type !== filterType.value) return false
      return true
    })
    .sort((a, b) => {
      const w = { urgent: 0, high: 1, medium: 2, low: 3 } as Record<IncidentSeverity, number>
      if (a.status !== b.status) return a.status === 'closed' ? 1 : -1
      return w[a.severity] - w[b.severity] || b.createdAt - a.createdAt
    })
})

function openIt(i: Incident) {
  selected.value = i
}

// 手动新建事件
const showCreate = ref(false)
const cType = ref<IncidentType>('device-fault')
const cSeverity = ref<IncidentSeverity>('medium')
const cTitle = ref('')
const cDetail = ref('')
const cNight = ref(false)

function createIncident() {
  if (!cTitle.value.trim()) {
    toast.bad('请填写事件标题')
    return
  }
  const defaultOwner = {
    stranded: 'security',
    'demag-failed': 'service',
    'box-full': 'service',
    'gate-abnormal': 'security',
    'device-fault': 'maintainer',
    'lost-item': 'service',
    'light-ac-on': 'security',
    'unmanned-access': 'security',
    'camera-offline': 'security',
    'fire-alarm': 'security',
    'abnormal-sound': 'security',
    'help-request': 'security',
    blackout: 'security',
    complaint: 'service',
    patrol: 'service'
  } as const
  const inc = incStore.create({
    libraryId: system.currentLibraryId,
    type: cType.value,
    severity: cSeverity.value,
    title: cTitle.value,
    detail: cDetail.value || '（人工上报，待补充详情）',
    at: now.value,
    night: cNight.value,
    owner: defaultOwner[cType.value]
  })
  toast.ok('事件已创建并通知责任方')
  showCreate.value = false
  cTitle.value = cDetail.value = ''
  selected.value = inc
}

const counts = computed(() => ({
  all: incStore.ofLibrary(system.currentLibraryId).filter((i) => i.status !== 'closed').length,
  night: incStore.byLibraryAndNight(system.currentLibraryId, true).length,
  carry: incStore.carryOverIncidents.filter((i) => i.libraryId === system.currentLibraryId && i.status !== 'closed').length
}))

const statusLabel: Record<Incident['status'], string> = {
  open: '待受理', handling: '处置中', resolved: '待复核', closed: '已归档'
}
const statusCls: Record<Incident['status'], string> = {
  open: 'st-bad', handling: 'st-warn', resolved: 'st-info', closed: 'st-off'
}
</script>

<template>
  <div>
    <div class="card">
      <div class="card-bd row">
        <div class="row" style="gap:6px">
          <button class="lib-pill" :class="{ active: filterStatus === 'open' }" @click="filterStatus = 'open'">未闭环</button>
          <button class="lib-pill" :class="{ active: filterStatus === 'all' }" @click="filterStatus = 'all'">全部</button>
          <button class="lib-pill" :class="{ active: filterStatus === 'closed' }" @click="filterStatus = 'closed'">已归档</button>
        </div>
        <span style="width:1px;height:20px;background:var(--line)"></span>
        <div class="row" style="gap:6px">
          <button class="lib-pill" :class="{ active: filterNight === 'all' }" @click="filterNight = 'all'">全天 ({{ counts.all }})</button>
          <button class="lib-pill" :class="{ active: filterNight === 'night' }" @click="filterNight = 'night'">🌙 夜间 ({{ counts.night }})</button>
          <button class="lib-pill" :class="{ active: filterNight === 'carry' }" @click="filterNight = 'carry'">🌅 次日遗留 ({{ counts.carry }})</button>
        </div>
        <select class="input" style="width:170px" v-model="filterType">
          <option value="">全部事件类型</option>
          <option v-for="(m, k) in incidentTypeMeta" :key="k" :value="k">{{ m.icon }} {{ m.label }}</option>
        </select>
        <div class="spacer"></div>
        <button class="btn amber sm" @click="showCreate = true" :disabled="auth.account?.role === 'volunteer'">＋ 人工上报事件</button>
      </div>
    </div>

    <div class="grid grid-2">
      <!-- 事件列表 -->
      <div class="card">
        <div class="card-hd"><h3>事件列表</h3><span class="sub">点击进入协同处置</span></div>
        <div class="card-bd flush">
          <table class="tbl">
            <thead><tr><th>级别</th><th>事件</th><th>负责方/状态</th><th>时间</th></tr></thead>
            <tbody>
              <tr v-for="i in list" :key="i.id" class="clickable" @click="openIt(i)">
                <td>
                  <span class="tag" :class="severityMeta[i.severity].cls">{{ severityMeta[i.severity].label }}</span>
                </td>
                <td>
                  <div style="font-weight:600">{{ incidentTypeMeta[i.type].icon }} {{ i.title }}</div>
                  <div class="small muted">{{ i.no }}
                    <span v-if="i.night" class="tag st-info" style="margin:0 4px">夜间</span>
                    <span v-if="i.carryOver && i.status !== 'closed'" class="tag sev-high">遗留</span>
                    <span v-if="i.blackout" class="tag st-bad">停电</span>
                  </div>
                </td>
                <td class="small">
                  <div><span class="tag" :class="statusCls[i.status]">{{ statusLabel[i.status] }}</span></div>
                  <div class="muted mt8">{{ ownerName(i.owner) }} · {{ i.actions.length }} 条记录</div>
                </td>
                <td class="small muted nowrap">{{ fmtTime(i.createdAt) }}</td>
              </tr>
              <tr v-if="!list.length"><td colspan="4" class="empty">当前筛选下没有事件</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 角色待办视图 -->
      <div>
        <div class="card">
          <div class="card-hd"><h3>🧭 我的待办（按当前登录角色）</h3>
            <span class="sub">{{ auth.account?.name }} · {{ roleNames[auth.account!.role] }}</span>
          </div>
          <div class="card-bd flush">
            <table class="tbl">
              <tbody>
                <tr v-for="i in list.filter(x => x.owner === auth.account?.role && x.status !== 'closed').slice(0,8)" :key="i.id" class="clickable" @click="openIt(i)">
                  <td style="width:30px; font-size:17px">{{ incidentTypeMeta[i.type].icon }}</td>
                  <td>
                    <div style="font-weight:600">{{ i.title }}</div>
                    <div class="small muted">{{ statusLabel[i.status] }} · 共 {{ i.actions.length }} 条处置记录</div>
                  </td>
                  <td class="right"><span class="tag" :class="severityMeta[i.severity].cls">{{ severityMeta[i.severity].label }}</span></td>
                </tr>
                <tr v-if="!list.some(x => x.owner === auth.account?.role && x.status !== 'closed')">
                  <td colspan="3" class="empty">当前没有分派给本角色的待办 🎉</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-hd"><h3>🌃 夜间无人值守联动说明</h3></div>
          <div class="card-bd small" style="line-height:1.9">
            <p>夜间异常事件（门禁闯入、摄像头离线、消防告警、异常声音、读者求助）在事件详情中可：</p>
            <ul style="padding-left:18px;list-style:disc">
              <li><b>一键转安保调度中心</b>：就近派勤、远程喊话并录像固证；</li>
              <li><b>一键转街道值班</b>：疑似入侵/火情同步街道，必要时拨打 110/119；</li>
              <li>处置全程在同一事件下留痕，设备维护、读者服务按 SOP 接力。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建事件弹层 -->
    <template v-if="showCreate">
      <div class="drawer-mask" @click="showCreate = false"></div>
      <div class="drawer">
        <div class="drawer-hd"><h3>人工上报事件</h3></div>
        <div class="drawer-bd">
          <label class="field">事件类型
            <select class="input" v-model="cType">
              <option v-for="(m, k) in incidentTypeMeta" :key="k" :value="k">{{ m.icon }} {{ m.label }}</option>
            </select>
          </label>
          <div class="grid grid-2">
            <label class="field">级别
              <select class="input" v-model="cSeverity">
                <option value="low">低</option><option value="medium">中</option>
                <option value="high">高</option><option value="urgent">紧急</option>
              </select>
            </label>
            <label class="field">发生时段
              <select class="input" v-model="cNight">
                <option :value="false">白天开放时段</option>
                <option :value="true">🌙 夜间/无人值守时段</option>
              </select>
            </label>
          </div>
          <label class="field">标题
            <input class="input" v-model="cTitle" placeholder="一句话说明事件">
          </label>
          <label class="field">详情
            <textarea class="input" rows="5" v-model="cDetail" placeholder="时间、地点、现状、已采取措施……"></textarea>
          </label>
        </div>
        <div class="drawer-ft row">
          <button class="btn ghost" @click="showCreate = false">取消</button>
          <div class="spacer"></div>
          <button class="btn amber" @click="createIncident">创建并进入处置</button>
        </div>
      </div>
    </template>

    <IncidentDrawer :incident="selected" @close="selected = null" />
  </div>
</template>
