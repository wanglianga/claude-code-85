<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { useBranchStore } from '@/stores/branch'
import { useIncidentStore } from '@/stores/incident'
import { useAuthStore } from '@/stores/auth'
import { deviceStatusMeta, deviceTypeMeta } from '@/data/meta'
import { fmtDateTime } from '@/utils/format'
import type { Device, DeviceStatus } from '@/types'
import IncidentDrawer from '@/components/IncidentDrawer.vue'
import { useToast } from '@/composables/useToast'

const system = useSystemStore()
const branch = useBranchStore()
const incStore = useIncidentStore()
const auth = useAuthStore()
const toast = useToast()
const { now } = storeToRefs(system)

const readOnly = computed(() => auth.account?.role === 'volunteer' || auth.account?.role === 'service')
const isMaintainer = computed(() => auth.account?.role === 'maintainer' || auth.account?.role === 'admin')

const filterType = ref<string>('')
const devices = computed(() =>
  branch.devicesOf(system.currentLibraryId).filter((d) => !filterType.value || d.type === filterType.value)
)

const techDefense = computed(() =>
  devices.value.filter((d) => ['gate', 'camera', 'fire', 'audio', 'help', 'ups'].includes(d.type))
)
const selfService = computed(() =>
  devices.value.filter((d) => ['selfkiosk', 'printer', 'water', 'returnbox', 'ac', 'light'].includes(d.type))
)

const abnormalCount = computed(() =>
  devices.value.filter((d) => ['fault', 'alarm', 'offline'].includes(d.status)).length
)

function changeStatus(d: Device, status: DeviceStatus) {
  branch.setDeviceStatus(d.id, status, d.note)
  if (status === 'normal' || status === 'online') {
    toast.ok(`${d.name} 已恢复`)
  } else if (status === 'off') {
    toast.info(`${d.name} 已关闭`)
  }
}

function reportFault(d: Device) {
  branch.setDeviceStatus(d.id, 'fault', d.note || '人工上报故障')
  const typeMap: Partial<Record<Device['type'], any>> = {
    gate: ['gate-abnormal', 'high', '门禁异常'],
    camera: ['camera-offline', 'high', '摄像头离线'],
    selfkiosk: ['device-fault', 'medium', '自助借还机故障'],
    printer: ['device-fault', 'low', '打印机故障'],
    water: ['device-fault', 'low', '饮水机故障'],
    ac: ['device-fault', 'low', '空调故障'],
    light: ['light-ac-on', 'low', '照明异常'],
    audio: ['abnormal-sound', 'high', '异常声音监测告警'],
    fire: ['fire-alarm', 'urgent', '消防系统告警'],
    help: ['help-request', 'high', '求助按钮告警'],
    returnbox: ['box-full', 'medium', '还书箱异常'],
    ups: ['device-fault', 'high', 'UPS/应急电源异常']
  }
  const [type, severity, title] = typeMap[d.type] ?? ['device-fault', 'medium', '设备故障']
  const inc = incStore.create({
    libraryId: system.currentLibraryId,
    type,
    severity,
    title: `${title}：${d.name}`,
    detail: `设备维护/巡检上报：${d.name}（位置：${d.location}）状态异常。${d.note ? '现象：' + d.note + '。' : ''}请设备维护到场检修，读者服务张贴提示并引导备用设备，夜间事件由安保联动技防处置。`,
    at: now.value,
    night: system.isNight,
    owner: 'maintainer',
    deviceId: d.id
  })
  toast.bad('已生成设备故障事件并派单设备维护')
  selected.value = inc
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

const selected = ref<any>(null)
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
                  <button v-if="isMaintainer && d.status !== 'normal' && d.status !== 'online'" class="mini-btn" style="margin-left:4px" @click="changeStatus(d, d.type === 'camera' ? 'online' : 'normal')">修复</button>
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
                    <button v-if="isMaintainer && d.status === 'fault'" class="mini-btn" style="margin-left:4px" @click="changeStatus(d, 'normal')">修复</button>
                    <button v-if="(d.type === 'ac' || d.type === 'light' || d.type === 'selfkiosk') && isMaintainer" class="mini-btn" style="margin-left:4px"
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

    <IncidentDrawer :incident="selected" @close="selected = null" />
  </div>
</template>
