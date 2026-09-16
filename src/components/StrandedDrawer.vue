<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStrandedStore } from '@/stores/stranded'
import { useBranchStore } from '@/stores/branch'
import { useSystemStore } from '@/stores/system'
import { useAuthStore } from '@/stores/auth'
import { useIncidentViewer } from '@/composables/useIncidentViewer'
import { fmtDateTime, fmtTime, maskIdCard } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import { useStrandedViewer } from '@/composables/useStrandedViewer'
import type { StrandedDecision, Visit } from '@/types'

const strandedViewer = useStrandedViewer()
const visit = computed<Visit | null>(() => strandedViewer.visit.value)
function emitClose() {
  strandedViewer.close()
}

const stranded = useStrandedStore()
const branch = useBranchStore()
const system = useSystemStore()
const auth = useAuthStore()
const toast = useToast()
const incidentViewer = useIncidentViewer()

const reader = computed(() => (visit.value ? stranded.readerOf(visit.value) : null))
const h = computed(() => visit.value?.strandedHandling ?? null)
const isChild = computed(() => !!reader.value?.isChild)
const role = computed(() => auth.account?.role ?? null)
/** admin 可代各岗操作；其余按本职 */
const can = (kind: 'security' | 'admin' | 'service') =>
  role.value === 'admin' ||
  (kind === 'security' && role.value === 'security') ||
  (kind === 'service' && (role.value === 'service' || role.value === 'security'))

// 派安保表单
const posts = computed(() => (visit.value ? stranded.securityPosts(visit.value.libraryId) : []))
const secPost = ref('夜间巡逻岗（馆内）')
const secName = ref('李安保（值班安保）')
const secEta = ref(3)
const secPhone = ref('139****2201')

// 解释
const reason = ref('')
// 决策
const decision = ref<StrandedDecision>('persuade-leave')
const decisionNote = ref('')
const extMinutes = ref(30)
const policeNo = ref('')
// 监护人
const guardianResult = ref('')
const willPickup = ref(true)
// 离馆方式
const leaveMethod = ref<'self' | 'guardian-pickup' | 'police' | 'staff-escort'>('staff-escort')

const steps = computed(() => {
  if (!h.value) return []
  const s = h.value.status
  return [
    { label: '发现滞留', done: true },
    { label: '派安保', done: !!h.value.dispatchedAt },
    { label: '安保到场', done: !!h.value.arrivedAt },
    { label: '处置决策', done: !!h.value.decision },
    { label: '最终离馆', done: s === 'left' }
  ]
})

function failMsg(r: { ok: boolean; error?: string }) {
  if (!r.ok && r.error) toast.bad(r.error)
}
function okMsg(r: boolean, msg: string) {
  if (r) toast.ok(msg)
  else toast.bad('当前流程阶段不能执行该操作')
}

function doDispatch() {
  if (!visit.value) return
  const r = stranded.dispatchSecurity({
    visitId: visit.value.id, securityName: secName.value, securityPost: secPost.value,
    etaMin: secEta.value, phone: secPhone.value, at: system.now
  })
  okMsg(r, '安保已出动')
}
function doArrive() {
  if (!visit.value) return
  okMsg(stranded.arrive(visit.value.id, secName.value, system.now), '已记录安保到场')
}
function doReason() {
  if (!visit.value || !reason.value.trim()) {
    toast.bad('请填写读者解释')
    return
  }
  if (stranded.recordReason(visit.value.id, reason.value.trim(), system.now)) {
    toast.ok('读者解释已留痕')
    reason.value = ''
  }
}
function doDecide() {
  if (!visit.value) return
  const r = stranded.decide({
    visitId: visit.value.id,
    decision: decision.value,
    decidedBy: auth.account?.name ?? '管理员',
    note: decisionNote.value,
    at: system.now,
    extensionMinutes: decision.value === 'extended-stay' ? extMinutes.value : undefined,
    policeNo: decision.value === 'police' ? policeNo.value : undefined
  })
  failMsg(r)
  if (r.ok) {
    toast.ok(decision.value === 'police' ? '已报警并同步街道值班' : '处置决策已确认')
    decisionNote.value = ''
    policeNo.value = ''
  }
}
function doNotifyGuardian() {
  if (!visit.value || !guardianResult.value.trim()) {
    toast.bad('请填写与监护人的沟通结果')
    return
  }
  const r = stranded.notifyGuardian(visit.value.id, {
    result: guardianResult.value.trim(),
    willPickup: willPickup.value,
    at: system.now,
    actor: auth.account?.name ?? '读者服务'
  })
  failMsg(r)
  if (r.ok) {
    toast.ok('监护人已通知，沟通结果已保存')
    leaveMethod.value = willPickup.value ? 'guardian-pickup' : 'self'
  }
}
function doLeave() {
  if (!visit.value) return
  const r = stranded.confirmLeave({
    visitId: visit.value.id, method: leaveMethod.value, at: system.now,
    actor: role.value === 'security'
      ? (auth.account?.name ?? '安保')
      : (secName.value || (auth.account?.name ?? '值班安保'))
  })
  failMsg(r)
  if (r.ok) {
    toast.ok('最终离馆时间已记录，滞留处置闭环')
    setTimeout(() => emitClose(), 900)
  }
}
function openIncident() {
  if (h.value?.incidentId) {
    emitClose()
    incidentViewer.open(h.value.incidentId)
  }
}
</script>

<template>
  <template v-if="visit && h && reader">
    <div class="drawer-mask" @click="emitClose()"></div>
    <aside class="drawer" style="width:660px">
      <div class="drawer-hd">
        <div class="row">
          <span style="font-size:22px">🧍</span>
          <div>
            <div class="row" style="gap:8px">
              <h3 style="font-size:16px">夜间滞留处置 · {{ visit.readerName }}</h3>
              <span v-if="isChild" class="tag st-info">未成年人 {{ reader.age }} 岁</span>
              <span class="tag" :class="h.status === 'left' ? 'st-ok' : 'st-bad'">
                {{ { discovered: '已发现', dispatched: '安保出动中', onscene: '安保到场', decided: '已决策待离馆', left: '已离馆闭环' }[h.status] }}
              </span>
            </div>
            <div class="small muted mt8">发现于 {{ fmtDateTime(h.discoveredAt) }} {{ fmtTime(h.discoveredAt) }}</div>
          </div>
          <div class="spacer"></div>
          <button class="mini-btn" @click="emitClose()">✕</button>
        </div>
        <!-- 步骤条 -->
        <div class="row mt12" style="gap:4px">
          <template v-for="(s, i) in steps" :key="s.label">
            <span class="tag" :class="s.done ? 'st-ok' : 'st-off'">{{ i + 1 }}. {{ s.label }}</span>
            <span v-if="i < steps.length - 1" class="muted">→</span>
          </template>
        </div>
      </div>

      <div class="drawer-bd">
        <!-- 读者身份 / 区域 / 门禁 / 安保 -->
        <div class="grid grid-2">
          <div class="card">
            <div class="card-hd"><h3>🪪 读者身份</h3></div>
            <div class="card-bd small">
              <div><b>{{ reader.name }}</b>（{{ reader.age }} 岁，信用 {{ reader.credit }}）</div>
              <div class="muted mt8">身份证：{{ maskIdCard(reader.idCard) }}</div>
              <div class="muted">借书证：{{ reader.cardNo }} ｜ {{ reader.phone }}</div>
              <div v-if="isChild" class="mt8" style="color:var(--info)">
                监护人：{{ reader.guardian }} {{ reader.guardianPhone }}
                <div class="bad-text" v-if="!h.guardianNotified">⚠ 尚未联系监护人，处置决策与离馆前必须完成</div>
                <div class="good-text" v-else>✔ 监护人已于 {{ fmtTime(h.guardianNotifiedAt) }} 联系</div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-hd"><h3>📍 所在区域 / 入馆</h3></div>
            <div class="card-bd small">
              <div>发现位置：<b>{{ h.zone }}</b></div>
              <div class="muted mt8">座位：{{ visit.seatNo }}</div>
              <div class="muted">入馆时间：{{ fmtDateTime(visit.enterAt) }} {{ fmtTime(visit.enterAt) }}</div>
              <div class="muted">入馆方式：{{ visit.entryMethod === 'idcard' ? '身份证' : visit.entryMethod === 'card' ? '借书证' : '预约码' }}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-hd"><h3>🚪 门禁记录</h3><span class="sub">系统比对出闸与门磁记录</span></div>
          <div class="card-bd flush">
            <table class="tbl">
              <tbody>
                <tr v-for="(g, i) in h.gateRecords" :key="i">
                  <td class="nowrap small">{{ fmtDateTime(g.at) }} {{ fmtTime(g.at) }}</td>
                  <td class="small">{{ g.gate }}</td>
                  <td class="small">{{ g.event }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 安保位置与派单 -->
        <div class="card">
          <div class="card-hd"><h3>🛡️ 安保位置与到场</h3></div>
          <div class="card-bd">
            <div v-if="!h.arrivedAt" class="grid" style="grid-template-columns:1.4fr 1fr 0.7fr 0.8fr;gap:8px">
              <label class="field" style="margin:0">值班位置
                <select class="input" v-model="secPost">
                  <option v-for="p in posts" :key="p" :value="p">{{ p }}</option>
                </select>
              </label>
              <label class="field" style="margin:0">安保姓名
                <input class="input" v-model="secName">
              </label>
              <label class="field" style="margin:0">到场(分)
                <input class="input" type="number" v-model.number="secEta" min="1">
              </label>
              <label class="field" style="margin:0">电话
                <input class="input" v-model="secPhone">
              </label>
            </div>
            <div class="row mt8">
              <button v-if="!h.dispatchedAt" class="btn danger sm" :disabled="!can('security')" @click="doDispatch">🚨 派出安保</button>
              <button v-else-if="!h.arrivedAt" class="btn amber sm" :disabled="!can('security')" @click="doArrive">
                🚶 安保到场（{{ h.securityName }} · {{ h.securityPost }} · ETA {{ h.securityEtaMin }} 分）
              </button>
              <span v-else class="tag st-ok">✔ {{ h.securityName }} 已于 {{ fmtTime(h.arrivedAt) }} 到场（{{ h.securityPost }}）</span>
              <span v-if="!can('security')" class="small muted">（需安保/管理员账号操作）</span>
            </div>
          </div>
        </div>

        <!-- 读者解释 -->
        <div class="card">
          <div class="card-hd"><h3>💬 读者解释</h3></div>
          <div class="card-bd">
            <div v-if="h.readerReason" class="small mb8" style="background:#f8fafd;padding:8px 10px;border-radius:7px">
              “{{ h.readerReason }}”
            </div>
            <div class="row">
              <input class="input" v-model="reason" placeholder="记录读者说明（疲惫睡着/等候家长/身体不适……）" @keyup.enter="doReason">
              <button class="btn ghost sm" :disabled="!can('service')" @click="doReason">留痕</button>
            </div>
          </div>
        </div>

        <!-- 未成年人监护人沟通 -->
        <div v-if="isChild" class="card" style="border-color:#c4dcf3">
          <div class="card-hd"><h3>📞 监护人通知与沟通结果（必填）</h3></div>
          <div class="card-bd">
            <div v-if="h.guardianNotified" class="small mb8" style="background:#f2f8ff;padding:8px 10px;border-radius:7px">
              已联系 <b>{{ reader.guardian }}</b>（{{ reader.guardianPhone }}）于 {{ fmtTime(h.guardianNotifiedAt) }}：
              {{ h.guardianContactResult }}
              <span class="tag" :class="h.guardianWillPickup ? 'st-ok' : 'st-info'" style="margin-left:6px">
                {{ h.guardianWillPickup ? '监护人到馆接回' : '同意读者自行离馆' }}
              </span>
            </div>
            <template v-else>
              <label class="row small mb8" style="gap:8px">
                沟通结果：
                <select v-model="willPickup" class="input" style="width:auto">
                  <option :value="true">监护人将立即到馆接回</option>
                  <option :value="false">监护人无法到场，委托劝其自行回家</option>
                </select>
              </label>
              <div class="row">
                <input class="input" v-model="guardianResult" placeholder="通话情况、到馆时长、接送安排……">
                <button class="btn sm" :disabled="!can('service')" @click="doNotifyGuardian">📞 已联系监护人并保存</button>
              </div>
            </template>
          </div>
        </div>

        <!-- 管理员决策 -->
        <div class="card">
          <div class="card-hd"><h3>⚖️ 管理员处置决策</h3><span class="sub">到场后方可决策</span></div>
          <div class="card-bd">
            <div v-if="h.decision" class="small mb8" style="background:#fdf8ec;padding:8px 10px;border-radius:7px">
              <b>{{ { 'persuade-leave': '劝离', 'extended-stay': '特殊延时', police: '报警处置' }[h.decision] }}</b>
              ｜ {{ h.decidedBy }} 于 {{ fmtTime(h.decidedAt) }} 确认
              <span v-if="h.extensionUntil">｜延时至 {{ fmtTime(h.extensionUntil) }}</span>
              <span v-if="h.policeAt">｜已报警 {{ h.policeNo ? '（回执 ' + h.policeNo + '）' : '' }}并转街道</span>
              <div v-if="h.decisionNote" class="muted mt8">{{ h.decisionNote }}</div>
            </div>
            <template v-else>
              <div class="row mb12">
                <button v-for="d in (['persuade-leave','extended-stay','police'] as StrandedDecision[])" :key="d"
                        class="lib-pill" :class="{ active: decision === d }" @click="decision = d">
                  {{ { 'persuade-leave': '✅ 确认劝离', 'extended-stay': '⏳ 特殊延时', police: '🚓 报警' }[d] }}
                </button>
              </div>
              <label v-if="decision === 'extended-stay'" class="field">延时时长（分钟，安保看护、延时后清场）
                <input class="input" type="number" v-model.number="extMinutes" min="10" step="10">
              </label>
              <label v-if="decision === 'police'" class="field">110 报警回执号（选填，同时自动转街道值班）
                <input class="input" v-model="policeNo" placeholder="如 11020260916-2231">
              </label>
              <label class="field">处置说明
                <input class="input" v-model="decisionNote" placeholder="身体状况、现场情况、后续要求……">
              </label>
              <button class="btn amber sm" :disabled="role !== 'admin'" @click="doDecide">确认决策</button>
              <span v-if="role !== 'admin'" class="small muted" style="margin-left:8px">仅管理员可作出处置决策</span>
            </template>
          </div>
        </div>

        <!-- 最终离馆 -->
        <div class="card">
          <div class="card-hd"><h3>🚪 最终离馆确认</h3></div>
          <div class="card-bd">
            <div v-if="h.status === 'left'" class="small good-text">
              ✔ 已于 {{ fmtDateTime(h.leftAt) }} {{ fmtTime(h.leftAt) }}
              （{{ { self: '自行离馆', 'guardian-pickup': '监护人接回', police: '民警带离', 'staff-escort': '工作人员陪同离馆' }[h.leaveMethod!] }}）离馆，处置闭环。
            </div>
            <template v-else>
              <div class="row">
                <select class="input" style="width:200px" v-model="leaveMethod">
                  <option value="self" :disabled="isChild && !(!h.guardianWillPickup && h.guardianNotified)">自行离馆</option>
                  <option value="guardian-pickup" :disabled="isChild && !h.guardianWillPickup">监护人到馆接回</option>
                  <option value="staff-escort">工作人员陪同离馆</option>
                  <option value="police">民警带离</option>
                </select>
                <button class="btn sm" :disabled="!can('security')" @click="doLeave">✔ 记录最终离馆时间（{{ fmtTime(system.now) }}）</button>
              </div>
              <div class="small muted mt8">完成决策后才可确认离馆；未成年人须先完成监护人沟通。</div>
            </template>
          </div>
        </div>

        <!-- 处置留痕 -->
        <div class="card">
          <div class="card-hd"><h3>📋 处置留痕</h3>
            <span class="sub">次日管理员可继续查看</span>
            <div class="spacer"></div>
            <button class="mini-btn" @click="openIncident">🔗 关联事件</button>
          </div>
          <div class="card-bd">
            <div class="timeline">
              <div v-for="(l, i) in h.logs" :key="i" class="tl-item" :class="{ sys: l.role === 'system' }">
                <div>
                  <span class="tl-who">{{ l.actor }}</span>
                  <span class="tag" style="margin-left:6px">{{ l.role === 'system' ? '系统' : l.role === 'admin' ? '管理员' : l.role === 'security' ? '安保' : '读者服务' }}</span>
                  <span class="tl-time">{{ fmtDateTime(l.at) }} {{ fmtTime(l.at) }}</span>
                </div>
                <div class="tl-text">{{ l.text }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </template>
</template>
