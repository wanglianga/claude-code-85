<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useSystemStore } from '@/stores/system'
import { useBlackoutStore } from '@/stores/blackout'
import { useToast } from '@/composables/useToast'
import { fmtDateTime, fmtTime } from '@/utils/format'

const router = useRouter()
const system = useSystemStore()
const blackout = useBlackoutStore()
const toast = useToast()
const { now } = storeToRefs(system)

const lib = computed(() => system.currentLibrary)
const event = computed(() => blackout.activeOf(lib.value.id))

const zones = ['一层阅览区 A 区', '一层阅览区 B 区', '少儿亲子区', '书库/卫生间通道', '饮水角/门厅']
const form = ref({ name: '', zone: zones[0], kind: 'trapped' as 'trapped' | 'injury' | 'separated' | 'route' | 'other', content: '' })
const submitted = ref(false)

const helpKinds = [
  { key: 'trapped', icon: '🛗', label: '被困（电梯/卫生间/书库）', urgent: true },
  { key: 'injury', icon: '🩹', label: '身体不适/受伤', urgent: true },
  { key: 'separated', icon: '🧒', label: '与同行人/孩子失散', urgent: false },
  { key: 'route', icon: '🧭', label: '询问疏散路线', urgent: false },
  { key: 'other', icon: '🙋', label: '其他求助', urgent: false }
] as const

function submitHelp() {
  if (!form.value.content.trim()) {
    toast.bad('请简要描述您的情况和位置')
    return
  }
  blackout.addHelp({
    libraryId: lib.value.id,
    at: now.value,
    readerName: form.value.name.trim() || '匿名读者',
    zone: form.value.zone,
    kind: form.value.kind,
    content: form.value.content.trim()
  })
  submitted.value = true
  form.value.content = ''
  toast.ok('求助已送达值班安保与管理员，请在原地等待（被困请勿强行扒门）')
}

const notices = computed(() => blackout.readerNotices(lib.value.id))
</script>

<template>
  <div class="reader-wrap" :class="{ emergency: event }">
    <div class="reader-topbar">
      <div class="row">
        <span style="font-size:22px">📖</span>
        <b>{{ lib.name }} · 读者端</b>
      </div>
      <div class="spacer"></div>
      <select class="reader-select" v-model="system.currentLibraryId">
        <option v-for="l in system.libraries" :key="l.id" :value="l.id">{{ l.name }}</option>
      </select>
      <span class="reader-clock">🕐 {{ fmtTime(now) }}</span>
      <button class="reader-link" @click="router.push('/login')">工作人员入口</button>
    </div>

    <!-- 停电应急视图 -->
    <div class="reader-body" v-if="event">
      <div class="reader-alert">
        <div class="ra-ico">⚡</div>
        <div>
          <h1>突发停电，请保持冷静，听从工作人员指引</h1>
          <p>应急照明与疏散指示灯已点亮，工作人员正在现场引导。{{ fmtDateTime(event.startedAt) }} {{ fmtTime(event.startedAt) }} 停电 ·
            停电期间借还已为您人工登记，来电后补录，<b>不会把您算作逾期或借阅失败</b>。</p>
        </div>
      </div>

      <div class="reader-grid">
        <div class="reader-card route">
          <h2>🚪 疏散路线与集合点</h2>
          <p class="assembly">集合点：<b>{{ lib.assemblyPoint }}</b></p>
          <div v-for="r in lib.evacuationRoutes" :key="r.zone" class="route-line">
            <span class="route-zone">{{ r.zone }}</span>
            <span class="route-arrow">→</span>
            <span>{{ r.route }}</span>
          </div>
          <div class="reader-warn">
            ⚠️ 停电后门禁/闸机可能无法扫码出门，<b>不要只依赖扫码</b>：安保已到场，将用
            <b>机械钥匙开门</b>或<b>临时开门</b>人工放行，请沿应急灯和绿色疏散指示有序撤离，勿折返取物。
          </div>
        </div>

        <div class="reader-card">
          <h2>📢 服务调整公告</h2>
          <ul class="notice-list">
            <li v-for="(n, i) in notices" :key="i"><span>{{ n.icon }}</span>{{ n.text }}</li>
            <li v-if="!notices.length"><span>✅</span>各项服务在应急供电下维持，请听从现场安排</li>
          </ul>
          <h2 style="margin-top:18px">📞 紧急联系</h2>
          <p class="small" style="line-height:2">
            安保调度：{{ lib.securityDispatchPhone }}<br />
            街道值班：{{ lib.streetDutyPhone }}<br />
            消防/急救：{{ lib.fireContactPhone }}
          </p>
        </div>
      </div>

      <!-- 一键求助 -->
      <div class="reader-card help-card">
        <h2>🆘 一键求助（值班安保与管理员即时收到）</h2>
        <div class="help-kinds">
          <button v-for="k in helpKinds" :key="k.key" class="help-kind"
                  :class="{ active: form.kind === k.key, urgent: k.urgent }"
                  @click="form.kind = k.key">
            <span class="hk-ico">{{ k.icon }}</span>{{ k.label }}
          </button>
        </div>
        <div class="help-form">
          <input class="reader-input" v-model="form.name" placeholder="您的称呼（可匿名）">
          <select class="reader-input" v-model="form.zone">
            <option v-for="z in zones" :key="z" :value="z">所在位置：{{ z }}</option>
          </select>
          <input class="reader-input wide" v-model="form.content" placeholder="请描述情况（如：2 人困在卫生间、孩子走散穿红色上衣……）">
          <button class="help-submit" @click="submitHelp">立即求助</button>
        </div>
        <div v-if="submitted" class="reader-ok">
          ✔ 已收到！您的求助已同步到应急指挥视图并通知值班人员。被困时请保持镇定、不要强行开门，工作人员会尽快到场。
        </div>
        <p class="small muted mt8">如有浓烟、明火或受伤，请同时大声呼喊并拨打 {{ lib.fireContactPhone }}。</p>
      </div>
    </div>

    <!-- 非停电：普通读者提示页 -->
    <div class="reader-body" v-else>
      <div class="reader-card" style="text-align:center;padding:48px 24px">
        <div style="font-size:46px">📖</div>
        <h1 style="font-size:22px;margin:12px 0">{{ lib.name }}供电与服务正常</h1>
        <p class="muted">本页面为突发停电时的应急读者端：停电发生时将自动展示疏散路线、集合点、服务调整公告与一键求助。</p>
        <div class="mt16"><button class="help-submit" @click="router.push('/login')">工作人员登录</button></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reader-wrap { min-height: 100%; background: #eef2f7; color: #1f2d3d; }
.reader-wrap.emergency { background: #20070d; }
.reader-topbar {
  height: 60px; background: #fff; border-bottom: 1px solid #d9dfe7;
  display: flex; align-items: center; gap: 14px; padding: 0 22px;
}
.emergency .reader-topbar { background: #16050a; border-color: #4a1220; color: #ffe7ea; }
.reader-select {
  border: 1px solid #d9dfe7; border-radius: 8px; padding: 7px 10px; font-size: 13px; background: #fff;
}
.emergency .reader-select { background: #2a0b13; color: #ffe7ea; border-color: #5a1a28; }
.reader-clock { font-variant-numeric: tabular-nums; font-weight: 650; }
.reader-link { font-size: 12.5px; color: #2f6fb0; background: none; border: none; cursor: pointer; }
.reader-body { max-width: 1060px; margin: 0 auto; padding: 24px 20px 60px; }

.reader-alert {
  background: linear-gradient(90deg, #7a1626, #b31232); color: #fff;
  border-radius: 14px; padding: 22px 24px; display: flex; gap: 18px; align-items: flex-start;
  animation: alertPulse 1.6s infinite; margin-bottom: 20px;
}
@keyframes alertPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(179,18,50,.5);} 50% { box-shadow: 0 0 0 10px rgba(179,18,50,0);} }
.ra-ico { font-size: 44px; line-height: 1; }
.reader-alert h1 { font-size: 22px; margin-bottom: 6px; }
.reader-alert p { margin: 0; line-height: 1.8; font-size: 14px; }

.reader-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }
@media (max-width: 860px) { .reader-grid { grid-template-columns: 1fr; } }
.reader-card {
  background: #fff; border-radius: 14px; padding: 20px 22px; margin-bottom: 16px;
  box-shadow: 0 4px 18px rgba(16,29,47,.08);
}
.emergency .reader-card { background: #fff8f6; }
.reader-card h2 { font-size: 16px; margin-bottom: 12px; }
.assembly { font-size: 15px; background: #fde3d3; border: 1px dashed #c2571c; border-radius: 8px; padding: 10px 12px; }
.route-line { display: flex; gap: 8px; align-items: baseline; padding: 9px 0; border-bottom: 1px dashed #e3d9d6; font-size: 13.5px; line-height: 1.7; }
.route-zone { flex: 0 0 132px; font-weight: 700; color: #b31232; }
.route-arrow { color: #b31232; font-weight: 700; }
.reader-warn {
  margin-top: 14px; background: #f9e1e5; border: 1px solid #e6aab3; color: #7a1626;
  border-radius: 8px; padding: 12px 14px; font-size: 13px; line-height: 1.8;
}
.notice-list { margin: 0; padding: 0; list-style: none; }
.notice-list li { display: flex; gap: 9px; align-items: baseline; padding: 8px 0; border-bottom: 1px dashed #ece4e1; font-size: 13.5px; }
.notice-list li span { font-size: 17px; }

.help-card { border: 2px solid #e6aab3; }
.help-kinds { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 14px; }
.help-kind {
  border: 1.5px solid #d9dfe7; background: #fff; border-radius: 10px; padding: 12px;
  font-size: 13.5px; cursor: pointer; display: flex; gap: 8px; align-items: center; text-align: left;
}
.help-kind .hk-ico { font-size: 19px; }
.help-kind.active { border-color: #2a4d78; background: #e3eef9; font-weight: 700; }
.help-kind.urgent.active { border-color: #b31232; background: #f9e1e5; }
.help-form { display: flex; flex-wrap: wrap; gap: 10px; }
.reader-input {
  border: 1px solid #d0c7c4; border-radius: 8px; padding: 11px 12px; font-size: 14px; font-family: inherit;
}
.help-form .reader-input:not(.wide) { flex: 1 1 200px; min-width: 160px; }
.reader-input.wide { flex: 1 1 240px; min-width: 220px; }
.help-submit {
  background: #b31232; color: #fff; border: none; border-radius: 8px; padding: 11px 26px;
  font-size: 15px; font-weight: 700; cursor: pointer;
}
.help-submit:hover { background: #8f0e28; }
.reader-ok { margin-top: 12px; background: #e2f2ef; color: #1f7a70; border-radius: 8px; padding: 10px 14px; font-size: 13.5px; }
.small { font-size: 12.5px; } .muted { color: #5b6b7c; } .mt8 { margin-top: 8px; } .mt16 { margin-top: 16px; }
</style>
