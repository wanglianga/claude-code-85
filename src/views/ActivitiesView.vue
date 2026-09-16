<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { useBranchStore } from '@/stores/branch'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'

const system = useSystemStore()
const branch = useBranchStore()
const auth = useAuthStore()
const toast = useToast()
const { now } = storeToRefs(system)
const readOnly = computed(() => auth.account?.role === 'volunteer')

const activities = computed(() =>
  branch.activities.filter((a) => a.libraryId === system.currentLibraryId)
)

const enroll = ref<Record<string, string>>({})
function setEnroll(id: string, field: 'parent' | 'child' | 'childAge' | 'phone', val: string) {
  const base = enroll.value[id] ?? '|||'
  const parts = base.split('|')
  const map = { parent: 0, child: 1, childAge: 2, phone: 3 }
  parts[map[field]] = val
  enroll.value[id] = parts.join('|')
}
function submitEnroll(id: string) {
  const raw = enroll.value[id] ?? ''
  const [parent, child, ageStr, phone] = raw.split('|')
  if (!parent || !child || !ageStr || !phone) {
    toast.bad('请填写家长、孩子姓名、年龄与联系电话')
    return
  }
  const ok = branch.enrollActivity(id, {
    parent, child, childAge: Number(ageStr) || 0, phone
  })
  if (!ok) {
    toast.bad('名额已满')
    return
  }
  const childReader = branch.readers.find((r) => r.isChild && r.name === child)
  if (childReader) {
    branch.adjustCredit(childReader, 3, `报名亲子活动《${branch.activities.find((a) => a.id === id)?.title}》`, now.value)
  }
  toast.ok('报名成功！参与后将累计读者信用')
  enroll.value[id] = ''
}

// 新建活动
const showCreate = ref(false)
const nTitle = ref('')
const nDate = ref('2026-09-27')
const nTime = ref('10:00-11:00')
const nAge = ref('4-8 岁')
const nCap = ref(15)
function createActivity() {
  if (!nTitle.value.trim()) {
    toast.bad('请填写活动名称')
    return
  }
  branch.activities.unshift({
    id: 'act_' + Math.random().toString(36).slice(2, 8),
    libraryId: system.currentLibraryId,
    title: nTitle.value,
    date: nDate.value,
    time: nTime.value,
    ageRange: nAge.value,
    capacity: nCap.value,
    enrolled: 0,
    host: `${auth.account?.name}组织`,
    status: 'open',
    families: []
  })
  toast.ok('亲子活动已发布')
  showCreate.value = false
  nTitle.value = ''
}
</script>

<template>
  <div>
    <div class="card">
      <div class="card-bd row">
        <div>👨‍👩‍👧 <b>亲子阅读活动</b>
          <span class="muted small">—— 服务儿童读者与家庭，报名、名额、年龄分层与信用激励一体化管理</span>
        </div>
        <div class="spacer"></div>
        <button class="btn amber sm" @click="showCreate = true" :disabled="readOnly">＋ 发布活动</button>
      </div>
    </div>

    <div class="grid grid-2">
      <div v-for="a in activities" :key="a.id" class="card">
        <div class="card-hd">
          <h3>{{ a.title }}</h3>
          <span class="tag" :class="a.status === 'full' ? 'st-warn' : 'st-ok'">
            {{ a.status === 'full' ? '已满员' : a.status === 'done' ? '已结束' : `报名中 ${a.enrolled}/${a.capacity}` }}
          </span>
        </div>
        <div class="card-bd">
          <div class="metric-strip mb12">
            <span>📅 <b>{{ a.date }}</b> {{ a.time }}</span>
            <span>👶 适合 <b>{{ a.ageRange }}</b></span>
            <span>🎤 {{ a.host }}</span>
          </div>
          <div class="progress mb8"><div :class="a.enrolled >= a.capacity ? 'bad' : a.enrolled >= a.capacity * 0.8 ? 'warn' : 'good'" :style="{ width: Math.min(100, (a.enrolled / a.capacity) * 100) + '%' }"></div></div>

          <div class="small muted mb8">已报名家庭：</div>
          <div class="row mb12">
            <span v-for="(f, i) in a.families" :key="i" class="tag st-info">
              {{ f.parent }} + {{ f.child }}（{{ f.childAge }}岁）
            </span>
            <span v-if="!a.families.length" class="small muted">暂无</span>
          </div>

          <div v-if="a.status === 'open'" class="grid" style="grid-template-columns:1fr 1fr;gap:8px">
            <input class="input" placeholder="家长姓名" :value="(enroll[a.id] ?? '|||').split('|')[0]" @input="setEnroll(a.id, 'parent', ($event.target as HTMLInputElement).value)" :disabled="readOnly">
            <input class="input" placeholder="孩子姓名" :value="(enroll[a.id] ?? '|||').split('|')[1]" @input="setEnroll(a.id, 'child', ($event.target as HTMLInputElement).value)" :disabled="readOnly">
            <input class="input" placeholder="孩子年龄" type="number" :value="(enroll[a.id] ?? '|||').split('|')[2]" @input="setEnroll(a.id, 'childAge', ($event.target as HTMLInputElement).value)" :disabled="readOnly">
            <input class="input" placeholder="联系电话" :value="(enroll[a.id] ?? '|||').split('|')[3]" @input="setEnroll(a.id, 'phone', ($event.target as HTMLInputElement).value)" :disabled="readOnly">
          </div>
          <button v-if="a.status === 'open'" class="btn sm mt8" @click="submitEnroll(a.id)" :disabled="readOnly">📝 家庭报名（参加 +3 信用）</button>
        </div>
      </div>
    </div>

    <template v-if="showCreate">
      <div class="drawer-mask" @click="showCreate = false"></div>
      <div class="drawer" style="width:440px">
        <div class="drawer-hd"><h3>发布亲子阅读活动</h3></div>
        <div class="drawer-bd">
          <label class="field">活动名称<input class="input" v-model="nTitle" placeholder="如：周末绘本共读《团圆》"></label>
          <div class="grid grid-2">
            <label class="field">日期<input class="input" type="date" v-model="nDate"></label>
            <label class="field">时间<input class="input" v-model="nTime"></label>
            <label class="field">适合年龄<input class="input" v-model="nAge"></label>
            <label class="field">名额<input class="input" type="number" v-model.number="nCap" min="1"></label>
          </div>
        </div>
        <div class="drawer-ft row">
          <button class="btn ghost" @click="showCreate = false">取消</button>
          <div class="spacer"></div>
          <button class="btn amber" @click="createActivity">发布</button>
        </div>
      </div>
    </template>
  </div>
</template>
