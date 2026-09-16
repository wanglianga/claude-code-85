<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Incident } from '@/types'
import { useIncidentStore } from '@/stores/incident'
import { useAuthStore, roleNames } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'
import { useBranchStore } from '@/stores/branch'
import { incidentTypeMeta, severityMeta } from '@/data/meta'
import { actionLabels, canDo, ownerName } from '@/data/sop'
import { fmtDateTime, fmtTime } from '@/utils/format'
import { useToast } from '@/composables/useToast'

const props = defineProps<{ incident: Incident | null }>()
const emit = defineEmits<{ close: [] }>()

const incStore = useIncidentStore()
const auth = useAuthStore()
const system = useSystemStore()
const branch = useBranchStore()
const toast = useToast()

const comment = ref('')
const newOwner = ref<'admin' | 'security' | 'maintainer' | 'service'>('security')

const role = computed(() => auth.account?.role ?? null)
const me = computed(() => auth.account?.name ?? '')
const meta = computed(() => (props.incident ? incidentTypeMeta[props.incident.type] : null))
const sops = computed(() => (props.incident ? incStore.sopOf(props.incident.type) : []))
const lib = computed(() =>
  props.incident ? system.libraries.find((l) => l.id === props.incident!.libraryId) : null
)
const device = computed(() =>
  props.incident?.deviceId ? branch.devices.find((d) => d.id === props.incident!.deviceId) : null
)
const reader = computed(() =>
  props.incident?.readerId ? branch.readers.find((r) => r.id === props.incident!.readerId) : null
)
const book = computed(() =>
  props.incident?.bookId ? branch.books.find((b) => b.id === props.incident!.bookId) : null
)

function doAction(type: any, text: string, owner?: typeof newOwner.value) {
  if (!props.incident) return
  if (!role.value) return
  incStore.act(props.incident.id, {
    role: role.value,
    actor: me.value,
    type,
    text,
    at: system.now,
    newOwner: owner
  })
  toast.ok(`已记录：${actionLabels[type]}`)
  comment.value = ''
}

function submitComment() {
  if (!comment.value.trim()) {
    toast.bad('请填写处置说明')
    return
  }
  doAction('comment', comment.value.trim())
}

function transfer() {
  doAction('transfer', `转交给${roleNames[newOwner.value]}继续处置`, newOwner.value)
}

function escalate(target: 'security-dispatch' | 'street') {
  if (!props.incident || !role.value) return
  incStore.escalate(props.incident.id, target, me.value, role.value, system.now)
  toast.ok(target === 'street' ? '已转街道值班室，请电话确认' : '已转安保调度中心')
}

const statusLabel: Record<Incident['status'], string> = {
  open: '待受理',
  handling: '处置中',
  resolved: '已处置待复核',
  closed: '已归档'
}
</script>

<template>
  <template v-if="incident">
    <div class="drawer-mask" @click="emit('close')"></div>
    <aside class="drawer">
      <div class="drawer-hd">
        <div class="row">
          <span style="font-size:22px">{{ meta?.icon }}</span>
          <div>
            <div class="row" style="gap:8px">
              <h3 style="font-size:16px">{{ incident.title }}</h3>
              <span class="tag" :class="severityMeta[incident.severity].cls">
                {{ severityMeta[incident.severity].label }}
              </span>
              <span v-if="incident.night" class="tag st-info">🌙 夜间事件</span>
              <span v-if="incident.blackout" class="tag st-bad">⚡ 停电关联</span>
              <span v-if="incident.carryOver && incident.status !== 'closed'" class="tag sev-high">🌅 次日遗留</span>
            </div>
            <div class="small muted mt8">
              {{ incident.no }} · {{ lib?.name }} · {{ fmtDateTime(incident.createdAt) }} ·
              当前状态：<b>{{ statusLabel[incident.status] }}</b> · 负责方：<b>{{ ownerName(incident.owner) }}</b>
            </div>
          </div>
          <div class="spacer"></div>
          <button class="mini-btn" @click="emit('close')">✕</button>
        </div>
      </div>

      <div class="drawer-bd">
        <!-- 事件描述与关联对象 -->
        <div class="card">
          <div class="card-hd"><h3>事件描述</h3></div>
          <div class="card-bd small" style="line-height:1.7">{{ incident.detail }}</div>
        </div>

        <div class="grid grid-3" v-if="device || reader || book">
          <div v-if="device" class="card"><div class="card-bd small">
            <div class="muted">关联设备</div>
            <div style="font-weight:650;margin:3px 0">{{ device.name }}</div>
            <div>{{ device.location }} · {{ device.note || '状态已同步' }}</div>
          </div></div>
          <div v-if="reader" class="card"><div class="card-bd small">
            <div class="muted">关联读者</div>
            <div style="font-weight:650;margin:3px 0">{{ reader.name }}（信用 {{ reader.credit }}）</div>
            <div>{{ reader.phone }}<template v-if="reader.isChild"> · 家长：{{ reader.guardian }} {{ reader.guardianPhone }}</template></div>
          </div></div>
          <div v-if="book" class="card"><div class="card-bd small">
            <div class="muted">关联图书</div>
            <div style="font-weight:650;margin:3px 0">{{ book.title }}</div>
            <div>{{ book.author }} · {{ book.location }}</div>
          </div></div>
        </div>

        <!-- SOP -->
        <div class="card">
          <div class="card-hd">
            <h3>标准处置流程（SOP）</h3>
            <span class="sub">管理员 / 安保 / 设备维护 / 读者服务围绕同一事件按职责协同</span>
          </div>
          <div class="card-bd">
            <div v-for="(s, i) in sops" :key="i" class="sop-step">
              <span class="sop-role">{{ s.owner === 'street' ? '街道值班' : roleNames[s.owner] }}</span>
              <span>{{ s.action }}</span>
            </div>
          </div>
        </div>

        <!-- 夜间快速转交 -->
        <div class="card" v-if="incident.night && incident.status !== 'closed'">
          <div class="card-hd"><h3>🌃 夜间快速联动</h3></div>
          <div class="card-bd row">
            <button class="btn danger sm" :disabled="!canDo(role, 'escalate')" @click="escalate('security-dispatch')">
              🚨 一键转安保调度
            </button>
            <button class="btn urgent sm" :disabled="!canDo(role, 'escalate')" @click="escalate('street')">
              🏙️ 一键转街道值班
            </button>
            <span class="small muted" v-if="lib">
              调度：{{ lib.securityDispatchPhone }} ｜ 街道：{{ lib.streetDutyPhone }}
            </span>
          </div>
        </div>

        <!-- 处置时间线 -->
        <div class="card">
          <div class="card-hd"><h3>处置留痕</h3><span class="sub">{{ incident.actions.length }} 条记录</span></div>
          <div class="card-bd">
            <div class="timeline">
              <div v-for="a in incident.actions" :key="a.id" class="tl-item" :class="{ sys: a.role === 'system' }">
                <div>
                  <span class="tl-who">{{ a.actor }}</span>
                  <span class="tag" style="margin-left:6px">{{ a.role === 'system' ? '系统' : a.role === 'street' ? '街道值班' : roleNames[a.role] }}</span>
                  <span class="tag st-info" style="margin-left:4px">{{ actionLabels[a.type] }}</span>
                  <span class="tl-time">{{ fmtDateTime(a.at) }} {{ fmtTime(a.at) }}</span>
                </div>
                <div class="tl-text">{{ a.text }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 当前角色可执行操作 -->
      <div class="drawer-ft" v-if="incident.status !== 'closed'">
        <div class="row">
          <button v-if="canDo(role, 'ack')" class="btn ghost sm" @click="doAction('ack', `${me} 已受理，开始处置`)">✅ 受理</button>
          <button v-if="canDo(role, 'arrive')" class="btn ghost sm" @click="doAction('arrive', `${me} 已到达现场`)">🚶 到场</button>
          <button v-if="canDo(role, 'notify')" class="btn ghost sm" @click="doAction('notify', '已通知相关读者/物业配合处理')">📞 通知</button>
          <button v-if="canDo(role, 'resolve')" class="btn sm" @click="doAction('resolve', `${me} 确认已处理完成，提交复核`)">✔️ 处理完成</button>
          <button v-if="canDo(role, 'verify') && incident.status === 'resolved'" class="btn amber sm" @click="doAction('verify', '复核通过，结果属实且闭环')">🔍 复核通过</button>
          <button v-if="canDo(role, 'close') && incident.status === 'resolved'" class="btn sm" @click="doAction('close', '事件归档关闭')">📁 归档关闭</button>
          <select v-model="newOwner" class="input" style="width:auto; padding:5px 8px; font-size:12px" :disabled="!canDo(role, 'transfer')">
            <option value="admin">管理员</option>
            <option value="security">安保</option>
            <option value="maintainer">设备维护</option>
            <option value="service">读者服务</option>
          </select>
          <button class="btn ghost sm" :disabled="!canDo(role, 'transfer')" @click="transfer">↗️ 转交</button>
          <div class="spacer"></div>
          <input class="input" style="width:260px" v-model="comment" placeholder="填写处置说明/备注后提交" @keyup.enter="submitComment" />
          <button class="btn sm" :disabled="!canDo(role, 'comment')" @click="submitComment">提交记录</button>
        </div>
        <div v-if="role === 'volunteer'" class="small muted mt8">志愿者账号仅可提交巡馆备注，事件处置请联系值班人员。</div>
      </div>
    </aside>
  </template>
</template>
