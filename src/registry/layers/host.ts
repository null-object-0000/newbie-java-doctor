/**
 * 宿主容器层定义：核心参数 / 核心配置 Schema 与层元信息
 */

import type { LayerDefinition, FormSchema } from '../spec'

const paramsSchema: FormSchema = {
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

const configSchema: FormSchema = {
  sections: [
    {
      id: 'net',
      label: '核心配置（可调优）— net',
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
        { key: 'net.ipLocalPortRange', label: 'net.ipv4.ip_local_port_range', type: 'string', default: '32768 60999', placeholder: '32768 60999' },
        { key: 'net.tcpMaxTwBuckets', label: 'net.ipv4.tcp_max_tw_buckets', type: 'number', default: 5000, min: 0 },
      ],
    },
    {
      id: 'fs',
      label: '核心配置（可调优）— fs',
      fields: [
        { key: 'fs.ulimitN', label: 'ulimit -n', type: 'number', default: 65535, min: 0 },
        { key: 'fs.fsNrOpen', label: 'fs.nr_open', type: 'number', default: 65535, min: 0 },
        { key: 'fs.fsFileMax', label: 'fs.file-max', type: 'number', default: 2097152, min: 0 },
      ],
    },
  ],
}

export const hostLayer: LayerDefinition = {
  id: 'host',
  label: '宿主容器层',
  icon: 'H',
  theme: 'green',
  maxCount: 1,
  paramsSchema,
  configSchema,
  topologyDisplay: {
    params: ['spec.vCpu', 'spec.memoryGb', 'spec.architecture'],
  },
}
