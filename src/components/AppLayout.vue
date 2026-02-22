<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="app-layout">
    <header class="header">
      <div class="header-inner">
        <div class="logo">
          <div class="logo-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
          </div>
          <span class="logo-title">Java Doctor</span>
          <span class="logo-divider" />
          <span class="logo-subtitle">全链路容量评估</span>
        </div>
      </div>
    </header>

    <main class="main">
      <RouterView />
    </main>

    <footer class="footer">
      <span class="footer-text">Java Doctor &copy; 2026</span>
    </footer>
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
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-xs);
  z-index: 20;
}

.header-inner {
  width: 100%;
  padding: 0 1.25rem;
  height: 3.25rem;
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.logo-icon {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: #fff;
  border-radius: var(--radius);
  flex-shrink: 0;
}

.logo-title {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.logo-divider {
  width: 1px;
  height: 1rem;
  background: var(--border);
}

.logo-subtitle {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted);
}

.main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
}

.main > * {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.footer {
  flex-shrink: 0;
  padding: 0.5rem 1.25rem;
  border-top: 1px solid var(--border);
  background: var(--bg-header);
}

.footer-text {
  font-size: 0.6875rem;
  color: var(--text-faint);
  letter-spacing: 0.02em;
}
</style>
