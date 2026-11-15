import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

import LoginView from '@/views/Login/LoginPage.vue'
import OtpVerificationView from '@/views/OtpVerification/OtpVerificationPage.vue'
import TodoView from '@/views/Todo/TodoPage.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: TodoView,
      meta: { showMenu: true, requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { showMenu: false },
    },
    {
      path: '/verify-otp',
      name: 'verify-otp',
      component: OtpVerificationView,
      meta: { showMenu: false },
    },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  await authStore.waitForAuthReady()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) return { name: 'login' }
  const isAuthPage = to.name === 'login' || to.name === 'verify-otp'
  if (isAuthPage && authStore.isAuthenticated) return { name: 'home' }
  // The OTP step only exists after a correct password (kept in memory).
  if (to.name === 'verify-otp' && !authStore.pendingLogin) return { name: 'login' }
})

export default router
