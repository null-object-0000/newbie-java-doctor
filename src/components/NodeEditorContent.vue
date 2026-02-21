<script setup lang="ts">
import { computed } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { storeToRefs } from 'pinia'
import { getParamsSchema, getConfigSchema } from '@/registry/layers'
import { NEmpty } from 'naive-ui'
import DynamicForm from '@/components/DynamicForm.vue'
import type { LayerId } from '@/types/layers'
import type { TopologyNode } from '@/types/layers'

const props = defineProps<{
  layerId: LayerId
  section: 'params' | 'config'
  editingNode?: TopologyNode | null
}>()

const store = useTopologyStore()
const { nodeParams, nodeConfig } = storeToRefs(store)

const schema = computed(() => {
  const kind = props.layerId === 'dependency' ? props.editingNode?.dependencyKind : undefined
  const role = props.layerId === 'dependency' ? props.editingNode?.dependencyRole : undefined
  return props.section === 'params'
    ? getParamsSchema(props.layerId, kind, role)
    : getConfigSchema(props.layerId, kind, role)
})

const model = computed(() => {
  const nodeId = props.editingNode?.id
  if (!nodeId) return {}
  return (props.section === 'params'
    ? nodeParams.value[nodeId]
    : nodeConfig.value[nodeId]) ?? {}
})

const resetHandler = computed(() => {
  const nodeId = props.editingNode?.id
  if (!nodeId) return undefined
  return () => store.resetNode(nodeId)
})

const formContext = computed(() => {
  if (props.section !== 'config') return undefined
  const nodeId = props.editingNode?.id
  if (!nodeId) return undefined
  return nodeParams.value[nodeId] ?? {}
})

const showReset = computed(() => !!resetHandler.value)
</script>

<template>
  <div class="node-editor-content">
    <template v-if="schema">
      <DynamicForm :schema="schema" :model="model" :context="formContext" :show-reset="showReset" :before-change="() => store.pushState?.()"
        @reset="resetHandler?.()" />
    </template>
    <NEmpty v-else :description="section === 'params' ? '该节点无核心参数' : '该节点无核心配置'" class="section-empty" />
  </div>
</template>

<style scoped>
.node-editor-content {
  max-width: 720px;
}

.section-empty {
  padding: 1.5rem;
}
</style>
