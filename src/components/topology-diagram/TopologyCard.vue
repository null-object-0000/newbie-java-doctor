<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import type { Node } from '@antv/x6'
import { getLayerTheme, getLayerIcon } from '@/registry/layers'
import type { TopologyNode } from '@/types/layers'
import type { DisplayField } from './constants'

interface NodeData {
  raw?: TopologyNode
  displayFields?: DisplayField[]
  selected?: boolean
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
    </div>
    <div v-if="displayFields.length > 0" class="topology-card-body">
      <div v-for="(field, idx) in displayFields" :key="idx" class="topology-card-field">
        {{ field.label }}: {{ field.displayText }}
      </div>
    </div>
  </div>
</template>

<style>
/* Global styles — x6-vue-shape mounts cards inside X6's container */
.topology-card {
  display: flex;
  flex-direction: column;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  box-sizing: border-box;
  padding: 12px 12px 14px;
  width: 100%;
  height: 100%;
  background: #fff;
  gap: 8px;
  cursor: pointer;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
  overflow: hidden;
}

.topology-card:hover {
  border-color: var(--accent, #4f46e5);
  box-shadow: 0 2px 12px rgba(79, 70, 229, 0.12);
}

.topology-card-selected {
  border-color: var(--accent, #4f46e5) !important;
  box-shadow:
    0 0 0 3px rgba(79, 70, 229, 0.18),
    0 2px 12px rgba(79, 70, 229, 0.12) !important;
}

.topology-card.user {
  border-color: var(--accent-dim, #6366f1);
}

.topology-card-follows-client {
  cursor: default;
}

.topology-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topology-card-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.topology-card-blue .topology-card-icon {
  background: #f0f5ff;
  color: #1d39c4;
}

.topology-card-gray .topology-card-icon {
  background: #f5f5f5;
  color: #595959;
}

.topology-card-green .topology-card-icon {
  background: #e6fffb;
  color: #08979c;
}

.topology-card-orange .topology-card-icon {
  background: #fff7e6;
  color: #fa8c16;
}

.topology-card-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topology-card-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.topology-card:hover .topology-card-actions {
  opacity: 1;
}

.topology-card-actions .op {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--text-muted, #64748b);
  transition:
    background 0.15s,
    color 0.15s;
}

.topology-card-actions .op:hover {
  background: var(--bg-hover, #f1f5f9);
  color: var(--accent, #4f46e5);
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
  padding-bottom: 2px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.topology-card-field {
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-muted, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
