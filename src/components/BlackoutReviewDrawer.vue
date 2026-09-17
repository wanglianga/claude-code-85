<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useBlackoutViewer } from '@/composables/useBlackoutViewer'
import { useBlackoutStore } from '@/stores/blackout'
import { useSystemStore } from '@/stores/system'
import { useAuthStore } from '@/stores/auth'
import { fmtDateTime, fmtTime } from '@/utils/format'
import { useToast } from '@/composables/useToast'

const viewer = useBlackoutViewer()
const bo = useBlackoutStore()
const system = useSystemStore()
const auth = useAuthStore()
const toast = useToast()

const c = computed(() => viewer.reviewCase.value)
const lib = computed(() => (c.value ? system.libraries.find((l) => l.id === c.value!.libraryId) : null))

const form = reactive({
  affectedScope: '',
  readerHelps: '',
  responsibilities: '',
  improvements: ''
})

watch(c, (v) => {
  if (!v) return
  form.affectedScope = v.review?.affectedScope ?? defaultScope(v)
  form.readerHelps = v.review?.readerHelps ?? defaultHelps(v)
  form.responsibilities = v.review?.responsibilities ?? ''
  form.improvements = v.review?.improvements ?? ''
})

function defaultScope(v: NonNullable<typeof c.value>) {
  const affected = v.devices.filter((d) => d.affected).length
  return `停电小区：${v.community}；影响书房：${lib.value?.name ?? v.libraryId}；在馆峰值约 ${v.zones.reduce((s, z) => s + z.count, 0)} 人；受影响市电设备 ${affected} 台（门禁/自助借还机/打印机/摄像头/异常声音/空调/新风/饮水/照明）；应急照明与疏散指示由 UPS 投切；消防主机/烟感备用电池供电。`
}
function defaultHelps(v: NonNullable<typeof c.value>) {
  if (!v.helps.length) return '停电期间无读者求助；疏散有序，无踩踏、无被困。'
  return v.helps.map((h) => `${fmtTime(h.at)} ${h.zone}：${h.desc}（${h.status === 'resolved' ? '已处置' : '处置中'}）`).join('；')
}

const blocked = computed(() => {
  if (!c.value) return [] as string[]
  const reasons: string[] = []
  if (c.value.phase === 'active') reasons.push('供电尚未恢复')
  if (c.value.emergencyReasons.length && !c.value.emergencyCleared) reasons.push('紧急险情尚未排除（被困/通道被占/烟感离线/应急灯不亮）')
  const st = bo.pendingSelfTestCount(c.value)
  if (st) reasons.push(`${st} 台设备未完成来电自检`)
  const tx = c.value.pendingTxns.filter((t) => !t.backfilled).length
  if (tx) reasons.push(`${tx} 笔暂存借还未补录`)
  if (c.value.night && !bo.nightConfirmedAll(c.value)) reasons.push('夜间六项未全部逐项确认')
  return reasons
})

function submit() {
  if (!c.value) return
  if (!form.responsibilities.trim() || !form.improvements.trim()) {
    toast.bad('请填写处置责任与改进项')
    return
  }
  const r = bo.submitReview(c.value.id, {
    affectedScope: form.affectedScope.trim() || defaultScope(c.value),
    readerHelps: form.readerHelps.trim() || defaultHelps(c.value),
    responsibilities: form.responsibilities.trim(),
    improvements: form.improvements.trim(),
    reviewedBy: auth.account?.name ?? '管理员',
    reviewedAt: system.now
  }, system.now)
  if (!r.ok) {
    toast.bad(r.error!)
    return
  }
  toast.ok('停电复盘已归档，应急处置闭环')
  viewer.closeReview()
}
</script>

<template>
  <template v-if="c">
    <div class="drawer-mask" @click="viewer.closeReview()"></div>
    <aside class="drawer">
      <div class="drawer-hd">
        <div class="row">
          <span style="font-size:22px">⚡</span>
          <div>
            <h3 style="font-size:16px">停电复盘记录 · {{ c.no }}</h3>
            <div class="small muted mt8">
              {{ lib?.name }} · {{ fmtDateTime(c.startedAt) }} {{ fmtTime(c.startedAt) }}
              <template v-if="c.restoredAt"> → 来电 {{ fmtTime(c.restoredAt) }}</template>
            </div>
          </div>
          <div class="spacer"></div>
          <button class="mini-btn" @click="viewer.closeReview()">✕</button>
        </div>
      </div>

      <div class="drawer-bd">
        <!-- 已复盘：只读展示 -->
        <template v-if="c.review">
          <div class="card">
            <div class="card-hd"><h3>📜 复盘结论（已归档只读）</h3><span class="tag st-ok">历时 {{ c.review.durationMin }} 分钟</span></div>
            <div class="card-bd small" style="line-height:1.9">
              <p><b>停电时间：</b>{{ fmtDateTime(c.startedAt) }} 起，历时 {{ c.review.durationMin }} 分钟{{ c.night ? '（夜间停电）' : '' }}</p>
              <p><b>影响范围：</b>{{ c.review.affectedScope }}</p>
              <p><b>读者求助：</b>{{ c.review.readerHelps }}</p>
              <p><b>处置责任：</b>{{ c.review.responsibilities }}</p>
              <p><b>改进项：</b>{{ c.review.improvements }}</p>
              <div class="muted mt8">复盘人：{{ c.review.reviewedBy }} · {{ fmtDateTime(c.review.reviewedAt) }}</div>
            </div>
          </div>
          <div class="card">
            <div class="card-hd"><h3>关键数据</h3></div>
            <div class="card-bd small">
              紧急事件 {{ c.emergencyIncidentIds.length }} 起；借还暂存补录 {{ c.pendingTxns.length }} 笔；
              来电自检失败转跨日工单 {{ c.devices.filter(d => d.faultReportId).length }} 台；
              提前闭馆 {{ c.earlyClosed ? '是（通知预约读者 ' + c.reservationNotifiedCount + ' 人次）' : '否' }}。
            </div>
          </div>
        </template>

        <!-- 未复盘：填写表单 -->
        <template v-else>
          <div v-if="blocked.length" class="banner danger" style="align-items:flex-start">
            <span>⛔</span>
            <div>
              <b>暂不能复盘归档：</b>
              <ul style="padding-left:18px;margin-top:2px">
                <li v-for="(r, i) in blocked" :key="i">{{ r }}</li>
              </ul>
            </div>
          </div>

          <label class="field">停电时间 / 影响范围
            <textarea class="input" rows="4" v-model="form.affectedScope"></textarea>
          </label>
          <label class="field">读者求助记录
            <textarea class="input" rows="3" v-model="form.readerHelps"></textarea>
          </label>
          <label class="field">处置责任（谁在何时做了什么：通知安保/机械钥匙/临时开门/疏散清点/街道消防同步/借还暂存补录/设备自检）
            <textarea class="input" rows="4" v-model="form.responsibilities" placeholder="如：停电即通知安保 2 分钟到场，启用机械钥匙；管理员逐区清点 12 人全部疏散；读者服务暂存借还 3 笔并于来电后 18:40 补录…"></textarea>
          </label>
          <label class="field">改进项（UPS 续航、应急照明巡检、疏散演练、预约读者通知、设备自检流程等）
            <textarea class="input" rows="3" v-model="form.improvements" placeholder="如：增加 UPS 季度带载测试；每季度组织停电疏散演练；预约系统增加批量短信通知…"></textarea>
          </label>
        </template>
      </div>

      <div class="drawer-ft row" v-if="!c.review">
        <button class="btn ghost" @click="viewer.closeReview()">取消</button>
        <div class="spacer"></div>
        <button class="btn amber" :disabled="blocked.length > 0" @click="submit">📝 提交复盘并归档</button>
      </div>
    </aside>
  </template>
</template>
