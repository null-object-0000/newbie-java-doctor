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
  /** 依赖层必传，用于按 kind 取 schema、按 nodeId 取/写 params/config */
  editingNode?: TopologyNode | null
}>()

const store = useTopologyStore()
const {
  clientParams,
  accessParams,
  hostParams,
  hostConfig,
  runtimeParams,
  runtimeConfig,
  dependencyNodeParams,
  dependencyNodeConfig,
} = storeToRefs(store)

const schema = computed(() => {
  const kind = props.layerId === 'dependency' ? props.editingNode?.dependencyKind : undefined
  const role = props.layerId === 'dependency' ? props.editingNode?.dependencyRole : undefined
  return props.section === 'params'
    ? getParamsSchema(props.layerId, kind, role)
    : getConfigSchema(props.layerId, kind, role)
})

const model = computed(() => {
  const { layerId, section, editingNode } = props
  if (layerId === 'dependency' && editingNode?.id) {
    const nodeData = section === 'params'
      ? dependencyNodeParams.value[editingNode.id]
      : dependencyNodeConfig.value[editingNode.id]
    return nodeData ?? {}
  }
  if (section === 'params') {
    switch (layerId) {
      case 'client': return clientParams.value
      case 'access': return accessParams.value
      case 'host': return hostParams.value
      case 'runtime': return runtimeParams.value
      default: return {}
    }
  } else {
    switch (layerId) {
      case 'host': return hostConfig.value
      case 'runtime': return runtimeConfig.value
      default: return {}
    }
  }
})

const resetHandler = computed(() => {
  const { layerId, editingNode } = props
  switch (layerId) {
    case 'client': return store.resetClient
    case 'host': return store.resetHost
    case 'runtime': return store.resetRuntime
    case 'dependency': return editingNode?.id ? () => store.resetDependencyNode(editingNode.id) : undefined
    default: return undefined
  }
})

const showReset = computed(() => !!resetHandler.value)
</script>

<template>
  <div class="layer-editor-content">
    <template v-if="schema">
      <DynamicForm :schema="schema" :model="model" :show-reset="showReset" :before-change="() => store.pushState?.()"
        @reset="resetHandler?.()" />
    </template>
    <NEmpty v-else :description="section === 'params' ? '本层无核心参数' : '本层无核心配置'" class="section-empty" />
  </div>
</template>

<style scoped>
.layer-editor-content {
  max-width: 720px;
}

.section-empty {
  padding: 1.5rem;
}
</style>
