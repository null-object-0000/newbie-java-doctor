/**
 * 依赖层计算规则：HTTP API 连接池天花板 + 限流约束
 */

import type { CeilingDetail, DiagnosticWarning } from '../types'
import type { NodeData } from '../helpers'
import { getByPath } from '@/registry/schemaBuild'

export interface HttpApiCeilingInput {
  clientData: NodeData
  serverData: NodeData
}

export interface HttpApiCeilingResult {
  /** Server 节点的天花板维度（对方限流等不可控约束） */
  serverDetails: CeilingDetail[]
  /** Client 节点的天花板维度（连接池等可调参数） */
  clientDetails: CeilingDetail[]
  warnings: DiagnosticWarning[]
}

export function computeHttpApiCeiling(input: HttpApiCeilingInput): HttpApiCeilingResult {
  const { clientData, serverData } = input
  const serverDetails: CeilingDetail[] = []
  const clientDetails: CeilingDetail[] = []
  const warnings: DiagnosticWarning[] = []

  const clientType = (getByPath(clientData.constraints, 'clientType') as string) ?? 'apache'
  const avgRtMs = (getByPath(serverData.constraints, 'avgRtMs') as number) ?? 200
  const rateLimitQps = (getByPath(serverData.constraints, 'rateLimitQps') as number) ?? 0

  if (avgRtMs <= 0) {
    warnings.push({
      nodeId: serverData.node.id,
      nodeLabel: serverData.node.label,
      level: 'warning',
      code: 'INVALID_AVG_RT',
      message: '平均响应时间必须大于 0',
      suggestion: '请设置下游服务的实际平均响应时间',
    })
    return { serverDetails, clientDetails, warnings }
  }

  const avgRtSec = avgRtMs / 1000

  // --- 对方限流天花板（归属 Server 节点） ---
  if (rateLimitQps > 0) {
    serverDetails.push({
      dimension: 'rate_limit',
      label: '对方限流',
      maxValue: rateLimitQps,
      formula: `限流阈值 = ${rateLimitQps} QPS`,
      inputs: { rateLimitQps },
    })
  }

  // --- 连接池天花板（归属 Client 节点，仅 Apache HttpClient 有 per-route 硬限制） ---
  if (clientType === 'apache') {
    const maxConnPerRoute = (getByPath(clientData.tunables, 'apache.maxConnPerRoute') as number) ?? 5
    const maxConnTotal = (getByPath(clientData.tunables, 'apache.maxConnTotal') as number) ?? 25

    const ceilingPerRoute = Math.floor(maxConnPerRoute / avgRtSec)
    clientDetails.push({
      dimension: 'conn_pool',
      label: '连接池 (maxConnPerRoute)',
      maxValue: ceilingPerRoute,
      formula: `maxConnPerRoute(${maxConnPerRoute}) / avgRT(${avgRtMs}ms = ${avgRtSec}s)`,
      inputs: { maxConnPerRoute, avgRtMs },
    })

    if (maxConnPerRoute <= 5) {
      warnings.push({
        nodeId: clientData.node.id,
        nodeLabel: clientData.node.label,
        level: 'warning',
        code: 'APACHE_CONN_PER_ROUTE_DEFAULT',
        message: `Apache HttpClient maxConnPerRoute 为 ${maxConnPerRoute}（默认值）`,
        suggestion: '对于高吞吐场景，建议根据 目标QPS × avgRT 计算所需连接数，通常需要调至 20~100',
      })
    }

    if (maxConnPerRoute > maxConnTotal) {
      warnings.push({
        nodeId: clientData.node.id,
        nodeLabel: clientData.node.label,
        level: 'error',
        code: 'APACHE_CONN_PER_ROUTE_EXCEEDS_TOTAL',
        message: `maxConnPerRoute(${maxConnPerRoute}) 超过 maxConnTotal(${maxConnTotal})`,
        suggestion: `将 maxConnTotal 调整到至少 ${maxConnPerRoute}`,
      })
    }
  }

  // OkHttp 同步调用无 per-host 并发连接数上限，天花板由 Tomcat 线程决定
  // Java HttpClient 连接池由 JVM 内部管理，无可配置的并发上限

  return { serverDetails, clientDetails, warnings }
}
