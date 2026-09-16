<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'
import { useBranchStore } from '@/stores/branch'
import { useIncidentStore } from '@/stores/incident'
import { fmtDateTime, fmtTime } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import IncidentDrawer from '@/components/IncidentDrawer.vue'
import type { Incident } from '@/types'

const auth = useAuthStore()
const system = useSystemStore()
const branch = useBranchStore()
const incStore = useIncidentStore()
const toast = useToast()
const { now } = storeToRefs(system)

// 志愿者限定在自己的书房；其他角色可查看当前书房
const myLibraryId = computed(
  () => auth.account?.role === 'volunteer'
    ? auth.account.libraryId ?? system.currentLibraryId
    : system.currentLibraryId
)
const myLibrary = computed(() => system.libraries.find((l) => l.id === myLibraryId.value)!)

const patrols = computed(() =>
  branch.patrols
    .filter((p) => p.libraryId === myLibraryId.value)
    .sort((a, b) => b.at - a.at)
)

const routePresets = ['正门→借阅区→少儿区→饮水角→消防通道', '一楼全层→卫生间→书库→正门', '少儿区→多功能间→门厅→外墙还书箱']
const route = ref(routePresets[0])
const findings = ref('')
const needIncident = ref(false)
const incidentTitle = ref('')
const incidentSeverity = ref<'low' | 'medium' | 'high'>('medium')

function submitPatrol() {
  if (!findings.value.trim()) {
    toast.bad('请填写巡馆发现')
    return
  }
  let incidentId: string | undefined
  if (needIncident.value) {
    const inc = incStore.create({
      libraryId: myLibraryId.value,
      type: 'patrol',
      severity: incidentSeverity.value,
      title: incidentTitle.value || `志愿者巡馆上报：${findings.value.slice(0, 16)}`,
      detail: `志愿者${auth.account?.name}巡馆发现：${findings.value}。路线：${route.value}。请读者服务/安保按职责跟进。`,
      at: now.value,
      owner: incidentSeverity.value === 'high' ? 'security' : 'service'
    })
    incidentId = inc.id
    selected.value = inc
  }
  branch.addPatrol({
    libraryId: myLibraryId.value,
    volunteer: auth.account?.name ?? '志愿者',
    at: now.value,
    route: route.value,
    findings: findings.value,
    incidentId
  })
  toast.ok('巡馆记录已提交')
  findings.value = ''
  needIncident.value = false
  incidentTitle.value = ''
}

const selected = ref<Incident | null>(null)
const linkedIncident = (id?: string) => (id ? incStore.incidents.find((i) => i.id === id) : null)
function openLinked(id?: string) {
  const inc = linkedIncident(id)
  if (inc) selected.value = inc
}

// 志愿者视角的今日摘要
const visits = computed(() => branch.activeVisits(myLibraryId.value))
const openIncidents = computed(() =>
  incStore.ofLibrary(myLibraryId.value).filter((i) => i.status !== 'closed')
)
</script>

<template>
  <div>
    <div class="banner night">
      <span style="font-size:20px">🧑‍🌾</span>
      <div>
        <b>志愿者巡馆工作台 · {{ myLibrary.name }}</b>
        <div class="small">记录巡馆路线与发现；安全问题一键转事件，由读者服务/安保接力处置。志愿者提交的记录会同步给管理员。</div>
      </div>
    </div>

    <div class="grid grid-4 mb16">
      <div class="kpi"><div class="k-ico">👥</div><div class="k-label">当前在馆</div><div class="k-value">{{ visits.length }}</div></div>
      <div class="kpi"><div class="k-ico">🧒</div><div class="k-label">儿童读者</div>
        <div class="k-value">{{ visits.filter(v => v.isChild).length }}</div></div>
      <div class="kpi" :class="{ alert: openIncidents.length }"><div class="k-ico">🚨</div><div class="k-label">本馆未结事件</div>
        <div class="k-value">{{ openIncidents.length }}</div></div>
      <div class="kpi"><div class="k-ico">🧭</div><div class="k-label">本月巡馆</div>
        <div class="k-value">{{ patrols.length }}</div></div>
    </div>

    <div class="grid" style="grid-template-columns: 1.1fr 1fr">
      <div class="card">
        <div class="card-hd"><h3>提交巡馆记录</h3><span class="sub">{{ fmtTime(now) }}</span></div>
        <div class="card-bd">
          <label class="field">巡馆路线
            <select class="input" v-model="route">
              <option v-for="r in routePresets" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>
          <label class="field">巡馆发现（秩序、环境、错架、设备、安全隐患等）
            <textarea class="input" rows="4" v-model="findings" placeholder="如：少儿区绘本两册错架已归位；提醒读者保持安静；消防通道堆放纸箱……"></textarea>
          </label>
          <label class="row small" style="gap:8px">
            <input type="checkbox" v-model="needIncident">
            发现需要工作人员跟进的问题，同时生成协同事件
          </label>
          <div v-if="needIncident" class="card mt8" style="background:#f8fafd;box-shadow:none">
            <div class="card-bd">
              <label class="field">事件标题（可留空自动生成）
                <input class="input" v-model="incidentTitle" placeholder="一句话说明">
              </label>
              <label class="field" style="margin-bottom:0">紧急程度
                <select class="input" v-model="incidentSeverity">
                  <option value="low">低（环境/整理类）</option>
                  <option value="medium">中（服务类，转读者服务）</option>
                  <option value="high">高（安全类，立即转安保）</option>
                </select>
              </label>
            </div>
          </div>
          <button class="btn amber mt12" @click="submitPatrol">✅ 提交巡馆记录</button>
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><h3>巡馆历史</h3></div>
        <div class="card-bd flush">
          <table class="tbl">
            <thead><tr><th>时间</th><th>志愿者</th><th>路线/发现</th><th>事件</th></tr></thead>
            <tbody>
              <tr v-for="p in patrols" :key="p.id">
                <td class="small muted nowrap">{{ fmtDateTime(p.at) }}<br>{{ fmtTime(p.at) }}</td>
                <td class="small">{{ p.volunteer }}</td>
                <td class="small">
                  <div class="muted">{{ p.route }}</div>
                  <div style="margin-top:2px">{{ p.findings }}</div>
                </td>
                <td>
                  <button v-if="p.incidentId" class="mini-btn" @click="openLinked(p.incidentId)">查看事件</button>
                  <span v-else class="tag st-ok">仅记录</span>
                </td>
              </tr>
              <tr v-if="!patrols.length"><td colspan="4" class="empty">暂无巡馆记录</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <IncidentDrawer :incident="selected" @close="selected = null" />
  </div>
</template>
