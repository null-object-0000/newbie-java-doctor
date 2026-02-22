<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import type { Node } from '@antv/x6'
import { getLayerTheme, getLayerIcon } from '@/registry/layers'
import type { TopologyNode } from '@/types/layers'
import type { DisplayField, NodeStatusInfo } from './constants'

interface NodeData {
  raw?: TopologyNode
  displayFields?: DisplayField[]
  selected?: boolean
  nodeStatus?: NodeStatusInfo | null
}

const getNode = inject<() => Node>('getNode')!
const node = getNode()
const data = ref<NodeData>(node.getData() ?? {})

function onDataChange({ current }: { current: NodeData }) {
  data.value = current ?? {}
}

onMounted(() => {
  node.on('change:data', onDataChange)
})

onUnmounted(() => {
  node.off('change:data', onDataChange)
})

const raw = computed(() => data.value.raw)
const theme = computed(() => (raw.value ? getLayerTheme(raw.value.layerId) : 'blue'))
const icon = computed(() => (raw.value ? getLayerIcon(raw.value.layerId) : '•'))
const displayFields = computed(() => data.value.displayFields ?? [])
const isSelected = computed(() => data.value.selected ?? false)
const isUser = computed(() => raw.value?.nodeSource === 'user')
const followsClient = computed(
  () => raw.value?.dependencyRole === 'server' && !!raw.value?.dependencyGroupId,
)
const canRemove = computed(() => isUser.value && !followsClient.value)
const nodeStatus = computed(() => data.value.nodeStatus ?? null)
</script>

<template>
  <div
    :class="[
      'topology-card',
      `topology-card-${theme}`,
      {
        user: isUser,
        'topology-card-selected': isSelected,
        'topology-card-follows-client': followsClient,
        'topology-card-status-ok': nodeStatus?.status === 'ok',
        'topology-card-status-warning': nodeStatus?.status === 'warning',
        'topology-card-status-error': nodeStatus?.status === 'error',
      },
    ]"
    @dragstart.prevent
  >
    <div class="topology-card-header">
      <div class="topology-card-icon">{{ icon }}</div>
      <div class="topology-card-title">{{ raw?.label }}</div>
      <div class="topology-card-actions">
        <span
          v-if="canRemove"
          class="op op-danger"
          title="删除节点 (Delete)"
          data-action="remove"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </span>
      </div>
      <span
        v-if="nodeStatus"
        class="topology-card-status-dot"
        :class="`status-${nodeStatus.status}`"
        :title="nodeStatus.summary"
      />
    </div>
    <div v-if="displayFields.length > 0" class="topology-card-body">
      <div v-for="(field, idx) in displayFields" :key="idx" class="topology-card-field">
        {{ field.label }}: {{ field.displayText }}
      </div>
    </div>
    <div v-if="nodeStatus" class="topology-card-status-bar" :class="`status-bar-${nodeStatus.status}`">
      {{ nodeStatus.summary }}
    </div>
  </div>
</template>

<style>
.topology-card {
  display: flex;
  flex-direction: column;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  box-sizing: border-box;
  padding: 10px 12px 12px;
  width: 100%;
  height: 100%;
  background: #fff;
  gap: 6px;
  cursor: pointer;
  transition: border-color 200ms ease, box-shadow 200ms ease;
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.topology-card:hover {
  border-color: #a5b4fc;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.1);
}

.topology-card-selected {
  border-color: #4f46e5 !important;
  box-shadow:
    0 0 0 2.5px rgba(79, 70, 229, 0.15),
    0 2px 8px rgba(79, 70, 229, 0.1) !important;
}

.topology-card.user {
  border-color: #c7d2fe;
}

.topology-card-follows-client {
  cursor: default;
}

.topology-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.topology-card-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  letter-spacing: -0.02em;
}

.topology-card-blue .topology-card-icon {
  background: #eef2ff;
  color: #4338ca;
}

.topology-card-gray .topology-card-icon {
  background: #f1f5f9;
  color: #475569;
}

.topology-card-green .topology-card-icon {
  background: #ecfdf5;
  color: #059669;
}

.topology-card-orange .topology-card-icon {
  background: #fff7ed;
  color: #ea580c;
}

.topology-card-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.01em;
}

.topology-card-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 150ms ease;
}

.topology-card:hover .topology-card-actions {
  opacity: 1;
}

.topology-card-actions .op {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  cursor: pointer;
  border-radius: 5px;
  color: #64748b;
  transition: background 150ms ease, color 150ms ease;
}

.topology-card-actions .op:hover {
  background: #f1f5f9;
  color: #4f46e5;
}

.topology-card-actions .op-danger:hover {
  background: #fef2f2;
  color: #ef4444;
}

.topology-card-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 6px;
  border-top: 1px solid #f1f5f9;
}

.topology-card-field {
  font-size: 10.5px;
  line-height: 1.4;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* --- Status indicator --- */

.topology-card-status-ok {
  border-left: 3px solid #22c55e;
}

.topology-card-status-warning {
  border-left: 3px solid #eab308;
}

.topology-card-status-error {
  border-left: 3px solid #ef4444;
}

.topology-card-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-left: 4px;
}

.topology-card-status-dot.status-ok {
  background: #22c55e;
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
}

.topology-card-status-dot.status-warning {
  background: #eab308;
  box-shadow: 0 0 4px rgba(234, 179, 8, 0.4);
}

.topology-card-status-dot.status-error {
  background: #ef4444;
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.4);
}

.topology-card-status-bar {
  font-size: 9.5px;
  line-height: 1.3;
  padding: 3px 6px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: auto;
}

.status-bar-ok {
  background: #f0fdf4;
  color: #15803d;
}

.status-bar-warning {
  background: #fefce8;
  color: #a16207;
}

.status-bar-error {
  background: #fef2f2;
  color: #dc2626;
}
</style>
