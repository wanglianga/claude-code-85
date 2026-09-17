<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { roleNames } from '@/stores/auth'
import { seedAccounts } from '@/data/seed'

const router = useRouter()
const auth = useAuthStore()
const toast = useToast()
const username = ref('admin')
const password = ref('admin123')
const error = ref('')

function doLogin() {
  const acc = auth.login(username.value, password.value)
  if (acc) {
    toast.ok(`欢迎，${acc.name}（${roleNames[acc.role]}）`)
    router.push('/dashboard')
  } else {
    error.value = '用户名或密码错误'
  }
}

function quick(u: string, p: string) {
  username.value = u
  password.value = p
  doLogin()
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-hero">
        <div style="font-size:34px">📖🌙</div>
        <h1>城市书房<br />自助借阅与夜间闭馆巡检平台</h1>
        <ul class="feat">
          <li>🎫 身份证 / 借书证 / 预约码入馆，座位与借还打印饮水全记录</li>
          <li>🌙 闭馆倒计时、逐项巡检与人员/图书/设备/公共安全四方交接</li>
          <li>🚨 滞留、消磁失败、还书箱满、门禁异常等事件多角色协同处置</li>
          <li>📹 无人时段门禁、摄像头、消防、异常声音、求助一体化技防</li>
          <li>🏙️ 多书房、志愿者巡馆、馆藏调拨、信用、亲子活动与停电预案</li>
          <li>⚡ 突发停电应急联动：影响范围、门禁机械钥匙/临时开门、紧急升级、借还暂存补录、夜间恢复确认、来电自检与复盘</li>
          <li>🏙️ 街道值班台：停电小区、影响书房、在馆人数与处置进展一屏掌握</li>
        </ul>
      </div>
      <div class="login-form">
        <h2 style="font-size:18px">登录工作台</h2>
        <p class="muted small" style="margin:4px 0 16px">同一事件，管理员、安保、设备维护、读者服务围绕一条记录协同。</p>
        <form @submit.prevent="doLogin">
          <label class="field">用户名
            <input class="input" v-model="username" placeholder="如 admin" autocomplete="username" />
          </label>
          <label class="field">密码
            <input class="input" v-model="password" type="password" placeholder="请输入密码" autocomplete="current-password" />
          </label>
          <div v-if="error" class="small bad-text mb12">{{ error }}</div>
          <button class="btn" style="width:100%; justify-content:center" type="submit">登 录</button>
        </form>
        <div class="mt16">
          <div class="small muted mb8">演示账号（点击一键登录）：</div>
          <div
            v-for="a in seedAccounts"
            :key="a.username"
            class="quick-account"
            @click="quick(a.username, a.password)"
          >
            <span class="qa-name">{{ a.name }}</span>
            <span class="tag">{{ roleNames[a.role] }}</span>
            <span class="qa-cred">{{ a.username }} / {{ a.password }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
