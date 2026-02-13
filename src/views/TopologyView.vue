<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LayerId } from '@/types/layers'
import { useTopologyStore } from '@/stores/topology'
import { storeToRefs } from 'pinia'
import {
  getTopologyDisplayConfig,
  getTopologyDisplayFieldLabel,
  getTopologyDisplayValueLabel,
  getGlobalCoreParamsFieldLabel,
  getGlobalCoreParamsValueLabel,
  isGlobalCoreParamKey,
  getNodeIoRules,
} from '@/registry/layers'
import { getByPath } from '@/registry/schemaBuild'
import { NButton, NButtonGroup, NCard, NCode, NEmpty, NSelect, NText, useMessage } from 'naive-ui'
import TopologyDiagram from '@/components/TopologyDiagram.vue'
import NodeListPanel from '@/components/NodeListPanel.vue'
import LayerEditorPanel from '@/components/LayerEditorPanel.vue'
import type { TopologyNode, BusinessScenario } from '@/types/layers'

const GLOBAL_BUSINESS_SCENARIO_OPTIONS = [
  { value: 'io', label: 'IO 密集型' },
  { value: 'compute', label: '计算密集型' },
]

const message = useMessage()
const store = useTopologyStore()
const {
  topology,
  globalCoreParams,
  clientParams,
  accessParams,
  hostParams,
  hostConfig,
  runtimeParams,
  runtimeConfig,
  dependencyNodeParams,
  dependencyNodeConfig,
  canUndo,
  canRedo,
} = storeToRefs(store)

function onGlobalBusinessScenarioChange(v: string) {
  store.pushState()
  globalCoreParams.value = { ...globalCoreParams.value, businessScenario: v as BusinessScenario }
}

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

/** 按节点生成拓扑图卡片展示字段（key 为 nodeId，依赖层按节点 kind + dependencyRole 用各自 schema） */
const layerDisplayFields = computed(() => {
  const out: Record<string, { label: string; displayText: string }[]> = {}
  for (const node of topology.value.nodes) {
    const layerId = node.layerId
    const kind = node.layerId === 'dependency' ? node.dependencyKind : undefined
    const role = node.layerId === 'dependency' ? node.dependencyRole : undefined
    const cfg = getTopologyDisplayConfig(layerId, kind, role)
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
      const value = isGlobalCoreParamKey(key)
        ? getByPath(globalCoreParams.value, key)
        : getByPath(params, key)
      const label = isGlobalCoreParamKey(key)
        ? getGlobalCoreParamsFieldLabel(key)
        : getTopologyDisplayFieldLabel(layerId, 'params', key, kind, role)
      const displayText = isGlobalCoreParamKey(key)
        ? getGlobalCoreParamsValueLabel(key, value)
        : getTopologyDisplayValueLabel(layerId, 'params', key, value, kind, role)
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

type MiddleViewMode = 'graph' | 'json'
const middleViewMode = ref<MiddleViewMode>('graph')

/** 根据节点取对应的 params/config（与侧边栏编辑一致） */
function getNodeParamsConfig(node: TopologyNode): { params: Record<string, unknown>; config: Record<string, unknown> } {
  const layerId = node.layerId
  if (layerId === 'dependency' && node.id) {
    return {
      params: { ...(dependencyNodeParams.value[node.id] ?? {}) },
      config: { ...(dependencyNodeConfig.value[node.id] ?? {}) },
    }
  }
  switch (layerId) {
    case 'client':
      return { params: { ...clientParams.value } as Record<string, unknown>, config: {} }
    case 'access':
      return { params: { ...accessParams.value } as Record<string, unknown>, config: {} }
    case 'host':
      return {
        params: { ...hostParams.value } as Record<string, unknown>,
        config: { ...hostConfig.value } as Record<string, unknown>,
      }
    case 'runtime':
      return {
        params: { ...runtimeParams.value } as Record<string, unknown>,
        config: { ...runtimeConfig.value } as Record<string, unknown>,
      }
    default:
      return { params: {}, config: {} }
  }
}

/** 当前拓扑的 JSON 展示（含全局参数与每个节点上的 params/config） */
const topologyJson = computed(() => {
  const payload = {
    globalCoreParams: { ...globalCoreParams.value } as Record<string, unknown>,
    nodes: topology.value.nodes.map((node) => {
      const { params, config } = getNodeParamsConfig(node)
      return { ...node, params, config }
    }),
    edges: topology.value.edges,
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

/** 当前编辑的节点（点击拓扑图节点时设置；依赖层需据此取 kind 与节点 params/config） */
const editingNode = ref<TopologyNode | null>(null)

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
}

function onEdit(node: TopologyNode) {
  editingNode.value = node
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
  store.removeEdge(edgeId)
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
          <div class="card-header-row">
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
            <div class="global-params-inline">
              <span class="global-params-label">全局核心参数</span>
              <NSelect :value="globalCoreParams.businessScenario" :options="GLOBAL_BUSINESS_SCENARIO_OPTIONS"
                size="small" style="width: 140px"
                @update:value="onGlobalBusinessScenarioChange" />
            </div>
          </div>
        </template>
        <template #header-extra>
          <NButton v-if="middleViewMode === 'json'" size="tiny" secondary @click="copyJson">
            复制
          </NButton>
        </template>
        <div class="middle-content">
          <TopologyDiagram v-show="middleViewMode === 'graph'" :nodes="nodes" :edges="edges"
            :layer-display-fields="layerDisplayFields" :node-port-config="nodePortConfig"
            :visible="middleViewMode === 'graph'" :can-undo="canUndo" :can-redo="canRedo"
            :selected-node-id="selectedNodeId"
            @remove="onRemove" @edit="onEdit" @select="onSelect" @drop="onDropFromPalette"
            @node-moved="onNodeMoved" @edge-vertices-changed="onEdgeVerticesChanged"
            @edge-connected="onEdgeConnected" @edge-removed="onEdgeRemoved" @undo="store.undo" @redo="store.redo" />
          <div v-show="middleViewMode === 'json'" class="json-view">
            <NCode :code="topologyJson" language="json" word-wrap />
          </div>
        </div>
      </NCard>
      <aside class="panel-right">
        <div v-if="editingNode" class="panel-right-inner">
          <LayerEditorPanel :layer-id="editingNode.layerId" :editing-node="editingNode" @close="editingNode = null" />
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

.card-header-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.global-params-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.global-params-label {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.panel-placeholder {
  padding: 1.5rem 1.25rem;
}
</style>
