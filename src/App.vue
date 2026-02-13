<script setup lang="ts">
import { NConfigProvider } from 'naive-ui'
import { themeOverrides } from '@/theme'
import AppLayout from '@/components/AppLayout.vue'
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <AppLayout />
  </NConfigProvider>
</template>

<style>
/* Inter 字体 + Slate/Indigo 配色 CSS 变量（供组件级 scoped 样式和 X6 HTML 节点使用） */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --bg-page: #f8fafc;
  --bg-header: #ffffff;
  --bg-footer: #f8fafc;
  --bg-card: #ffffff;
  --bg-hover: #f1f5f9;
  --bg-active: #e2e8f0;
  --border: #e2e8f0;
  --border-input: #cbd5e1;
  --text-primary: #0f172a;
  --text-secondary: #334155;
  --text-muted: #64748b;
  --accent: #4f46e5;
  --accent-hover: #4338ca;
  --accent-dim: #6366f1;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --radius: 0.5rem;
  --radius-lg: 0.75rem;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.875rem;
  line-height: 1.5;
  background: var(--bg-page);
  color: var(--text-primary);
}

#app {
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* NConfigProvider 根节点撑满，否则内部 height: 100% 无效 */
#app > * {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
