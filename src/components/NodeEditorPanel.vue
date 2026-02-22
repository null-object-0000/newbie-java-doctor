<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { LayerId } from '@/types/layers'
import { getLayerLabel, getDependencyNodeTypeLabel, getConstraintsSchema, getObjectivesSchema, getTunablesSchema } from '@/registry/layers'
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

const activeInputTab = ref<string>('constraints')

const hasConstraintsSchema = computed(() =>
  !!getConstraintsSchema(
    props.layerId,
    props.editingNode?.dependencyKind,
    props.editingNode?.dependencyRole
  )
)
const hasObjectivesSchema = computed(() =>
  !!getObjectivesSchema(
    props.layerId,
    props.editingNode?.dependencyKind,
    props.editingNode?.dependencyRole
  )
)
const hasTunablesSchema = computed(() =>
  !!getTunablesSchema(
    props.layerId,
    props.editingNode?.dependencyKind,
    props.editingNode?.dependencyRole
  )
)

const hasInputSection = computed(() => hasConstraintsSchema.value || hasObjectivesSchema.value)

watch(
  [hasConstraintsSchema, hasObjectivesSchema],
  ([c, o]) => {
    const current = activeInputTab.value
    if (current === 'constraints' && !c) activeInputTab.value = o ? 'objectives' : 'constraints'
    else if (current === 'objectives' && !o) activeInputTab.value = c ? 'constraints' : 'objectives'
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

    <div class="panel-content" :class="{ 'has-both': hasInputSection && hasTunablesSchema }">
      <!-- 上半部分：环境约束 / 负载目标 -->
      <div v-if="hasInputSection" class="input-section">
        <NTabs
          v-if="hasConstraintsSchema && hasObjectivesSchema"
          v-model:value="activeInputTab"
          type="line"
          size="small"
          class="input-tabs"
        >
          <NTabPane name="constraints" tab="环境约束">
            <div class="section-body">
              <NodeEditorContent
                :layer-id="layerId"
                section="constraints"
                :editing-node="editingNode"
              />
            </div>
          </NTabPane>
          <NTabPane name="objectives" tab="负载目标">
            <div class="section-body">
              <NodeEditorContent
                :layer-id="layerId"
                section="objectives"
                :editing-node="editingNode"
              />
            </div>
          </NTabPane>
        </NTabs>
        <!-- 只有一种输入类型时不用 Tab，直接显示标题 -->
        <template v-else>
          <div class="section-sticky-header">
            <NText strong depth="2">{{ hasConstraintsSchema ? '环境约束' : '负载目标' }}</NText>
          </div>
          <div class="section-scroll">
            <div class="section-body">
              <NodeEditorContent
                :layer-id="layerId"
                :section="hasConstraintsSchema ? 'constraints' : 'objectives'"
                :editing-node="editingNode"
              />
            </div>
          </div>
        </template>
      </div>

      <!-- 分隔线 -->
      <div v-if="hasInputSection && hasTunablesSchema" class="section-divider" />

      <!-- 下半部分：可调配置 -->
      <div v-if="hasTunablesSchema" class="tunables-section">
        <div class="section-sticky-header">
          <NText strong depth="2">可调配置</NText>
        </div>
        <div class="section-scroll">
          <div class="section-body">
            <NodeEditorContent
              :layer-id="layerId"
              section="tunables"
              :editing-node="editingNode"
            />
          </div>
        </div>
      </div>
    </div>
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

.panel-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 只有一个区块时占满 */
.panel-content:not(.has-both) > .input-section,
.panel-content:not(.has-both) > .tunables-section {
  flex: 1;
  min-height: 0;
}

/* 两个区块同时存在时各占一半 */
.panel-content.has-both > .input-section,
.panel-content.has-both > .tunables-section {
  flex: 1;
  min-height: 0;
}

.input-section {
  display: flex;
  flex-direction: column;
}

.tunables-section {
  display: flex;
  flex-direction: column;
}

/* ---- Tabs 模式（两个输入 Tab）---- */
.input-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.input-tabs :deep(.n-tabs-nav) {
  flex-shrink: 0;
  padding: 0 1.25rem;
}

.input-tabs :deep(.n-tab-pane) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

/* ---- 单标题 + 滚动区 ---- */
.section-sticky-header {
  flex-shrink: 0;
  padding: 0.75rem 1.25rem 0;
  font-size: 0.875rem;
}

.section-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.section-body {
  padding: 1rem 1.25rem;
}

.section-divider {
  flex-shrink: 0;
  height: 1px;
  margin: 0 1.25rem;
  background: var(--border);
}
</style>
