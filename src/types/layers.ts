/**
 * 全链路容量评估 - 各层数据类型定义
 * 核心参数：使用者提供、默认不可修改
 * 核心配置：可调优、可基于核心参数自动计算推荐
 */

// ========== Global 全局核心参数 ==========
export type BusinessScenario = 'io' | 'compute'  // IO 密集型 | 计算密集型
export interface GlobalCoreParams {
  businessScenario: BusinessScenario
}

// ========== Client Layer 客户端层 ==========
export type NetworkEnv = 'public' | 'intra_dc' | 'cross_dc'  // 公网 | 内网同中心 | 内网跨中心
export interface ClientLayerParams {
  networkEnv: NetworkEnv
  messageSizeBytes: number
  concurrentUsers: number
  targetThroughputRps: number
  expectedFailureRatePercent: number
}

// ========== Access Layer 接入网关层 ==========
export interface AccessLayerParams {
  nodes: string[]  // Tengine / Nginx / API Gateway
  note: string     // 暂不纳入调优，仅完善链路
}

// ========== Host Layer 宿主容器层 ==========
export type DiskType = 'ssd' | 'nvme' | 'hdd'
export type Arch = 'x86' | 'arm'

export interface HostSpecParams {
  vCpu: number
  cpuFreqGhz: number
  memoryGb: number
  architecture: Arch
}

export interface HostStorageParams {
  diskType: DiskType
  iopsLimit: number
  throughputMbPerSec: number
}

export interface HostNetworkParams {
  nicBandwidthGbps: number
  ppsLimit: number
}

export interface HostOSParams {
  osVersion: string
  kernelVersion: string
}

export interface HostNetConfig {
  tcpTwReuse: 0 | 1 | 2
  ipLocalPortRange: string
  tcpMaxTwBuckets: number
}

export interface HostFsConfig {
  ulimitN: number
  fsNrOpen: number
  fsFileMax: number
}

export interface HostLayerParams {
  spec: HostSpecParams
  storage: HostStorageParams
  network: HostNetworkParams
  os: HostOSParams
}

export interface HostLayerConfig {
  net: HostNetConfig
  fs: HostFsConfig
}

// ========== Application Layer - Runtime 运行时层 ==========
export interface RuntimeParams {
  jdkVersion: string
  logLinesPerRequest: number
  logSizeBytesPerRequest: number
}

export interface RuntimeConfig {
  gc: string
  jvmOptions: string
  virtualThreadsEnabled: boolean
  tomcatMaxThreads: number
  tomcatMinSpareThreads: number
  tomcatMaxConnections: number
  tomcatAcceptCount: number
  logbackMaxFileSize: string
  logbackMaxHistory: number
  logbackQueueSize: number
  logbackDiscardingThreshold: number
  logbackMaxFlushTimeMs: number
  logbackNeverBlock: boolean
}

// ========== 拓扑节点 ==========
export type LayerId = 'client' | 'access' | 'host' | 'runtime' | 'dependency'

/** 依赖层子类型：Redis / 数据库 / 三方接口（可自定义名称） */
export type DependencyKind = 'redis' | 'database' | 'http_api'

/** 依赖层节点角色：client_only 类型仅 client；client_and_server 类型为组合中的 Server 或 Client */
export type DependencyRole = 'client' | 'server'

export interface TopologyNode {
  id: string
  layerId: LayerId
  /** 展示名称 */
  label: string
  /** 用户添加的节点可删除；默认为 default */
  nodeSource?: 'default' | 'user'
  /** 仅当 layerId === 'dependency' 时有效 */
  dependencyKind?: DependencyKind
  /** 仅当 dependency 且 client_and_server 时：该节点是组合中的 server 还是 client */
  dependencyRole?: DependencyRole
  /** 仅当 dependency 且 client_and_server 时：同组 server+client 共用此 id，用于拓扑组合展示与关联 */
  dependencyGroupId?: string
  x?: number
  y?: number
}

export interface TopologyEdge {
  id: string
  source: string
  target: string
  /** 连线路径上的顶点（用户拖拽连线产生的拐点） */
  vertices?: { x: number; y: number }[]
}

export interface Topology {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
}

/** 添加节点时的参数（线性插入到某节点之后） */
export interface AddNodeOptions {
  layerId: LayerId
  label?: string
  dependencyKind?: DependencyKind
}
