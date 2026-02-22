<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { NTooltip, NDropdown } from 'naive-ui'
import type { TopologyNode, TopologyEdge, DependencyKind } from '@/types/layers'

import { useGraph } from './topology-diagram/useGraph'
import { useGraphDnd } from './topology-diagram/useGraphDnd'
import { useGraphContextMenu } from './topology-diagram/useGraphContextMenu'

// ========== Props ==========
import type { NodeStatusInfo } from './topology-diagram/constants'

const props = withDefaults(
  defineProps<{
    nodes: TopologyNode[]
    edges: TopologyEdge[]
    nodeDisplayFields?: Record<string, { label: string; displayText: string }[]>
    edgeDisplayFields?: Record<string, { label: string; displayText: string }[]>
    nodePortConfig?: Record<string, { hasInput: boolean; hasOutput: boolean }>
    nodeStatusMap?: Record<string, NodeStatusInfo>
    visible?: boolean
    canUndo?: boolean
    canRedo?: boolean
    selectedNodeId?: string | null
  }>(),
  {
    nodeDisplayFields: () => ({}),
    edgeDisplayFields: () => ({}),
    nodePortConfig: () => ({}),
    nodeStatusMap: () => ({}),
    visible: true,
    canUndo: false,
    canRedo: false,
    selectedNodeId: null,
  },
)

// ========== Emits ==========
const emit = defineEmits<{
  remove: [nodeId: string]
  edit: [node: TopologyNode]
  select: [node: TopologyNode | null]
  edgeSelect: [edge: TopologyEdge | null]
  drop: [
    payload:
      | { type: 'layer'; layerId: 'client' | 'access' | 'host' | 'runtime'; x: number; y: number }
      | { type: 'dependency'; kind: DependencyKind; label: string; x: number; y: number },
  ]
  nodeMoved: [payload: { nodeId: string; x: number; y: number }]
  edgeVerticesChanged: [payload: { edgeId: string; vertices: { x: number; y: number }[] }]
  edgeConnected: [payload: { source: string; target: string }]
  edgeRemoved: [edgeId: string]
  undo: []
  redo: []
}>()

// ========== Container Ref ==========
const containerRef = ref<HTMLElement | null>(null)

// ========== Composables ==========
const {
  graph,
  selectedEdgeId,
  positionOnlyRef,
  initGraph,
  disposeGraph,
  syncGraph,
  selectEdge,
  isGroupEdge,
  deleteSelected,
  updateSelectedNodeVisual,
  zoomIn,
  zoomOut,
  resetView,
  fitContent,
} = useGraph(containerRef, () => ({
  nodes: props.nodes,
  edges: props.edges,
  nodeDisplayFields: props.nodeDisplayFields,
  edgeDisplayFields: props.edgeDisplayFields,
  nodePortConfig: props.nodePortConfig,
  nodeStatusMap: props.nodeStatusMap,
  selectedNodeId: props.selectedNodeId,
}))

const contextMenu = useGraphContextMenu({
  getNodes: () => props.nodes,
  getEdges: () => props.edges,
  isGroupEdge,
  selectEdge,
  selectedEdgeId,
  fitContent,
  resetView,
  onEditNode: (node) => {
    emit('select', node)
    emit('edit', node)
  },
  onDeleteNode: (id) => emit('remove', id),
  onEditEdge: (edge) => {
    selectEdge(edge.id)
    emit('select', null)
    emit('edgeSelect', edge)
  },
  onDeleteEdge: (id) => {
    emit('edgeRemoved', id)
    emit('edgeSelect', null)
    if (selectedEdgeId.value === id) selectEdge(null)
  },
})

const dnd = useGraphDnd({
  graph,
  getNodes: () => props.nodes,
  onDrop: (payload) => emit('drop', payload),
})

// ========== Computed ==========
const hasSelection = computed(() => !!props.selectedNodeId || !!selectedEdgeId.value)

// ========== Lifecycle ==========
onMounted(() => {
  initGraph({
    onRemove: (id) => emit('remove', id),
    onSelect: (node) => emit('select', node),
    onEdit: (node) => emit('edit', node),
    onEdgeSelect: (edge) => emit('edgeSelect', edge),
    onNodeMoved: (payload) => emit('nodeMoved', payload),
    onEdgeVerticesChanged: (payload) => emit('edgeVerticesChanged', payload),
    onEdgeConnected: (payload) => emit('edgeConnected', payload),
    onEdgeRemoved: (id) => emit('edgeRemoved', id),
    onUndo: () => emit('undo'),
    onRedo: () => emit('redo'),
    onNodeContextMenu: (e, nodeId) => contextMenu.showNodeContextMenu(e, nodeId),
    onEdgeContextMenu: (e, edgeId) => contextMenu.showEdgeContextMenu(e, edgeId),
    onBlankContextMenu: (e) => contextMenu.showBlankContextMenu(e),
  })
})

onUnmounted(() => {
  disposeGraph()
})

// ========== Watchers ==========
watch(
  () => [props.nodes, props.edges, props.nodeDisplayFields, props.edgeDisplayFields, props.nodePortConfig, props.nodeStatusMap],
  () => syncGraph(),
  { deep: true },
)

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      positionOnlyRef.value = false
      nextTick(() => syncGraph())
    }
  },
)

watch(
  () => props.selectedNodeId,
  (newId, oldId) => updateSelectedNodeVisual(newId ?? null, oldId ?? null),
)

// ========== Toolbar Handlers ==========
function onUndo() {
  if (props.canUndo) emit('undo')
}

function onRedo() {
  if (props.canRedo) emit('redo')
}
</script>

<template>
  <div
    class="zoom-pan-container"
    @dragover="dnd.onDragOver"
    @drop="dnd.onDrop"
    @contextmenu.prevent
  >
    <div ref="containerRef" class="x6-container" />

    <!-- Toolbar -->
    <div class="diagram-toolbar">
      <!-- Undo / Redo -->
      <div class="toolbar-group">
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn" :disabled="!canUndo" @click="onUndo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
            </button>
          </template>
          撤销 (Ctrl+Z)
        </NTooltip>
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn" :disabled="!canRedo" @click="onRedo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" /></svg>
            </button>
          </template>
          重做 (Ctrl+Shift+Z)
        </NTooltip>
      </div>

      <div class="toolbar-divider" />

      <!-- Zoom -->
      <div class="toolbar-group">
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn" @click="zoomIn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
            </button>
          </template>
          放大
        </NTooltip>
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn" @click="zoomOut">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
            </button>
          </template>
          缩小
        </NTooltip>
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn" @click="fitContent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
            </button>
          </template>
          适应画布
        </NTooltip>
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn" @click="resetView">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
            </button>
          </template>
          重置视图
        </NTooltip>
      </div>

      <div class="toolbar-divider" />

      <!-- Delete selected -->
      <div class="toolbar-group">
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn toolbar-btn-danger" :disabled="!hasSelection" @click="deleteSelected">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
          </template>
          删除选中 (Delete)
        </NTooltip>
      </div>
    </div>

    <!-- Context Menu -->
    <NDropdown
      placement="bottom-start"
      trigger="manual"
      :x="contextMenu.ctxMenu.x"
      :y="contextMenu.ctxMenu.y"
      :options="contextMenu.ctxMenu.options"
      :show="contextMenu.ctxMenu.show"
      @select="contextMenu.onCtxMenuSelect"
      @clickoutside="contextMenu.onCtxMenuClickOutside"
    />
  </div>
</template>

<style scoped>
.zoom-pan-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-card);
}

.x6-container {
  width: 100%;
  height: 100%;
}

.diagram-toolbar {
  position: absolute;
  bottom: 14px;
  right: 14px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(226, 232, 240, 0.7);
  border-radius: var(--radius-lg);
  padding: 4px;
  box-shadow: var(--shadow-md);
}

.toolbar-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.toolbar-divider {
  height: 1px;
  margin: 2px 4px;
  background: var(--border);
  opacity: 0.6;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
  transition: background var(--transition-fast), color var(--transition-fast);
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--accent-surface);
  color: var(--accent);
}

.toolbar-btn:active:not(:disabled) {
  background: var(--accent-light);
}

.toolbar-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.toolbar-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.toolbar-btn-danger:hover:not(:disabled) {
  color: var(--danger);
  background: var(--danger-surface);
}

.toolbar-btn svg {
  flex-shrink: 0;
}
</style>
