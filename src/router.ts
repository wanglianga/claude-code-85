import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    // 读者端应急视图（免登录，可在读者手机/大屏打开）
    { path: '/reader/emergency', name: 'reader-emergency', component: () => import('@/views/ReaderView.vue'), meta: { public: true, title: '读者应急端' } },
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '运行总览' } },
    { path: '/service', name: 'service', component: () => import('@/views/ServiceView.vue'), meta: { title: '读者服务台' } },
    { path: '/emergency', name: 'emergency', component: () => import('@/views/EmergencyView.vue'), meta: { title: '停电应急联动指挥' } },
    { path: '/street', name: 'street', component: () => import('@/views/StreetView.vue'), meta: { title: '街道值班应急联动台' } },
    { path: '/incidents', name: 'incidents', component: () => import('@/views/IncidentsView.vue'), meta: { title: '事件协同中心' } },
    { path: '/inspection', name: 'inspection', component: () => import('@/views/InspectionView.vue'), meta: { title: '夜间闭馆巡检' } },
    { path: '/devices', name: 'devices', component: () => import('@/views/DevicesView.vue'), meta: { title: '设备与技防' } },
    { path: '/books', name: 'books', component: () => import('@/views/BooksView.vue'), meta: { title: '馆藏与调拨' } },
    { path: '/readers', name: 'readers', component: () => import('@/views/ReadersView.vue'), meta: { title: '读者信用' } },
    { path: '/activities', name: 'activities', component: () => import('@/views/ActivitiesView.vue'), meta: { title: '亲子阅读活动' } },
    { path: '/volunteer', name: 'volunteer', component: () => import('@/views/VolunteerView.vue'), meta: { title: '志愿者巡馆', roles: ['volunteer', 'admin'] } }
  ]
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.account) return { name: 'login' }
  if (to.name === 'login' && auth.account) {
    return auth.account.role === 'street' ? { name: 'street' } : { name: 'dashboard' }
  }
  return true
})

export default router
