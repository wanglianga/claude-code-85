<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { useBranchStore } from '@/stores/branch'
import { useAuthStore } from '@/stores/auth'
import { bookStatusMeta } from '@/data/meta'
import { fmtDate, fmtDateTime } from '@/utils/format'
import { useToast } from '@/composables/useToast'

const system = useSystemStore()
const branch = useBranchStore()
const auth = useAuthStore()
const toast = useToast()
const { now } = storeToRefs(system)
const readOnly = computed(() => auth.account?.role === 'volunteer')

const statusFilter = ref('')
const books = computed(() =>
  branch.books.filter(
    (b) =>
      (!system.currentLibraryId || b.libraryId === system.currentLibraryId || b.status === 'in-transfer') &&
      (!statusFilter.value || b.status === statusFilter.value)
  )
)

function libName(id: string) {
  return system.libraries.find((l) => l.id === id)?.name ?? id
}
function borrowerName(id?: string) {
  return id ? branch.readers.find((r) => r.id === id)?.name ?? id : '—'
}

const currentBooks = computed(() =>
  branch.books.filter((b) => b.libraryId === system.currentLibraryId && b.status === 'on-shelf')
)
const targetLibs = computed(() => system.libraries.filter((l) => l.id !== system.currentLibraryId))

const tBookId = ref('')
const tToLib = ref('')
const tReason = ref('')
function createTransfer() {
  if (!tBookId.value || !tToLib.value) {
    toast.bad('请选择图书与目标书房')
    return
  }
  branch.requestTransfer({
    bookId: tBookId.value,
    toLibraryId: tToLib.value,
    qty: 1,
    reason: tReason.value || '馆际复本调配',
    at: now.value,
    handler: auth.account?.name ?? ''
  })
  toast.ok('调拨申请已提交')
  tBookId.value = tToLib.value = tReason.value = ''
}

function setStatus(id: string, status: any) {
  branch.setTransferStatus(id, status, auth.account?.name)
  toast.ok(`调拨状态已更新为${status}`)
}

function reshelve(bookId: string) {
  const b = branch.books.find((x) => x.id === bookId)
  if (b) {
    branch.reshelve(b)
    toast.ok(`《${b.title}》已上架`)
  }
}

const transferStatusMeta: Record<string, { label: string; cls: string }> = {
  requested: { label: '待审批', cls: 'st-warn' },
  approved: { label: '已批准', cls: 'st-info' },
  shipping: { label: '调拨在途', cls: 'st-info' },
  received: { label: '已接收上架', cls: 'st-ok' },
  rejected: { label: '已驳回', cls: 'st-off' }
}
</script>

<template>
  <div>
    <div class="grid grid-4 mb16">
      <div class="kpi"><div class="k-ico">📚</div><div class="k-label">本馆在架</div>
        <div class="k-value">{{ branch.books.filter(b => b.libraryId === system.currentLibraryId && b.status === 'on-shelf').length }}</div></div>
      <div class="kpi"><div class="k-ico">📕</div><div class="k-label">借出未还</div>
        <div class="k-value">{{ branch.books.filter(b => b.libraryId === system.currentLibraryId && b.status === 'borrowed').length }}</div></div>
      <div class="kpi" :class="{ alert: branch.books.some(b => b.status === 'demag-failed') }"><div class="k-ico">🧲</div><div class="k-label">消磁失败</div>
        <div class="k-value">{{ branch.books.filter(b => b.status === 'demag-failed').length }}</div></div>
      <div class="kpi"><div class="k-ico">🚚</div><div class="k-label">调拨中</div>
        <div class="k-value">{{ branch.books.filter(b => b.status === 'in-transfer').length }}</div></div>
    </div>

    <div class="grid" style="grid-template-columns: 1.6fr 1fr">
      <div class="card">
        <div class="card-hd">
          <h3>馆藏清单</h3>
          <select class="input" style="width:140px" v-model="statusFilter">
            <option value="">全部状态</option>
            <option v-for="(m, k) in bookStatusMeta" :key="k" :value="k">{{ m.label }}</option>
          </select>
        </div>
        <div class="card-bd flush">
          <table class="tbl">
            <thead><tr><th>书名/作者</th><th>所属书房</th><th>位置</th><th>状态</th><th>借阅人</th></tr></thead>
            <tbody>
              <tr v-for="b in books" :key="b.id">
                <td><b>{{ b.title }}</b><div class="small muted">{{ b.author }} · {{ b.isbn }}</div></td>
                <td class="small">{{ libName(b.libraryId).replace('城市书房', '') }}</td>
                <td class="small">{{ b.location }}</td>
                <td>
                  <span class="tag" :class="bookStatusMeta[b.status].cls">{{ bookStatusMeta[b.status].label }}</span>
                  <div v-if="b.dueAt && b.status === 'borrowed'" class="small mt8" :class="b.dueAt < now ? 'bad-text' : 'muted'">
                    {{ b.dueAt < now ? '已逾期 ' : '应还 ' }}{{ fmtDate(b.dueAt) }}
                  </div>
                  <button v-if="b.status === 'returned'" class="mini-btn mt8" @click="reshelve(b.id)" :disabled="readOnly">上架</button>
                </td>
                <td class="small">{{ borrowerName(b.borrowerId) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-hd"><h3>🚚 馆藏调拨</h3><span class="sub">多座书房馆际调配</span></div>
          <div class="card-bd">
            <label class="field">调出图书（本馆在架）
              <select class="input" v-model="tBookId" :disabled="readOnly">
                <option value="">请选择</option>
                <option v-for="b in currentBooks" :key="b.id" :value="b.id">{{ b.title }}（{{ b.location }}）</option>
              </select>
            </label>
            <label class="field">调入书房
              <select class="input" v-model="tToLib" :disabled="readOnly">
                <option value="">请选择</option>
                <option v-for="l in targetLibs" :key="l.id" :value="l.id">{{ l.name }}</option>
              </select>
            </label>
            <label class="field">调拨原因
              <input class="input" v-model="tReason" placeholder="如：复本不足/读者预约" :disabled="readOnly">
            </label>
            <button class="btn" @click="createTransfer" :disabled="readOnly">提交调拨申请</button>
          </div>
        </div>

        <div class="card">
          <div class="card-hd"><h3>调拨单据</h3></div>
          <div class="card-bd flush">
            <table class="tbl">
              <thead><tr><th>图书</th><th>流向</th><th>状态</th><th class="right">操作</th></tr></thead>
              <tbody>
                <tr v-for="t in branch.transfers" :key="t.id">
                  <td class="small"><b>{{ t.bookTitle }}</b><div class="muted">{{ t.reason }}</div></td>
                  <td class="small">{{ libName(t.fromLibraryId).replace('城市书房','') }} → {{ libName(t.toLibraryId).replace('城市书房','') }}</td>
                  <td><span class="tag" :class="transferStatusMeta[t.status].cls">{{ transferStatusMeta[t.status].label }}</span>
                    <div class="small muted mt8">{{ fmtDateTime(t.createdAt) }}</div></td>
                  <td class="right">
                    <button v-if="t.status === 'requested'" class="mini-btn" @click="setStatus(t.id, 'approved')" :disabled="readOnly">批准</button>
                    <button v-if="t.status === 'approved'" class="mini-btn" @click="setStatus(t.id, 'shipping')" :disabled="readOnly">发运</button>
                    <button v-if="t.status === 'shipping'" class="mini-btn" @click="setStatus(t.id, 'received')" :disabled="readOnly">接收</button>
                  </td>
                </tr>
                <tr v-if="!branch.transfers.length"><td colspan="4" class="empty">暂无调拨单</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
