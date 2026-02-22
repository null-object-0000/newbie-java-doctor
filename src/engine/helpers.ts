/**
 * 引擎辅助工具函数
 */

import type { TopologyFullState } from '@/stores/topology'
import type { TopologyNode } from '@/types/layers'
import { getByPath } from '@/registry/schemaBuild'

/** 将值限制在 [min, max] 区间 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * 从 JVM 参数字符串中解析 -Xmx 值，返回 GB 数
 * 支持格式: -Xmx4g / -Xmx4096m / -Xmx4194304k
 */
export function parseXmx(jvmOptions: string): number | null {
  const match = jvmOptions.match(/-Xmx(\d+)([gmkGMK]?)/)
  if (!match) return null
  const value = parseInt(match[1] ?? '0', 10)
  const unit = (match[2] ?? '').toLowerCase()
  switch (unit) {
    case 'g': return value
    case 'm': return value / 1024
    case 'k': return value / (1024 * 1024)
    default: return value / (1024 * 1024 * 1024) // bytes
  }
}

/**
 * 从 JVM 参数字符串中解析 -Xms 值，返回 GB 数
 */
export function parseXms(jvmOptions: string): number | null {
  const match = jvmOptions.match(/-Xms(\d+)([gmkGMK]?)/)
  if (!match) return null
  const value = parseInt(match[1] ?? '0', 10)
  const unit = (match[2] ?? '').toLowerCase()
  switch (unit) {
    case 'g': return value
    case 'm': return value / 1024
    case 'k': return value / (1024 * 1024)
    default: return value / (1024 * 1024 * 1024)
  }
}

/** 解析端口范围字符串 "32768 60999" -> { low, high } */
export function parsePortRange(range: string): { low: number; high: number } | null {
  const parts = range.trim().split(/\s+/)
  if (parts.length !== 2) return null
  const low = parseInt(parts[0] ?? '0', 10)
  const high = parseInt(parts[1] ?? '0', 10)
  if (isNaN(low) || isNaN(high) || low >= high) return null
  return { low, high }
}

export interface NodeData {
  node: TopologyNode
  constraints: Record<string, unknown>
  objectives: Record<string, unknown>
  tunables: Record<string, unknown>
}

/** 按 layerId 从状态中查找第一个匹配节点及其数据 */
export function findNodeByLayer(state: TopologyFullState, layerId: string): NodeData | null {
  const node = state.topology.nodes.find((n) => n.layerId === layerId)
  if (!node) return null
  return {
    node,
    constraints: state.nodeConstraints[node.id] ?? {},
    objectives: state.nodeObjectives[node.id] ?? {},
    tunables: state.nodeTunables[node.id] ?? {},
  }
}

/** 按 nodeId 从状态中获取节点数据 */
export function getNodeData(state: TopologyFullState, nodeId: string): NodeData | null {
  const node = state.topology.nodes.find((n) => n.id === nodeId)
  if (!node) return null
  return {
    node,
    constraints: state.nodeConstraints[node.id] ?? {},
    objectives: state.nodeObjectives[node.id] ?? {},
    tunables: state.nodeTunables[node.id] ?? {},
  }
}

/**
 * 沿 runtime -> dependency 的边，收集所有三方接口 Server 的 slaRtMs 总和
 * 用于估算应用的平均响应时间
 */
export function collectDependencyRtMs(state: TopologyFullState): number {
  const runtimeNode = state.topology.nodes.find((n) => n.layerId === 'runtime')
  if (!runtimeNode) return 0

  let totalRtMs = 0
  for (const edge of state.topology.edges) {
    if (edge.source !== runtimeNode.id) continue
    const targetNode = state.topology.nodes.find((n) => n.id === edge.target)
    if (!targetNode) continue

    // 依赖层 client 节点 -> 找到同组的 server 节点取 slaRtMs
    if (targetNode.layerId === 'dependency' && targetNode.dependencyGroupId) {
      const serverNode = state.topology.nodes.find(
        (n) =>
          n.dependencyGroupId === targetNode.dependencyGroupId &&
          n.dependencyRole === 'server',
      )
      if (serverNode) {
        const serverObjectives = state.nodeObjectives[serverNode.id] ?? {}
        const slaRt = getByPath(serverObjectives, 'slaRtMs')
        if (typeof slaRt === 'number' && slaRt > 0) {
          totalRtMs += slaRt
        }
      }
    }
  }

  return totalRtMs
}

/**
 * 获取 client -> host 连线上的报文大小
 * 也检查 client -> access -> host 的情况
 */
export function getMessageSizeBytes(state: TopologyFullState): number {
  const clientNode = state.topology.nodes.find((n) => n.layerId === 'client')
  if (!clientNode) return 1024

  for (const edge of state.topology.edges) {
    if (edge.source !== clientNode.id) continue
    const params = state.edgeParams[edge.id]
    if (params) {
      const size = getByPath(params, 'messageSizeBytes')
      if (typeof size === 'number' && size > 0) return size
    }
  }

  return 1024
}

/** 数字格式化：大于 10000 时用 K 表示 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`
  return Math.round(n).toLocaleString()
}
