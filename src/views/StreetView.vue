<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { useBlackoutStore } from '@/stores/blackout'
import { useIncidentStore } from '@/stores/incident'
import { useAuthStore, roleNames } from '@/stores/auth'
import { useIncidentViewer } from '@/composables/useIncidentViewer'
import { fmtDateTime, fmtDuration, fmtTime } from '@/utils/format'
import type { BlackoutEvent } from '@/types'

const system = useSystemStore()
const blackout = useBlackoutStore()
const incStore = useIncidentStore()
const auth = useAuthStore()
const incidentViewer = useIncidentViewer()
const { now } = storeToRefs(system)

const rows = computed(() => blackout.streetRows)
const history = computed(() =>
  blackout.events
    .filter((e) => e.phase === 'closed')
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
)

const selectedId = ref<string | null>(null)
const selected = computed<BlackoutEvent | undefined>(() =>
  selectedId.value ? blackout.byId(selectedId.value) : rows.value[0]?.event
)
const guidance = ref('')

function libName(id: string) {
  return system.libraries.find((l) => l.id === id)?.name ?? id
}
function libOf(id: string) {
  return system.libraries.find((l) => l.id === id)
}
function people(e: BlackoutEvent) {
  return blackout.peopleCount(e)
}

const phaseLabel: Record<string, { text: string; cls: string }> = {
  blackout: { text: '停电处置中', cls: 'sev-high' },
  urgent: { text: '紧急事件', cls: 'sev-urgent' },
  recovered: { text: '来电自检中', cls: 'st-info' },
  closed: { text: '已闭环', cls: 'st-ok' }
}

function sendGuidance() {
  if (!selected.value || !guidance.value.trim()) return
  blackout.streetGuidance(selected.value.id, auth.account?.name ?? '街道值班', now.value, guidance.value)
  guidance.value = ''
}

function openIncident(e: BlackoutEvent) {
  if (e.incidentId) incidentViewer.open(e.incidentId)
}

const relatedIncidents = computed(() => {
  if (!selected.value) return []
  return incStore.ofLibrary(selected.value.libraryId).filter((i) => i.blackout)
})

function ownerText(owner: 'admin' | 'security' | 'maintainer' | 'service' | 'volunteer' | 'street' | null): string {
  if (!owner) return '待受理'
  return owner === 'street' ? '街道值班' : roleNames[owner]
}
</script>

<template>
  <div>
    <div class="banner night">
      <span style="font-size:22px">🏙️</span>
      <div>
        <b>街道值班应急联动台</b> · {{ auth.account?.name }}
        <div class="small">跨书房实时掌握：停电小区、影响书房、在馆人数与处置进展；可下发处置指导，紧急情况督促同步消防。</div>
      </div>
      <div class="spacer"></div>
      <div class="metric-strip" style="color:#e7eef8">
        <span>进行中停电 <b style="color:#ffd166">{{ rows.length }}</b> 起</span>
        <span>紧急 <b style="color:#ff8fa3">{{ rows.filter(r => r.urgent).length }}</b> 起</span>
        <span>受影响在馆 <b style="color:#fff">{{ rows.reduce((s, r) => s + r.people, 0) }}</b> 人</span>
      </div>
    </div>

    <div v-if="!rows.length" class="card">
      <div class="card-bd empty">当前辖区无进行中的突发停电事件。书房触发停电后将自动汇聚到本台。</div>
    </div>

    <div class="grid" v-else style="grid-template-columns: 1.15fr 1fr">
      <!-- 左：跨书房列表 -->
      <div>
        <div class="card">
          <div class="card-hd"><h3>⚡ 停电书房汇总（跨辖区）</h3><span class="sub">按紧急程度排序</span></div>
          <div class="card-bd flush">
            <table class="tbl">
              <thead><tr><th>停电小区</th><th>影响书房</th><th>在馆</th><th>阶段</th><th>时长</th></tr></thead>
              <tbody>
                <tr v-for="r in rows" :key="r.event.id" class="clickable"
                    :style="r.urgent ? 'background:#fff5f6' : ''"
                    @click="selectedId = r.event.id">
                  <td class="small"><b>{{ r.community }}</b><div class="muted">{{ r.address }}</div></td>
                  <td>{{ r.libraryName }}</td>
                  <td><b>{{ r.people }}</b> 人</td>
                  <td>
                    <span class="tag" :class="phaseLabel[r.phase].cls">{{ phaseLabel[r.phase].text }}</span>
                    <span v-if="r.urgent" class="pulse-dot" style="margin-left:6px"></span>
                  </td>
                  <td class="small nowrap">{{ fmtDuration(r.startedAt, r.event.restoredAt ?? now) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 已闭环复盘历史 -->
        <div class="card" v-if="history.length">
          <div class="card-hd"><h3>📋 近期停电复盘</h3></div>
          <div class="card-bd flush">
            <table class="tbl">
              <tbody>
                <tr v-for="e in history.slice(0, 5)" :key="e.id" class="clickable" @click="selectedId = e.id">
                  <td>{{ libName(e.libraryId) }}</td>
                  <td class="small">{{ e.community }}</td>
                  <td class="small">停电 {{ e.review?.durationMin ?? '—' }} 分钟</td>
                  <td class="small">求助 {{ e.helps.length }} 起 · 改进项 {{ e.review?.improvements.length ?? 0 }} 条</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 右：详情 + 指导 -->
      <div v-if="selected">
        <div class="card" :class="selected.phase === 'urgent' ? 'alert' : ''">
          <div class="card-hd">
            <h3>📍 {{ libName(selected.libraryId) }} · 处置进展</h3>
            <span class="tag" :class="phaseLabel[selected.phase].cls">{{ phaseLabel[selected.phase].text }}</span>
          </div>
          <div class="card-bd small" style="line-height:2">
            <div>● 停电小区：<b>{{ selected.community }}</b>（{{ libOf(selected.libraryId)?.district }}）</div>
            <div>● 开始：{{ fmtDateTime(selected.startedAt) }} {{ fmtTime(selected.startedAt) }}
              <span v-if="selected.restoredAt">；来电：{{ fmtDateTime(selected.restoredAt) }} {{ fmtTime(selected.restoredAt) }}</span>
            </div>
            <div>● 当前在馆 <b>{{ people(selected) }}</b> 人 · 门禁：
              <b :class="selected.gateFailed ? 'bad-text' : 'good-text'">{{ selected.gateFailed ? '已失效' : 'UPS 维持' }}</b>
              <span v-if="selected.gateFallback !== 'none'">（{{ selected.gateFallback === 'mechanical-key' ? '机械钥匙' : '临时开门' }}）</span>
            </div>
            <div>● 紧急事件：
              <span v-if="!selected.escalations.length" class="muted">无</span>
              <span v-for="esc in selected.escalations" :key="esc.reason" class="tag" style="margin:2px"
                    :class="esc.resolved ? 'st-ok' : 'sev-urgent'">
                {{ esc.label }}{{ esc.resolved ? '·已解除' : '' }}
              </span>
            </div>
            <div>● 街道同步：<b :class="selected.streetNotified ? 'good-text' : 'bad-text'">{{ selected.streetNotified ? '已同步 ' + fmtTime(selected.streetNotifiedAt) : '未同步' }}</b>
              ｜消防：<b :class="selected.fireNotified ? 'good-text' : 'bad-text'">{{ selected.fireNotified ? '已联系' : '未联系' }}</b>
            </div>
            <div>● 借还暂存 {{ selected.pendingLoans.length }} 笔（待补 {{ selected.pendingLoans.filter(l => l.status === 'pending').length }}）· 读者求助 {{ selected.helps.length }} 起 · 自检失败工单 {{ selected.carriedFaultIds.length }} 起</div>
            <button class="mini-btn mt8" @click="openIncident(selected)">🔗 查看停电主事件与协同留痕</button>
          </div>
        </div>

        <!-- 下发指导 -->
        <div class="card" v-if="selected.phase !== 'closed'">
          <div class="card-hd"><h3>📣 下发处置指导</h3><span class="sub">写入书房应急时间线与事件留痕</span></div>
          <div class="card-bd">
            <div class="row mb8">
              <button class="btn ghost sm" @click="guidance = '街道已知悉，请立即清点人数、保持消防通道畅通，每 15 分钟回报处置进展。'">模板：知悉+定时回报</button>
              <button class="btn urgent sm" @click="guidance = '紧急情况：立即拨打 119 并组织疏散到集合点，街道已协调社区与消防站到场支援。'">模板：紧急疏散支援</button>
            </div>
            <textarea class="input" rows="3" v-model="guidance" placeholder="向书房管理员/安保下发指导意见……"></textarea>
            <div class="mt8"><button class="btn amber" @click="sendGuidance">下发到书房应急指挥视图</button></div>
          </div>
        </div>

        <!-- 关联停电事件 -->
        <div class="card" v-if="relatedIncidents.length">
          <div class="card-hd"><h3>🚨 关联停电事件</h3></div>
          <div class="card-bd flush">
            <table class="tbl">
              <tbody>
                <tr v-for="i in relatedIncidents" :key="i.id" class="clickable" @click="incidentViewer.open(i.id)">
                  <td style="width:30px">⚡</td>
                  <td>
                    <div style="font-weight:600">{{ i.title }}</div>
                    <div class="small muted">{{ i.no }} · {{ ownerText(i.owner) }} · {{ fmtTime(i.createdAt) }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 进展时间线（只读） -->
        <div class="card">
          <div class="card-hd"><h3>🕓 处置进展时间线</h3><span class="sub">{{ selected.logs.length }} 条</span></div>
          <div class="card-bd">
            <div class="timeline">
              <div v-for="(l, i) in selected.logs.slice(0, 14)" :key="i" class="tl-item" :class="{ sys: l.role === 'system' }">
                <div>
                  <span class="tl-who">{{ l.actor }}</span>
                  <span class="tag" style="margin-left:6px">{{ l.role === 'system' ? '系统' : l.role === 'street' ? '街道值班' : roleNames[l.role] ?? l.role }}</span>
                  <span class="tl-time">{{ fmtDateTime(l.at) }} {{ fmtTime(l.at) }}</span>
                </div>
                <div class="tl-text">{{ l.text }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
