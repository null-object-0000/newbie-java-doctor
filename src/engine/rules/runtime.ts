/**
 * 运行时层计算规则：天花板分析 + 配置推荐 + 约束校验
 */

import type { CeilingDetail, DiagnosticWarning, Recommendation } from '../types'
import type { NodeData } from '../helpers'
import { clamp, parseXmx } from '../helpers'
import { getByPath } from '@/registry/schemaBuild'

export interface RuntimeCeilingInput {
  runtimeData: NodeData
  /** 宿主层 constraints（跨节点读取） */
  hostConstraints: Record<string, unknown>
  /** 宿主层 tunables（跨节点读取，用于 FD 校验） */
  hostTunables: Record<string, unknown>
  /** 客户端层 objectives（跨节点读取） */
  clientObjectives: Record<string, unknown>
  /** 依赖层 slaRtMs 累加值 */
  dependencyRtMs: number
}

export interface RuntimeCeilingResult {
  details: CeilingDetail[]
  warnings: DiagnosticWarning[]
  recommendations: Recommendation[]
}

const SELF_PROCESS_MS = 5
const DEFAULT_AVG_RT_MS = 50

export function computeRuntimeCeiling(input: RuntimeCeilingInput): RuntimeCeilingResult {
  const { runtimeData, hostConstraints, hostTunables, clientObjectives, dependencyRtMs } = input
  const { node, tunables } = runtimeData
  const details: CeilingDetail[] = []
  const warnings: DiagnosticWarning[] = []
  const recommendations: Recommendation[] = []

  // --- 读取参数 ---
  const tomcatMaxThreads = (getByPath(tunables, 'tomcatMaxThreads') as number) ?? 200
  const tomcatMaxConnections = (getByPath(tunables, 'tomcatMaxConnections') as number) ?? 10000
  const tomcatAcceptCount = (getByPath(tunables, 'tomcatAcceptCount') as number) ?? 100
  const tomcatMinSpareThreads = (getByPath(tunables, 'tomcatMinSpareThreads') as number) ?? 10
  const jvmOptions = (getByPath(tunables, 'jvmOptions') as string) ?? '-Xms4g -Xmx4g'
  const virtualThreadsEnabled = getByPath(tunables, 'virtualThreadsEnabled')

  const vCpu = (getByPath(hostConstraints, 'spec.vCpu') as number) ?? 8
  const hostMemoryGb = (getByPath(hostConstraints, 'spec.memoryGb') as number) ?? 16
  const ulimitN = (getByPath(hostTunables, 'fs.ulimitN') as number) ?? 65535

  const targetThroughputRps = (getByPath(clientObjectives, 'targetThroughputRps') as number) ?? 500
  const businessScenario = (getByPath(clientObjectives, 'businessScenario') as string) ?? 'io'

  // --- 计算 avgRT ---
  const avgRtMs = dependencyRtMs > 0 ? dependencyRtMs + SELF_PROCESS_MS : DEFAULT_AVG_RT_MS
  const avgRtSec = avgRtMs / 1000

  // --- 线程天花板 ---
  const maxByThreads = Math.floor(tomcatMaxThreads / avgRtSec)
  details.push({
    dimension: 'thread',
    label: 'Tomcat 线程',
    maxValue: maxByThreads,
    formula: `maxThreads(${tomcatMaxThreads}) / avgRT(${avgRtMs}ms = ${avgRtSec}s)`,
    inputs: { tomcatMaxThreads, avgRtMs },
  })

  // --- 连接天花板 ---
  const maxByConnections = Math.floor(tomcatMaxConnections / avgRtSec)
  details.push({
    dimension: 'connection',
    label: 'Tomcat 连接',
    maxValue: maxByConnections,
    formula: `maxConnections(${tomcatMaxConnections}) / avgRT(${avgRtMs}ms = ${avgRtSec}s)`,
    inputs: { tomcatMaxConnections, avgRtMs },
  })

  // ========== 配置推荐 ==========

  // --- Tomcat 线程池推荐 ---
  const idealThreads = Math.ceil(targetThroughputRps * avgRtSec)
  const threadMultiplier = businessScenario === 'io' ? 100 : 4
  const cpuUpperBound = vCpu * threadMultiplier

  const recommendedMaxThreads = clamp(idealThreads, 10, cpuUpperBound)
  if (Math.abs(tomcatMaxThreads - recommendedMaxThreads) > recommendedMaxThreads * 0.2) {
    recommendations.push({
      key: 'tomcatMaxThreads',
      label: 'server.tomcat.threads.max',
      currentValue: tomcatMaxThreads,
      recommendedValue: recommendedMaxThreads,
      reason: `Little's Law: 目标QPS(${targetThroughputRps}) × avgRT(${avgRtMs}ms) = ${idealThreads} 线程`
        + (idealThreads > cpuUpperBound
          ? `，受 CPU 上界限制(${vCpu}核 × ${threadMultiplier} = ${cpuUpperBound})`
          : ''),
      priority: Math.abs(tomcatMaxThreads - recommendedMaxThreads) > recommendedMaxThreads ? 'critical' : 'important',
    })
  }

  const recommendedMinSpareThreads = clamp(Math.ceil(recommendedMaxThreads * 0.1), 5, 50)
  if (tomcatMinSpareThreads < recommendedMinSpareThreads * 0.5 || tomcatMinSpareThreads > recommendedMaxThreads) {
    recommendations.push({
      key: 'tomcatMinSpareThreads',
      label: 'server.tomcat.threads.min-spare',
      currentValue: tomcatMinSpareThreads,
      recommendedValue: recommendedMinSpareThreads,
      reason: `建议为 maxThreads 的 10% 左右 (${recommendedMaxThreads} × 10% ≈ ${recommendedMinSpareThreads})`,
      priority: 'optional',
    })
  }

  const recommendedMaxConnections = clamp(recommendedMaxThreads * 2, recommendedMaxThreads, 10000)
  if (tomcatMaxConnections < recommendedMaxThreads) {
    recommendations.push({
      key: 'tomcatMaxConnections',
      label: 'server.tomcat.max-connections',
      currentValue: tomcatMaxConnections,
      recommendedValue: recommendedMaxConnections,
      reason: `maxConnections 不应低于 maxThreads(${recommendedMaxThreads})，建议 2 倍以上`,
      priority: 'important',
    })
  }

  const recommendedAcceptCount = clamp(Math.ceil(targetThroughputRps * 0.1), 50, 200)
  if (tomcatAcceptCount < 50 || tomcatAcceptCount > targetThroughputRps) {
    recommendations.push({
      key: 'tomcatAcceptCount',
      label: 'server.tomcat.accept-count',
      currentValue: tomcatAcceptCount,
      recommendedValue: recommendedAcceptCount,
      reason: `建议为目标QPS的 10% 左右，范围 50~200`,
      priority: 'optional',
    })
  }

  // --- JVM 堆大小推荐 ---
  const currentXmxGb = parseXmx(jvmOptions)
  const recommendedXmxGb = clamp(Math.floor(hostMemoryGb * 0.75), 1, 32)

  if (currentXmxGb !== null) {
    if (currentXmxGb > hostMemoryGb * 0.85) {
      warnings.push({
        nodeId: node.id,
        nodeLabel: node.label,
        level: 'error',
        code: 'JVM_HEAP_EXCEEDS_MEMORY',
        message: `JVM 堆内存 -Xmx(${currentXmxGb}G) 超过宿主内存(${hostMemoryGb}G) 的 85%`,
        suggestion: `建议 -Xmx 不超过宿主内存的 75%，即 ${recommendedXmxGb}G`,
      })
    }

    if (Math.abs(currentXmxGb - recommendedXmxGb) >= 1) {
      const otherOptions = jvmOptions
        .replace(/-Xmx\d+[gmkGMK]?/g, '')
        .replace(/-Xms\d+[gmkGMK]?/g, '')
        .trim()
      const recommendedJvmOptions = `-Xms${recommendedXmxGb}g -Xmx${recommendedXmxGb}g${otherOptions ? ' ' + otherOptions : ''}`
      recommendations.push({
        key: 'jvmOptions',
        label: 'JVM 配置',
        currentValue: jvmOptions,
        recommendedValue: recommendedJvmOptions,
        reason: `基于宿主内存(${hostMemoryGb}G) × 75% = ${recommendedXmxGb}G，Xms=Xmx 避免运行时扩缩`,
        priority: currentXmxGb > hostMemoryGb * 0.85 ? 'critical' : 'important',
      })
    }
  }

  // --- 约束校验 ---
  // FD 不足校验
  const fdNeeded = tomcatMaxConnections + 256
  if (fdNeeded > ulimitN) {
    warnings.push({
      nodeId: node.id,
      nodeLabel: node.label,
      level: 'error',
      code: 'FD_INSUFFICIENT',
      message: `Tomcat maxConnections(${tomcatMaxConnections}) + 预留(256) = ${fdNeeded}，超过 ulimit -n(${ulimitN})`,
      suggestion: `将 ulimit -n 调整到至少 ${fdNeeded}，或降低 maxConnections`,
    })
  }

  // 线程数远超推荐值
  if (tomcatMaxThreads > recommendedMaxThreads * 3 && recommendedMaxThreads > 0) {
    warnings.push({
      nodeId: node.id,
      nodeLabel: node.label,
      level: 'warning',
      code: 'THREADS_OVER_RECOMMENDED',
      message: `当前线程数(${tomcatMaxThreads}) 是推荐值(${recommendedMaxThreads}) 的 ${(tomcatMaxThreads / recommendedMaxThreads).toFixed(1)} 倍`,
      suggestion: '过多的线程会增加上下文切换开销，建议适当降低',
    })
  }

  // 虚拟线程提示
  if (virtualThreadsEnabled === true) {
    warnings.push({
      nodeId: node.id,
      nodeLabel: node.label,
      level: 'info',
      code: 'VIRTUAL_THREADS_ENABLED',
      message: '已启用虚拟线程，Tomcat threads.max 配置不生效',
      suggestion: '虚拟线程由 JVM 自动管理，线程天花板不适用于此模式',
    })
  }

  return { details, warnings, recommendations }
}
