<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LayerId } from '@/types/layers'
import { useTopologyStore } from '@/stores/topology'
import { storeToRefs } from 'pinia'
import {
  getLayers,
  getTopologyDisplayConfig,
  getTopologyDisplayFieldLabel,
  getTopologyDisplayValueLabel,
} from '@/registry/layers'
import { getByPath } from '@/registry/schemaBuild'
import TopologyDiagram from '@/components/TopologyDiagram.vue'
import NodeListPanel from '@/components/NodeListPanel.vue'
import AddNodeModal from '@/components/AddNodeModal.vue'
import LayerEditorPanel from '@/components/LayerEditorPanel.vue'
import type { TopologyNode } from '@/types/layers'

const store = useTopologyStore()
const {
  topology,
  clientParams,
  accessParams,
  hostParams,
  hostConfig,
  runtimeParams,
  runtimeConfig,
  dependencyParams,
  dependencyConfig,
} = storeToRefs(store)

function getLayerParams(layerId: LayerId): object {
  switch (layerId) {
    case 'client': return clientParams.value
    case 'access': return accessParams.value
    case 'host': return hostParams.value
    case 'runtime': return runtimeParams.value
    case 'dependency': return dependencyParams.value
    default: return {}
  }
}

function getLayerConfig(layerId: LayerId): object {
  switch (layerId) {
    case 'host': return hostConfig.value
    case 'runtime': return runtimeConfig.value
    case 'dependency': return dependencyConfig.value
    default: return {}
  }
}

/** 每层在拓扑图卡片上展示的字段（label + displayText，枚举已映射为选项描述） */
const layerDisplayFields = computed(() => {
  const out: Record<string, { label: string; displayText: string }[]> = {}
  const layerIds = getLayers().map((l) => l.id)
  for (const layerId of layerIds) {
    const cfg = getTopologyDisplayConfig(layerId)
    if (!cfg) continue
    const rows: { label: string; displayText: string }[] = []
    const params = getLayerParams(layerId as LayerId)
    const config = getLayerConfig(layerId as LayerId)
    for (const key of cfg.params ?? []) {
      const value = getByPath(params, key)
      rows.push({
        label: getTopologyDisplayFieldLabel(layerId, 'params', key),
        displayText: getTopologyDisplayValueLabel(layerId, 'params', key, value),
      })
    }
    for (const key of cfg.config ?? []) {
      const value = getByPath(config, key)
      rows.push({
        label: getTopologyDisplayFieldLabel(layerId, 'config', key),
        displayText: getTopologyDisplayValueLabel(layerId, 'config', key, value),
      })
    }
    if (rows.length) out[layerId] = rows
  }
  return out
})

type MiddleViewMode = 'graph' | 'json'
const middleViewMode = ref<MiddleViewMode>('graph')

/** 当前拓扑的 JSON 展示（仅查看） */
const topologyJson = computed(() => JSON.stringify(topology.value, null, 2))

function copyJson() {
  navigator.clipboard.writeText(topologyJson.value)
}

const addModalVisible = ref(false)
const editingLayerId = ref<LayerId | null>(null)

const nodes = computed(() => topology.value.nodes)
const edges = computed(() => topology.value.edges)

/** 是否还能拖入该层（客户端/接入/宿主/运行时各最多 1 个） */
function canAddLayer(layerId: 'client' | 'access' | 'host' | 'runtime') {
  return !topology.value.nodes.some((n) => n.layerId === layerId)
}

function closeAddModal() {
  addModalVisible.value = false
}

function onEdit(node: TopologyNode) {
  editingLayerId.value = node.layerId
}

function onAddSubmit(opts: { layerId: 'dependency'; dependencyKind?: import('@/types/layers').DependencyKind; customLabel?: string }): void {
  store.addNodeAfter(null, {
    layerId: 'dependency',
    dependencyKind: opts.dependencyKind,
    customLabel: opts.customLabel,
  })
  closeAddModal()
}

function onRemove(nodeId: string) {
  store.removeNode(nodeId)
}

function onNodeMoved(payload: { nodeId: string; x: number; y: number }) {
  store.updateNodePosition(payload.nodeId, payload.x, payload.y)
}

function onEdgeVerticesChanged(payload: { edgeId: string; vertices: { x: number; y: number }[] }) {
  store.updateEdgeVertices(payload.edgeId, payload.vertices)
}

function onEdgeConnected(payload: { source: string; target: string }) {
  store.addEdge(payload.source, payload.target)
}

type DropPayload =
  | { type: 'layer'; layerId: 'client' | 'access' | 'host' | 'runtime' }
  | { type: 'dependency'; kind: import('@/types/layers').DependencyKind; label: string }

function onDropFromPalette(payload: DropPayload) {
  if (payload.type === 'layer') {
    if (!canAddLayer(payload.layerId)) return
    store.addLayerNode(payload.layerId)
    return
  }
  if (payload.kind === 'custom' || payload.kind === 'http_api') {
    addModalVisible.value = true
    return
  }
  store.addNodeAfter(null, {
    layerId: 'dependency',
    dependencyKind: payload.kind,
  })
}
</script>

<template>
  <div class="topology-view">
    <div class="topology-body">
      <aside class="panel-left">
        <NodeListPanel :can-add-layer="canAddLayer" />
      </aside>
      <div class="topology-main">
        <div class="middle-toolbar">
          <div class="mode-tabs">
            <button type="button" class="mode-tab" :class="{ active: middleViewMode === 'graph' }"
              @click="middleViewMode = 'graph'">
              拓扑图
            </button>
            <button type="button" class="mode-tab" :class="{ active: middleViewMode === 'json' }"
              @click="middleViewMode = 'json'">
              JSON
            </button>
          </div>
          <button v-if="middleViewMode === 'json'" type="button" class="copy-btn" @click="copyJson">
            复制
          </button>
        </div>
        <div class="middle-content">
          <TopologyDiagram v-show="middleViewMode === 'graph'" :nodes="nodes" :edges="edges"
            :layer-display-fields="layerDisplayFields" :visible="middleViewMode === 'graph'"
            @remove="onRemove" @edit="onEdit" @drop="onDropFromPalette" @node-moved="onNodeMoved"
            @edge-vertices-changed="onEdgeVerticesChanged" @edge-connected="onEdgeConnected" />
          <div v-show="middleViewMode === 'json'" class="json-view">
            <pre class="json-pre"><code>{{ topologyJson }}</code></pre>
          </div>
        </div>
      </div>
      <aside class="panel-right">
        <div v-if="editingLayerId" class="panel-right-inner">
          <LayerEditorPanel :layer-id="editingLayerId" @close="editingLayerId = null" />
        </div>
        <div v-else class="panel-placeholder">
          <p>点击拓扑图中的节点可在此编辑该层属性</p>
        </div>
      </aside>
    </div>

    <AddNodeModal :visible="addModalVisible" @close="closeAddModal" @submit="onAddSubmit" />
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
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.middle-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-page);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.mode-tabs {
  display: flex;
  gap: 0.25rem;
}

.mode-tab {
  padding: 0.35rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius);
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.mode-tab:hover {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.mode-tab.active {
  color: var(--accent);
  background: var(--bg-card);
  border-color: var(--border);
}

.copy-btn {
  padding: 0.35rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.copy-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--accent);
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
  background: var(--bg-page);
}

.json-pre {
  margin: 0;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

.json-pre code {
  font-family: inherit;
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
  color: var(--text-muted);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.panel-placeholder p {
  margin: 0;
}
</style>
