<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSystemStore } from '@/stores/system'
import { useBlackoutStore } from '@/stores/blackout'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { fmtDateTime } from '@/utils/format'
import BlackoutPanel from '@/components/BlackoutPanel.vue'

const system = useSystemStore()
const blackout = useBlackoutStore()
const auth = useAuthStore()
const toast = useToast()
const { now } = storeToRefs(system)

const lib = computed(() => system.currentLibrary)
const activeEvent = computed(() => blackout.activeOf(lib.value.id))
const historyId = ref<string | null>(null)
const shownEvent = computed(() => activeEvent.value ?? (historyId.value ? blackout.byId(historyId.value) : undefined))
const history = computed(() => blackout.byLibrary(lib.value.id))
const readOnly = computed(() => auth.account?.role === 'volunteer' || auth.account?.role === 'street')

function triggerBlackout(gateFails: boolean) {
  blackout.trigger(lib.value.id, now.value, { gateFails })
  historyId.value = null
  toast.bad(`⚡ 已触发突发停电（门禁${gateFails ? '失效' : 'UPS 维持'}），应急视图已启动`)
}
</script>

<template>
  <div>
    <!-- 处置面板（进行中或回看历史） -->
    <BlackoutPanel v-if="shownEvent" :key="shownEvent.id" :event="shownEvent"
                   :show-back="!activeEvent && !!historyId" @back="historyId = null" />

    <!-- 无进行中事件：演练触发 + 历史复盘 -->
    <template v-else>
      <div class="card">
        <div class="card-hd"><h3>⚡ 突发停电与门禁消防应急联动</h3><span class="sub">当前书房供电正常，可启动应急演练</span></div>
        <div class="card-bd">
          <p class="small muted" style="line-height:1.9;max-width:860px">
            触发后页面立即切换<b>应急视图</b>：自动快照全部设备状态并切换市电/UPS 设备，生成紧急停电事件；
            先展示受影响范围（门禁、应急照明/疏散指示、自助借还机/打印机、消防主机/烟感、摄像头/异常声音、空调/新风）与分区在馆人数；
            门禁失效自动通知安保到场，引导启用机械钥匙/临时开门，读者端显示疏散路线与集合点；
            有人被困/消防通道被占/烟感离线/应急灯不亮即转紧急事件并同步街道值班与消防联系人，<b>巡检不允许完成</b>。
          </p>
          <div class="row mt12" v-if="!readOnly">
            <button class="btn danger" @click="triggerBlackout(true)">⚡ 模拟突发停电（门禁失效）</button>
            <button class="btn amber" @click="triggerBlackout(false)">⚡ 模拟停电（UPS 维持门禁）</button>
          </div>
          <div class="small muted mt12">
            建议配合总览「🎬 场景演示控制」先「跳到闭馆前 30 分钟」或「进入夜间无人时段」，再触发夜间停电，体验夜间恢复逐项确认。
          </div>
        </div>
      </div>

      <div class="card" v-if="history.length">
        <div class="card-hd"><h3>📋 历史停电处置与复盘（{{ history.length }}）</h3></div>
        <div class="card-bd flush">
          <table class="tbl">
            <thead><tr><th>处置单</th><th>停电小区</th><th>开始/时长</th><th>紧急事件</th><th>借还补录</th><th>状态</th><th class="right">操作</th></tr></thead>
            <tbody>
              <tr v-for="e in history" :key="e.id">
                <td class="small">{{ e.no }}</td>
                <td class="small">{{ e.community }}</td>
                <td class="small nowrap">{{ fmtDateTime(e.startedAt) }}<div class="muted">{{ e.review?.durationMin != null ? e.review.durationMin + ' 分钟' : '—' }}</div></td>
                <td class="small">{{ e.escalations.length }} 起（未解除 {{ e.escalations.filter(x => !x.resolved).length }}）</td>
                <td class="small">{{ e.pendingLoans.filter(l => l.status === 'backfilled').length }}/{{ e.pendingLoans.length }} 已补录</td>
                <td><span class="tag" :class="e.phase === 'closed' ? 'st-ok' : 'sev-urgent'">{{ e.phase === 'closed' ? '已复盘闭环' : '处置中' }}</span></td>
                <td class="right"><button class="mini-btn" @click="historyId = e.id">{{ e.phase === 'closed' ? '查看复盘' : '继续处置' }}</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
