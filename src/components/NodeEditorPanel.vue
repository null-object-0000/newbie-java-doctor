<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { LayerId } from '@/types/layers'
import { getLayerLabel, getDependencyNodeTypeLabel, getParamsSchema, getConfigSchema } from '@/registry/layers'
import { NTabs, NTabPane, NButton, NText } from 'naive-ui'
import NodeEditorContent from '@/components/NodeEditorContent.vue'
import type { TopologyNode } from '@/types/layers'

const props = defineProps<{
  layerId: LayerId
  editingNode?: TopologyNode | null
}>()

defineEmits<{
  close: []
}>()

const activeTab = ref<string>('params')

const hasParamsSchema = computed(() =>
  !!getParamsSchema(
    props.layerId,
    props.editingNode?.dependencyKind,
    props.editingNode?.dependencyRole
  )
)
const hasConfigSchema = computed(() =>
  !!getConfigSchema(
    props.layerId,
    props.editingNode?.dependencyKind,
    props.editingNode?.dependencyRole
  )
)

watch(
  [hasParamsSchema, hasConfigSchema],
  ([params, config]) => {
    const current = activeTab.value
    if (current === 'params' && !params) activeTab.value = config ? 'config' : 'params'
    else if (current === 'config' && !config) activeTab.value = params ? 'params' : 'config'
  },
  { immediate: true }
)

const nodeTitle = computed(() => {
  if (props.layerId === 'dependency' && props.editingNode?.dependencyKind) {
    const kindLabel = getDependencyNodeTypeLabel(props.editingNode.dependencyKind)
    const roleLabel = props.editingNode.dependencyRole === 'server' ? ' — Server'
      : props.editingNode.dependencyRole === 'client' ? ' — Client'
      : ''
    return `${kindLabel}${roleLabel}`
  }
  return getLayerLabel(props.layerId).replace(/层$/, '')
})
</script>

<template>
  <div class="node-editor-panel">
    <header class="panel-header">
      <NText strong class="panel-title">编辑：{{ nodeTitle }}</NText>
      <NButton quaternary circle size="small" @click="$emit('close')">
        <template #icon>×</template>
      </NButton>
    </header>
    <NTabs v-model:value="activeTab" type="line" size="small" class="panel-tabs">
      <NTabPane v-if="hasParamsSchema || !hasConfigSchema" name="params" tab="核心参数">
        <div class="panel-body">
          <NodeEditorContent
            :layer-id="layerId"
            section="params"
            :editing-node="editingNode"
          />
        </div>
      </NTabPane>
      <NTabPane v-if="hasConfigSchema" name="config" tab="核心配置">
        <div class="panel-body">
          <NodeEditorContent
            :layer-id="layerId"
            section="config"
            :editing-node="editingNode"
          />
        </div>
      </NTabPane>
    </NTabs>
  </div>
</template>

<style scoped>
.node-editor-panel {
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
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

.panel-title {
  font-size: 1rem;
}

.panel-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.panel-tabs :deep(.n-tabs-nav) {
  padding: 0 1.25rem;
}

.panel-tabs :deep(.n-tab-pane) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.panel-body {
  padding: 1rem 1.25rem;
}
</style>
