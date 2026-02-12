import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  ClientLayerParams,
  AccessLayerParams,
  HostLayerParams,
  HostLayerConfig,
  RuntimeParams,
  RuntimeConfig,
  DependencyLayerParams,
  DependencyLayerConfig,
  Topology,
  TopologyNode,
  TopologyEdge,
  AddNodeOptions,
  LayerId,
  DependencyKind,
} from '@/types/layers'

const defaultClientParams: ClientLayerParams = {
  businessScenario: 'io',
  networkEnv: 'intra_dc',
  messageSizeBytes: 1024,
  concurrentUsers: 100,
  targetThroughputRps: 500,
  expectedFailureRatePercent: 0,
}

const defaultAccessParams: AccessLayerParams = {
  nodes: ['Tengine', 'Nginx', 'API Gateway'],
  note: '此环节由运维管控，暂不纳入调优排障，仅用以完善链路。',
}

const defaultHostParams: HostLayerParams = {
  spec: {
    vCpu: 8,
    cpuFreqGhz: 2.5,
    memoryGb: 16,
    architecture: 'x86',
  },
  storage: {
    diskType: 'ssd',
    iopsLimit: 10000,
    throughputMbPerSec: 500,
  },
  network: {
    nicBandwidthGbps: 10,
    ppsLimit: 1000000,
  },
  os: {
    osVersion: 'AlmaLinux 9',
    kernelVersion: '5.14',
  },
}

const defaultHostConfig: HostLayerConfig = {
  net: {
    tcpTwReuse: 1,
    ipLocalPortRange: '32768 60999',
    tcpMaxTwBuckets: 5000,
  },
  fs: {
    ulimitN: 65535,
    fsNrOpen: 65535,
    fsFileMax: 2097152,
  },
}

const defaultRuntimeParams: RuntimeParams = {
  jdkVersion: '21',
  logLinesPerRequest: 5,
  logSizeBytesPerRequest: 512,
}

const defaultRuntimeConfig: RuntimeConfig = {
  gc: 'G1GC',
  jvmOptions: '-Xms4g -Xmx4g',
  virtualThreadsEnabled: true,
  tomcatMaxThreads: 200,
  tomcatMinSpareThreads: 10,
  tomcatMaxConnections: 10000,
  tomcatAcceptCount: 100,
  logbackMaxFileSize: '100MB',
  logbackMaxHistory: 30,
  logbackQueueSize: 256,
  logbackDiscardingThreshold: 20,
  logbackMaxFlushTimeMs: 5000,
  logbackNeverBlock: false,
}

const defaultDependencyParams: DependencyLayerParams = {
  httpClients: [],
  redis: { memoryGb: 8, shardCount: 1 },
  database: {
    engine: 'MySQL',
    cpu: 8,
    memoryGb: 16,
    maxConnections: 500,
    maxIops: 5000,
    storageGb: 500,
  },
}

const defaultDependencyConfig: DependencyLayerConfig = {
  redisClient: 'lettuce',
}

const LAYER_LABELS: Record<LayerId, string> = {
  client: '客户端层',
  access: '接入网关层',
  host: '宿主容器层',
  runtime: '运行时层',
  dependency: '依赖层',
}

const DEPENDENCY_KIND_LABELS: Record<DependencyKind, string> = {
  redis: 'Redis',
  database: '数据库',
  http_api: '三方接口',
  custom: '自定义依赖',
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

function computeLabel(opts: AddNodeOptions): string {
  if (opts.label) return opts.label
  if (opts.layerId === 'dependency' && opts.dependencyKind) {
    if (opts.dependencyKind === 'http_api' || opts.dependencyKind === 'custom') {
      return opts.customLabel?.trim() || DEPENDENCY_KIND_LABELS[opts.dependencyKind]
    }
    return DEPENDENCY_KIND_LABELS[opts.dependencyKind]
  }
  return LAYER_LABELS[opts.layerId]
}

export const useTopologyStore = defineStore('topology', () => {
  const topology = ref<Topology>(buildDefaultTopology())

  const clientParams = ref<ClientLayerParams>({ ...defaultClientParams })
  const accessParams = ref<AccessLayerParams>({ ...defaultAccessParams })

  const hostParams = ref<HostLayerParams>(JSON.parse(JSON.stringify(defaultHostParams)))
  const hostConfig = ref<HostLayerConfig>(JSON.parse(JSON.stringify(defaultHostConfig)))

  const runtimeParams = ref<RuntimeParams>({ ...defaultRuntimeParams })
  const runtimeConfig = ref<RuntimeConfig>(JSON.parse(JSON.stringify(defaultRuntimeConfig)))

  const dependencyParams = ref<DependencyLayerParams>(
    JSON.parse(JSON.stringify(defaultDependencyParams))
  )
  const dependencyConfig = ref<DependencyLayerConfig>(
    JSON.parse(JSON.stringify(defaultDependencyConfig))
  )

  const layerLabels = computed(() => LAYER_LABELS)

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
    const node: TopologyNode = {
      id: nextNodeId(),
      layerId: 'dependency',
      label: computeLabel(effectiveOpts),
      nodeSource: 'user',
      dependencyKind: effectiveOpts.dependencyKind,
      customLabel: effectiveOpts.customLabel,
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

  /** 层顺序（用于插入新层节点时确定位置） */
  const LAYER_ORDER: LayerId[] = ['client', 'access', 'host', 'runtime', 'dependency']

  /** 客户端/接入/宿主/运行时层在图中最多 1 个；依赖层无上限（由子节点拖入） */
  const LAYER_MAX_COUNT: Record<'client' | 'access' | 'host' | 'runtime', number> = {
    client: 1,
    access: 1,
    host: 1,
    runtime: 1,
  }

  /** 将“层”节点插入拓扑（不自动连线）；若该层已达上限则返回 null */
  function addLayerNode(layerId: 'client' | 'access' | 'host' | 'runtime'): TopologyNode | null {
    const max = LAYER_MAX_COUNT[layerId]
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
      label: LAYER_LABELS[layerId],
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
    return true
  }

  function resetClient() {
    clientParams.value = { ...defaultClientParams }
  }

  function resetHost() {
    hostParams.value = JSON.parse(JSON.stringify(defaultHostParams))
    hostConfig.value = JSON.parse(JSON.stringify(defaultHostConfig))
  }

  function resetRuntime() {
    runtimeParams.value = { ...defaultRuntimeParams }
    runtimeConfig.value = JSON.parse(JSON.stringify(defaultRuntimeConfig))
  }

  function resetDependency() {
    dependencyParams.value = JSON.parse(JSON.stringify(defaultDependencyParams))
    dependencyConfig.value = JSON.parse(JSON.stringify(defaultDependencyConfig))
  }

  return {
    topology,
    clientParams,
    accessParams,
    hostParams,
    hostConfig,
    runtimeParams,
    runtimeConfig,
    dependencyParams,
    dependencyConfig,
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
    resetDependency,
  }
})

export { LAYER_LABELS, DEPENDENCY_KIND_LABELS }
