/**
 * 核心计算引擎类型定义
 */

/** 天花板的单个维度详情 */
export interface CeilingDetail {
  /** 维度名称，如 "bandwidth" / "pps" / "port" / "fd" / "thread" / "connection" */
  dimension: string
  /** 维度中文展示名 */
  label: string
  /** 该维度能支撑的最大 QPS */
  maxValue: number
  /** 计算公式说明（展示给用户） */
  formula: string
  /** 参与计算的输入值 */
  inputs: Record<string, unknown>
}

/** 单个节点的天花板报告 */
export interface NodeCeiling {
  nodeId: string
  /** 该节点理论最大 QPS（取各维度最小值） */
  maxThroughputRps: number
  /** 限制因素维度名 */
  limitingFactor: string
  /** 限制因素中文名 */
  limitingFactorLabel: string
  /** 各维度详细上限 */
  details: CeilingDetail[]
}

/** 单个参数的推荐 */
export interface Recommendation {
  /** 参数 key（对应 tunables 中的 dot-path） */
  key: string
  /** 参数展示名 */
  label: string
  /** 当前值 */
  currentValue: unknown
  /** 推荐值 */
  recommendedValue: unknown
  /** 推荐理由 */
  reason: string
  /** 优先级 */
  priority: 'critical' | 'important' | 'optional'
}

/** 单个节点的推荐配置集合 */
export interface NodeRecommendation {
  nodeId: string
  /** 节点展示名 */
  nodeLabel: string
  items: Recommendation[]
}

/** 瓶颈信息 */
export interface Bottleneck {
  /** 瓶颈所在节点 */
  nodeId: string
  /** 节点展示名 */
  nodeLabel: string
  /** 瓶颈维度 */
  dimension: string
  /** 维度中文名 */
  dimensionLabel: string
  /** 当前天花板 QPS */
  currentCeiling: number
  /** 目标 QPS */
  targetThroughput: number
  /** 差距百分比（负值表示不足） */
  gapPercent: number
}

/** 诊断告警 */
export interface DiagnosticWarning {
  nodeId: string
  /** 节点展示名 */
  nodeLabel: string
  level: 'error' | 'warning' | 'info'
  /** 告警编码，如 "FD_INSUFFICIENT" */
  code: string
  message: string
  suggestion: string
}

/** 节点健康状态（用于拓扑图着色） */
export interface NodeStatus {
  nodeId: string
  status: 'ok' | 'warning' | 'error'
  /** 简要状态文案 */
  summary: string
}

/** 引擎总输出 */
export interface AnalysisResult {
  ceilings: NodeCeiling[]
  recommendations: NodeRecommendation[]
  bottlenecks: Bottleneck[]
  warnings: DiagnosticWarning[]
  nodeStatuses: NodeStatus[]
  /** 目标 QPS（从 client 层读取） */
  targetThroughput: number
  /** 全链路天花板（所有节点天花板的最小值） */
  overallCeiling: number
  /** 分析时间戳 */
  timestamp: number
}
