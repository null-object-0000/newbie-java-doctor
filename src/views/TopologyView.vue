<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { storeToRefs } from 'pinia'
import {
  getTopologyDisplayConfig,
  getTopologyDisplayFieldLabel,
  getTopologyDisplayValueLabel,
  getNodeIoRules,
  getEdgeDisplayConfig,
  getEdgeFieldLabel,
  getEdgeValueLabel,
} from '@/registry/layers'
import type { SchemaCategory } from '@/registry/layers'
import { getByPath } from '@/registry/schemaBuild'
import { NButton, NButtonGroup, NCode, useDialog, useMessage } from 'naive-ui'
import TopologyDiagram from '@/components/TopologyDiagram.vue'
import NodeListPanel from '@/components/NodeListPanel.vue'
import NodeEditorPanel from '@/components/NodeEditorPanel.vue'
import EdgeEditorPanel from '@/components/EdgeEditorPanel.vue'
import type { TopologyNode, TopologyEdge } from '@/types/layers'

const message = useMessage()
const dialog = useDialog()
const store = useTopologyStore()
const {
  topology,
  nodeConstraints,
  nodeObjectives,
  nodeTunables,
  edgeParams,
  canUndo,
  canRedo,
} = storeToRefs(store)

/** 按节点生成拓扑图卡片展示字段 */
const nodeDisplayFields = computed(() => {
  const out: Record<string, { label: string; displayText: string }[]> = {}
  for (const node of topology.value.nodes) {
    const layerId = node.layerId
    const kind = node.layerId === 'dependency' ? node.dependencyKind : undefined
    const role = node.layerId === 'dependency' ? node.dependencyRole : undefined
    const cfg = getTopologyDisplayConfig(layerId, kind, role)
    if (!cfg || (!cfg.constraints?.length && !cfg.objectives?.length && !cfg.tunables?.length)) continue

    const constraints = nodeConstraints.value[node.id] ?? {}
    const objectives = nodeObjectives.value[node.id] ?? {}
    const tunables = nodeTunables.value[node.id] ?? {}

    const rows: { label: string; displayText: string }[] = []

    const categories: { keys: string[]; source: SchemaCategory; data: Record<string, unknown> }[] = [
      { keys: cfg.constraints ?? [], source: 'constraints', data: constraints },
      { keys: cfg.objectives ?? [], source: 'objectives', data: objectives },
      { keys: cfg.tunables ?? [], source: 'tunables', data: tunables },
    ]

    for (const { keys, source, data } of categories) {
      for (const key of keys) {
        const value = getByPath(data, key)
        rows.push({
          label: getTopologyDisplayFieldLabel(layerId, source, key, kind, role),
          displayText: getTopologyDisplayValueLabel(layerId, source, key, value, kind, role),
        })
      }
    }

    if (rows.length) out[node.id] = rows
  }
  return out
})

/** 按连线生成拓扑图连线上展示的字段（key 为 edgeId） */
const edgeDisplayFields = computed(() => {
  const out: Record<string, { label: string; displayText: string }[]> = {}
  for (const edge of topology.value.edges) {
    const srcNode = topology.value.nodes.find((n) => n.id === edge.source)
    const tgtNode = topology.value.nodes.find((n) => n.id === edge.target)
    if (!srcNode || !tgtNode) continue
    const cfg = getEdgeDisplayConfig(srcNode.layerId, tgtNode.layerId)
    if (!cfg?.params?.length) continue
    const params = edgeParams.value[edge.id] ?? {}
    const rows: { label: string; displayText: string }[] = []
    for (const key of cfg.params) {
      const value = getByPath(params, key)
      rows.push({
        label: getEdgeFieldLabel(srcNode.layerId, tgtNode.layerId, key),
        displayText: getEdgeValueLabel(srcNode.layerId, tgtNode.layerId, key, value),
      })
    }
    if (rows.length) out[edge.id] = rows
  }
  return out
})

type MiddleViewMode = 'graph' | 'json'
const middleViewMode = ref<MiddleViewMode>('graph')

function getNodeData(node: TopologyNode): { constraints: Record<string, unknown>; objectives: Record<string, unknown>; tunables: Record<string, unknown> } {
  return {
    constraints: { ...(nodeConstraints.value[node.id] ?? {}) },
    objectives: { ...(nodeObjectives.value[node.id] ?? {}) },
    tunables: { ...(nodeTunables.value[node.id] ?? {}) },
  }
}

const topologyJson = computed(() => {
  const payload = {
    nodes: topology.value.nodes.map((node) => {
      const { constraints, objectives, tunables } = getNodeData(node)
      return { ...node, constraints, objectives, tunables }
    }),
    edges: topology.value.edges.map((edge) => {
      const params = edgeParams.value[edge.id]
      return params ? { ...edge, params } : edge
    }),
  }
  return JSON.stringify(payload, null, 2)
})

async function copyJson() {
  try {
    await navigator.clipboard.writeText(topologyJson.value)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败，请手动选择后复制')
  }
}

function downloadJson() {
  const blob = new Blob([topologyJson.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `topology-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const fileInputRef = ref<HTMLInputElement | null>(null)

function triggerImport() {
  fileInputRef.value?.click()
}

function handleFileImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  const reader = new FileReader()
  reader.onload = () => {
    const content = reader.result as string
    dialog.warning({
      title: '导入拓扑',
      content: '导入将替换当前拓扑数据（可通过撤销恢复），确认继续？',
      positiveText: '确认导入',
      negativeText: '取消',
      onPositiveClick: () => {
        const result = store.importFromJson(content)
        if (result.ok) {
          editingNode.value = null
          editingEdge.value = null
          message.success('导入成功')
        } else {
          message.error(`导入失败：${result.message}`)
        }
      },
    })
  }
  reader.onerror = () => message.error('文件读取失败')
  reader.readAsText(file)
}

/** 当前编辑的节点（点击拓扑图节点时设置；依赖层需据此取 kind 与节点数据） */
const editingNode = ref<TopologyNode | null>(null)
/** 当前编辑的连线（点击拓扑图连线时设置） */
const editingEdge = ref<TopologyEdge | null>(null)

const nodes = computed(() => topology.value.nodes)
const edges = computed(() => topology.value.edges)

/** 各节点的输入输出端口配置（用于拓扑图只显示允许的端口） */
const nodePortConfig = computed(() => {
  const out: Record<string, { hasInput: boolean; hasOutput: boolean }> = {}
  for (const node of topology.value.nodes) {
    const rules = getNodeIoRules(node.layerId, node.dependencyKind)
    out[node.id] = { hasInput: rules.hasInput, hasOutput: rules.hasOutput }
  }
  return out
})

/** 是否还能拖入该层（客户端/接入/宿主/运行时各最多 1 个） */
function canAddLayer(layerId: 'client' | 'access' | 'host' | 'runtime') {
  return !topology.value.nodes.some((n) => n.layerId === layerId)
}

/** 当前选中节点 id（与拓扑图选中态同步） */
const selectedNodeId = computed(() => editingNode.value?.id ?? null)

function onSelect(node: TopologyNode | null) {
  editingNode.value = node
  if (node) editingEdge.value = null
}

function onEdit(node: TopologyNode) {
  editingNode.value = node
  editingEdge.value = null
}

function onEdgeSelect(edge: TopologyEdge | null) {
  editingEdge.value = edge
  if (edge) editingNode.value = null
}

function onRemove(nodeId: string) {
  if (editingNode.value?.id === nodeId) {
    editingNode.value = null
  }
  store.removeNode(nodeId)
}

function onNodeMoved(payload: { nodeId: string; x: number; y: number }) {
  store.updateNodePosition(payload.nodeId, payload.x, payload.y)
}

function onEdgeVerticesChanged(payload: { edgeId: string; vertices: { x: number; y: number }[] }) {
  store.updateEdgeVertices(payload.edgeId, payload.vertices)
}

function onEdgeConnected(payload: { source: string; target: string }) {
  const result = store.addEdge(payload.source, payload.target)
  if (!result.ok) {
    message.warning(result.message)
  }
}

function onEdgeRemoved(edgeId: string) {
  if (editingEdge.value?.id === edgeId) {
    editingEdge.value = null
  }
  store.removeEdge(edgeId)
}

type DropPayload =
  | { type: 'layer'; layerId: 'client' | 'access' | 'host' | 'runtime'; x: number; y: number }
  | { type: 'dependency'; kind: import('@/types/layers').DependencyKind; label: string; x: number; y: number }

function onDropFromPalette(payload: DropPayload) {
  if (payload.type === 'layer') {
    if (!canAddLayer(payload.layerId)) return
    store.addLayerNode(payload.layerId, payload.x, payload.y)
    return
  }
  store.addNodeAfter(null, {
    layerId: 'dependency',
    dependencyKind: payload.kind,
  }, payload.x, payload.y)
}
</script>

<template>
  <div class="topology-view">
    <div class="topology-body">
      <aside class="panel-left">
        <NodeListPanel :can-add-layer="canAddLayer" />
      </aside>

      <div class="topology-main">
        <div class="main-header">
          <div class="view-tabs">
            <button
              class="view-tab"
              :class="{ active: middleViewMode === 'graph' }"
              @click="middleViewMode = 'graph'"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
              拓扑图
            </button>
            <button
              class="view-tab"
              :class="{ active: middleViewMode === 'json' }"
              @click="middleViewMode = 'json'"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
              JSON
            </button>
          </div>
          <div class="header-actions">
            <NButtonGroup size="tiny">
              <NButton secondary @click="triggerImport">导入</NButton>
              <NButton secondary @click="downloadJson">导出</NButton>
            </NButtonGroup>
            <NButton v-if="middleViewMode === 'json'" size="tiny" secondary @click="copyJson">
              复制
            </NButton>
          </div>
          <input ref="fileInputRef" type="file" accept=".json" style="display: none" @change="handleFileImport" />
        </div>
        <div class="middle-content">
          <TopologyDiagram v-show="middleViewMode === 'graph'" :nodes="nodes" :edges="edges"
            :node-display-fields="nodeDisplayFields" :edge-display-fields="edgeDisplayFields"
            :node-port-config="nodePortConfig"
            :visible="middleViewMode === 'graph'" :can-undo="canUndo" :can-redo="canRedo"
            :selected-node-id="selectedNodeId"
            @remove="onRemove" @edit="onEdit" @select="onSelect" @edge-select="onEdgeSelect"
            @drop="onDropFromPalette"
            @node-moved="onNodeMoved" @edge-vertices-changed="onEdgeVerticesChanged"
            @edge-connected="onEdgeConnected" @edge-removed="onEdgeRemoved" @undo="store.undo" @redo="store.redo" />
          <div v-show="middleViewMode === 'json'" class="json-view">
            <NCode :code="topologyJson" language="json" word-wrap />
          </div>
        </div>
      </div>

      <aside class="panel-right">
        <div v-if="editingNode" class="panel-right-inner">
          <NodeEditorPanel :layer-id="editingNode.layerId" :editing-node="editingNode" @close="editingNode = null" />
        </div>
        <div v-else-if="editingEdge" class="panel-right-inner">
          <EdgeEditorPanel :edge="editingEdge" @close="editingEdge = null" />
        </div>
        <div v-else class="panel-placeholder">
          <div class="placeholder-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
          </div>
          <span class="placeholder-text">点击节点或连线编辑属性</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.topology-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topology-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 0.625rem;
  overflow: hidden;
}

.panel-left {
  width: 232px;
  flex-shrink: 0;
  min-height: 0;
  overflow: hidden;
}

.topology-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  background: var(--bg-card);
  box-shadow: var(--shadow-panel);
}

.main-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
}

.view-tabs {
  display: flex;
  gap: 2px;
  background: var(--bg-active);
  border-radius: var(--radius);
  padding: 2px;
}

.view-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0.3rem 0.75rem;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted);
  transition: all var(--transition-fast);
  font-family: inherit;
}

.view-tab:hover {
  color: var(--text-secondary);
}

.view-tab.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-xs);
}

.middle-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.middle-content .json-view {
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 1rem;
  background: var(--bg-subtle);
}

.panel-right {
  width: 400px;
  flex-shrink: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-panel);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
}

.panel-right-inner {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem;
}

.placeholder-icon {
  color: var(--text-faint);
  opacity: 0.5;
}

.placeholder-text {
  font-size: 0.8125rem;
  color: var(--text-faint);
  text-align: center;
  line-height: 1.5;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
