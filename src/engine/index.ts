/**
 * 核心计算引擎入口
 */

import type { TopologyFullState } from '@/stores/topology'
import type {
  AnalysisResult,
  NodeCeiling,
  NodeRecommendation,
  Bottleneck,
  DiagnosticWarning,
  NodeStatus,
} from './types'
import {
  findNodeByLayer,
  collectDependencyRtMs,
  collectHttpApiPairs,
  getMessageSizeBytes,
  formatNumber,
} from './helpers'
import { computeHostCeiling } from './rules/host'
import { computeRuntimeCeiling } from './rules/runtime'
import { computeHttpApiCeiling } from './rules/dependency'
import { getByPath } from '@/registry/schemaBuild'

export function runAnalysis(state: TopologyFullState): AnalysisResult {
  const ceilings: NodeCeiling[] = []
  const recommendations: NodeRecommendation[] = []
  const warnings: DiagnosticWarning[] = []
  const bottlenecks: Bottleneck[] = []
  const nodeStatuses: NodeStatus[] = []

  // --- 定位关键节点 ---
  const clientData = findNodeByLayer(state, 'client')
  const hostData = findNodeByLayer(state, 'host')
  const runtimeData = findNodeByLayer(state, 'runtime')

  const targetThroughput = clientData
    ? ((getByPath(clientData.objectives, 'targetThroughputRps') as number) ?? 500)
    : 500

  // 缺少关键节点时的警告
  if (!clientData) {
    warnings.push({
      nodeId: '',
      nodeLabel: '全局',
      level: 'warning',
      code: 'MISSING_CLIENT',
      message: '未找到客户端层节点',
      suggestion: '请添加客户端层节点并配置负载目标',
    })
  }
  if (!hostData) {
    warnings.push({
      nodeId: '',
      nodeLabel: '全局',
      level: 'warning',
      code: 'MISSING_HOST',
      message: '未找到宿主容器层节点',
      suggestion: '请添加宿主容器层节点并配置环境约束',
    })
  }
  if (!runtimeData) {
    warnings.push({
      nodeId: '',
      nodeLabel: '全局',
      level: 'warning',
      code: 'MISSING_RUNTIME',
      message: '未找到运行时层节点',
      suggestion: '请添加运行时层节点并配置可调参数',
    })
  }

  // --- 收集跨节点信息 ---
  const messageSizeBytes = getMessageSizeBytes(state)
  const dependencyRtMs = collectDependencyRtMs(state)

  // --- 宿主层计算 ---
  if (hostData) {
    const hostResult = computeHostCeiling({
      hostData,
      messageSizeBytes,
    })

    warnings.push(...hostResult.warnings)

    if (hostResult.details.length > 0) {
      const minDetail = hostResult.details.reduce((a, b) => a.maxValue < b.maxValue ? a : b)
      ceilings.push({
        nodeId: hostData.node.id,
        maxThroughputRps: minDetail.maxValue,
        limitingFactor: minDetail.dimension,
        limitingFactorLabel: minDetail.label,
        details: hostResult.details,
      })
    }
  }

  // --- 运行时层计算 ---
  if (runtimeData) {
    const runtimeResult = computeRuntimeCeiling({
      runtimeData,
      hostConstraints: hostData?.constraints ?? {},
      hostTunables: hostData?.tunables ?? {},
      clientObjectives: clientData?.objectives ?? {},
      dependencyRtMs,
    })

    warnings.push(...runtimeResult.warnings)

    if (runtimeResult.recommendations.length > 0) {
      recommendations.push({
        nodeId: runtimeData.node.id,
        nodeLabel: runtimeData.node.label,
        items: runtimeResult.recommendations,
      })
    }

    if (runtimeResult.details.length > 0) {
      const minDetail = runtimeResult.details.reduce((a, b) => a.maxValue < b.maxValue ? a : b)
      ceilings.push({
        nodeId: runtimeData.node.id,
        maxThroughputRps: minDetail.maxValue,
        limitingFactor: minDetail.dimension,
        limitingFactorLabel: minDetail.label,
        details: runtimeResult.details,
      })
    }
  }

  // --- 依赖层计算（HTTP API 连接池天花板 + 限流约束） ---
  const httpApiPairs = collectHttpApiPairs(state)
  for (const { clientData, serverData } of httpApiPairs) {
    const httpApiResult = computeHttpApiCeiling({ clientData, serverData })

    warnings.push(...httpApiResult.warnings)

    if (httpApiResult.serverDetails.length > 0) {
      const minDetail = httpApiResult.serverDetails.reduce((a, b) => a.maxValue < b.maxValue ? a : b)
      ceilings.push({
        nodeId: serverData.node.id,
        maxThroughputRps: minDetail.maxValue,
        limitingFactor: minDetail.dimension,
        limitingFactorLabel: minDetail.label,
        details: httpApiResult.serverDetails,
      })
    }

    if (httpApiResult.clientDetails.length > 0) {
      const minDetail = httpApiResult.clientDetails.reduce((a, b) => a.maxValue < b.maxValue ? a : b)
      ceilings.push({
        nodeId: clientData.node.id,
        maxThroughputRps: minDetail.maxValue,
        limitingFactor: minDetail.dimension,
        limitingFactorLabel: minDetail.label,
        details: httpApiResult.clientDetails,
      })
    }
  }

  // --- 计算全链路天花板 ---
  const overallCeiling = ceilings.length > 0
    ? Math.min(...ceilings.map((c) => c.maxThroughputRps))
    : 0

  // --- 瓶颈检测 ---
  for (const ceiling of ceilings) {
    if (ceiling.maxThroughputRps < targetThroughput) {
      const node = state.topology.nodes.find((n) => n.id === ceiling.nodeId)
      const gapPercent = ((ceiling.maxThroughputRps - targetThroughput) / targetThroughput) * 100
      bottlenecks.push({
        nodeId: ceiling.nodeId,
        nodeLabel: node?.label ?? ceiling.nodeId,
        dimension: ceiling.limitingFactor,
        dimensionLabel: ceiling.limitingFactorLabel,
        currentCeiling: ceiling.maxThroughputRps,
        targetThroughput,
        gapPercent: Math.round(gapPercent * 10) / 10,
      })
    }
  }

  // 按差距从大到小排序
  bottlenecks.sort((a, b) => a.gapPercent - b.gapPercent)

  // --- 计算节点状态 ---
  for (const ceiling of ceilings) {
    const ratio = ceiling.maxThroughputRps / targetThroughput
    const node = state.topology.nodes.find((n) => n.id === ceiling.nodeId)
    const nodeWarnings = warnings.filter((w) => w.nodeId === ceiling.nodeId)
    const hasError = nodeWarnings.some((w) => w.level === 'error')

    let status: 'ok' | 'warning' | 'error'
    let summary: string

    if (ratio < 1 || hasError) {
      status = 'error'
      summary = ratio < 1
        ? `天花板 ${formatNumber(ceiling.maxThroughputRps)} < 目标 ${formatNumber(targetThroughput)}`
        : nodeWarnings.find((w) => w.level === 'error')?.message ?? '存在错误'
    } else if (ratio < 1.3 || nodeWarnings.some((w) => w.level === 'warning')) {
      status = 'warning'
      summary = ratio < 1.3
        ? `天花板 ${formatNumber(ceiling.maxThroughputRps)}，余量不足 30%`
        : nodeWarnings.find((w) => w.level === 'warning')?.message ?? '存在告警'
    } else {
      status = 'ok'
      summary = `天花板 ${formatNumber(ceiling.maxThroughputRps)} RPS`
    }

    nodeStatuses.push({
      nodeId: ceiling.nodeId,
      status,
      summary,
    })

    // 给 client 节点也加状态
    if (node && clientData && !nodeStatuses.find((s) => s.nodeId === clientData.node.id)) {
      nodeStatuses.push({
        nodeId: clientData.node.id,
        status: overallCeiling >= targetThroughput ? 'ok' : 'error',
        summary: overallCeiling >= targetThroughput
          ? `目标 ${formatNumber(targetThroughput)} RPS 可达`
          : `目标 ${formatNumber(targetThroughput)} 超过天花板 ${formatNumber(overallCeiling)}`,
      })
    }
  }

  return {
    ceilings,
    recommendations,
    bottlenecks,
    warnings,
    nodeStatuses,
    targetThroughput,
    overallCeiling,
    timestamp: Date.now(),
  }
}
