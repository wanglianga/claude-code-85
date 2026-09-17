<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { useBranchStore } from '@/stores/branch'
import { useBlackoutStore } from '@/stores/blackout'
import { fmtDuration, fmtTime } from '@/utils/format'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const system = useSystemStore()
const branch = useBranchStore()
const bo = useBlackoutStore()
const toast = useToast()
const { now } = storeToRefs(system)

const selected = ref<string>((route.query.lib as string) || system.currentLibraryId)
const lib = computed(() => system.libraries.find((l) => l.id === selected.value) ?? system.libraries[0])
const active = computed(() => bo.activeCase(lib.value.id))
const visits = computed(() => branch.activeVisits(lib.value.id))

const stoppedDevices = computed(() => {
  if (!active.value) return []
  return active.value.devices.filter((d) => ['water', 'printer', 'selfkiosk'].includes(d.type))
})

// 读者一键求助
const helpZone = ref('一层阅览区')
const helpText = ref('')
const sent = ref(false)
function sendHelp() {
  if (!active.value || !helpText.value.trim()) return
  bo.addHelp(active.value.id, {
    readerName: '读者端一键求助',
    zone: helpZone.value,
    desc: helpText.value.trim(),
    at: now.value
  })
  sent.value = true
  helpText.value = ''
  toast.ok('求助已发送，安保正在赶来，请原地等待')
  setTimeout(() => (sent.value = false), 4000)
}
</script>

<template>
  <div>
    <!-- 停电应急通告 -->
    <div v-if="active" class="reader-screen">
      <div style="max-width:920px;margin:0 auto">
        <div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap">
          <button
            v-for="l in system.libraries" :key="l.id"
            class="emg-btn sm" :style="l.id === lib.id ? 'background:#ffb703;color:#332500;border-color:#ffb703;font-weight:700' : ''"
            @click="selected = l.id"
          >{{ l.name.replace('城市书房', '') }}</button>
        </div>

        <div class="reader-card emergency-siren" style="text-align:center;border:none">
          <div style="font-size:52px">⚡</div>
          <h1 style="font-size:30px;letter-spacing:2px">突发停电 · 请保持冷静</h1>
          <div class="mt8" style="font-size:15px;color:#ffe7ea">
            {{ lib.name }} 已停电 {{ fmtDuration(active.startedAt, now) }}，应急照明与绿色疏散指示灯已点亮，工作人员正在引导疏散。
          </div>
        </div>

        <div class="reader-card">
          <h3 style="color:#ffd166;font-size:18px">🧭 请按地面/墙面绿色指示灯沿以下路线撤离</h3>
          <div class="mt12">
            <div v-for="(r, i) in lib.evacuationRoutes" :key="i" class="route-step">
              <span class="n">{{ i + 1 }}</span>
              <div style="font-size:14.5px;line-height:1.8">{{ r }}</div>
            </div>
          </div>
          <div style="background:rgba(42,157,143,.15);border:1px solid #2a9d8f;border-radius:10px;padding:12px 14px;margin-top:8px">
            <b style="color:#9fe6da">📍 集合点：{{ lib.assemblyPoint }}</b>
          </div>
          <div class="mt12" style="color:#ffd166;line-height:1.9;font-size:14px">
            ⚠️ 停电期间电动门禁/扫码出门可能失效，<b>不要只依赖扫码出门</b>，也不要拥挤推门；
            工作人员已启用机械钥匙/临时开门通道（只出不进、专人值守），请听从指挥有序撤离；<b>请勿乘坐电梯</b>。
          </div>
        </div>

        <div class="grid grid-2" style="gap:16px">
          <div class="reader-card" style="margin-bottom:0">
            <h3 style="color:#ffb3bc;font-size:17px">🚱 停止服务的设备</h3>
            <ul style="padding-left:20px;list-style:disc;line-height:2;font-size:14px" class="mt8">
              <li v-for="d in stoppedDevices" :key="d.deviceId">
                {{ d.name }}（{{ d.location }}）：{{ d.during === 'offline' ? '已离线暂停' : '已停止服务' }}
              </li>
              <li>借还书业务请到人工服务台登记，来电后统一补录，<b style="color:#9fe6da">不会产生逾期或借阅失败</b></li>
            </ul>
            <div v-if="active.earlyClosed" class="mt12" style="color:#ffd166">
              🏁 接通知书房已提前闭馆，已预约活动将改约/顺延，请注意短信通知。
            </div>
          </div>

          <div class="reader-card" style="margin-bottom:0">
            <h3 style="color:#9fe6da;font-size:17px">🆘 需要帮助？一键呼叫工作人员</h3>
            <div class="mt8">
              <select class="emg-input" v-model="helpZone">
                <option>一层阅览区</option><option>亲子阅览区</option><option>卫生间通道</option>
                <option>书库</option><option>二层阅览区</option><option>消防通道</option><option>电梯内</option>
              </select>
              <textarea class="emg-input mt8" rows="3" v-model="helpText" placeholder="说明您的情况与位置，如：行动不便需要协助、与孩子走散、被困电梯…"></textarea>
              <button class="emg-btn danger" style="width:100%;justify-content:center;margin-top:8px" @click="sendHelp">🆘 一键求助（工作人员即刻到场）</button>
              <div v-if="sent" class="good-text small mt8">✔ 求助已发送，安保已收到您的位置，请原地等待。</div>
            </div>
          </div>
        </div>

        <div class="reader-card" style="text-align:center;color:#9fb3cc;font-size:13px">
          当前在馆约 <b style="color:#fff">{{ visits.length }}</b> 人，工作人员正在逐区清点，请撤离后在集合点等候清点，不要擅自离开集结区。
          <div class="mt8">紧急情况请拨打 119 / 110；书房联系电话见门口公示牌。</div>
        </div>
      </div>
    </div>

    <!-- 正常状态读者屏 -->
    <div v-else class="reader-screen" style="display:flex;align-items:center;justify-content:center">
      <div class="reader-card" style="text-align:center;max-width:560px">
        <div style="font-size:48px">📖</div>
        <h1 style="font-size:24px">{{ lib.name }}</h1>
        <p class="mt8" style="color:#c5d4e6">当前供电正常，自助借还机、打印机、饮水机等服务正常开放。</p>
        <p class="small" style="color:#8ea3bb">本屏幕在突发停电时将自动切换为应急疏散通告：疏散路线、集合点、停止服务与一键求助。</p>
        <div class="row" style="justify-content:center;margin-top:14px;gap:8px;flex-wrap:wrap">
          <button
            v-for="l in system.libraries" :key="l.id"
            class="emg-btn sm" @click="selected = l.id"
          >{{ l.name.replace('城市书房', '') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
