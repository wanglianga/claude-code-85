<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFaultViewer } from '@/composables/useFaultViewer'
import { useFaultsStore } from '@/stores/faults'
import { useSystemStore } from '@/stores/system'
import { useAuthStore, roleNames } from '@/stores/auth'
import { useInspectionStore } from '@/stores/inspection'
import { useIncidentViewer } from '@/composables/useIncidentViewer'
import { useArchiveViewer } from '@/composables/useArchiveViewer'
import { deviceTypeMeta } from '@/data/meta'
import { fmtDateTime, fmtTime } from '@/utils/format'
import { useToast } from '@/composables/useToast'

const viewer = useFaultViewer()
const faults = useFaultsStore()
const system = useSystemStore()
const auth = useAuthStore()
const inspStore = useInspectionStore()
const incidentViewer = useIncidentViewer()
const archiveViewer = useArchiveViewer()
const toast = useToast()

const r = computed(() => viewer.fault.value)

// 开馆前确认
const openDecision = ref<'continue-closed' | 'temporary-recovery'>('continue-closed')
const decisionNote = ref('')
const manualService = ref(true)

// 人工借还录入
const mOperator = ref(auth.account?.name ?? '')
const mReader = ref('')
const mBarcode = ref('')
const mKind = ref<'borrow' | 'return'>('borrow')
const mNote = ref('')

// 修复
const repairNote = ref('')

const statusMeta: Record<string, { label: string; cls: string }> = {
  open: { label: '当日故障', cls: 'st-bad' },
  'carried-over': { label: '跨日待开馆确认', cls: 'sev-high' },
  'continue-closed': { label: '继续停用', cls: 'st-bad' },
  'temporary-recovery': { label: '临时恢复', cls: 'st-warn' },
  repaired: { label: '已修复关闭', cls: 'st-ok' }
}

function confirmOpen() {
  if (!r.value) return
  const res = faults.confirmOpen(r.value.id, {
    decision: openDecision.value,
    decidedBy: auth.account?.name ?? '管理员',
    note: decisionNote.value,
    manualService: manualService.value,
    at: system.now
  })
  if (!res.ok) {
    toast.bad(res.error ?? '确认失败')
    return
  }
  toast.ok(
    openDecision.value === 'continue-closed'
      ? manualService.value && faults.manualCapable(res.report!)
        ? '已确认继续停用，人工借还已启动'
        : '已确认继续停用'
      : '已确认临时恢复，设备降级开放'
  )
  decisionNote.value = ''
}

function startManual() {
  if (!r.value) return
  faults.startManualSession(r.value.id, auth.account?.name ?? '读者服务', '设备停用期间人工借还兜底', system.now)
  toast.ok('人工借还已开始')
}

function addRecord() {
  if (!r.value) return
  if (!mReader.value.trim() || !mBarcode.value.trim()) {
    toast.bad('读者姓名与图书条码必填')
    return
  }
  const res = faults.addManualRecord(r.value.id, {
    operator: mOperator.value || (auth.account?.name ?? ''),
    readerName: mReader.value,
    bookBarcode: mBarcode.value,
    kind: mKind.value,
    note: mNote.value,
    at: system.now
  })
  if (!res.ok) {
    toast.bad(res.error ?? '登记失败')
    return
  }
  toast.ok('已登记人工借还（事后补入系统）')
  mReader.value = ''
  mBarcode.value = ''
  mNote.value = ''
}

function backfillOne(id: string) {
  if (!r.value) return
  faults.backfillRecord(r.value.id, id, auth.account?.name ?? '', system.now)
  toast.ok('该笔已补入系统（自助流水可查）')
}
function backfillAll() {
  if (!r.value) return
  const n = faults.backfillAll(r.value.id, auth.account?.name ?? '', system.now)
  toast.ok(`已将 ${n} 笔人工借还补入系统`)
}

const endSummary = ref('')
function endManual() {
  if (!r.value) return
  const res = faults.endManualSession(r.value.id, { operator: auth.account?.name ?? '', at: system.now, summary: endSummary.value })
  if (!res.ok) {
    toast.bad(res.error ?? '结束失败')
    return
  }
  toast.ok(`人工借还结束，已补生成设备故障说明（${res.pendingBackfill} 笔待补录）`)
  endSummary.value = ''
}

function doRepair() {
  if (!r.value) return
  if (!repairNote.value.trim()) {
    toast.bad('请填写维修说明')
    return
  }
  faults.repair(r.value.id, { by: auth.account?.name ?? '设备维护', note: repairNote.value, at: system.now })
  toast.ok('设备已修复，工单关闭')
  repairNote.value = ''
}

function openIncident() {
  if (!r.value?.incidentId) return
  viewer.close()
  incidentViewer.open(r.value.incidentId)
}

const archive = computed(() => {
  if (!r.value?.carriedToDate) return null
  return inspStore.archives(r.value.libraryId).find((a) => a.date < r.value!.carriedToDate!) ?? null
})
function openArchive() {
  if (archive.value) {
    viewer.close()
    archiveViewer.open(archive.value.id)
  }
}
</script>

<template>
  <template v-if="r">
    <div class="drawer-mask" @click="viewer.close()"></div>
    <aside class="drawer" style="width:680px">
      <div class="drawer-hd">
        <div class="row">
          <span style="font-size:22px">🛠️</span>
          <div>
            <div class="row" style="gap:8px">
              <h3 style="font-size:16px">{{ r.deviceName }} · 故障工单 {{ r.no }}</h3>
              <span class="tag" :class="statusMeta[r.status].cls">{{ statusMeta[r.status].label }}</span>
              <span v-if="r.carriedToDate" class="tag st-info">跨日至 {{ r.carriedToDate }}</span>
            </div>
            <div class="small muted mt8">{{ deviceTypeMeta[r.deviceType] }} · 报修于 {{ fmtDateTime(r.reportedAt) }} {{ fmtTime(r.reportedAt) }} · {{ r.reporter }}</div>
          </div>
          <div class="spacer"></div>
          <button class="mini-btn" @click="viewer.close()">✕</button>
        </div>
      </div>

      <div class="drawer-bd">
        <!-- 照片 -->
        <div class="card" v-if="r.photos.length">
          <div class="card-hd"><h3>📷 故障照片（{{ r.photos.length }}）</h3><span class="sub">跨日保留</span></div>
          <div class="card-bd row">
            <div v-for="p in r.photos" :key="p.id">
              <img :src="p.dataUrl" :alt="p.name" style="width:150px;height:96px;object-fit:cover;border-radius:8px;border:1px solid var(--line)">
              <div class="small muted" style="max-width:150px">{{ p.name }}<template v-if="p.note"><br>{{ p.note }}</template></div>
            </div>
          </div>
        </div>

        <div class="grid grid-2">
          <div class="card">
            <div class="card-hd"><h3>故障现象</h3></div>
            <div class="card-bd small" style="line-height:1.7">{{ r.faultDesc }}</div>
          </div>
          <div class="card">
            <div class="card-hd"><h3>👥 影响读者</h3></div>
            <div class="card-bd small">
              <div style="font-size:20px;font-weight:700">{{ r.affectedReaderCount }} <span class="k-unit">人次</span></div>
              <div class="muted mt8">{{ r.affectedDesc }}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-hd"><h3>📞 维修联系人</h3><span class="sub">报修时间、联系人随工单跨日保留</span></div>
          <div class="card-bd small row">
            <span class="tag st-info">{{ r.maintainerName }}</span>
            <span>{{ r.maintainerPhone }}</span>
            <span class="muted">{{ r.maintainerCompany }}</span>
            <div class="spacer"></div>
            <button v-if="r.incidentId" class="mini-btn" @click="openIncident">🔗 关联事件</button>
            <button v-if="archive" class="mini-btn" @click="openArchive">📜 交接档案</button>
          </div>
        </div>

        <!-- 跨日/开馆前确认 -->
        <div class="card" v-if="r.status === 'carried-over'" style="border-color:#f0d795;background:#fffdf5">
          <div class="card-hd"><h3>🌅 次日开馆前确认</h3>
            <span class="sub">该故障未修复跨日，开馆前管理员必须确认处置方式</span>
          </div>
          <div class="card-bd">
            <div class="row mb12">
              <button class="lib-pill" :class="{ active: openDecision === 'continue-closed' }" @click="openDecision = 'continue-closed'">⛔ 继续停用</button>
              <button class="lib-pill" :class="{ active: openDecision === 'temporary-recovery' }" @click="openDecision = 'temporary-recovery'">⚠️ 临时恢复（降级使用）</button>
            </div>
            <label v-if="openDecision === 'continue-closed' && faults.manualCapable(r)" class="row small mb8" style="gap:8px">
              <input type="checkbox" v-model="manualService">
              <b>启用人工借还兜底</b>（开馆后读者在服务台办理，登记经办人与图书条码，避免无处处理图书）
            </label>
            <label class="field">确认说明
              <input class="input" v-model="decisionNote" placeholder="如：等配件明天到，继续停用；或经测试可临时恢复">
            </label>
            <button class="btn amber sm" @click="confirmOpen" :disabled="auth.account?.role !== 'admin'">
              管理员确认（{{ openDecision === 'continue-closed' ? '继续停用' : '临时恢复' }}）
            </button>
            <span v-if="auth.account?.role !== 'admin'" class="small muted" style="margin-left:8px">仅管理员可确认</span>
          </div>
        </div>

        <!-- 人工借还 -->
        <div class="card" v-if="faults.manualCapable(r) && (r.status === 'continue-closed' || r.manualSession)">
          <div class="card-hd"><h3>📋 临时人工借还</h3>
            <span class="tag" :class="r.manualSession?.status === 'active' ? 'st-bad' : 'st-off'">
              {{ r.manualSession?.status === 'active' ? '进行中' : r.manualSession ? '已结束' : '未开始' }}
            </span>
          </div>
          <div class="card-bd">
            <div v-if="!r.manualSession" class="row">
              <span class="small muted">设备停用期间，读者图书业务转服务台人工办理。</span>
              <div class="spacer"></div>
              <button class="btn sm" @click="startManual">开始人工借还</button>
            </div>
            <template v-else>
              <div class="small muted mb8">
                开始于 {{ fmtDateTime(r.manualSession.startedAt) }} {{ fmtTime(r.manualSession.startedAt) }}（{{ r.manualSession.startedBy }}）｜{{ r.manualSession.reason }}
              </div>
              <div v-if="r.manualSession.status === 'active'" class="grid" style="grid-template-columns:1fr 1fr 1fr 0.8fr 2fr auto;gap:8px">
                <input class="input" v-model="mOperator" placeholder="经办人">
                <input class="input" v-model="mReader" placeholder="读者姓名/证号">
                <input class="input" v-model="mBarcode" placeholder="图书条码 *">
                <select class="input" v-model="mKind"><option value="borrow">人工借出</option><option value="return">人工归还</option></select>
                <input class="input" v-model="mNote" placeholder="备注（选填）">
                <button class="btn sm" @click="addRecord">登记</button>
              </div>
              <table class="tbl mt12">
                <thead><tr><th>时间</th><th>类型</th><th>图书条码</th><th>读者</th><th>经办人</th><th>补录</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="m in r.manualSession.records" :key="m.id">
                    <td class="small nowrap">{{ fmtTime(m.at) }}</td>
                    <td><span class="tag" :class="m.kind === 'borrow' ? 'st-warn' : 'st-info'">{{ m.kind === 'borrow' ? '借出' : '归还' }}</span></td>
                    <td class="small"><b>{{ m.bookBarcode }}</b></td>
                    <td class="small">{{ m.readerName }}</td>
                    <td class="small">{{ m.operator }}</td>
                    <td>
                      <span v-if="m.backfilled" class="tag st-ok">已补入 · {{ m.backfilledBy }}</span>
                      <span v-else class="tag st-warn">待补录</span>
                    </td>
                    <td class="right">
                      <button v-if="!m.backfilled && r.manualSession.status === 'active'" class="mini-btn" @click="backfillOne(m.id)">补入系统</button>
                    </td>
                  </tr>
                  <tr v-if="!r.manualSession.records.length"><td colspan="7" class="empty">暂无人工借还记录</td></tr>
                </tbody>
              </table>
              <div v-if="r.manualSession.status === 'active'" class="row mt12">
                <input class="input" style="flex:1" v-model="endSummary" placeholder="结束备注（选填）">
                <button class="btn ghost sm" @click="backfillAll" :disabled="!r.manualSession.records.some(x => !x.backfilled)">一键全部补入系统</button>
                <button class="btn amber sm" @click="endManual">结束人工借还（补生成故障说明）</button>
              </div>
            </template>
          </div>
        </div>

        <!-- 补生成的故障说明 -->
        <div class="card" v-if="r.statement" style="border-color:#cfe2c8;background:#f8fcf7">
          <div class="card-hd"><h3>📄 设备故障说明（人工借还结束后自动补生成）</h3>
            <span class="sub">{{ fmtDateTime(r.statement.generatedAt) }} · {{ r.statement.generatedBy }}</span>
          </div>
          <div class="card-bd">
            <pre class="small" style="white-space:pre-wrap;font-family:inherit;margin:0;line-height:1.8">{{ r.statement.content }}</pre>
          </div>
        </div>

        <!-- 修复关闭 -->
        <div class="card" v-if="r.status !== 'repaired'">
          <div class="card-hd"><h3>🔧 修复关闭工单</h3><span class="sub">{{ roleNames[auth.account?.role ?? 'maintainer'] }} 维修完成后填写</span></div>
          <div class="card-bd row">
            <input class="input" style="flex:1" v-model="repairNote" placeholder="维修说明：更换消磁线圈/恢复读卡器/测试正常…">
            <button class="btn sm" :disabled="!(auth.account?.role === 'maintainer' || auth.account?.role === 'admin')" @click="doRepair">修复并关闭</button>
          </div>
        </div>
        <div class="card" v-else>
          <div class="card-bd small good-text">
            ✔ 已于 {{ fmtDateTime(r.repairedAt) }} 由 {{ r.repairedBy }} 修复关闭：{{ r.repairNote }}
          </div>
        </div>
      </div>
    </aside>
  </template>
</template>
