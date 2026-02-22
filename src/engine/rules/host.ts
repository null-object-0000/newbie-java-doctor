/**
 * 宿主容器层计算规则：天花板分析 + 约束校验
 */

import type { CeilingDetail, DiagnosticWarning } from '../types'
import type { NodeData } from '../helpers'
import { parsePortRange } from '../helpers'
import { getByPath } from '@/registry/schemaBuild'

export interface HostCeilingInput {
  hostData: NodeData
  messageSizeBytes: number
}

export interface HostCeilingResult {
  details: CeilingDetail[]
  warnings: DiagnosticWarning[]
}

const DEFAULT_PACKETS_PER_REQUEST = 4
const DEFAULT_CONNECTION_HOLD_SEC = 0.06
const RESERVED_FD = 256

export function computeHostCeiling(input: HostCeilingInput): HostCeilingResult {
  const { hostData, messageSizeBytes } = input
  const { node, constraints, tunables } = hostData
  const details: CeilingDetail[] = []
  const warnings: DiagnosticWarning[] = []

  const nicBandwidthGbps = (getByPath(constraints, 'network.nicBandwidthGbps') as number) ?? 10
  const ppsLimit = (getByPath(constraints, 'network.ppsLimit') as number) ?? 1_000_000
  const ipLocalPortRange = (getByPath(tunables, 'net.ipLocalPortRange') as string) ?? '32768 60999'
  const ulimitN = (getByPath(tunables, 'fs.ulimitN') as number) ?? 65535
  const fsNrOpen = (getByPath(tunables, 'fs.fsNrOpen') as number) ?? 65535
  const fsFileMax = (getByPath(tunables, 'fs.fsFileMax') as number) ?? 2097152

  // --- 带宽天花板 ---
  const bandwidthBytesPerSec = nicBandwidthGbps * 1e9 / 8
  const maxByBandwidth = Math.floor(bandwidthBytesPerSec / messageSizeBytes)
  details.push({
    dimension: 'bandwidth',
    label: '网络带宽',
    maxValue: maxByBandwidth,
    formula: `NIC带宽(${nicBandwidthGbps}Gbps) × 1e9 / 8 / 报文大小(${messageSizeBytes}B)`,
    inputs: { nicBandwidthGbps, messageSizeBytes },
  })

  // --- PPS 天花板 ---
  const maxByPps = Math.floor(ppsLimit / DEFAULT_PACKETS_PER_REQUEST)
  details.push({
    dimension: 'pps',
    label: 'PPS (包转发率)',
    maxValue: maxByPps,
    formula: `PPS上限(${ppsLimit}) / 每请求包数(${DEFAULT_PACKETS_PER_REQUEST})`,
    inputs: { ppsLimit, packetsPerRequest: DEFAULT_PACKETS_PER_REQUEST },
  })

  // --- 端口天花板 ---
  const portRange = parsePortRange(ipLocalPortRange)
  if (portRange) {
    const availablePorts = portRange.high - portRange.low + 1
    const maxByPorts = Math.floor(availablePorts / DEFAULT_CONNECTION_HOLD_SEC)
    details.push({
      dimension: 'port',
      label: '临时端口',
      maxValue: maxByPorts,
      formula: `可用端口(${portRange.high} - ${portRange.low} + 1 = ${availablePorts}) / 连接保持时间(${DEFAULT_CONNECTION_HOLD_SEC}s)`,
      inputs: { portRange: ipLocalPortRange, availablePorts, connectionHoldTimeSec: DEFAULT_CONNECTION_HOLD_SEC },
    })
  } else {
    warnings.push({
      nodeId: node.id,
      nodeLabel: node.label,
      level: 'warning',
      code: 'PORT_RANGE_INVALID',
      message: `ip_local_port_range 格式无效: "${ipLocalPortRange}"`,
      suggestion: '请设置为 "起始端口 结束端口" 格式，如 "1024 65535"',
    })
  }

  // --- 文件句柄天花板 ---
  const availableFd = Math.max(0, ulimitN - RESERVED_FD)
  details.push({
    dimension: 'fd',
    label: '文件句柄',
    maxValue: availableFd,
    formula: `ulimit -n(${ulimitN}) - 预留(${RESERVED_FD})`,
    inputs: { ulimitN, reservedFd: RESERVED_FD },
  })

  // --- 约束校验 ---
  if (ulimitN > fsNrOpen) {
    warnings.push({
      nodeId: node.id,
      nodeLabel: node.label,
      level: 'error',
      code: 'FD_ULIMIT_EXCEEDS_NROPEN',
      message: `ulimit -n(${ulimitN}) 超过 fs.nr_open(${fsNrOpen})`,
      suggestion: '将 fs.nr_open 调整为不低于 ulimit -n 的值',
    })
  }
  if (fsNrOpen > fsFileMax) {
    warnings.push({
      nodeId: node.id,
      nodeLabel: node.label,
      level: 'error',
      code: 'FD_NROPEN_EXCEEDS_FILEMAX',
      message: `fs.nr_open(${fsNrOpen}) 超过 fs.file-max(${fsFileMax})`,
      suggestion: '将 fs.file-max 调整为不低于 fs.nr_open 的值',
    })
  }

  if (portRange) {
    const availablePorts = portRange.high - portRange.low + 1
    if (availablePorts < 10000) {
      warnings.push({
        nodeId: node.id,
        nodeLabel: node.label,
        level: 'warning',
        code: 'PORT_RANGE_SMALL',
        message: `可用端口范围仅 ${availablePorts} 个 (${ipLocalPortRange})`,
        suggestion: '建议将端口范围扩大到至少 "1024 65535"（61512 个端口）以支撑高并发',
      })
    }
  }

  return { details, warnings }
}
