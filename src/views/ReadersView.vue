<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useBranchStore } from '@/stores/branch'
import { useSystemStore } from '@/stores/system'
import { useAuthStore } from '@/stores/auth'
import { creditLevel, fmtDateTime, maskIdCard } from '@/utils/format'
import { useToast } from '@/composables/useToast'
import type { Reader } from '@/types'

const branch = useBranchStore()
const system = useSystemStore()
const auth = useAuthStore()
const toast = useToast()
const { now } = storeToRefs(system)
const readOnly = computed(() => auth.account?.role === 'volunteer')

const keyword = ref('')
const readers = computed(() => {
  const k = keyword.value.trim()
  let list = branch.readers
  if (k) list = list.filter((r) => r.name.includes(k) || r.cardNo.includes(k) || r.idCard.includes(k))
  return [...list].sort((a, b) => a.credit - b.credit)
})

const selectedReader = ref<Reader | null>(null)
const delta = ref(-5)
const reason = ref('')
const presets = [
  { d: -20, r: '恶意占座/扰乱秩序' },
  { d: -10, r: '图书逾期' },
  { d: -5, r: '闭馆滞留（经提醒离馆）' },
  { d: 2, r: '按时还书' },
  { d: 5, r: '参加亲子阅读活动' },
  { d: 5, r: '志愿服务/图书归位' }
]
function adjust() {
  if (!selectedReader.value) return
  if (!reason.value.trim()) {
    toast.bad('请填写加减分原因')
    return
  }
  branch.adjustCredit(selectedReader.value, delta.value, reason.value, now.value)
  toast.ok(`已为${selectedReader.value.name}记录信用 ${delta.value > 0 ? '+' : ''}${delta.value} 分`)
  reason.value = ''
}
function preset(p: { d: number; r: string }) {
  delta.value = p.d
  reason.value = p.r
}

function creditColor(c: number) {
  return c >= 90 ? 'var(--good)' : c >= 70 ? '#7aa848' : c >= 50 ? 'var(--warn)' : 'var(--bad)'
}
function levelTagCls(c: number) {
  const cls = creditLevel(c).cls
  return cls === 'good' ? 'st-ok' : cls === 'ok' ? 'st-info' : cls === 'warn' ? 'st-warn' : 'st-bad'
}

const readerVisits = (id: string) => branch.visits.filter((v) => v.readerId === id).length
const readerBorrowed = (id: string) => branch.books.filter((b) => b.borrowerId === id).length
</script>

<template>
  <div>
    <div class="card">
      <div class="card-bd row">
        <input class="input" style="width:280px" v-model="keyword" placeholder="搜索姓名 / 借书证号 / 身份证">
        <span class="small muted">读者信用初始 100 分：逾期、滞留、占座扣分；按时还书、参加活动、志愿服务加分。低于 50 分将限制自助服务。</span>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: 1.5fr 1fr">
      <div class="card">
        <div class="card-hd"><h3>读者信用榜（低到高）</h3></div>
        <div class="card-bd flush">
          <table class="tbl">
            <thead><tr><th>读者</th><th>证件</th><th>信用分</th><th>在馆/借阅</th><th class="right">操作</th></tr></thead>
            <tbody>
              <tr v-for="r in readers" :key="r.id">
                <td>
                  <b>{{ r.name }}</b>
                  <span v-if="r.isChild" class="tag st-info" style="margin-left:4px">儿童 · {{ r.age }}岁</span>
                  <div class="small muted">{{ r.phone }}<template v-if="r.guardian"> · 家长 {{ r.guardian }} {{ r.guardianPhone }}</template></div>
                </td>
                <td class="small">{{ maskIdCard(r.idCard) }}<div class="muted">{{ r.cardNo }}</div></td>
                <td>
                  <div class="row" style="gap:8px">
                    <div class="credit-bar"><div :style="{ width: r.credit + '%', background: creditColor(r.credit) }"></div></div>
                    <b :style="{ color: creditColor(r.credit) }">{{ r.credit }}</b>
                    <span class="tag" :class="levelTagCls(r.credit)">{{ creditLevel(r.credit).label }}</span>
                  </div>
                </td>
                <td class="small">入馆 {{ readerVisits(r.id) }} 次<br>当前借 {{ readerBorrowed(r.id) }} 册</td>
                <td class="right"><button class="mini-btn" @click="selectedReader = r; reason = ''" :disabled="readOnly">信用调整</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div class="card" v-if="selectedReader">
          <div class="card-hd"><h3>调整信用：{{ selectedReader.name }}</h3>
            <span class="tag" :class="levelTagCls(selectedReader.credit)">当前 {{ selectedReader.credit }}</span></div>
          <div class="card-bd">
            <div class="row mb12">
              <button v-for="p in presets" :key="p.r" class="lib-pill" @click="preset(p)">
                {{ p.d > 0 ? '+' : '' }}{{ p.d }} {{ p.r }}
              </button>
            </div>
            <label class="field">分值
              <input class="input" type="number" v-model.number="delta" max="20" min="-30" step="5">
            </label>
            <label class="field">原因
              <input class="input" v-model="reason" placeholder="请说明加减分原因">
            </label>
            <button class="btn amber" @click="adjust" :disabled="readOnly">确认调整（0-100 自动夹取）</button>
          </div>
        </div>

        <div class="card">
          <div class="card-hd"><h3>信用变动流水</h3></div>
          <div class="card-bd flush">
            <table class="tbl">
              <thead><tr><th>时间</th><th>读者</th><th>分值</th><th>原因</th></tr></thead>
              <tbody>
                <tr v-for="c in branch.creditRecords.slice(0, 12)" :key="c.id">
                  <td class="small muted nowrap">{{ fmtDateTime(c.at) }}</td>
                  <td>{{ c.readerName }}</td>
                  <td><b :class="c.delta > 0 ? 'good-text' : 'bad-text'">{{ c.delta > 0 ? '+' : '' }}{{ c.delta }}</b></td>
                  <td class="small">{{ c.reason }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
