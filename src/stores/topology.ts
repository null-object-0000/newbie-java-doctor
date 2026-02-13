import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getLayerLabels,
  getLayerLabel,
  getLayerOrder,
  getLayerMaxCount,
  getDependencyNodeTypeLabel,
  getDependencyKindLabels,
  getDefaultParams,
  getDefaultConfig,
} from '@/registry/layers'
import type {
  ClientLayerParams,
  AccessLayerParams,
  HostLayerParams,
  HostLayerConfig,
  RuntimeParams,
  RuntimeConfig,
  Topology,
  TopologyNode,
  TopologyEdge,
  AddNodeOptions,
  LayerId,
  DependencyKind,
} from '@/types/layers'

/** 默认拓扑为空，节点与连线均由用户拖入并自行连接 */
function buildDefaultTopology(): Topology {
  return { nodes: [], edges: [] }
}

function nextNodeId(): string {
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function nextEdgeId(source: string, target: string): string {
  return `e-${source}-${target}`
}

function computeLabel(opts: AddNodeOptions): string {
  if (opts.label) return opts.label
  if (opts.layerId === 'dependency' && opts.dependencyKind) {
    if (opts.dependencyKind === 'http_api' || opts.dependencyKind === 'custom') {
      return opts.customLabel?.trim() || getDependencyNodeTypeLabel(opts.dependencyKind)
    }
    return getDependencyNodeTypeLabel(opts.dependencyKind)
  }
  return getLayerLabel(opts.layerId)
}

export const useTopologyStore = defineStore('topology', () => {
  const topology = ref<Topology>(buildDefaultTopology())

  const clientParams = ref<ClientLayerParams>(getDefaultParams('client') as ClientLayerParams)
  const accessParams = ref<AccessLayerParams>(getDefaultParams('access') as AccessLayerParams)

  const hostParams = ref<HostLayerParams>(getDefaultParams('host') as HostLayerParams)
  const hostConfig = ref<HostLayerConfig>(getDefaultConfig('host') as HostLayerConfig)

  const runtimeParams = ref<RuntimeParams>(getDefaultParams('runtime') as RuntimeParams)
  const runtimeConfig = ref<RuntimeConfig>(getDefaultConfig('runtime') as RuntimeConfig)

  /** 依赖层按节点 id 存储核心参数/配置，每种子类型用各自 schema 的默认值 */
  const dependencyNodeParams = ref<Record<string, Record<string, unknown>>>({})
  const dependencyNodeConfig = ref<Record<string, Record<string, unknown>>>({})

  const layerLabels = computed(() => getLayerLabels())

  /** 按 nodes 顺序重建线性边（保留已有边的 vertices） */
  function syncEdgesFromOrder(): void {
    const list = topology.value.nodes
    const oldEdges = topology.value.edges
    const edges: TopologyEdge[] = []
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i]
      const b = list[i + 1]
      if (a && b) {
        const id = nextEdgeId(a.id, b.id)
        const prev = oldEdges.find((e) => e.source === a.id && e.target === b.id)
        edges.push({
          id,
          source: a.id,
          target: b.id,
          ...(prev?.vertices && prev.vertices.length > 0 ? { vertices: prev.vertices } : {}),
        })
      }
    }
    topology.value = { ...topology.value, edges }
  }

  /** 用户从端口拖拽创建的新连线（由用户自行操作） */
  function addEdge(sourceId: string, targetId: string): TopologyEdge | null {
    const nodeIds = new Set(topology.value.nodes.map((n) => n.id))
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) return null
    const id = nextEdgeId(sourceId, targetId)
    if (topology.value.edges.some((e) => e.source === sourceId && e.target === targetId)) return null
    const edge: TopologyEdge = { id, source: sourceId, target: targetId }
    topology.value = {
      ...topology.value,
      edges: [...topology.value.edges, edge],
    }
    return edge
  }

  /** 更新连线顶点（用户拖拽连线路径后持久化） */
  function updateEdgeVertices(edgeId: string, vertices: { x: number; y: number }[]): void {
    const edges = topology.value.edges.map((e) =>
      e.id === edgeId ? { ...e, vertices: vertices.length > 0 ? vertices : undefined } : e
    )
    topology.value = { ...topology.value, edges }
  }

  /** 在指定节点之后插入新节点，或当 afterNodeId 为空时在末尾追加依赖节点；不自动连线 */
  function addNodeAfter(afterNodeId: string | null, opts: AddNodeOptions): TopologyNode | null {
    const effectiveOpts: AddNodeOptions = { ...opts, layerId: 'dependency' }
    const kind = effectiveOpts.dependencyKind
    const node: TopologyNode = {
      id: nextNodeId(),
      layerId: 'dependency',
      label: computeLabel(effectiveOpts),
      nodeSource: 'user',
      dependencyKind: kind,
      customLabel: effectiveOpts.customLabel,
    }
    if (kind) {
      dependencyNodeParams.value = {
        ...dependencyNodeParams.value,
        [node.id]: (getDefaultParams('dependency', kind) as Record<string, unknown>) ?? {},
      }
      dependencyNodeConfig.value = {
        ...dependencyNodeConfig.value,
        [node.id]: (getDefaultConfig('dependency', kind) as Record<string, unknown>) ?? {},
      }
    }
    const list = topology.value.nodes
    const edges = topology.value.edges
    let nodes: TopologyNode[]
    if (afterNodeId != null) {
      const idx = list.findIndex((n) => n.id === afterNodeId)
      if (idx < 0) return null
      nodes = [...list]
      nodes.splice(idx + 1, 0, node)
    } else {
      nodes = [...list, node]
    }
    topology.value = { nodes, edges }
    return node
  }

  /** 将“层”节点插入拓扑（不自动连线）；若该层已达上限则返回 null */
  function addLayerNode(layerId: 'client' | 'access' | 'host' | 'runtime'): TopologyNode | null {
    const LAYER_ORDER = getLayerOrder()
    const max = getLayerMaxCount(layerId)
    const current = topology.value.nodes.filter((n) => n.layerId === layerId).length
    if (current >= max) return null
    const orderIdx = LAYER_ORDER.indexOf(layerId)
    const list = topology.value.nodes
    let insertAt = 0
    for (let i = 0; i < list.length; i++) {
      const node = list[i]
      if (node && LAYER_ORDER.indexOf(node.layerId) <= orderIdx) insertAt = i + 1
    }
    const node: TopologyNode = {
      id: nextNodeId(),
      layerId,
      label: getLayerLabel(layerId),
      nodeSource: 'user',
    }
    const nodes = [...list]
    nodes.splice(insertAt, 0, node)
    topology.value = { nodes, edges: topology.value.edges }
    return node
  }

  /** 更新节点位置（手动拖动后持久化） */
  function updateNodePosition(nodeId: string, x: number, y: number): void {
    const nodes = topology.value.nodes.map((n) =>
      n.id === nodeId ? { ...n, x, y } : n
    )
    topology.value = { ...topology.value, nodes }
  }

  /** 删除用户添加的节点，并移除以该节点为端点的连线 */
  function removeNode(nodeId: string): boolean {
    const node = topology.value.nodes.find((n) => n.id === nodeId)
    if (!node || node.nodeSource !== 'user') return false
    const nodes = topology.value.nodes.filter((n) => n.id !== nodeId)
    const edges = topology.value.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId
    )
    topology.value = { nodes, edges }
    if (node.layerId === 'dependency') {
      const nextParams = { ...dependencyNodeParams.value }
      const nextConfig = { ...dependencyNodeConfig.value }
      delete nextParams[nodeId]
      delete nextConfig[nodeId]
      dependencyNodeParams.value = nextParams
      dependencyNodeConfig.value = nextConfig
    }
    return true
  }

  function resetClient() {
    clientParams.value = getDefaultParams('client') as ClientLayerParams
  }

  function resetHost() {
    hostParams.value = getDefaultParams('host') as HostLayerParams
    hostConfig.value = getDefaultConfig('host') as HostLayerConfig
  }

  function resetRuntime() {
    runtimeParams.value = getDefaultParams('runtime') as RuntimeParams
    runtimeConfig.value = getDefaultConfig('runtime') as RuntimeConfig
  }

  function resetDependencyNode(nodeId: string) {
    const node = topology.value.nodes.find((n) => n.id === nodeId)
    if (!node || node.layerId !== 'dependency' || !node.dependencyKind) return
    dependencyNodeParams.value = {
      ...dependencyNodeParams.value,
      [nodeId]: (getDefaultParams('dependency', node.dependencyKind) as Record<string, unknown>) ?? {},
    }
    dependencyNodeConfig.value = {
      ...dependencyNodeConfig.value,
      [nodeId]: (getDefaultConfig('dependency', node.dependencyKind) as Record<string, unknown>) ?? {},
    }
  }

  return {
    topology,
    clientParams,
    accessParams,
    hostParams,
    hostConfig,
    runtimeParams,
    runtimeConfig,
    dependencyNodeParams,
    dependencyNodeConfig,
    layerLabels,
    addNodeAfter,
    addLayerNode,
    addEdge,
    syncEdgesFromOrder,
    updateNodePosition,
    updateEdgeVertices,
    removeNode,
    resetClient,
    resetHost,
    resetRuntime,
    resetDependencyNode,
  }
})

/** 兼容：层/依赖类型展示名（只读快照，扩展请用 registry） */
export const LAYER_LABELS = getLayerLabels()
export const DEPENDENCY_KIND_LABELS = getDependencyKindLabels()
