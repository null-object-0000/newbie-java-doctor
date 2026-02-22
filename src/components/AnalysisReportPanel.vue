<script setup lang="ts">
import { computed } from 'vue'
import { NText, NTag, NCollapse, NCollapseItem, NAlert } from 'naive-ui'
import { useAnalysisStore } from '@/stores/analysis'
import { storeToRefs } from 'pinia'
import { formatNumber } from '@/engine/helpers'
import type { DiagnosticWarning, Recommendation, NodeRecommendation } from '@/engine/types'

defineEmits<{ close: [] }>()

const analysisStore = useAnalysisStore()
const { analysisResult, isStale } = storeToRefs(analysisStore)

const result = computed(() => analysisResult.value)

const formattedTime = computed(() => {
  if (!result.value) return ''
  return new Date(result.value.timestamp).toLocaleTimeString()
})

const isReachable = computed(() => {
  if (!result.value) return false
  return result.value.overallCeiling >= result.value.targetThroughput
})

const errorWarnings = computed(() =>
  result.value?.warnings.filter((w) => w.level === 'error') ?? [],
)
const warnWarnings = computed(() =>
  result.value?.warnings.filter((w) => w.level === 'warning') ?? [],
)
const infoWarnings = computed(() =>
  result.value?.warnings.filter((w) => w.level === 'info') ?? [],
)

function priorityType(p: Recommendation['priority']): 'error' | 'warning' | 'info' {
  if (p === 'critical') return 'error'
  if (p === 'important') return 'warning'
  return 'info'
}

function priorityLabel(p: Recommendation['priority']): string {
  if (p === 'critical') return '关键'
  if (p === 'important') return '重要'
  return '可选'
}

function warningAlertType(w: DiagnosticWarning): 'error' | 'warning' | 'info' {
  return w.level
}

function groupLabel(rec: NodeRecommendation): string {
  return rec.nodeLabel
}
</script>

<template>
  <div v-if="result" class="analysis-report-panel">
    <header class="panel-header">
      <NText strong class="panel-title">诊断报告</NText>
      <div class="panel-header-actions">
        <span class="report-time">{{ formattedTime }}</span>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
    </header>

    <div class="panel-body">
      <!-- Stale 提示 -->
      <div v-if="isStale" class="stale-banner">
        数据已变更，分析结果可能已过期
      </div>

      <!-- 概览 -->
      <section class="report-section summary-section">
        <div class="summary-grid">
          <div class="summary-card">
            <span class="summary-label">目标 QPS</span>
            <span class="summary-value">{{ formatNumber(result.targetThroughput) }}</span>
          </div>
          <div class="summary-card">
            <span class="summary-label">全链路天花板</span>
            <span class="summary-value" :class="{ 'text-error': !isReachable }">
              {{ result.overallCeiling > 0 ? formatNumber(result.overallCeiling) : '—' }}
            </span>
          </div>
          <div class="summary-card summary-card-wide">
            <span class="summary-label">综合评估</span>
            <NTag :type="isReachable ? 'success' : 'error'" size="small" round>
              {{ isReachable ? '目标可达' : '存在瓶颈' }}
            </NTag>
          </div>
        </div>
      </section>

      <!-- 瓶颈分析 -->
      <section v-if="result.bottlenecks.length > 0" class="report-section">
        <h3 class="section-title">
          <span class="section-icon error-icon">!</span>
          瓶颈分析
        </h3>
        <div v-for="b in result.bottlenecks" :key="b.nodeId + b.dimension" class="bottleneck-item">
          <div class="bottleneck-header">
            <NTag type="error" size="small">{{ b.nodeLabel }}</NTag>
            <span class="bottleneck-dim">{{ b.dimensionLabel }}</span>
          </div>
          <div class="bottleneck-detail">
            <span class="bottleneck-metric">
              天花板 <strong>{{ formatNumber(b.currentCeiling) }}</strong>
              &lt; 目标 <strong>{{ formatNumber(b.targetThroughput) }}</strong>
            </span>
            <NTag type="error" size="tiny" round>{{ b.gapPercent }}%</NTag>
          </div>
        </div>
      </section>

      <!-- 诊断告警 -->
      <section
        v-if="errorWarnings.length > 0 || warnWarnings.length > 0 || infoWarnings.length > 0"
        class="report-section"
      >
        <h3 class="section-title">
          <span class="section-icon warn-icon">⚠</span>
          诊断告警
        </h3>
        <div class="warning-list">
          <NAlert
            v-for="(w, i) in [...errorWarnings, ...warnWarnings, ...infoWarnings]"
            :key="i"
            :type="warningAlertType(w)"
            :title="w.code"
            class="warning-alert"
            :show-icon="true"
          >
            <div class="warning-content">
              <p class="warning-message">{{ w.message }}</p>
              <p v-if="w.suggestion" class="warning-suggestion">
                <NText depth="3">建议：{{ w.suggestion }}</NText>
              </p>
              <NTag v-if="w.nodeLabel" size="tiny" round class="warning-node-tag">
                {{ w.nodeLabel }}
              </NTag>
            </div>
          </NAlert>
        </div>
      </section>

      <!-- 推荐配置 -->
      <section v-if="result.recommendations.length > 0" class="report-section">
        <h3 class="section-title">
          <span class="section-icon ok-icon">✓</span>
          推荐配置
        </h3>
        <NCollapse>
          <NCollapseItem
            v-for="group in result.recommendations"
            :key="group.nodeId"
            :title="groupLabel(group)"
            :name="group.nodeId"
          >
            <div class="recommendation-list">
              <div
                v-for="rec in group.items"
                :key="rec.key"
                class="recommendation-item"
              >
                <div class="rec-header">
                  <code class="rec-key">{{ rec.label }}</code>
                  <NTag :type="priorityType(rec.priority)" size="tiny" round>
                    {{ priorityLabel(rec.priority) }}
                  </NTag>
                </div>
                <div class="rec-values">
                  <span class="rec-current">{{ rec.currentValue }}</span>
                  <span class="rec-arrow">→</span>
                  <span class="rec-recommended">{{ rec.recommendedValue }}</span>
                </div>
                <p class="rec-reason">
                  <NText depth="3">{{ rec.reason }}</NText>
                </p>
              </div>
            </div>
          </NCollapseItem>
        </NCollapse>
      </section>

      <!-- 天花板详情 -->
      <section v-if="result.ceilings.length > 0" class="report-section">
        <h3 class="section-title">
          <span class="section-icon">⊤</span>
          天花板详情
        </h3>
        <NCollapse>
          <NCollapseItem
            v-for="ceiling in result.ceilings"
            :key="ceiling.nodeId"
            :name="ceiling.nodeId"
          >
            <template #header>
              <span class="ceiling-header-text">
                {{ (result.nodeStatuses.find(s => s.nodeId === ceiling.nodeId))?.summary ?? ceiling.nodeId }}
              </span>
            </template>
            <div class="ceiling-detail-list">
              <div
                v-for="d in ceiling.details"
                :key="d.dimension"
                class="ceiling-detail-item"
                :class="{ 'is-limiting': d.dimension === ceiling.limitingFactor }"
              >
                <div class="ceiling-detail-header">
                  <span class="ceiling-dim-label">{{ d.label }}</span>
                  <span class="ceiling-dim-value">{{ formatNumber(d.maxValue) }} RPS</span>
                </div>
                <p class="ceiling-formula">
                  <NText depth="3">{{ d.formula }}</NText>
                </p>
              </div>
            </div>
          </NCollapseItem>
        </NCollapse>
      </section>
    </div>
  </div>
</template>

<style scoped>
.analysis-report-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
}

.panel-title {
  font-size: 0.875rem;
}

.panel-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.report-time {
  font-size: 0.7rem;
  color: var(--text-faint);
}

.close-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 1rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.stale-banner {
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius-sm);
  background: #fefce8;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 0.75rem;
  text-align: center;
}

/* --- 概览 --- */
.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.summary-card {
  padding: 0.625rem 0.75rem;
  border-radius: var(--radius);
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.summary-card-wide {
  grid-column: 1 / -1;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.summary-label {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-weight: 500;
}

.summary-value {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
}

.text-error {
  color: var(--danger);
}

/* --- Section --- */
.report-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
  padding-top: 0.25rem;
  border-top: 1px solid var(--border);
}

.section-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 700;
  background: var(--bg-active);
  color: var(--text-muted);
  flex-shrink: 0;
}

.error-icon {
  background: #fef2f2;
  color: #dc2626;
}

.warn-icon {
  background: #fffbeb;
  color: #d97706;
}

.ok-icon {
  background: #f0fdf4;
  color: #16a34a;
}

/* --- 瓶颈 --- */
.bottleneck-item {
  padding: 0.5rem 0.625rem;
  border-radius: var(--radius-sm);
  background: #fef2f2;
  border: 1px solid #fecaca;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.bottleneck-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.bottleneck-dim {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.bottleneck-detail {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bottleneck-metric {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.bottleneck-metric strong {
  color: var(--text-primary);
}

/* --- 告警 --- */
.warning-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.warning-alert {
  font-size: 0.75rem;
}

.warning-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.warning-message {
  margin: 0;
  font-size: 0.75rem;
}

.warning-suggestion {
  margin: 0;
  font-size: 0.7rem;
}

.warning-node-tag {
  align-self: flex-start;
}

/* --- 推荐配置 --- */
.recommendation-list {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.recommendation-item {
  padding: 0.5rem 0.625rem;
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.rec-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.375rem;
}

.rec-key {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-active);
  padding: 0 0.25rem;
  border-radius: 3px;
}

.rec-values {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.rec-current {
  color: var(--text-muted);
  text-decoration: line-through;
  font-family: 'Courier New', monospace;
  word-break: break-all;
}

.rec-arrow {
  color: var(--accent);
  font-weight: 700;
}

.rec-recommended {
  color: var(--accent);
  font-weight: 600;
  font-family: 'Courier New', monospace;
  word-break: break-all;
}

.rec-reason {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.4;
}

/* --- 天花板详情 --- */
.ceiling-header-text {
  font-size: 0.8125rem;
}

.ceiling-detail-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ceiling-detail-item {
  padding: 0.375rem 0.5rem;
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  border: 1px solid var(--border);
}

.ceiling-detail-item.is-limiting {
  border-color: #fecaca;
  background: #fff5f5;
}

.ceiling-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ceiling-dim-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.ceiling-dim-value {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-primary);
}

.ceiling-formula {
  margin: 0.25rem 0 0;
  font-size: 0.675rem;
  line-height: 1.4;
}
</style>
