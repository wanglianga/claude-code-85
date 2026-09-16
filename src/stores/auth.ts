import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Account, Role } from '@/types'
import { seedAccounts } from '@/data/seed'

export const roleNames: Record<Role, string> = {
  admin: '管理员',
  security: '安保',
  maintainer: '设备维护',
  service: '读者服务',
  volunteer: '志愿者'
}

export const useAuthStore = defineStore('auth', () => {
  const account = ref<Account | null>(null)

  function login(username: string, password: string): Account | null {
    const found = seedAccounts.find(
      (a) => a.username === username.trim() && a.password === password
    )
    if (found) {
      account.value = found
      return found
    }
    return null
  }

  function logout() {
    account.value = null
  }

  return { account, login, logout }
})
