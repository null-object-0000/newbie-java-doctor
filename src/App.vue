<script setup lang="ts">
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import { themeOverrides } from '@/theme'
import AppLayout from '@/components/AppLayout.vue'

hljs.registerLanguage('json', json)
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides" :hljs="hljs">
    <NDialogProvider>
      <NMessageProvider>
        <AppLayout />
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --bg-page: #f1f5f9;
  --bg-header: #ffffff;
  --bg-footer: #f8fafc;
  --bg-card: #ffffff;
  --bg-hover: #f1f5f9;
  --bg-active: #e2e8f0;
  --bg-subtle: #f8fafc;

  --border: #e2e8f0;
  --border-input: #cbd5e1;
  --border-focus: #a5b4fc;

  --text-primary: #0f172a;
  --text-secondary: #334155;
  --text-muted: #64748b;
  --text-faint: #94a3b8;

  --accent: #4f46e5;
  --accent-hover: #4338ca;
  --accent-dim: #6366f1;
  --accent-light: #e0e7ff;
  --accent-surface: #eef2ff;

  --danger: #ef4444;
  --danger-surface: #fef2f2;

  --shadow-xs: 0 1px 2px rgb(0 0 0 / 0.04);
  --shadow-sm: 0 1px 3px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04);
  --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05);
  --shadow-md: 0 8px 16px -4px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04);
  --shadow-lg: 0 16px 32px -8px rgb(0 0 0 / 0.1), 0 8px 16px -8px rgb(0 0 0 / 0.06);
  --shadow-panel: 0 1px 3px rgb(0 0 0 / 0.04), 0 0 0 1px rgb(0 0 0 / 0.02);

  --radius-sm: 0.375rem;
  --radius: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
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
  line-height: 1.6;
  background: var(--bg-page);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app {
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

#app > * {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

* {
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}

*::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 9px;
}

*::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

*::-webkit-scrollbar-corner {
  background: transparent;
}
</style>
