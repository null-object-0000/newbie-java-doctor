<script setup lang="ts">
import { useTopologyStore } from '@/stores/topology'
import { storeToRefs } from 'pinia'
import type { BusinessScenario, NetworkEnv } from '@/types/layers'

defineProps<{
  section: 'params' | 'config'
}>()

const store = useTopologyStore()
const { clientParams } = storeToRefs(store)

const businessOptions: { value: BusinessScenario; label: string }[] = [
  { value: 'io', label: 'IO 密集型' },
  { value: 'compute', label: '计算密集型' },
]

const networkOptions: { value: NetworkEnv; label: string }[] = [
  { value: 'public', label: '公网' },
  { value: 'intra_dc', label: '内网（同中心）' },
  { value: 'cross_dc', label: '内网（跨中心）' },
]
</script>

<template>
  <div class="layer-view">
    <template v-if="section === 'params'">
      <header class="page-header">
        <h2>客户端层 (Client Layer)</h2>
        <p class="desc">流量的发令枪与性能 KPI 的定义者。以下为<strong>核心参数</strong>（需使用者提供）。</p>
      </header>

      <div class="card">
        <h3 class="card-title">核心参数</h3>
      <div class="form-grid">
        <div class="field">
          <label>业务场景</label>
          <select v-model="clientParams.businessScenario">
            <option v-for="opt in businessOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div class="field">
          <label>网络环境</label>
          <select v-model="clientParams.networkEnv">
            <option v-for="opt in networkOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div class="field">
          <label>报文大小 (bytes)</label>
          <input v-model.number="clientParams.messageSizeBytes" type="number" min="1" />
        </div>
        <div class="field">
          <label>并发用户数</label>
          <input v-model.number="clientParams.concurrentUsers" type="number" min="1" />
        </div>
        <div class="field">
          <label>目标吞吐量 (RPS)</label>
          <input v-model.number="clientParams.targetThroughputRps" type="number" min="1" />
        </div>
        <div class="field">
          <label>预期失败率 (%)</label>
          <input v-model.number="clientParams.expectedFailureRatePercent" type="number" min="0" max="100" />
          <span class="hint">默认 0%，不允许有失败请求</span>
        </div>
      </div>
      <div class="card-actions">
        <button type="button" class="btn btn-secondary" @click="store.resetClient">恢复默认</button>
      </div>
    </div>
    </template>
    <div v-else class="section-empty">
      <p>本层无核心配置</p>
    </div>
  </div>
</template>

<style scoped>
.layer-view {
  max-width: 720px;
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
  box-shadow: var(--shadow-sm);
  padding: 1.5rem;
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field label {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 500;
}

.field input,
.field select {
  padding: 0.5rem 0.75rem;
  background: var(--bg-page);
  border: 1px solid var(--border-input);
  border-radius: var(--radius);
  color: var(--text-primary);
  font-size: 0.875rem;
}

.field input:focus,
.field select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}

.hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.card-actions {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  font-size: 0.875rem;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn:hover {
  background: var(--border);
}

.btn-secondary {
  color: var(--text-secondary);
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
