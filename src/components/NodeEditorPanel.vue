<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import type { LayerId } from '@/types/layers'
import { getLayerLabel, getDependencyNodeTypeLabel, getConstraintsSchema, getObjectivesSchema, getTunablesSchema } from '@/registry/layers'
import { useTopologyStore } from '@/stores/topology'
import { NTabs, NTabPane, NButton, NText, NTooltip } from 'naive-ui'
import NodeEditorContent from '@/components/NodeEditorContent.vue'
import type { TopologyNode } from '@/types/layers'

const props = defineProps<{
  layerId: LayerId
  editingNode?: TopologyNode | null
}>()

defineEmits<{
  close: []
}>()

const store = useTopologyStore()

function resetNode() {
  const nodeId = props.editingNode?.id
  if (nodeId) store.resetNode(nodeId)
}

const activeInputTab = ref<string>('constraints')

const panelContentRef = ref<HTMLElement | null>(null)
const splitRatio = ref(0.35)
const isDragging = ref(false)

function onDragStart(e: MouseEvent) {
  e.preventDefault()
  isDragging.value = true
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent) {
  const container = panelContentRef.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  const y = e.clientY - rect.top
  const ratio = y / rect.height
  splitRatio.value = Math.min(0.7, Math.max(0.15, ratio))
}

function onDragEnd() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})

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
      <div class="panel-header-actions">
        <NTooltip>
          <template #trigger>
            <NButton quaternary size="tiny" @click="resetNode">恢复默认</NButton>
          </template>
          重置该节点所有属性为默认值
        </NTooltip>
        <NButton quaternary circle size="small" @click="$emit('close')">
          <template #icon>×</template>
        </NButton>
      </div>
    </header>

    <div
      ref="panelContentRef"
      class="panel-content"
      :class="{ 'has-both': hasInputSection && hasTunablesSchema, 'is-dragging': isDragging }"
    >
      <!-- 上半部分：环境约束 / 负载目标 -->
      <div
        v-if="hasInputSection"
        class="input-section"
        :style="hasInputSection && hasTunablesSchema ? { flex: `0 0 ${splitRatio * 100}%` } : undefined"
      >
        <template v-if="hasConstraintsSchema && hasObjectivesSchema">
          <NTabs
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
        </template>
        <template v-else>
          <div class="category-bar">
            <span class="category-label">{{ hasConstraintsSchema ? '环境约束' : '负载目标' }}</span>
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

      <!-- 拖拽分隔条 -->
      <div
        v-if="hasInputSection && hasTunablesSchema"
        class="resize-handle"
        @mousedown="onDragStart"
      >
        <div class="resize-handle-grip" />
      </div>

      <!-- 下半部分：可调配置 -->
      <div v-if="hasTunablesSchema" class="tunables-section">
        <div class="category-bar">
          <span class="category-label">可调配置</span>
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

/* ---- 顶栏 ---- */
.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

.panel-title {
  font-size: 0.9375rem;
  flex: 1;
  min-width: 0;
}

.panel-header-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

/* ---- 内容区整体布局 ---- */
.panel-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.panel-content.is-dragging {
  user-select: none;
  cursor: row-resize;
}

.panel-content:not(.has-both) > .input-section,
.panel-content:not(.has-both) > .tunables-section {
  flex: 1;
  min-height: 0;
}

.panel-content.has-both > .tunables-section {
  flex: 1;
  min-height: 0;
}

.input-section,
.tunables-section {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ---- 拖拽分隔条 ---- */
.resize-handle {
  flex-shrink: 0;
  height: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: row-resize;
  background: var(--bg-page);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}

.resize-handle:hover,
.panel-content.is-dragging > .resize-handle {
  background: var(--bg-active);
}

.resize-handle-grip {
  width: 32px;
  height: 3px;
  border-radius: 1.5px;
  background: var(--border);
  transition: background 0.15s;
}

.resize-handle:hover > .resize-handle-grip,
.panel-content.is-dragging > .resize-handle > .resize-handle-grip {
  background: var(--border-input);
}

/* ---- 大分类标题条 ---- */
.category-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  background: var(--bg-page);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.category-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  text-transform: uppercase;
}

/* ---- Tabs 模式（环境约束 + 负载目标） ---- */
.input-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.input-tabs :deep(.n-tabs-nav) {
  flex-shrink: 0;
  padding: 0 1.25rem;
  background: var(--bg-page);
  border-bottom: 1px solid var(--border);
}

.input-tabs :deep(.n-tab-pane) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

/* ---- 滚动区 + 内容 ---- */
.section-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.section-body {
  padding: 0.75rem 1rem;
}
</style>
