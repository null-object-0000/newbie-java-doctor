<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NText, NEmpty } from 'naive-ui'
import DynamicForm from '@/components/DynamicForm.vue'
import { getEdgeParamsSchema, getLayerLabel } from '@/registry/layers'
import { useTopologyStore } from '@/stores/topology'
import type { TopologyEdge } from '@/types/layers'

const props = defineProps<{
  edge: TopologyEdge
}>()

defineEmits<{
  close: []
}>()

const store = useTopologyStore()

/** 源节点与目标节点 */
const sourceNode = computed(() =>
  store.topology.nodes.find((n) => n.id === props.edge.source),
)
const targetNode = computed(() =>
  store.topology.nodes.find((n) => n.id === props.edge.target),
)

/** 连线参数 Schema（由源/目标层 ID 决定） */
const schema = computed(() => {
  if (!sourceNode.value || !targetNode.value) return undefined
  return getEdgeParamsSchema(sourceNode.value.layerId, targetNode.value.layerId)
})

/** 连线参数数据模型（直接引用 store.edgeParams[edgeId]） */
const model = computed(() => store.edgeParams[props.edge.id] ?? {})

/** 面板标题 */
const panelTitle = computed(() => {
  const srcLabel = sourceNode.value ? getLayerLabel(sourceNode.value.layerId) : '?'
  const tgtLabel = targetNode.value ? getLayerLabel(targetNode.value.layerId) : '?'
  return `${srcLabel} → ${tgtLabel}`
})

const showReset = computed(() => !!schema.value)

function onReset() {
  store.resetEdgeParams(props.edge.id)
}
</script>

<template>
  <div class="edge-editor-panel">
    <header class="panel-header">
      <NText strong class="panel-title">编辑连线：{{ panelTitle }}</NText>
      <NButton quaternary circle size="small" @click="$emit('close')">
        <template #icon>×</template>
      </NButton>
    </header>
    <div class="panel-body">
      <template v-if="schema">
        <DynamicForm
          :schema="schema"
          :model="model"
          :show-reset="showReset"
          :before-change="() => store.pushState?.()"
          @reset="onReset"
        />
      </template>
      <NEmpty v-else description="该连线无可编辑参数" class="section-empty" />
    </div>
  </div>
</template>

<style scoped>
.edge-editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-card);
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
}

.panel-title {
  font-size: 0.875rem;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.75rem 1rem;
}

.section-empty {
  padding: 2rem 0;
}
</style>
