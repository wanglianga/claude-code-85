<script setup lang="ts">
import { computed } from 'vue'
import { useArchiveViewer } from '@/composables/useArchiveViewer'
import { useIncidentViewer } from '@/composables/useIncidentViewer'
import { useStrandedViewer } from '@/composables/useStrandedViewer'
import { useFaultViewer } from '@/composables/useFaultViewer'
import { useSystemStore } from '@/stores/system'
import { useIncidentStore } from '@/stores/incident'
import { useBranchStore } from '@/stores/branch'
import { useFaultsStore } from '@/stores/faults'
import { useBlackoutStore } from '@/stores/blackout'
import { incidentTypeMeta, severityMeta, deviceTypeMeta } from '@/data/meta'
import { fmtDateTime, fmtDuration, fmtTime } from '@/utils/format'
import type { BlackoutEvent, CheckState, DeviceFaultReport, Visit } from '@/types'

const archiveViewer = useArchiveViewer()
const incidentViewer = useIncidentViewer()
const strandedViewer = useStrandedViewer()
const faultViewer = useFaultViewer()
const system = useSystemStore()
const incStore = useIncidentStore()
const branch = useBranchStore()
const faults = useFaultsStore()
const blackout = useBlackoutStore()

const archive = computed(() => archiveViewer.archive.value)

const libName = (id: string) => system.libraries.find((l) => l.id === id)?.name ?? id

const stateLabel: Record<CheckState, { text: string; cls: string; ico: string }> = {
  pending: { text: '未检查', cls: 'st-off', ico: '⬜' },
  normal: { text: '正常', cls: 'st-ok', ico: '✅' },
  abnormal: { text: '异常', cls: 'st-bad', ico: '⚠️' },
  na: { text: '不适用', cls: 'st-off', ico: '➖' }
}

const handoverItems = computed(() => archive.value?.items.filter((i) => i.scope === 'handover') ?? [])
const unmannedItems = computed(() => archive.value?.items.filter((i) => i.scope === 'unmanned') ?? [])
const carryIncidents = computed(() =>
  archive.value
    ? incStore.incidents.filter((i) => i.handoverArchiveId === archive.value!.id)
    : []
)
const stillOpen = computed(() => carryIncidents.value.filter((i) => i.status !== 'closed'))

function openIncident(id: string) {
  archiveViewer.close()
  incidentViewer.open(id)
}

/** 本夜滞留处置记录（快照中存 visit id，详情永久保存在 visits） */
const strandedVisits = computed<Visit[]>(() => {
  if (!archive.value?.archive?.strandedVisitIds) return []
  return archive.value.archive.strandedVisitIds
    .map((id) => branch.visits.find((v) => v.id === id))
    .filter((v): v is Visit => !!v && !!v.strandedHandling)
    .sort((a, b) => a.strandedHandling!.discoveredAt - b.strandedHandling!.discoveredAt)
})
function openStranded(v: Visit) {
  archiveViewer.close()
  strandedViewer.open(v.id)
}

/** 随档案跨日交接的未修复设备故障工单 */
const carriedFaults = computed<DeviceFaultReport[]>(() => {
  if (!archive.value?.archive?.carriedFaultIds) return []
  return archive.value.archive.carriedFaultIds
    .map((id) => faults.byId(id))
    .filter((f): f is DeviceFaultReport => !!f)
})
function openFault(id: string) {
  archiveViewer.close()
  faultViewer.open(id)
}

/** 本营业日发生的停电应急处置单（随档案留存，未闭环的无法完成交接） */
const blackoutEvents = computed<BlackoutEvent[]>(() => {
  const ids = archive.value?.archive?.blackoutEventIds ?? []
  return ids.map((id) => blackout.byId(id)).filter((e): e is BlackoutEvent => !!e)
})

const sigRows = computed(() => [
  { key: 'people' as const, label: '人员交接' },
  { key: 'books' as const, label: '图书交接' },
  { key: 'devices' as const, label: '设备交接' },
  { key: 'safety' as const, label: '公共安全交接' }
])
function sigName(key: 'people' | 'books' | 'devices' | 'safety'): string {
  return archive.value?.archive?.signatures[key] ?? ''
}
</script>

<template>
  <template v-if="archive">
    <div class="drawer-mask" style="z-index:60" @click="archiveViewer.close()"></div>
    <aside class="drawer" style="z-index:61; width:640px">
      <div class="drawer-hd">
        <div class="row">
          <span style="font-size:22px">📜</span>
          <div>
            <div class="row" style="gap:8px">
              <h3 style="font-size:16px">夜间闭馆交接档案（只读）</h3>
              <span class="tag st-ok">🔒 已固化</span>
            </div>
            <div class="small muted mt8">
              {{ libName(archive.libraryId) }} · 营业日 {{ archive.date }}
              · 完成于 {{ fmtDateTime(archive.archive!.finishedAt) }} {{ fmtTime(archive.archive!.finishedAt) }}
            </div>
          </div>
          <div class="spacer"></div>
          <button class="mini-btn" @click="archiveViewer.close()">✕</button>
        </div>
      </div>

      <div class="drawer-bd">
        <div class="banner" style="background:#eef4ec;border:1px solid #cfe2c8;color:#2f5d28">
          <span>✅</span>
          <div class="small">
            <b>交接结论：</b>{{ archive.archive!.conclusion }}<br />
            交接人：{{ archive.archive!.closedBy }} ｜ 闭馆后灯光空调复核：
            <b>{{ archive.archive!.afterCloseCheck ? '已复核关闭' : '未复核' }}</b>
          </div>
        </div>

        <!-- 四方签字 -->
        <div class="card">
          <div class="card-hd"><h3>✍️ 四方交接签字</h3></div>
          <div class="card-bd grid grid-4" style="gap:8px">
            <div v-for="row in sigRows" :key="row.key"
                 class="sig-box" :class="{ signed: !!sigName(row.key) }">
              <div class="small muted">{{ row.label }}</div>
              <div class="sig-name mt8">{{ sigName(row.key) || '缺签' }}</div>
            </div>
          </div>
        </div>

        <!-- 12 项巡检结果快照 -->
        <div class="card">
          <div class="card-hd"><h3>🔒 闭馆交接巡检（7 项）</h3>
            <span class="sub">完成时快照，不随后续操作改变</span>
          </div>
          <div class="card-bd">
            <div v-for="item in handoverItems" :key="item.key" class="check-item"
                 :class="{ abnormal: item.state === 'abnormal', done: item.state === 'normal' || item.state === 'na' }">
              <span class="check-ico">{{ stateLabel[item.state].ico }}</span>
              <div>
                <div style="font-weight:600">{{ item.label }}</div>
                <div class="small muted mt8" v-if="item.confirmedBy">
                  {{ item.confirmedBy }} · {{ fmtTime(item.confirmedAt) }}<template v-if="item.remark">：{{ item.remark }}</template>
                </div>
                <button v-if="item.incidentId" class="mini-btn mt8" style="border-color:#e6aab3;color:var(--bad)"
                        @click="item.incidentId && openIncident(item.incidentId)">
                  🔗 查看关联事件
                </button>
              </div>
              <div class="check-state">
                <span class="tag" :class="stateLabel[item.state].cls">{{ stateLabel[item.state].text }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-hd"><h3>📹 无人值守技防巡检（5 项）</h3></div>
          <div class="card-bd">
            <div v-for="item in unmannedItems" :key="item.key" class="check-item"
                 :class="{ abnormal: item.state === 'abnormal', done: item.state === 'normal' || item.state === 'na' }">
              <span class="check-ico">{{ stateLabel[item.state].ico }}</span>
              <div>
                <div style="font-weight:600">{{ item.label }}</div>
                <div class="small muted mt8" v-if="item.confirmedBy">
                  {{ item.confirmedBy }} · {{ fmtTime(item.confirmedAt) }}<template v-if="item.remark">：{{ item.remark }}</template>
                </div>
                <button v-if="item.incidentId" class="mini-btn mt8" style="border-color:#e6aab3;color:var(--bad)"
                        @click="item.incidentId && openIncident(item.incidentId)">
                  🔗 查看关联夜间事件
                </button>
              </div>
              <div class="check-state">
                <span class="tag" :class="stateLabel[item.state].cls">{{ stateLabel[item.state].text }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 本夜滞留处置记录 -->
        <div class="card" v-if="strandedVisits.length">
          <div class="card-hd">
            <h3>🧍 本夜滞留处置记录（{{ strandedVisits.length }}）</h3>
            <span class="sub">含身份、区域、门禁、安保到场、解释、决策、监护人沟通与最终离馆时间</span>
          </div>
          <div class="card-bd flush">
            <table class="tbl">
              <thead><tr><th>读者</th><th>发现区域/时间</th><th>安保到场</th><th>决策</th><th>监护人</th><th>最终离馆</th><th class="right">详情</th></tr></thead>
              <tbody>
                <tr v-for="v in strandedVisits" :key="v.id" class="clickable">
                  <td>{{ v.readerName }}<span v-if="v.isChild" class="tag st-info" style="margin-left:4px">未成年</span></td>
                  <td class="small">{{ v.strandedHandling!.zone }}<div class="muted">{{ fmtTime(v.strandedHandling!.discoveredAt) }}</div></td>
                  <td class="small">
                    <span v-if="v.strandedHandling!.arrivedAt" class="good-text">{{ fmtTime(v.strandedHandling!.arrivedAt) }} {{ v.strandedHandling!.securityName }}</span>
                    <span v-else class="bad-text">未到场</span>
                  </td>
                  <td class="small">
                    <span v-if="v.strandedHandling!.decision === 'persuade-leave'" class="tag st-ok">劝离</span>
                    <span v-else-if="v.strandedHandling!.decision === 'extended-stay'" class="tag st-warn">延时</span>
                    <span v-else-if="v.strandedHandling!.decision === 'police'" class="tag st-bad">报警</span>
                    <span v-else class="muted">—</span>
                  </td>
                  <td class="small">
                    <template v-if="v.isChild">
                      <span v-if="v.strandedHandling!.guardianNotified" class="good-text">已通知 ✔</span>
                      <span v-else class="bad-text">未联系</span>
                    </template>
                    <span v-else class="muted">成年人</span>
                  </td>
                  <td class="small">
                    <span v-if="v.strandedHandling!.leftAt" class="good-text">{{ fmtDateTime(v.strandedHandling!.leftAt) }} {{ fmtTime(v.strandedHandling!.leftAt) }}</span>
                    <span v-else class="bad-text">未离馆</span>
                  </td>
                  <td class="right"><button class="mini-btn" @click="openStranded(v)">处置记录</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 跨日交接的设备故障工单 -->
        <div class="card" v-if="carriedFaults.length">
          <div class="card-hd">
            <h3>🛠️ 跨日设备故障工单（{{ carriedFaults.length }}）</h3>
            <span class="sub">照片/报修时间/影响读者/维修联系人已保留到次日，开馆前确认停用或临时恢复</span>
          </div>
          <div class="card-bd flush">
            <table class="tbl">
              <thead><tr><th>工单</th><th>设备</th><th>报修时间</th><th>照片</th><th>影响</th><th>联系人</th><th class="right">详情</th></tr></thead>
              <tbody>
                <tr v-for="f in carriedFaults" :key="f.id" class="clickable" @click="openFault(f.id)">
                  <td class="small">{{ f.no }}</td>
                  <td class="small"><b>{{ f.deviceName }}</b><div class="muted">{{ deviceTypeMeta[f.deviceType] }}</div></td>
                  <td class="small nowrap">{{ fmtDateTime(f.reportedAt) }}</td>
                  <td>{{ f.photos.length }} 张</td>
                  <td class="small">{{ f.affectedReaderCount }} 人次</td>
                  <td class="small">{{ f.maintainerName }}<div class="muted">{{ f.maintainerPhone }}</div></td>
                  <td class="right"><button class="mini-btn" @click.stop="openFault(f.id)">工单</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 停电应急联动处置单 -->
        <div class="card" v-if="blackoutEvents.length">
          <div class="card-hd">
            <h3>⚡ 突发停电应急处置（{{ blackoutEvents.length }}）</h3>
            <span class="sub">受影响范围、门禁消防联动、紧急升级、暂存补录、夜间恢复确认与复盘随档案留存</span>
          </div>
          <div class="card-bd flush">
            <table class="tbl">
              <thead><tr><th>处置单</th><th>停电小区/时长</th><th>门禁/紧急事件</th><th>借还暂存</th><th>夜间恢复/自检</th><th>状态</th></tr></thead>
              <tbody>
                <tr v-for="e in blackoutEvents" :key="e.id">
                  <td class="small"><b>{{ e.no }}</b><div class="muted">{{ fmtDateTime(e.startedAt) }} {{ fmtTime(e.startedAt) }}</div></td>
                  <td class="small">{{ e.community }}<div class="muted">
                    {{ e.restoredAt ? fmtDuration(e.startedAt, e.restoredAt) : '未恢复' }}
                  </div></td>
                  <td class="small">
                    门禁：<b :class="e.gateFailed ? 'bad-text' : 'good-text'">{{ e.gateFailed ? '失效' : 'UPS 维持' }}</b>
                    <span v-if="e.gateFallback !== 'none'" class="tag st-info" style="margin-left:4px">{{ e.gateFallback === 'mechanical-key' ? '机械钥匙' : '临时开门' }}</span>
                    <div class="mt8">
                      <span v-if="e.escalations.length" class="tag" :class="e.escalations.some(x => !x.resolved) ? 'sev-urgent' : 'st-ok'">
                        紧急事件 {{ e.escalations.filter(x => x.resolved).length }}/{{ e.escalations.length }} 解除
                      </span>
                      <span v-else class="muted">无紧急事件</span>
                    </div>
                  </td>
                  <td class="small">
                    共 {{ e.pendingLoans.length }} 笔<div class="muted">已补录 {{ e.pendingLoans.filter(l => l.status === 'backfilled').length }}</div>
                  </td>
                  <td class="small">
                    <template v-if="e.night">{{ e.nightItems.filter(i => i.state === 'ok').length }}/{{ e.nightItems.length }} 项确认</template>
                    <span v-else class="muted">白天停电</span>
                    <div class="muted">自检失败工单 {{ e.carriedFaultIds.length }} 起</div>
                  </td>
                  <td>
                    <span class="tag" :class="e.phase === 'closed' ? 'st-ok' : 'sev-urgent'">{{ e.phase === 'closed' ? '已复盘闭环' : '处置未闭环' }}</span>
                    <button v-if="e.incidentId" class="mini-btn mt8" style="display:block" @click.stop="e.incidentId && openIncident(e.incidentId)">停电事件</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 随档案移交的事件 -->
        <div class="card">
          <div class="card-hd">
            <h3>📎 随本档案移交的事件（{{ carryIncidents.length }}）</h3>
            <span class="sub">次日仍未闭环 {{ stillOpen.length }} 件，可回链本档案</span>
          </div>
          <div class="card-bd flush">
            <table class="tbl">
              <tbody>
                <tr v-for="i in carryIncidents" :key="i.id" class="clickable" @click="openIncident(i.id)">
                  <td style="width:30px;font-size:17px">{{ incidentTypeMeta[i.type].icon }}</td>
                  <td>
                    <div style="font-weight:600">{{ i.title }}</div>
                    <div class="small muted">
                      <span class="tag" :class="severityMeta[i.severity].cls">{{ severityMeta[i.severity].label }}</span>
                      <span class="tag" :class="i.status === 'closed' ? 'st-off' : 'st-bad'" style="margin-left:4px">
                        {{ i.status === 'closed' ? '已归档' : '次日遗留待办' }}
                      </span>
                    </div>
                  </td>
                </tr>
                <tr v-if="!carryIncidents.length"><td class="empty">交接时无未闭环事件</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="drawer-ft">
        <span class="small muted">🔒 该档案为夜间交接固化快照，任何开馆/重置操作均不可改写。</span>
        <div class="spacer"></div>
        <button class="btn ghost" @click="archiveViewer.close()">关 闭</button>
      </div>
    </aside>
  </template>
</template>
