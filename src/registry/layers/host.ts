/**
 * 宿主容器层定义：环境约束 / 可调配置 Schema 与层元信息
 */

import type { LayerDefinition, FormSchema, CrossFieldRule, FieldValidator } from '../spec'
import { getByPath } from '../schemaBuild'

const constraintsSchema: FormSchema = {
  sections: [
    {
      id: 'spec',
      label: '规格维度 (Computing Specification)',
      fields: [
        { key: 'spec.vCpu', label: 'vCPU（逻辑核数）', type: 'number', default: 8, min: 1 },
        { key: 'spec.cpuFreqGhz', label: '单核频率 (GHz)', type: 'number', default: 2.5, min: 0.1, step: 0.1 },
        { key: 'spec.memoryGb', label: '内存 (GB)', type: 'number', default: 16, min: 1 },
        {
          key: 'spec.architecture',
          label: 'Architecture',
          type: 'select',
          default: 'x86',
          options: [
            { value: 'x86', label: 'X86' },
            { value: 'arm', label: 'ARM' },
          ],
        },
      ],
    },
    {
      id: 'storage',
      label: '存储维度 (Storage / IOPS)',
      fields: [
        {
          key: 'storage.diskType',
          label: 'Disk Type',
          type: 'select',
          default: 'ssd',
          options: [
            { value: 'ssd', label: 'SSD' },
            { value: 'nvme', label: 'NVMe' },
            { value: 'hdd', label: 'HDD' },
          ],
        },
        { key: 'storage.iopsLimit', label: 'IOPS 上限', type: 'number', default: 10000, min: 0 },
        { key: 'storage.throughputMbPerSec', label: 'Throughput (MB/s)', type: 'number', default: 500, min: 0 },
      ],
    },
    {
      id: 'network',
      label: '网络维度 (Network Throughput)',
      fields: [
        { key: 'network.nicBandwidthGbps', label: 'NIC 带宽 (Gbps)', type: 'number', default: 10, min: 0 },
        { key: 'network.ppsLimit', label: 'PPS 上限', type: 'number', default: 1000000, min: 0 },
      ],
    },
    {
      id: 'os',
      label: '软件环境与内核 (OS & Kernel)',
      fields: [
        { key: 'os.osVersion', label: 'OS Version', type: 'string', default: 'AlmaLinux 9', placeholder: '如 AlmaLinux, Ubuntu' },
        { key: 'os.kernelVersion', label: 'Kernel Version', type: 'string', default: '5.14', placeholder: '如 5.14' },
      ],
    },
  ],
}

const validatePortRange: FieldValidator = (value) => {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parts = value.trim().split(/\s+/)
  if (parts.length !== 2) return '格式应为 "起始端口 结束端口"，如 "32768 60999"'
  const [startStr, endStr] = parts
  const start = Number(startStr)
  const end = Number(endStr)
  if (!Number.isInteger(start) || !Number.isInteger(end))
    return '起始端口和结束端口必须为整数'
  if (start < 1024) return `起始端口 (${start}) 不应小于 1024`
  if (end > 65535) return `结束端口 (${end}) 不应超过 65535`
  if (start >= end) return `起始端口 (${start}) 应小于结束端口 (${end})`
}

const tunablesCrossRules: CrossFieldRule[] = [
  {
    fieldKey: 'fs.ulimitN',
    check: ({ formValues }) => {
      const ulimit = getByPath(formValues, 'fs.ulimitN') as number
      const nrOpen = getByPath(formValues, 'fs.fsNrOpen') as number
      if (typeof ulimit === 'number' && typeof nrOpen === 'number' && ulimit > nrOpen)
        return `ulimit -n (${ulimit}) 不应超过 fs.nr_open (${nrOpen})，后者为内核单进程上限`
    },
  },
  {
    fieldKey: 'fs.fsNrOpen',
    check: ({ formValues }) => {
      const nrOpen = getByPath(formValues, 'fs.fsNrOpen') as number
      const fileMax = getByPath(formValues, 'fs.fsFileMax') as number
      if (typeof nrOpen === 'number' && typeof fileMax === 'number' && nrOpen > fileMax)
        return `fs.nr_open (${nrOpen}) 不应超过 fs.file-max (${fileMax})，后者为系统全局上限`
    },
  },
]

const tunablesSchema: FormSchema = {
  sections: [
    {
      id: 'net',
      label: '可调配置 — net',
      fields: [
        {
          key: 'net.tcpTwReuse',
          label: 'net.ipv4.tcp_tw_reuse',
          description: 'TIME-WAIT 端口复用',
          type: 'select',
          default: 1,
          options: [
            { value: 0, label: '0：关' },
            { value: 1, label: '1：全局开启' },
            { value: 2, label: '2：只对 loopback 开启' },
          ],
        },
        {
          key: 'net.ipLocalPortRange',
          label: 'net.ipv4.ip_local_port_range',
          type: 'string',
          default: '32768 60999',
          placeholder: '32768 60999',
          validate: validatePortRange,
        },
        { key: 'net.tcpMaxTwBuckets', label: 'net.ipv4.tcp_max_tw_buckets', type: 'number', default: 5000, min: 0 },
      ],
    },
    {
      id: 'fs',
      label: '可调配置 — fs',
      fields: [
        { key: 'fs.ulimitN', label: 'ulimit -n', type: 'number', default: 65535, min: 0 },
        { key: 'fs.fsNrOpen', label: 'fs.nr_open', type: 'number', default: 65535, min: 0 },
        { key: 'fs.fsFileMax', label: 'fs.file-max', type: 'number', default: 2097152, min: 0 },
      ],
    },
  ],
  crossRules: tunablesCrossRules,
}

export const hostLayer: LayerDefinition = {
  id: 'host',
  label: '宿主容器层',
  icon: 'H',
  theme: 'green',
  maxCount: 1,
  constraintsSchema,
  tunablesSchema,
  topologyDisplay: {
    constraints: ['spec.vCpu', 'spec.memoryGb', 'spec.architecture'],
  },
}
