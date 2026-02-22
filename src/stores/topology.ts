import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import {
  getLayerLabel,
  getLayerOrder,
  getLayerMaxCount,
  getDependencyNodeTypeLabel,
  getDependencyClientServer,
  getDefaultConstraints,
  getDefaultObjectives,
  getDefaultTunables,
  validateEdge,
  getEdgeDefaultParams,
  getEdgeParamsSchema,
} from '@/registry/layers'
import type {
  Topology,
  TopologyNode,
  TopologyEdge,
  AddNodeOptions,
  DependencyRole,
} from '@/types/layers'
import { deepClone } from '@/utils/clone'

/** 完整拓扑状态（用于撤销/重做与 JSON 导出） */
export interface TopologyFullState {
  topology: Topology
  /** 所有节点的环境约束，按 nodeId 索引 */
  nodeConstraints: Record<string, Record<string, unknown>>
  /** 所有节点的负载目标，按 nodeId 索引 */
  nodeObjectives: Record<string, Record<string, unknown>>
  /** 所有节点的可调配置，按 nodeId 索引 */
  nodeTunables: Record<string, Record<string, unknown>>
  /** 连线参数，按 edgeId 索引 */
  edgeParams: Record<string, Record<string, unknown>>
}

const STORAGE_KEY = 'newbie-java-doctor:topology'
const AUTOSAVE_DEBOUNCE_MS = 800

function loadFromStorage(): TopologyFullState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed.topology?.nodes || !parsed.topology?.edges) return null

    // 兼容旧格式：nodeParams/nodeConfig → nodeConstraints/nodeObjectives/nodeTunables
    if ('nodeParams' in parsed && !('nodeConstraints' in parsed)) {
      parsed.nodeConstraints = parsed.nodeParams ?? {}
      parsed.nodeObjectives = {}
      parsed.nodeTunables = parsed.nodeConfig ?? {}
      delete parsed.nodeParams
      delete parsed.nodeConfig
    }

    return parsed as TopologyFullState
  } catch {
    return null
  }
}

const DEFAULT_NODE_IDS = {
  client: 'n-client-default',
  host: 'n-host-default',
  runtime: 'n-runtime-default',
} as const

const DEFAULT_LAYOUT = { x: 0, clientY: 0, hostY: 250, runtimeY: 500 }

function buildDefaultTopology(): Topology {
  const clientId = DEFAULT_NODE_IDS.client
  const hostId = DEFAULT_NODE_IDS.host
  const runtimeId = DEFAULT_NODE_IDS.runtime
  const { x, clientY, hostY, runtimeY } = DEFAULT_LAYOUT
  const nodes: TopologyNode[] = [
    { id: clientId, layerId: 'client', label: getLayerLabel('client'), nodeSource: 'default', x, y: clientY },
    { id: hostId, layerId: 'host', label: getLayerLabel('host'), nodeSource: 'default', x, y: hostY },
    { id: runtimeId, layerId: 'runtime', label: getLayerLabel('runtime'), nodeSource: 'default', x, y: runtimeY },
  ]
  const edges: TopologyEdge[] = [
    { id: nextEdgeId(clientId, hostId), source: clientId, target: hostId },
    { id: nextEdgeId(hostId, runtimeId), source: hostId, target: runtimeId },
  ]
  return { nodes, edges }
}

function buildDefaultNodeConstraints(): Record<string, Record<string, unknown>> {
  return {
    [DEFAULT_NODE_IDS.host]: (getDefaultConstraints('host') as Record<string, unknown>) ?? {},
    [DEFAULT_NODE_IDS.runtime]: (getDefaultConstraints('runtime') as Record<string, unknown>) ?? {},
  }
}

function buildDefaultNodeObjectives(): Record<string, Record<string, unknown>> {
  return {
    [DEFAULT_NODE_IDS.client]: (getDefaultObjectives('client') as Record<string, unknown>) ?? {},
    [DEFAULT_NODE_IDS.runtime]: (getDefaultObjectives('runtime') as Record<string, unknown>) ?? {},
  }
}

function buildDefaultNodeTunables(): Record<string, Record<string, unknown>> {
  return {
    [DEFAULT_NODE_IDS.host]: (getDefaultTunables('host') as Record<string, unknown>) ?? {},
    [DEFAULT_NODE_IDS.runtime]: (getDefaultTunables('runtime') as Record<string, unknown>) ?? {},
  }
}

function getDefaultTopologyEdgeParams(topology: Topology): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {}
  for (const e of topology.edges) {
    const src = topology.nodes.find((n) => n.id === e.source)
    const tgt = topology.nodes.find((n) => n.id === e.target)
    if (src && tgt) {
      const def = getEdgeDefaultParams(src.layerId, tgt.layerId)
      if (Object.keys(def).length > 0) result[e.id] = def
    }
  }
  return result
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

/** 根据节点信息获取该节点的默认 constraints */
function getNodeDefaultConstraints(node: TopologyNode): Record<string, unknown> {
  if (node.layerId === 'dependency' && node.dependencyKind) {
    return (getDefaultConstraints('dependency', node.dependencyKind, node.dependencyRole) as Record<string, unknown>) ?? {}
  }
  return (getDefaultConstraints(node.layerId) as Record<string, unknown>) ?? {}
}

/** 根据节点信息获取该节点的默认 objectives */
function getNodeDefaultObjectives(node: TopologyNode): Record<string, unknown> {
  if (node.layerId === 'dependency' && node.dependencyKind) {
    return (getDefaultObjectives('dependency', node.dependencyKind, node.dependencyRole) as Record<string, unknown>) ?? {}
  }
  return (getDefaultObjectives(node.layerId) as Record<string, unknown>) ?? {}
}

/** 根据节点信息获取该节点的默认 tunables */
function getNodeDefaultTunables(node: TopologyNode): Record<string, unknown> {
  if (node.layerId === 'dependency' && node.dependencyKind) {
    return (getDefaultTunables('dependency', node.dependencyKind, node.dependencyRole) as Record<string, unknown>) ?? {}
  }
  return (getDefaultTunables(node.layerId) as Record<string, unknown>) ?? {}
}

export const useTopologyStore = defineStore('topology', () => {
  const saved = loadFromStorage()
  const defaultTopology = buildDefaultTopology()

  const topology = ref<Topology>(saved?.topology ?? defaultTopology)

  /** 所有节点的环境约束，按 nodeId 索引 */
  const nodeConstraints = ref<Record<string, Record<string, unknown>>>(
    saved?.nodeConstraints ?? buildDefaultNodeConstraints(),
  )
  /** 所有节点的负载目标，按 nodeId 索引 */
  const nodeObjectives = ref<Record<string, Record<string, unknown>>>(
    saved?.nodeObjectives ?? buildDefaultNodeObjectives(),
  )
  /** 所有节点的可调配置，按 nodeId 索引 */
  const nodeTunables = ref<Record<string, Record<string, unknown>>>(
    saved?.nodeTunables ?? buildDefaultNodeTunables(),
  )

  /** 连线参数，按 edgeId 索引 */
  const edgeParams = ref<Record<string, Record<string, unknown>>>(
    saved?.edgeParams ?? getDefaultTopologyEdgeParams(defaultTopology),
  )

  // ========== 撤销/重做 ==========
  const historyPast = ref<TopologyFullState[]>([])
  const historyFuture = ref<TopologyFullState[]>([])
  const HISTORY_MAX = 50

  function getFullState(): TopologyFullState {
    return {
      topology: topology.value,
      nodeConstraints: nodeConstraints.value,
      nodeObjectives: nodeObjectives.value,
      nodeTunables: nodeTunables.value,
      edgeParams: edgeParams.value,
    }
  }

  function setFullState(s: TopologyFullState): void {
    const c = deepClone(s)
    topology.value = c.topology
    nodeConstraints.value = c.nodeConstraints ?? {}
    nodeObjectives.value = c.nodeObjectives ?? {}
    nodeTunables.value = c.nodeTunables ?? {}
    edgeParams.value = c.edgeParams ?? {}
  }

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

  // ========== 连线操作 ==========

  function addEdge(
    sourceId: string,
    targetId: string,
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
    const defaultEdge = getEdgeDefaultParams(sourceNode.layerId, targetNode.layerId)
    if (Object.keys(defaultEdge).length > 0) {
      edgeParams.value = { ...edgeParams.value, [id]: defaultEdge }
    }
    return { ok: true, edge }
  }

  function removeEdge(edgeId: string): void {
    const edge = topology.value.edges.find((e) => e.id === edgeId)
    if (!edge) return
    pushState()
    topology.value = {
      ...topology.value,
      edges: topology.value.edges.filter((e) => e.id !== edgeId),
    }
    if (edgeParams.value[edgeId]) {
      const next = { ...edgeParams.value }
      delete next[edgeId]
      edgeParams.value = next
    }
  }

  function updateEdgeVertices(edgeId: string, vertices: { x: number; y: number }[]): void {
    pushState()
    const edges = topology.value.edges.map((e) =>
      e.id === edgeId ? { ...e, vertices: vertices.length > 0 ? vertices : undefined } : e,
    )
    topology.value = { ...topology.value, edges }
  }

  // ========== 节点操作 ==========

  /** 在指定节点之后插入依赖节点；client_and_server 时一次创建 Server+Client 两节点并关联 */
  function addNodeAfter(afterNodeId: string | null, opts: AddNodeOptions, dropX?: number, dropY?: number): TopologyNode | null {
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
        x: dropX,
        y: dropY,
      }
      nodeConstraints.value = {
        ...nodeConstraints.value,
        [serverNode.id]: (getDefaultConstraints('dependency', kind, 'server') as Record<string, unknown>) ?? {},
        [clientNode.id]: (getDefaultConstraints('dependency', kind, 'client') as Record<string, unknown>) ?? {},
      }
      nodeObjectives.value = {
        ...nodeObjectives.value,
        [serverNode.id]: (getDefaultObjectives('dependency', kind, 'server') as Record<string, unknown>) ?? {},
        [clientNode.id]: (getDefaultObjectives('dependency', kind, 'client') as Record<string, unknown>) ?? {},
      }
      nodeTunables.value = {
        ...nodeTunables.value,
        [serverNode.id]: (getDefaultTunables('dependency', kind, 'server') as Record<string, unknown>) ?? {},
        [clientNode.id]: (getDefaultTunables('dependency', kind, 'client') as Record<string, unknown>) ?? {},
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
        x: dropX,
        y: dropY,
      }
      nodeConstraints.value = {
        ...nodeConstraints.value,
        [node.id]: (getDefaultConstraints('dependency', kind) as Record<string, unknown>) ?? {},
      }
      nodeObjectives.value = {
        ...nodeObjectives.value,
        [node.id]: (getDefaultObjectives('dependency', kind) as Record<string, unknown>) ?? {},
      }
      nodeTunables.value = {
        ...nodeTunables.value,
        [node.id]: (getDefaultTunables('dependency', kind) as Record<string, unknown>) ?? {},
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
  function addLayerNode(layerId: 'client' | 'access' | 'host' | 'runtime', dropX?: number, dropY?: number): TopologyNode | null {
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
      x: dropX,
      y: dropY,
    }
    const nodes = [...list]
    nodes.splice(insertAt, 0, node)
    topology.value = { nodes, edges: topology.value.edges }

    const defaultC = (getDefaultConstraints(layerId) as Record<string, unknown>) ?? {}
    if (Object.keys(defaultC).length > 0) {
      nodeConstraints.value = { ...nodeConstraints.value, [node.id]: defaultC }
    }
    const defaultO = (getDefaultObjectives(layerId) as Record<string, unknown>) ?? {}
    if (Object.keys(defaultO).length > 0) {
      nodeObjectives.value = { ...nodeObjectives.value, [node.id]: defaultO }
    }
    const defaultT = (getDefaultTunables(layerId) as Record<string, unknown>) ?? {}
    if (Object.keys(defaultT).length > 0) {
      nodeTunables.value = { ...nodeTunables.value, [node.id]: defaultT }
    }

    return node
  }

  const DEPENDENCY_GROUP_CARD_WIDTH = 260
  const DEPENDENCY_GROUP_HORIZONTAL_GAP = 72

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
    const removedEdgeIds = new Set(
      topology.value.edges
        .filter((e) => toRemove.has(e.source) || toRemove.has(e.target))
        .map((e) => e.id),
    )
    const edges = topology.value.edges.filter(
      (e) => !toRemove.has(e.source) && !toRemove.has(e.target),
    )
    topology.value = { nodes, edges }

    if (removedEdgeIds.size > 0) {
      const nextEdge = { ...edgeParams.value }
      removedEdgeIds.forEach((id) => delete nextEdge[id])
      edgeParams.value = nextEdge
    }
    const nextConstraints = { ...nodeConstraints.value }
    const nextObjectives = { ...nodeObjectives.value }
    const nextTunables = { ...nodeTunables.value }
    toRemove.forEach((id) => {
      delete nextConstraints[id]
      delete nextObjectives[id]
      delete nextTunables[id]
    })
    nodeConstraints.value = nextConstraints
    nodeObjectives.value = nextObjectives
    nodeTunables.value = nextTunables
    return true
  }

  // ========== 重置 ==========

  /** 统一的节点重置：根据节点的 layerId / dependencyKind / dependencyRole 恢复默认值 */
  function resetNode(nodeId: string) {
    const node = topology.value.nodes.find((n) => n.id === nodeId)
    if (!node) return
    pushState()
    nodeConstraints.value = {
      ...nodeConstraints.value,
      [nodeId]: getNodeDefaultConstraints(node),
    }
    nodeObjectives.value = {
      ...nodeObjectives.value,
      [nodeId]: getNodeDefaultObjectives(node),
    }
    nodeTunables.value = {
      ...nodeTunables.value,
      [nodeId]: getNodeDefaultTunables(node),
    }
  }

  function resetEdgeParams(edgeId: string) {
    const edge = topology.value.edges.find((e) => e.id === edgeId)
    if (!edge) return
    const sourceNode = topology.value.nodes.find((n) => n.id === edge.source)
    const targetNode = topology.value.nodes.find((n) => n.id === edge.target)
    if (!sourceNode || !targetNode) return
    const schema = getEdgeParamsSchema(sourceNode.layerId, targetNode.layerId)
    if (!schema) return
    pushState()
    edgeParams.value = {
      ...edgeParams.value,
      [edgeId]: getEdgeDefaultParams(sourceNode.layerId, targetNode.layerId),
    }
  }

  // ========== 导入/导出 ==========

  /** 将导出格式（节点内联 constraints/objectives/tunables，连线内联 params）解析为 TopologyFullState */
  function parseExportJson(json: string): TopologyFullState {
    const data = JSON.parse(json)
    if (!data.nodes || !Array.isArray(data.nodes)) throw new Error('缺少 nodes 数组')
    if (!data.edges || !Array.isArray(data.edges)) throw new Error('缺少 edges 数组')

    const nc: Record<string, Record<string, unknown>> = {}
    const no: Record<string, Record<string, unknown>> = {}
    const nt: Record<string, Record<string, unknown>> = {}
    const ep: Record<string, Record<string, unknown>> = {}

    const nodes: TopologyNode[] = data.nodes.map((n: Record<string, unknown>) => {
      const { constraints, objectives, tunables, params, config, ...rest } = n
      const nodeId = rest.id as string
      // 新格式
      if (constraints && typeof constraints === 'object') nc[nodeId] = constraints as Record<string, unknown>
      if (objectives && typeof objectives === 'object') no[nodeId] = objectives as Record<string, unknown>
      if (tunables && typeof tunables === 'object') nt[nodeId] = tunables as Record<string, unknown>
      // 兼容旧格式
      if (!constraints && params && typeof params === 'object') nc[nodeId] = params as Record<string, unknown>
      if (!tunables && config && typeof config === 'object') nt[nodeId] = config as Record<string, unknown>
      return rest as unknown as TopologyNode
    })

    const edges: TopologyEdge[] = data.edges.map((e: Record<string, unknown>) => {
      const { params, ...rest } = e
      if (params && typeof params === 'object') ep[rest.id as string] = params as Record<string, unknown>
      return rest as unknown as TopologyEdge
    })

    return { topology: { nodes, edges }, nodeConstraints: nc, nodeObjectives: no, nodeTunables: nt, edgeParams: ep }
  }

  /** 导入完整状态（会先保存当前状态到撤销历史） */
  function importFullState(state: TopologyFullState): void {
    pushState()
    setFullState(state)
  }

  /** 从导出 JSON 字符串导入 */
  function importFromJson(json: string): { ok: true } | { ok: false; message: string } {
    try {
      const state = parseExportJson(json)
      importFullState(state)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : '导入失败' }
    }
  }

  // ========== localStorage 自动保存 ==========
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function saveToStorage(): void {
    try {
      const state: TopologyFullState = deepClone(getFullState())
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch { /* quota exceeded — silently ignore */ }
  }

  function debouncedSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveToStorage, AUTOSAVE_DEBOUNCE_MS)
  }

  watch([topology, nodeConstraints, nodeObjectives, nodeTunables, edgeParams], debouncedSave, { deep: true })

  /** 清除本地存储的拓扑数据 */
  function clearStorage(): void {
    localStorage.removeItem(STORAGE_KEY)
  }

  return {
    topology,
    nodeConstraints,
    nodeObjectives,
    nodeTunables,
    edgeParams,
    canUndo,
    canRedo,
    pushState,
    undo,
    redo,
    addNodeAfter,
    addLayerNode,
    addEdge,
    removeEdge,
    updateNodePosition,
    updateEdgeVertices,
    removeNode,
    resetNode,
    resetEdgeParams,
    getFullState,
    importFullState,
    importFromJson,
    clearStorage,
  }
})
