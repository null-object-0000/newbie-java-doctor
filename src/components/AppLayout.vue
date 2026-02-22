<script setup lang="ts">
import { RouterView } from 'vue-router'

const GITHUB_REPO_URL = 'https://github.com/null-object-0000/newbie-java-doctor'
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
        <a
          :href="GITHUB_REPO_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="github-link"
          title="在 GitHub 上查看开源项目"
        >
          <svg class="github-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          <span class="github-label">开源项目</span>
        </a>
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
  justify-content: space-between;
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

.github-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-card);
  transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast);
}

.github-link:hover {
  color: var(--accent);
  background: var(--accent-surface);
  border-color: var(--accent-light);
}

.github-icon {
  flex-shrink: 0;
}

.github-label {
  letter-spacing: 0.01em;
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
