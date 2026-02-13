import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getLayerLabel,
  getLayerOrder,
  getLayerMaxCount,
  getDependencyNodeTypeLabel,
  getDependencyClientServer,
  getDefaultParams,
  getDefaultConfig,
  getDefaultGlobalCoreParams,
  validateEdge,
} from '@/registry/layers'
import type {
  GlobalCoreParams,
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
  DependencyRole,
} from '@/types/layers'

/** 完整拓扑状态（与导出的 JSON 一致，用于撤销/重做） */
export interface TopologyFullState {
  globalCoreParams: GlobalCoreParams
  topology: Topology
  clientParams: ClientLayerParams
  accessParams: AccessLayerParams
  hostParams: HostLayerParams
  hostConfig: HostLayerConfig
  runtimeParams: RuntimeParams
  runtimeConfig: RuntimeConfig
  dependencyNodeParams: Record<string, Record<string, unknown>>
  dependencyNodeConfig: Record<string, Record<string, unknown>>
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}

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

function computeLabel(opts: AddNodeOptions, role?: DependencyRole): string {
  if (opts.label) return opts.label
  if (opts.layerId === 'dependency' && opts.dependencyKind) {
    const base = getDependencyNodeTypeLabel(opts.dependencyKind)
    if (role === 'server') return `${base} — Server`
    if (role === 'client') return `${base} — Client`
    return base
  }
  return getLayerLabel(opts.layerId)
}

export const useTopologyStore = defineStore('topology', () => {
  const topology = ref<Topology>(buildDefaultTopology())

  const globalCoreParams = ref<GlobalCoreParams>(getDefaultGlobalCoreParams())
  const clientParams = ref<ClientLayerParams>(getDefaultParams('client') as ClientLayerParams)
  const accessParams = ref<AccessLayerParams>(getDefaultParams('access') as AccessLayerParams)

  const hostParams = ref<HostLayerParams>(getDefaultParams('host') as HostLayerParams)
  const hostConfig = ref<HostLayerConfig>(getDefaultConfig('host') as HostLayerConfig)

  const runtimeParams = ref<RuntimeParams>(getDefaultParams('runtime') as RuntimeParams)
  const runtimeConfig = ref<RuntimeConfig>(getDefaultConfig('runtime') as RuntimeConfig)

  /** 依赖层按节点 id 存储核心参数/配置，每种子类型用各自 schema 的默认值 */
  const dependencyNodeParams = ref<Record<string, Record<string, unknown>>>({})
  const dependencyNodeConfig = ref<Record<string, Record<string, unknown>>>({})

  /** 撤销/重做：针对完整 JSON 状态（拓扑 + 所有节点 params/config） */
  const historyPast = ref<TopologyFullState[]>([])
  const historyFuture = ref<TopologyFullState[]>([])
  const HISTORY_MAX = 50

  function getFullState(): TopologyFullState {
    return {
      globalCoreParams: globalCoreParams.value,
      topology: topology.value,
      clientParams: clientParams.value,
      accessParams: accessParams.value,
      hostParams: hostParams.value,
      hostConfig: hostConfig.value,
      runtimeParams: runtimeParams.value,
      runtimeConfig: runtimeConfig.value,
      dependencyNodeParams: dependencyNodeParams.value,
      dependencyNodeConfig: dependencyNodeConfig.value,
    }
  }

  function setFullState(s: TopologyFullState): void {
    const c = deepClone(s)
    globalCoreParams.value = c.globalCoreParams
    topology.value = c.topology
    clientParams.value = c.clientParams
    accessParams.value = c.accessParams
    hostParams.value = c.hostParams
    hostConfig.value = c.hostConfig
    runtimeParams.value = c.runtimeParams
    runtimeConfig.value = c.runtimeConfig
    dependencyNodeParams.value = c.dependencyNodeParams
    dependencyNodeConfig.value = c.dependencyNodeConfig
  }

  /** 在发生变更前调用，将当前状态压入历史（并清空 redo 栈） */
  function pushState(): void {
    const snapshot = deepClone(getFullState())
    historyPast.value = [...historyPast.value.slice(-(HISTORY_MAX - 1)), snapshot]
    historyFuture.value = []
  }

  function undo(): void {
    const prev = historyPast.value[historyPast.value.length - 1]
    if (!prev) return
    historyPast.value = historyPast.value.slice(0, -1)
    historyFuture.value = [deepClone(getFullState()), ...historyFuture.value]
    setFullState(prev)
  }

  function redo(): void {
    const next = historyFuture.value[0]
    if (!next) return
    historyFuture.value = historyFuture.value.slice(1)
    historyPast.value = [...historyPast.value, deepClone(getFullState())]
    setFullState(next)
  }

  const canUndo = computed(() => historyPast.value.length > 0)
  const canRedo = computed(() => historyFuture.value.length > 0)

  /** 用户从端口拖拽创建的新连线（由用户自行操作）；不符合节点输入输出规则时返回 { ok: false, message } */
  function addEdge(
    sourceId: string,
    targetId: string
  ): { ok: true; edge: TopologyEdge } | { ok: false; message: string } {
    const nodeIds = new Set(topology.value.nodes.map((n) => n.id))
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) {
      return { ok: false, message: '源节点或目标节点不存在' }
    }
    const sourceNode = topology.value.nodes.find((n) => n.id === sourceId)
    const targetNode = topology.value.nodes.find((n) => n.id === targetId)
    if (!sourceNode || !targetNode) {
      return { ok: false, message: '源节点或目标节点不存在' }
    }
    const validation = validateEdge(
      { layerId: sourceNode.layerId, dependencyKind: sourceNode.dependencyKind },
      { layerId: targetNode.layerId, dependencyKind: targetNode.dependencyKind },
    )
    if (!validation.valid) {
      return { ok: false, message: validation.message ?? '不允许该连线' }
    }
    if (topology.value.edges.some((e) => e.source === sourceId && e.target === targetId)) {
      return { ok: false, message: '该连线已存在' }
    }
    pushState()
    const id = nextEdgeId(sourceId, targetId)
    const edge: TopologyEdge = { id, source: sourceId, target: targetId }
    topology.value = {
      ...topology.value,
      edges: [...topology.value.edges, edge],
    }
    return { ok: true, edge }
  }

  /** 更新连线顶点（用户拖拽连线路径后持久化） */
  function updateEdgeVertices(edgeId: string, vertices: { x: number; y: number }[]): void {
    pushState()
    const edges = topology.value.edges.map((e) =>
      e.id === edgeId ? { ...e, vertices: vertices.length > 0 ? vertices : undefined } : e
    )
    topology.value = { ...topology.value, edges }
  }

  /** 在指定节点之后插入新节点，或当 afterNodeId 为空时在末尾追加依赖节点；client_and_server 时一次创建 Server+Client 两节点并关联，不自动连线 */
  function addNodeAfter(afterNodeId: string | null, opts: AddNodeOptions): TopologyNode | null {
    const effectiveOpts: AddNodeOptions = { ...opts, layerId: 'dependency' }
    const kind = effectiveOpts.dependencyKind
    if (!kind) return null
    pushState()
    const clientServer = getDependencyClientServer(kind)
    const list = topology.value.nodes
    const edges = topology.value.edges
    const toInsert: TopologyNode[] = []

    if (clientServer === 'client_and_server') {
      const groupId = `dep-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const serverNode: TopologyNode = {
        id: nextNodeId(),
        layerId: 'dependency',
        label: computeLabel(effectiveOpts, 'server'),
        nodeSource: 'user',
        dependencyKind: kind,
        dependencyRole: 'server',
        dependencyGroupId: groupId,
      }
      const clientNode: TopologyNode = {
        id: nextNodeId(),
        layerId: 'dependency',
        label: computeLabel(effectiveOpts, 'client'),
        nodeSource: 'user',
        dependencyKind: kind,
        dependencyRole: 'client',
        dependencyGroupId: groupId,
      }
      dependencyNodeParams.value = {
        ...dependencyNodeParams.value,
        [serverNode.id]: (getDefaultParams('dependency', kind, 'server') as Record<string, unknown>) ?? {},
        [clientNode.id]: (getDefaultParams('dependency', kind, 'client') as Record<string, unknown>) ?? {},
      }
      dependencyNodeConfig.value = {
        ...dependencyNodeConfig.value,
        [serverNode.id]: (getDefaultConfig('dependency', kind, 'server') as Record<string, unknown>) ?? {},
        [clientNode.id]: (getDefaultConfig('dependency', kind, 'client') as Record<string, unknown>) ?? {},
      }
      toInsert.push(serverNode, clientNode)
      const groupEdge: TopologyEdge = {
        id: nextEdgeId(clientNode.id, serverNode.id),
        source: clientNode.id,
        target: serverNode.id,
      }
      edges.push(groupEdge)
    } else {
      const node: TopologyNode = {
        id: nextNodeId(),
        layerId: 'dependency',
        label: computeLabel(effectiveOpts),
        nodeSource: 'user',
        dependencyKind: kind,
      }
      dependencyNodeParams.value = {
        ...dependencyNodeParams.value,
        [node.id]: (getDefaultParams('dependency', kind) as Record<string, unknown>) ?? {},
      }
      dependencyNodeConfig.value = {
        ...dependencyNodeConfig.value,
        [node.id]: (getDefaultConfig('dependency', kind) as Record<string, unknown>) ?? {},
      }
      toInsert.push(node)
    }

    let nodes: TopologyNode[]
    if (afterNodeId != null) {
      const idx = list.findIndex((n) => n.id === afterNodeId)
      if (idx < 0) return null
      nodes = [...list]
      nodes.splice(idx + 1, 0, ...toInsert)
    } else {
      nodes = [...list, ...toInsert]
    }
    topology.value = { nodes, edges: [...edges] }
    return toInsert[0] ?? null
  }

  /** 将「层」节点插入拓扑（不自动连线）；若该层已达上限则返回 null */
  function addLayerNode(layerId: 'client' | 'access' | 'host' | 'runtime'): TopologyNode | null {
    const LAYER_ORDER = getLayerOrder()
    const max = getLayerMaxCount(layerId)
    const current = topology.value.nodes.filter((n) => n.layerId === layerId).length
    if (current >= max) return null
    pushState()
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

  /** 依赖层同组节点在拓扑图中的卡片宽度与水平间距（与 TopologyDiagram 的 CARD_WIDTH、GROUP_CLIENT_SERVER_GAP 一致，用于拖动联动） */
  const DEPENDENCY_GROUP_CARD_WIDTH = 260
  const DEPENDENCY_GROUP_HORIZONTAL_GAP = 72

  /** 更新节点位置（手动拖动后持久化）；若为 client_and_server 组内节点则联动更新另一节点位置 */
  function updateNodePosition(nodeId: string, x: number, y: number): void {
    pushState()
    const node = topology.value.nodes.find((n) => n.id === nodeId)
    const nodes = topology.value.nodes.map((n) => {
      if (n.id === nodeId) return { ...n, x, y }
      if (node?.dependencyGroupId && n.dependencyGroupId === node.dependencyGroupId) {
        const dx =
          node.dependencyRole === 'server'
            ? DEPENDENCY_GROUP_CARD_WIDTH + DEPENDENCY_GROUP_HORIZONTAL_GAP
            : -(DEPENDENCY_GROUP_CARD_WIDTH + DEPENDENCY_GROUP_HORIZONTAL_GAP)
        return { ...n, x: x + dx, y }
      }
      return n
    })
    topology.value = { ...topology.value, nodes }
  }

  /** 删除用户添加的节点，并移除以该节点为端点的连线。Server 节点不可单独删除（随 Client）；删 Client 时同组 Server 一并删除。 */
  function removeNode(nodeId: string): boolean {
    const node = topology.value.nodes.find((n) => n.id === nodeId)
    if (!node || node.nodeSource !== 'user') return false
    if (node.layerId === 'dependency' && node.dependencyRole === 'server' && node.dependencyGroupId) {
      return false
    }
    pushState()
    const toRemove = new Set<string>([nodeId])
    if (node.layerId === 'dependency' && node.dependencyRole === 'client' && node.dependencyGroupId) {
      const serverNode = topology.value.nodes.find(
        (n) => n.dependencyGroupId === node.dependencyGroupId && n.dependencyRole === 'server',
      )
      if (serverNode) toRemove.add(serverNode.id)
    }
    const nodes = topology.value.nodes.filter((n) => !toRemove.has(n.id))
    const edges = topology.value.edges.filter(
      (e) => !toRemove.has(e.source) && !toRemove.has(e.target),
    )
    topology.value = { nodes, edges }
    if (node.layerId === 'dependency' || toRemove.size > 1) {
      const nextParams = { ...dependencyNodeParams.value }
      const nextConfig = { ...dependencyNodeConfig.value }
      toRemove.forEach((id) => {
        delete nextParams[id]
        delete nextConfig[id]
      })
      dependencyNodeParams.value = nextParams
      dependencyNodeConfig.value = nextConfig
    }
    return true
  }

  function resetGlobalCoreParams() {
    pushState()
    globalCoreParams.value = getDefaultGlobalCoreParams()
  }

  function resetClient() {
    pushState()
    clientParams.value = getDefaultParams('client') as ClientLayerParams
  }

  function resetHost() {
    pushState()
    hostParams.value = getDefaultParams('host') as HostLayerParams
    hostConfig.value = getDefaultConfig('host') as HostLayerConfig
  }

  function resetRuntime() {
    pushState()
    runtimeParams.value = getDefaultParams('runtime') as RuntimeParams
    runtimeConfig.value = getDefaultConfig('runtime') as RuntimeConfig
  }

  function resetDependencyNode(nodeId: string) {
    const node = topology.value.nodes.find((n) => n.id === nodeId)
    if (!node || node.layerId !== 'dependency' || !node.dependencyKind) return
    pushState()
    const role = node.dependencyRole
    dependencyNodeParams.value = {
      ...dependencyNodeParams.value,
      [nodeId]: (getDefaultParams('dependency', node.dependencyKind, role) as Record<string, unknown>) ?? {},
    }
    dependencyNodeConfig.value = {
      ...dependencyNodeConfig.value,
      [nodeId]: (getDefaultConfig('dependency', node.dependencyKind, role) as Record<string, unknown>) ?? {},
    }
  }

  return {
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
    pushState,
    undo,
    redo,
    addNodeAfter,
    addLayerNode,
    addEdge,
    updateNodePosition,
    updateEdgeVertices,
    removeNode,
    resetGlobalCoreParams,
    resetClient,
    resetHost,
    resetRuntime,
    resetDependencyNode,
  }
})
