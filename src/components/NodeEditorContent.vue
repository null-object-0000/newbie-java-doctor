<script setup lang="ts">
import { computed } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { storeToRefs } from 'pinia'
import { getConstraintsSchema, getObjectivesSchema, getTunablesSchema } from '@/registry/layers'
import type { SchemaCategory } from '@/registry/layers'
import { NEmpty } from 'naive-ui'
import DynamicForm from '@/components/DynamicForm.vue'
import type { LayerId } from '@/types/layers'
import type { TopologyNode } from '@/types/layers'

const props = defineProps<{
  layerId: LayerId
  section: SchemaCategory
  editingNode?: TopologyNode | null
}>()

const store = useTopologyStore()
const { nodeConstraints, nodeObjectives, nodeTunables } = storeToRefs(store)

const schema = computed(() => {
  const kind = props.layerId === 'dependency' ? props.editingNode?.dependencyKind : undefined
  const role = props.layerId === 'dependency' ? props.editingNode?.dependencyRole : undefined
  if (props.section === 'constraints') return getConstraintsSchema(props.layerId, kind, role)
  if (props.section === 'objectives') return getObjectivesSchema(props.layerId, kind, role)
  return getTunablesSchema(props.layerId, kind, role)
})

const model = computed(() => {
  const nodeId = props.editingNode?.id
  if (!nodeId) return {}
  if (props.section === 'constraints') return nodeConstraints.value[nodeId] ?? {}
  if (props.section === 'objectives') return nodeObjectives.value[nodeId] ?? {}
  return nodeTunables.value[nodeId] ?? {}
})

const resetHandler = computed(() => {
  const nodeId = props.editingNode?.id
  if (!nodeId) return undefined
  return () => store.resetNode(nodeId)
})

const formContext = computed(() => {
  if (props.section !== 'tunables') return undefined
  const nodeId = props.editingNode?.id
  if (!nodeId) return undefined
  return nodeConstraints.value[nodeId] ?? {}
})

const showReset = computed(() => !!resetHandler.value)

const emptyDescription = computed(() => {
  if (props.section === 'constraints') return '该节点无环境约束'
  if (props.section === 'objectives') return '该节点无负载目标'
  return '该节点无可调配置'
})
</script>

<template>
  <div class="node-editor-content">
    <template v-if="schema">
      <DynamicForm :schema="schema" :model="model" :context="formContext" :show-reset="showReset" :before-change="() => store.pushState?.()"
        @reset="resetHandler?.()" />
    </template>
    <NEmpty v-else :description="emptyDescription" class="section-empty" />
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
