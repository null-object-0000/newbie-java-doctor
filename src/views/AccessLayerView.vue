<script setup lang="ts">
import { useTopologyStore } from '@/stores/topology'
import { storeToRefs } from 'pinia'

defineProps<{
  section: 'params' | 'config'
}>()

const store = useTopologyStore()
const { accessParams } = storeToRefs(store)
</script>

<template>
  <div class="layer-view">
    <template v-if="section === 'params'">
      <header class="page-header">
        <h2>接入网关层 (Access Layer)</h2>
        <p class="desc">流量的咽喉，管理连接的建立与分发。此环节由运维管控，<strong>暂不纳入调优与排障</strong>，仅用以完善链路。</p>
      </header>

      <div class="card">
        <h3 class="card-title">核心节点</h3>
        <ul class="node-list">
          <li v-for="(node, i) in accessParams.nodes" :key="i">{{ node }}</li>
        </ul>
        <p class="note">{{ accessParams.note }}</p>
      </div>
    </template>
    <div v-else class="section-empty">
      <p>本层无核心配置</p>
    </div>
  </div>
</template>

<style scoped>
.layer-view {
  max-width: 560px;
}

.page-header {
  margin-bottom: 1.5rem;
}

.page-header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
}

.desc {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
}

.node-list {
  margin: 0 0 1rem 0;
  padding-left: 1.5rem;
  color: var(--text-secondary);
}

.note {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0;
  padding: 0.75rem;
  background: var(--bg-page);
  border-radius: var(--radius);
}

.section-empty {
  padding: 1.5rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.section-empty p {
  margin: 0;
}
</style>
