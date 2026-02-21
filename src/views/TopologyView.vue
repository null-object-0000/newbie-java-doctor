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
import { getByPath } from '@/registry/schemaBuild'
import { NButton, NButtonGroup, NCard, NCode, NEmpty, NText, useDialog, useMessage } from 'naive-ui'
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
  nodeParams,
  nodeConfig,
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
    if (!cfg || (!cfg.params?.length && !cfg.config?.length)) continue
    const params = nodeParams.value[node.id] ?? {}
    const config = nodeConfig.value[node.id] ?? {}
    const rows: { label: string; displayText: string }[] = []
    for (const key of cfg.params ?? []) {
      const value = getByPath(params, key)
      const label = getTopologyDisplayFieldLabel(layerId, 'params', key, kind, role)
      const displayText = getTopologyDisplayValueLabel(layerId, 'params', key, value, kind, role)
      rows.push({ label, displayText })
    }
    for (const key of cfg.config ?? []) {
      const value = getByPath(config, key)
      rows.push({
        label: getTopologyDisplayFieldLabel(layerId, 'config', key, kind, role),
        displayText: getTopologyDisplayValueLabel(layerId, 'config', key, value, kind, role),
      })
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

function getNodeParamsConfig(node: TopologyNode): { params: Record<string, unknown>; config: Record<string, unknown> } {
  return {
    params: { ...(nodeParams.value[node.id] ?? {}) },
    config: { ...(nodeConfig.value[node.id] ?? {}) },
  }
}

const topologyJson = computed(() => {
  const payload = {
    nodes: topology.value.nodes.map((node) => {
      const { params, config } = getNodeParamsConfig(node)
      return { ...node, params, config }
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

/** 当前编辑的节点（点击拓扑图节点时设置；依赖层需据此取 kind 与节点 params/config） */
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
  // 如果删除的是正在编辑的节点，清空编辑状态
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
      <NCard class="topology-main" :segmented="{ content: true }" size="small">
        <template #header>
          <NButtonGroup size="small">
            <NButton :type="middleViewMode === 'graph' ? 'primary' : 'default'"
              :secondary="middleViewMode === 'graph'" @click="middleViewMode = 'graph'">
              拓扑图
            </NButton>
            <NButton :type="middleViewMode === 'json' ? 'primary' : 'default'" :secondary="middleViewMode === 'json'"
              @click="middleViewMode = 'json'">
              JSON
            </NButton>
          </NButtonGroup>
        </template>
        <template #header-extra>
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
        </template>
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
      </NCard>
      <aside class="panel-right">
        <div v-if="editingNode" class="panel-right-inner">
          <NodeEditorPanel :layer-id="editingNode.layerId" :editing-node="editingNode" @close="editingNode = null" />
        </div>
        <div v-else-if="editingEdge" class="panel-right-inner">
          <EdgeEditorPanel :edge="editingEdge" @close="editingEdge = null" />
        </div>
        <NEmpty v-else description="点击拓扑图中的节点或连线可在此编辑属性" class="panel-placeholder" />
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
  gap: 0.75rem;
  overflow: hidden;
}

.panel-left {
  width: 240px;
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
}

.topology-main :deep(.n-card__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 !important;
}

.middle-content {
  height: 100%;
  overflow: hidden;
  position: relative;
}

.middle-content .json-view {
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 1rem;
  background: var(--bg-page);
}

.panel-right {
  width: 420px;
  flex-shrink: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
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
  padding: 1.5rem 1.25rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
