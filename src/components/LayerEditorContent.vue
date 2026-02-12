<script setup lang="ts">
import { computed } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { storeToRefs } from 'pinia'
import { getParamsSchema, getConfigSchema } from '@/registry/layers'
import DynamicForm from '@/components/DynamicForm.vue'
import type { LayerId } from '@/types/layers'

const props = defineProps<{
  layerId: LayerId
  section: 'params' | 'config'
}>()

const store = useTopologyStore()
const {
  clientParams,
  accessParams,
  hostParams,
  hostConfig,
  runtimeParams,
  runtimeConfig,
  dependencyParams,
  dependencyConfig,
} = storeToRefs(store)

const schema = computed(() =>
  props.section === 'params'
    ? getParamsSchema(props.layerId)
    : getConfigSchema(props.layerId)
)

const model = computed(() => {
  const { layerId, section } = props
  if (section === 'params') {
    switch (layerId) {
      case 'client': return clientParams.value
      case 'access': return accessParams.value
      case 'host': return hostParams.value
      case 'runtime': return runtimeParams.value
      case 'dependency': return dependencyParams.value
      default: return {}
    }
  } else {
    switch (layerId) {
      case 'host': return hostConfig.value
      case 'runtime': return runtimeConfig.value
      case 'dependency': return dependencyConfig.value
      default: return {}
    }
  }
})

const resetHandler = computed(() => {
  const { layerId } = props
  switch (layerId) {
    case 'client': return store.resetClient
    case 'host': return store.resetHost
    case 'runtime': return store.resetRuntime
    case 'dependency': return store.resetDependency
    default: return undefined
  }
})

const showReset = computed(() => !!resetHandler.value)
</script>

<template>
  <div class="layer-editor-content">
    <template v-if="schema">
      <DynamicForm
        :schema="schema"
        :model="model"
        :show-reset="showReset"
        @reset="resetHandler?.()"
      />
    </template>
    <div v-else class="section-empty">
      <p>本层无核心配置</p>
    </div>
  </div>
</template>

<style scoped>
.layer-editor-content {
  max-width: 720px;
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
