import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/views/TopologyView.vue'),
      meta: { title: '全链路拓扑' },
    },
  ],
})

router.afterEach((to) => {
  const title = (to.meta?.title as string) || 'Java Doctor'
  document.title = `${title} - 全链路容量评估`
})

export default router
