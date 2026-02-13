/**
 * 全链路容量评估 - 各层数据类型定义
 * 核心参数：使用者提供、默认不可修改
 * 核心配置：可调优、可基于核心参数自动计算推荐
 */

// ========== Client Layer 客户端层 ==========
export type BusinessScenario = 'io' | 'compute'  // IO 密集型 | 计算密集型
export type NetworkEnv = 'public' | 'intra_dc' | 'cross_dc'  // 公网 | 内网同中心 | 内网跨中心

export interface ClientLayerParams {
  businessScenario: BusinessScenario
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

// ========== Application Layer - Dependency 依赖层 ==========
export type HttpClientType = 'java_http' | 'okhttp' | 'apache'

export interface DependencyHttpClientParams {
  type: HttpClientType
  networkEnv: NetworkEnv
  messageSizeBytes: number
  targetQps?: number
  slaRtMs?: number
}

export interface DependencyRedisParams {
  memoryGb: number
  shardCount: number
}

export interface DependencyDbParams {
  engine: string
  cpu: number
  memoryGb: number
  maxConnections: number
  maxIops: number
  storageGb: number
}

export interface JavaHttpClientConfig {
  version: string
  executor: string
  timeoutMs: number
}

export interface OkHttpConfig {
  maxRequestsPerHost: number
  maxRequests: number
  maxIdleConnections: number
  keepAliveDurationSec: number
  connectTimeoutMs: number
  readTimeoutMs: number
  writeTimeoutMs: number
}

export interface ApacheHttpClientConfig {
  maxConnTotal: number
  maxConnPerRoute: number
  connectionTimeToLiveSec: number
  connectionRequestTimeoutMs: number
  responseTimeoutMs: number
}

export interface DependencyLayerParams {
  httpClients: DependencyHttpClientParams[]
  redis?: DependencyRedisParams
  database?: DependencyDbParams
}

export interface DependencyLayerConfig {
  javaHttp?: JavaHttpClientConfig
  okhttp?: OkHttpConfig
  apacheHttp?: ApacheHttpClientConfig
  redisClient: 'jedis' | 'lettuce' | 'redisson'
}

// ========== 拓扑节点 ==========
export type LayerId = 'client' | 'access' | 'host' | 'runtime' | 'dependency'

/** 依赖层子类型：Redis / 数据库 / 三方接口（可自定义名称） */
export type DependencyKind = 'redis' | 'database' | 'http_api'

export interface TopologyNode {
  id: string
  layerId: LayerId
  /** 展示名称 */
  label: string
  /** 用户添加的节点可删除；默认为 default */
  nodeSource?: 'default' | 'user'
  /** 仅当 layerId === 'dependency' 时有效 */
  dependencyKind?: DependencyKind
  /** 三方接口/自定义依赖时的名称 */
  customLabel?: string
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
  customLabel?: string
}
