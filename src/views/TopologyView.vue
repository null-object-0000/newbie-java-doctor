<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LayerId } from '@/types/layers'
import { useTopologyStore } from '@/stores/topology'
import { storeToRefs } from 'pinia'
import {
  getTopologyDisplayConfig,
  getTopologyDisplayFieldLabel,
  getTopologyDisplayValueLabel,
} from '@/registry/layers'
import { getByPath } from '@/registry/schemaBuild'
import { NButton, NButtonGroup, NCard, NCode, NEmpty, NText } from 'naive-ui'
import TopologyDiagram from '@/components/TopologyDiagram.vue'
import NodeListPanel from '@/components/NodeListPanel.vue'
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
  dependencyNodeParams,
  dependencyNodeConfig,
} = storeToRefs(store)

function getLayerParams(layerId: LayerId): object {
  switch (layerId) {
    case 'client': return clientParams.value
    case 'access': return accessParams.value
    case 'host': return hostParams.value
    case 'runtime': return runtimeParams.value
    case 'dependency': return {}
    default: return {}
  }
}

function getLayerConfig(layerId: LayerId): object {
  switch (layerId) {
    case 'host': return hostConfig.value
    case 'runtime': return runtimeConfig.value
    case 'dependency': return {}
    default: return {}
  }
}

/** 按节点生成拓扑图卡片展示字段（key 为 nodeId，依赖层按节点 kind 用各自 schema） */
const layerDisplayFields = computed(() => {
  const out: Record<string, { label: string; displayText: string }[]> = {}
  for (const node of topology.value.nodes) {
    const layerId = node.layerId
    const kind = node.layerId === 'dependency' ? node.dependencyKind : undefined
    const cfg = getTopologyDisplayConfig(layerId, kind)
    if (!cfg || (!cfg.params?.length && !cfg.config?.length)) continue
    const params =
      layerId === 'dependency' && node.id
        ? (dependencyNodeParams.value[node.id] ?? {})
        : getLayerParams(layerId as LayerId)
    const config =
      layerId === 'dependency' && node.id
        ? (dependencyNodeConfig.value[node.id] ?? {})
        : getLayerConfig(layerId as LayerId)
    const rows: { label: string; displayText: string }[] = []
    for (const key of cfg.params ?? []) {
      const value = getByPath(params, key)
      rows.push({
        label: getTopologyDisplayFieldLabel(layerId, 'params', key, kind),
        displayText: getTopologyDisplayValueLabel(layerId, 'params', key, value, kind),
      })
    }
    for (const key of cfg.config ?? []) {
      const value = getByPath(config, key)
      rows.push({
        label: getTopologyDisplayFieldLabel(layerId, 'config', key, kind),
        displayText: getTopologyDisplayValueLabel(layerId, 'config', key, value, kind),
      })
    }
    if (rows.length) out[node.id] = rows
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

/** 当前编辑的节点（点击拓扑图节点时设置；依赖层需据此取 kind 与节点 params/config） */
const editingNode = ref<TopologyNode | null>(null)

const nodes = computed(() => topology.value.nodes)
const edges = computed(() => topology.value.edges)

/** 是否还能拖入该层（客户端/接入/宿主/运行时各最多 1 个） */
function canAddLayer(layerId: 'client' | 'access' | 'host' | 'runtime') {
  return !topology.value.nodes.some((n) => n.layerId === layerId)
}

function onEdit(node: TopologyNode) {
  editingNode.value = node
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
      <NCard class="topology-main" :segmented="{ content: true }" size="small">
        <template #header>
          <NButtonGroup size="small">
            <NButton
              :type="middleViewMode === 'graph' ? 'primary' : 'default'"
              :secondary="middleViewMode === 'graph'"
              @click="middleViewMode = 'graph'"
            >
              拓扑图
            </NButton>
            <NButton
              :type="middleViewMode === 'json' ? 'primary' : 'default'"
              :secondary="middleViewMode === 'json'"
              @click="middleViewMode = 'json'"
            >
              JSON
            </NButton>
          </NButtonGroup>
        </template>
        <template #header-extra>
          <NButton
            v-if="middleViewMode === 'json'"
            size="tiny"
            secondary
            @click="copyJson"
          >
            复制
          </NButton>
        </template>
        <div class="middle-content">
          <TopologyDiagram v-show="middleViewMode === 'graph'" :nodes="nodes" :edges="edges"
            :layer-display-fields="layerDisplayFields" :visible="middleViewMode === 'graph'"
            @remove="onRemove" @edit="onEdit" @drop="onDropFromPalette" @node-moved="onNodeMoved"
            @edge-vertices-changed="onEdgeVerticesChanged" @edge-connected="onEdgeConnected" />
          <div v-show="middleViewMode === 'json'" class="json-view">
            <NCode :code="topologyJson" language="json" word-wrap />
          </div>
        </div>
      </NCard>
      <aside class="panel-right">
        <div v-if="editingNode" class="panel-right-inner">
          <LayerEditorPanel
            :layer-id="editingNode.layerId"
            :editing-node="editingNode"
            @close="editingNode = null"
          />
        </div>
        <NEmpty v-else description="点击拓扑图中的节点可在此编辑该层属性" class="panel-placeholder" />
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
</style>
