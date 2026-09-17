<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { useBranchStore } from '@/stores/branch'
import { useIncidentStore } from '@/stores/incident'
import { useFaultsStore } from '@/stores/faults'
import { useAuthStore } from '@/stores/auth'
import { deviceStatusMeta, deviceTypeMeta } from '@/data/meta'
import { fmtDateTime, fmtTime } from '@/utils/format'
import type { Device, DeviceStatus } from '@/types'
import { useToast } from '@/composables/useToast'
import { useIncidentViewer } from '@/composables/useIncidentViewer'
import { useFaultViewer } from '@/composables/useFaultViewer'

const system = useSystemStore()
const branch = useBranchStore()
const incStore = useIncidentStore()
const faults = useFaultsStore()
const auth = useAuthStore()
const toast = useToast()
const { now } = storeToRefs(system)
const incidentViewer = useIncidentViewer()
const faultViewer = useFaultViewer()

const readOnly = computed(() => auth.account?.role === 'volunteer' || auth.account?.role === 'service')
const isMaintainer = computed(() => auth.account?.role === 'maintainer' || auth.account?.role === 'admin')

const filterType = ref<string>('')
const devices = computed(() =>
  branch.devicesOf(system.currentLibraryId).filter((d) => !filterType.value || d.type === filterType.value)
)

const techDefense = computed(() =>
  devices.value.filter((d) => ['gate', 'camera', 'fire', 'smoke', 'audio', 'help', 'ups', 'exitlight'].includes(d.type))
)
const selfService = computed(() =>
  devices.value.filter((d) => ['selfkiosk', 'printer', 'water', 'returnbox', 'ac', 'freshair', 'light'].includes(d.type))
)

const abnormalCount = computed(() =>
  devices.value.filter((d) => ['fault', 'alarm', 'offline'].includes(d.status)).length
)

const faultReports = computed(() => faults.ofLibrary(system.currentLibraryId))
const pendingDecisions = computed(() => faults.pendingOpenDecision(system.currentLibraryId))

function changeStatus(d: Device, status: DeviceStatus) {
  branch.setDeviceStatus(d.id, status, d.note)
  if (status === 'normal' || status === 'online') {
    toast.ok(`${d.name} 已恢复`)
  } else if (status === 'off') {
    toast.info(`${d.name} 已关闭`)
  }
}

/** 上报故障：打开故障工单抽屉（照片/联系人/影响；同步生成事件） */
function reportFault(d: Device) {
  faultViewer.openCreate(d.id)
}
function openFault(id: string) {
  faultViewer.open(id)
}

function emptyBox(d: Device) {
  branch.setDeviceStatus(d.id, 'normal', '清运完成，已复位')
  branch.updateDevice(d.id, { level: 8 })
  toast.ok('还书箱已清运并复位')
  const inc = incStore.ofLibrary(system.currentLibraryId)
    .find((i) => i.type === 'box-full' && i.deviceId === d.id && i.status !== 'closed')
  if (inc) {
    incStore.act(inc.id, {
      role: auth.account?.role === 'volunteer' ? 'service' : auth.account!.role,
      actor: auth.account?.name ?? '',
      type: 'resolve',
      text: '还书箱清运完成，空箱复位',
      at: now.value
    })
  }
}

const faultStatusCls: Record<string, string> = {
  open: 'st-bad',
  'carried-over': 'sev-high',
  'continue-closed': 'st-bad',
  'temporary-recovery': 'st-warn',
  repaired: 'st-ok'
}
const faultStatusLabel: Record<string, string> = {
  open: '当日故障',
  'carried-over': '跨日待开馆确认',
  'continue-closed': '继续停用',
  'temporary-recovery': '临时恢复',
  repaired: '已修复'
}
</script>

<template>
  <div>
    <div class="grid grid-4 mb16">
      <div class="kpi" :class="{ alert: abnormalCount }">
        <div class="k-ico">⚠️</div>
        <div class="k-label">异常/告警设备</div>
        <div class="k-value">{{ abnormalCount }}</div>
      </div>
      <div class="kpi">
        <div class="k-ico">📹</div>
        <div class="k-label">技防设备在线率</div>
        <div class="k-value">
          {{ techDefense.length ? Math.round((techDefense.filter(d => d.status === 'online' || d.status === 'normal').length / techDefense.length) * 100) : 0 }}<span class="k-unit">%</span>
        </div>
      </div>
      <div class="kpi">
        <div class="k-ico">🖥️</div>
        <div class="k-label">自助服务设备</div>
        <div class="k-value">{{ selfService.filter(d => d.status === 'normal' || d.status === 'online').length }}<span class="k-unit">/{{ selfService.length }} 正常</span></div>
      </div>
      <div class="kpi night">
        <div class="k-ico">🌙</div>
        <div class="k-label">当前时段</div>
        <div class="k-value" style="font-size:20px">{{ system.isNight ? '无人值守' : '开放服务' }}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-bd row">
        <select class="input" style="width:180px" v-model="filterType">
          <option value="">全部设备类型</option>
          <option v-for="(label, key) in deviceTypeMeta" :key="key" :value="key">{{ label }}</option>
        </select>
        <span class="small muted">设备状态变更与故障工单、夜间事件联动；维护账号可标记修复。</span>
      </div>
    </div>

    <!-- 开馆前必须确认的跨日故障 -->
    <div v-if="pendingDecisions.length" class="banner danger">
      <span style="font-size:20px">🌅</span>
      <div>
        <b>开馆前确认：</b>{{ pendingDecisions.length }} 起设备故障跨日未修复，请管理员确认「继续停用（启用人工借还兜底）」或「临时恢复」，避免读者开馆后无处处理图书。
      </div>
      <button class="btn amber sm" @click="openFault(pendingDecisions[0].id)">立即确认 →</button>
    </div>

    <!-- 故障工单（跨日交接） -->
    <div class="card">
      <div class="card-hd">
        <h3>🛠️ 设备故障工单（跨日交接）</h3>
        <span class="sub">照片、报修时间、影响读者、维修联系人保留到次日；人工借还结束后自动补生成故障说明</span>
      </div>
      <div class="card-bd flush">
        <table class="tbl">
          <thead><tr><th>工单</th><th>设备</th><th>报修时间</th><th>照片</th><th>影响</th><th>维修联系人</th><th>状态</th><th>人工借还</th><th class="right">操作</th></tr></thead>
          <tbody>
            <tr v-for="f in faultReports" :key="f.id" class="clickable" @click="openFault(f.id)">
              <td class="small">{{ f.no }}</td>
              <td><b>{{ f.deviceName }}</b><div class="small muted">{{ f.faultDesc.slice(0, 22) }}…</div></td>
              <td class="small nowrap">{{ fmtDateTime(f.reportedAt) }}<div class="muted">{{ f.reporter }}</div></td>
              <td>{{ f.photos.length }} 张</td>
              <td class="small">{{ f.affectedReaderCount }} 人次</td>
              <td class="small">{{ f.maintainerName }}<div class="muted">{{ f.maintainerPhone }}</div></td>
              <td><span class="tag" :class="faultStatusCls[f.status]">{{ faultStatusLabel[f.status] }}</span>
                <div v-if="f.carriedToDate" class="small muted">至 {{ f.carriedToDate }}</div></td>
              <td class="small">
                <span v-if="f.manualSession?.status === 'active'" class="tag st-bad">进行中 {{ f.manualSession.records.length }} 笔</span>
                <span v-else-if="f.manualSession" class="tag st-ok">已结束 {{ f.statement?.recordCount ?? 0 }} 笔</span>
                <span v-else class="muted">—</span>
              </td>
              <td class="right"><button class="mini-btn" @click.stop="openFault(f.id)">处理</button></td>
            </tr>
            <tr v-if="!faultReports.length"><td colspan="9" class="empty">暂无故障工单</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-hd"><h3>📹 无人值守技防设备</h3>
          <span class="sub">门禁 · 摄像头 · 消防 · 异常声音 · 求助 · UPS</span>
        </div>
        <div class="card-bd flush">
          <table class="tbl">
            <thead><tr><th>设备</th><th>位置</th><th>状态</th><th>最近检查</th><th class="right">操作</th></tr></thead>
            <tbody>
              <tr v-for="d in techDefense" :key="d.id">
                <td><b>{{ deviceTypeMeta[d.type] }}</b><div class="small muted">{{ d.name }}</div></td>
                <td class="small">{{ d.location }}</td>
                <td>
                  <span class="tag" :class="deviceStatusMeta[d.status].cls">{{ deviceStatusMeta[d.status].label }}</span>
                  <div v-if="d.note" class="small bad-text mt8">{{ d.note }}</div>
                </td>
                <td class="small muted nowrap">{{ d.lastCheck ? fmtDateTime(d.lastCheck) : '—' }}</td>
                <td class="right">
                  <button class="mini-btn" @click="reportFault(d)" :disabled="readOnly">上报异常</button>
                  <button v-if="faults.faultOfDevice(d.id)" class="mini-btn" style="margin-left:4px;border-color:#e6aab3;color:var(--bad)" @click.stop="openFault(faults.faultOfDevice(d.id)!.id)">
                    工单 {{ faults.faultOfDevice(d.id)!.carriedToDate ? '·跨日' : '' }}
                  </button>
                  <button v-else-if="isMaintainer && d.status !== 'normal' && d.status !== 'online'" class="mini-btn" style="margin-left:4px" @click="changeStatus(d, d.type === 'camera' ? 'online' : 'normal')">修复</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-hd"><h3>🖥️ 自助服务与楼宇设备</h3>
          <span class="sub">借还机 · 打印 · 饮水 · 还书箱 · 空调 · 灯光</span>
        </div>
        <div class="card-bd flush">
          <table class="tbl">
            <thead><tr><th>设备</th><th>状态</th><th>容量</th><th class="right">操作</th></tr></thead>
            <tbody>
              <tr v-for="d in selfService" :key="d.id">
                <td><b>{{ d.name }}</b><div class="small muted">{{ d.location }}</div></td>
                <td>
                  <span class="tag" :class="deviceStatusMeta[d.status].cls">{{ deviceStatusMeta[d.status].label }}</span>
                  <div v-if="d.note" class="small muted mt8">{{ d.note }}</div>
                </td>
                <td style="width:120px">
                  <template v-if="d.level !== undefined">
                    <div class="progress"><div :class="d.level >= 90 ? 'bad' : d.level >= 70 ? 'warn' : 'good'" :style="{ width: d.level + '%' }"></div></div>
                    <div class="small muted mt8">{{ d.level }}%</div>
                  </template>
                  <span v-else class="muted small">—</span>
                </td>
                <td class="right">
                  <button v-if="d.type === 'returnbox'" class="mini-btn" @click="emptyBox(d)" :disabled="readOnly">清运复位</button>
                  <template v-else>
                    <button class="mini-btn" @click="reportFault(d)" :disabled="readOnly">上报故障</button>
                    <button v-if="faults.faultOfDevice(d.id)" class="mini-btn" style="margin-left:4px;border-color:#e6aab3;color:var(--bad)" @click.stop="openFault(faults.faultOfDevice(d.id)!.id)">
                      工单
                    </button>
                    <button v-else-if="isMaintainer && d.status === 'fault'" class="mini-btn" style="margin-left:4px" @click="changeStatus(d, 'normal')">修复</button>
                    <button v-if="(d.type === 'ac' || d.type === 'light' || d.type === 'selfkiosk') && isMaintainer && !faults.faultOfDevice(d.id)" class="mini-btn" style="margin-left:4px"
                      @click="changeStatus(d, d.status === 'off' ? 'normal' : 'off')">
                      {{ d.status === 'off' ? '开启' : '关闭' }}
                    </button>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-hd"><h3>🌃 无人值守时段技防策略</h3></div>
      <div class="card-bd small" style="line-height:1.9">
        <div class="grid grid-3">
          <div><b>🚪 门禁：</b>闭馆自动布防，非法开门触发事件并联动录像，自动通知安保。</div>
          <div><b>📹 摄像头：</b>夜间移动侦测 + 录像固证，离线超 30 分钟报街道备案。</div>
          <div><b>🔥 消防：</b>烟感/温感/手报 7×24 联网，告警直接升级紧急事件。</div>
          <div><b>🔊 异常声音：</b>玻璃破碎、敲击、呼救声纹识别，疑似入侵转街道并报警。</div>
          <div><b>🆘 读者求助：</b>一键求助夜间转值班手机，3 分钟到场承诺计时。</div>
          <div><b>🔋 UPS：</b>停电时保障应急照明、门禁与技防不少于 90 分钟。</div>
        </div>
      </div>
    </div>
  </div>
</template>
