<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { useBranchStore } from '@/stores/branch'
import { useIncidentStore } from '@/stores/incident'
import { useAuthStore } from '@/stores/auth'
import { entryMethodMeta, serviceKindMeta, bookStatusMeta } from '@/data/meta'
import { fmtTime, maskIdCard } from '@/utils/format'
import type { EntryMethod, Reader, ServiceKind } from '@/types'
import { useToast } from '@/composables/useToast'
import { useFaultsStore } from '@/stores/faults'
import { useFaultViewer } from '@/composables/useFaultViewer'
import { useBlackoutStore } from '@/stores/blackout'

const system = useSystemStore()
const branch = useBranchStore()
const incStore = useIncidentStore()
const auth = useAuthStore()
const toast = useToast()
const faults = useFaultsStore()
const blackoutStore = useBlackoutStore()
const faultViewer = useFaultViewer()
const { now } = storeToRefs(system)

const readOnly = computed(() => auth.account?.role === 'volunteer' || auth.account?.role === 'street')
const activeManualFaults = computed(() => faults.activeManualReports(system.currentLibraryId))

// ---------------- 入馆登记 ----------------
const method = ref<EntryMethod>('idcard')
const credential = ref('')
const foundReader = ref<Reader | null>(null)
const lookupError = ref('')
const chosenSeat = ref('')
const seatNote = ref('')

function lookup() {
  foundReader.value = null
  lookupError.value = ''
  const r = method.value === 'reservation'
    ? branch.findByReservation(credential.value)
    : branch.findReader(credential.value)
  if (!r) {
    lookupError.value = '未查询到读者，请核对证件/借书证/预约码（演示可用 LS20210001 或 YY20260916-08）'
    return
  }
  foundReader.value = r
  if (branch.activeVisitOfReader(r.id)) {
    lookupError.value = '该读者已在馆，无需重复入馆登记'
  }
}

const sampleCred: Record<EntryMethod, string> = {
  idcard: '330106199203152211',
  card: 'LS20210001',
  reservation: 'YY20260916-08'
}
function useSample() {
  method.value = method.value
  credential.value = sampleCred[method.value]
}

const occupiedSeats = computed(() => new Set(branch.occupiedSeats(system.currentLibraryId)))
const seatOptions = computed(() => {
  const list: string[] = []
  for (let i = 1; i <= 24; i++) {
    list.push(`A-${String(i).padStart(2, '0')}`)
    list.push(`B-${String(i).padStart(2, '0')}`)
  }
  for (let i = 1; i <= 8; i++) list.push(`亲子-${String(i).padStart(2, '0')}`)
  return list
})

function checkIn() {
  if (!foundReader.value) return
  if (branch.activeVisitOfReader(foundReader.value.id)) {
    toast.bad('该读者已在馆')
    return
  }
  if (!chosenSeat.value) {
    toast.bad('请选择座位')
    return
  }
  const r = foundReader.value
  branch.checkIn({
    libraryId: system.currentLibraryId,
    reader: r,
    method: method.value,
    entryNo: method.value === 'idcard' ? maskIdCard(r.idCard) : credential.value.trim(),
    seatNo: chosenSeat.value,
    at: now.value,
    note: seatNote.value || (r.isChild ? `家长 ${r.guardian} 陪同` : undefined)
  })
  branch.logUsage(system.currentLibraryId, r, 'kiosk', `通过${entryMethodMeta[method.value]}入馆，分配座位 ${chosenSeat.value}`, now.value)
  toast.ok(`${r.name} 入馆登记完成，座位 ${chosenSeat.value}`)
  foundReader.value = null
  credential.value = ''
  chosenSeat.value = ''
  seatNote.value = ''
}

const visits = computed(() =>
  branch.visits
    .filter((v) => v.libraryId === system.currentLibraryId)
    .sort((a, b) => b.enterAt - a.enterAt)
)

// ---------------- 自助服务记录 ----------------
const svcReaderCard = ref('LS20210001')
const svcReader = computed(() => branch.findReader(svcReaderCard.value))
const svcKind = ref<ServiceKind>('borrow')
const svcBookId = ref('')
const printPages = ref(4)
const waterMl = ref(350)
const demagForceFail = ref(false)

const booksHere = computed(() =>
  branch.books.filter((b) => b.libraryId === system.currentLibraryId)
)
const borrowableBooks = computed(() => booksHere.value.filter((b) => b.status === 'on-shelf'))
const readerBorrowed = computed(() =>
  svcReader.value
    ? booksHere.value.filter((b) => b.status === 'borrowed' && b.borrowerId === svcReader.value!.id)
    : []
)

function recordService() {
  const r = svcReader.value
  if (!r) {
    toast.bad('未找到读者，请输入有效借书证号')
    return
  }
  const lib = system.currentLibrary
  const isBlackout = !!blackoutStore.activeOf(lib.id)
  if (svcKind.value === 'borrow') {
    const book = booksHere.value.find((b) => b.id === svcBookId.value)
    if (!book || book.status !== 'on-shelf') {
      toast.bad('请选择一本在架可借图书')
      return
    }
    if (isBlackout) {
      toast.bad('停电中，自助借还机不可用：请到「停电应急联动」页做人工暂存，来电按操作时间补录')
      return
    }
    branch.borrowBook(book, r, now.value)
    branch.logUsage(lib.id, r, 'borrow', `借出《${book.title}》1 册，应还 30 天`, now.value)
    branch.adjustCredit(r, 1, '规范借书', now.value)
    toast.ok(`已借出《${book.title}》，磁条已激活`)
  } else if (svcKind.value === 'return') {
    const book = readerBorrowed.value[0] ?? booksHere.value.find((b) => b.id === svcBookId.value)
    if (!book) {
      toast.bad('该读者名下没有可还图书')
      return
    }
    // 模拟消磁：1 号自助机故障（d-kiosk-1）必然失败，也可手工勾选
    const kioskFault = branch.devices.find((d) => d.id === 'd-kiosk-1' && d.libraryId === lib.id)
    const fail = demagForceFail.value || kioskFault?.status === 'fault'
    branch.returnBook(book, !fail, now.value)
    if (!fail) {
      branch.logUsage(lib.id, r, 'return', `归还《${book.title}》，消磁成功`, now.value)
      branch.adjustCredit(r, 2, '按时还书', now.value)
      toast.ok(`《${book.title}》归还成功，已消磁`)
    } else {
      branch.logUsage(lib.id, r, 'return', `归还《${book.title}》——消磁失败 E17`, now.value)
      // 消磁失败 → 同一事件协同：服务暂扣放行 + 维护检修 + 安保核门禁
      const inc = incStore.create({
        libraryId: lib.id,
        type: 'demag-failed',
        severity: 'high',
        title: `《${book.title}》还书消磁失败`,
        detail: `读者${r.name}（${r.cardNo}）在自助机还书时消磁失败（E17），图书防盗磁条未解除。读者服务人工暂扣图书并登记放行；设备维护检修消磁线圈；安保核对门禁带出记录；管理员复核闭环。`,
        at: now.value,
        night: system.isNight,
        owner: 'service',
        deviceId: 'd-kiosk-1',
        readerId: r.id,
        bookId: book.id
      })
      incStore.act(inc.id, { role: 'service', actor: auth.account?.name ?? '读者服务', type: 'ack', text: '已受理：图书暂扣人工台，开人工通道放行读者', at: now.value })
      toast.bad('消磁失败！已生成事件并通知读者服务/设备维护/安保协同处理')
    }
    demagForceFail.value = false
  } else if (svcKind.value === 'print') {
    if (isBlackout) {
      toast.bad('停电中打印机停止服务，已在读者端公告；恢复后可补打')
      return
    }
    branch.logUsage(lib.id, r, 'print', `自助打印 ${printPages.value} 页（黑白）`, now.value)
    toast.ok(`已记录打印 ${printPages.value} 页`)
  } else if (svcKind.value === 'water') {
    if (isBlackout) {
      toast.bad('停电中饮水机停止服务（已同步读者端公告），请勿引导读者接水')
      return
    }
    branch.logUsage(lib.id, r, 'water', `饮水机接水 ${waterMl.value}ml`, now.value)
    toast.ok(`已记录饮水 ${waterMl.value}ml`)
  } else {
    if (isBlackout) {
      toast.bad('停电中自助设备不可用，请引导读者至安全区域等候')
      return
    }
    branch.logUsage(lib.id, r, 'kiosk', '使用自助设备（检索/续借/座位预约）', now.value)
    toast.ok('自助设备使用已记录')
  }
}

const recentLogs = computed(() =>
  branch.usageLogs
    .filter((u) => u.libraryId === system.currentLibraryId)
    .slice(0, 14)
)

// ---------------- 失物 / 投诉快捷登记 ----------------
const lostName = ref('')
const lostDesc = ref('')
const lostLoc = ref('')
function registerLost() {
  if (!lostName.value.trim()) {
    toast.bad('请填写物品名称')
    return
  }
  branch.addLostItem({
    libraryId: system.currentLibraryId,
    name: lostName.value,
    desc: lostDesc.value,
    foundAt: now.value,
    location: lostLoc.value || '服务台交来'
  })
  const inc = incStore.create({
    libraryId: system.currentLibraryId,
    type: 'lost-item',
    severity: 'low',
    title: `拾获${lostName.value}`,
    detail: `读者/工作人员拾获${lostName.value}（${lostDesc.value || '无特征描述'}），地点：${lostLoc.value || '未注明'}。读者服务登记招领，必要时安保协助调取监控。`,
    at: now.value, owner: 'service'
  })
  incStore.act(inc.id, { role: 'service', actor: auth.account?.name ?? '读者服务', type: 'ack', text: '已登记招领台账', at: now.value })
  toast.ok('遗失物品已登记并生成协同事件')
  lostName.value = lostDesc.value = lostLoc.value = ''
}

const complaintText = ref('')
const complaintName = ref('匿名读者')
function registerComplaint() {
  if (!complaintText.value.trim()) {
    toast.bad('请填写投诉内容')
    return
  }
  branch.addComplaint(system.currentLibraryId, complaintName.value, complaintText.value, now.value)
  incStore.create({
    libraryId: system.currentLibraryId,
    type: 'complaint',
    severity: 'low',
    title: '读者投诉/建议',
    detail: complaintText.value,
    at: now.value,
    owner: 'service',
    carryOver: system.isNight
  })
  toast.ok('投诉已登记，当天将回复；闭馆后自动遗留次日督办')
  complaintText.value = ''
}
</script>

<template>
  <div>
    <!-- 设备故障停用期间：临时人工借还 -->
    <div v-if="activeManualFaults.length" class="banner danger">
      <span style="font-size:20px">📋</span>
      <div>
        <b>临时人工借还进行中：</b>
        <span v-for="f in activeManualFaults" :key="f.id" style="margin-right:10px">
          {{ f.deviceName }}（{{ f.manualSession?.records.length ?? 0 }} 笔）
          <a href="#" @click.prevent="faultViewer.open(f.id)">前往登记 →</a>
        </span>
        <div class="small">设备停用期间在服务台登记经办人与图书条码，结束后补生成设备故障说明，再补入系统。</div>
      </div>
    </div>
    <div v-else-if="faults.continueClosed(system.currentLibraryId).filter(f => faults.manualCapable(f)).length" class="banner warn">
      <span style="font-size:20px">⚠️</span>
      <div>
        <b>借还设备继续停用：</b>请在故障工单中启动「人工借还」兜底，避免开馆后读者无处处理图书。
      </div>
      <button class="btn amber sm" @click="faultViewer.open(faults.continueClosed(system.currentLibraryId).filter(f => faults.manualCapable(f))[0].id)">打开工单</button>
    </div>
    <div class="grid" style="grid-template-columns: 1.15fr 1fr">
      <!-- 入馆登记 -->
      <div class="card">
        <div class="card-hd">
          <h3>🎫 读者入馆登记</h3>
          <span class="sub">刷身份证 / 借书证 / 扫预约码进入</span>
        </div>
        <div class="card-bd">
          <div class="row mb12">
            <button
              v-for="m in (['idcard','card','reservation'] as EntryMethod[])"
              :key="m"
              class="lib-pill"
              :class="{ active: method === m }"
              @click="method = m; foundReader = null; lookupError = ''"
            >{{ entryMethodMeta[m] }}</button>
            <button class="mini-btn" @click="useSample">填入演示号码</button>
          </div>
          <label class="field">
            {{ method === 'idcard' ? '身份证号' : method === 'card' ? '借书证号' : '预约码' }}
            <input class="input" v-model="credential" @keyup.enter="lookup" :placeholder="sampleCred[method]" :disabled="readOnly">
          </label>
          <button class="btn ghost" @click="lookup" :disabled="readOnly">🔍 查询读者</button>
          <div v-if="lookupError" class="small bad-text mt8">{{ lookupError }}</div>

          <div v-if="foundReader" class="card mt12" style="box-shadow:none; background:#f8fafd">
            <div class="card-bd">
              <div class="row">
                <div>
                  <b style="font-size:15px">{{ foundReader.name }}</b>
                  <span v-if="foundReader.isChild" class="tag st-info" style="margin-left:6px">儿童读者 · 家长 {{ foundReader.guardian }}</span>
                </div>
                <div class="spacer"></div>
                <span class="tag" :class="foundReader.credit >= 70 ? 'st-ok' : 'st-warn'">信用 {{ foundReader.credit }}</span>
              </div>
              <div class="small muted mt8">
                {{ maskIdCard(foundReader.idCard) }} · 借书证 {{ foundReader.cardNo }} · {{ foundReader.phone }}
              </div>
              <div class="grid grid-2 mt12">
                <label class="field" style="margin:0">分配座位
                  <select class="input" v-model="chosenSeat">
                    <option value="">请选择座位</option>
                    <option v-for="s in seatOptions" :key="s" :value="s" :disabled="occupiedSeats.has(s)">
                      {{ s }}{{ occupiedSeats.has(s) ? '（已占用）' : '' }}
                    </option>
                  </select>
                </label>
                <label class="field" style="margin:0">备注
                  <input class="input" v-model="seatNote" placeholder="如：亲子陪同/行动不便">
                </label>
              </div>
              <div class="mt12">
                <button class="btn amber" @click="checkIn" :disabled="readOnly">✅ 确认入馆（记录入馆时间与座位）</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 自助服务记录 -->
      <div class="card">
        <div class="card-hd"><h3>🖥️ 自助服务记录</h3><span class="sub">借书 / 还书 / 打印 / 饮水机 / 自助设备</span></div>
        <div class="card-bd">
          <label class="field">读者借书证号
            <input class="input" v-model="svcReaderCard" :disabled="readOnly">
          </label>
          <div v-if="svcReader" class="small mb12">读者：<b>{{ svcReader.name }}</b> · 信用 {{ svcReader.credit }}
            · 当前借出 {{ readerBorrowed.length }} 册</div>
          <div v-else class="small bad-text mb12">未找到该读者</div>

          <div class="row mb12">
            <button v-for="(meta, key) in serviceKindMeta" :key="key" class="lib-pill" :class="{ active: svcKind === key }" @click="svcKind = key as ServiceKind">
              {{ meta.icon }} {{ meta.label }}
            </button>
          </div>

          <label class="field" v-if="svcKind === 'borrow'">选择在架图书
            <select class="input" v-model="svcBookId">
              <option value="">请选择</option>
              <option v-for="b in borrowableBooks" :key="b.id" :value="b.id">{{ b.title }}（{{ b.location }}）</option>
            </select>
          </label>
          <div v-if="svcKind === 'return'" class="mb12">
            <label class="field" style="margin:0">归还图书（默认该读者名下借出图书）
              <select class="input" v-model="svcBookId">
                <option v-for="b in readerBorrowed" :key="b.id" :value="b.id">{{ b.title }}</option>
                <option v-if="!readerBorrowed.length" value="">该读者名下无借出图书</option>
              </select>
            </label>
            <label class="row small mt8" style="gap:6px">
              <input type="checkbox" v-model="demagForceFail"> 模拟消磁失败（1 号自助机当前故障，默认会触发）
            </label>
          </div>
          <label class="field" v-if="svcKind === 'print'">打印页数
            <input class="input" type="number" v-model.number="printPages" min="1" max="100">
          </label>
          <label class="field" v-if="svcKind === 'water'">接水量 (ml)
            <input class="input" type="number" v-model.number="waterMl" min="50" max="1000" step="50">
          </label>

          <button class="btn" @click="recordService" :disabled="readOnly">📝 记录本次服务</button>
        </div>
      </div>
    </div>

    <!-- 在馆/出入记录 -->
    <div class="card">
      <div class="card-hd"><h3>👥 出入馆记录</h3><span class="sub">含入馆时间、座位、离馆时间、滞留标记</span></div>
      <div class="card-bd flush">
        <table class="tbl">
          <thead><tr><th>读者</th><th>方式</th><th>凭证</th><th>座位</th><th>入馆</th><th>离馆</th><th>状态/备注</th></tr></thead>
          <tbody>
            <tr v-for="v in visits.slice(0, 12)" :key="v.id">
              <td>{{ v.readerName }}<span v-if="v.isChild" class="tag st-info" style="margin-left:4px">儿童</span></td>
              <td>{{ entryMethodMeta[v.entryMethod] }}</td>
              <td class="small muted">{{ v.entryNo }}</td>
              <td>{{ v.seatNo }}</td>
              <td class="nowrap">{{ fmtTime(v.enterAt) }}</td>
              <td class="nowrap">{{ v.leaveAt ? fmtTime(v.leaveAt) : '—' }}</td>
              <td class="small">
                <span v-if="v.stranded && !v.resolved" class="tag st-bad"><span class="pulse-dot"></span>夜间滞留</span>
                <span v-else-if="v.leaveAt" class="tag st-off">已离馆</span>
                <span v-else class="tag st-ok">在馆</span>
                <span v-if="v.note" class="muted" style="margin-left:6px">{{ v.note }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="grid grid-2">
      <!-- 服务流水 -->
      <div class="card">
        <div class="card-hd"><h3>🧾 自助服务流水</h3></div>
        <div class="card-bd flush">
          <table class="tbl">
            <thead><tr><th>时间</th><th>读者</th><th>类型</th><th>内容</th></tr></thead>
            <tbody>
              <tr v-for="u in recentLogs" :key="u.id">
                <td class="nowrap">{{ fmtTime(u.at) }}</td>
                <td>{{ u.readerName }}</td>
                <td>{{ serviceKindMeta[u.kind].icon }} {{ serviceKindMeta[u.kind].label }}</td>
                <td class="small">{{ u.detail }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 失物 + 投诉 -->
      <div>
        <div class="card">
          <div class="card-hd"><h3>🔑 遗失物品快捷登记</h3></div>
          <div class="card-bd">
            <div class="grid grid-3" style="gap:8px">
              <input class="input" v-model="lostName" placeholder="物品名称" :disabled="readOnly">
              <input class="input" v-model="lostLoc" placeholder="拾获地点" :disabled="readOnly">
              <input class="input" v-model="lostDesc" placeholder="特征描述" :disabled="readOnly">
            </div>
            <button class="btn ghost sm mt8" @click="registerLost" :disabled="readOnly">登记并生成招领事件</button>
            <div class="small muted mt8">
              在馆未认领：
              <span v-for="it in branch.lostItems.filter(i => i.libraryId === system.currentLibraryId && i.status === 'kept')" :key="it.id" class="tag st-info" style="margin:2px">{{ it.name }}</span>
              <span v-if="!branch.lostItems.some(i => i.libraryId === system.currentLibraryId && i.status === 'kept')">无</span>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-hd"><h3>📝 读者投诉/建议</h3><span class="sub">闭馆后未回复将遗留次日开馆提示</span></div>
          <div class="card-bd">
            <input class="input mb8" v-model="complaintName" placeholder="读者称呼" :disabled="readOnly">
            <textarea class="input" rows="2" v-model="complaintText" placeholder="请描述投诉或建议内容" :disabled="readOnly"></textarea>
            <button class="btn ghost sm mt8" @click="registerComplaint" :disabled="readOnly">提交投诉</button>
            <div class="mt8 small" v-for="c in branch.complaints.filter(x => x.libraryId === system.currentLibraryId).slice(0,3)" :key="c.id">
              <span class="tag" :class="c.status === 'open' ? 'st-warn' : c.status === 'replied' ? 'st-info' : 'st-off'">
                {{ c.status === 'open' ? '待回复' : c.status === 'replied' ? '已回复' : '已关闭' }}
              </span>
              <b>{{ c.readerName }}</b>：{{ c.content }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
