<script setup lang="ts">
import { RouterView } from 'vue-router'
import { NLayoutHeader, NLayoutFooter } from 'naive-ui'
</script>

<template>
  <div class="app-layout">
    <NLayoutHeader bordered class="header">
      <div class="header-inner">
        <div class="logo">
          <div class="logo-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
          </div>
          <div class="logo-text">
            <h1 class="logo-title">Java Doctor</h1>
            <span class="logo-subtitle">全链路容量评估与性能导航</span>
          </div>
        </div>
      </div>
    </NLayoutHeader>

    <main class="main">
      <RouterView />
    </main>

    <NLayoutFooter bordered class="footer">
      <div class="footer-inner">
        Java Doctor © 2026 · 全链路容量评估与性能导航
      </div>
    </NLayoutFooter>
  </div>
</template>

<style scoped>
.app-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-page);
  color: var(--text-primary);
}

.header {
  flex-shrink: 0;
  background: var(--bg-header);
}

.header-inner {
  width: 100%;
  padding: 0 0.5rem;
  height: 4rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo-icon {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: #fff;
  border-radius: 0.5rem;
}

.logo-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.2;
}

.logo-subtitle {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0.75rem 0.5rem;
  display: flex;
  flex-direction: column;
}

/* RouterView 渲染的视图根节点撑满 main */
.main > * {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.footer {
  flex-shrink: 0;
  background: var(--bg-footer);
  padding: 1rem;
}

.footer-inner {
  width: 100%;
  padding: 0 0.5rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--text-muted);
}
</style>
