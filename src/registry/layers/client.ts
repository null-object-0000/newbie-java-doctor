/**
 * 客户端层定义：核心参数 Schema 与层元信息
 */

import type { LayerDefinition, FormSchema } from '../spec'

const paramsSchema: FormSchema = {
  sections: [
    {
      id: 'main',
      label: '核心参数',
      description: '需使用者提供',
      fields: [
        {
          key: 'businessScenario',
          label: '业务场景',
          type: 'select',
          default: 'io',
          options: [
            { value: 'io', label: 'IO 密集型' },
            { value: 'compute', label: '计算密集型' },
          ],
        },
        {
          key: 'networkEnv',
          label: '网络环境',
          type: 'select',
          default: 'intra_dc',
          options: [
            { value: 'public', label: '公网' },
            { value: 'intra_dc', label: '内网（同中心）' },
            { value: 'cross_dc', label: '内网（跨中心）' },
          ],
        },
        { key: 'messageSizeBytes', label: '报文大小 (bytes)', type: 'number', default: 1024, min: 1 },
        { key: 'concurrentUsers', label: '并发用户数', type: 'number', default: 100, min: 1 },
        { key: 'targetThroughputRps', label: '目标吞吐量 (RPS)', type: 'number', default: 500, min: 1 },
        {
          key: 'expectedFailureRatePercent',
          label: '预期失败率 (%)',
          description: '默认 0%，不允许有失败请求',
          type: 'number',
          default: 0,
          min: 0,
          max: 100,
        },
      ],
    },
  ],
}

export const clientLayer: LayerDefinition = {
  id: 'client',
  label: '客户端层',
  icon: 'C',
  theme: 'blue',
  maxCount: 1,
  ioRules: {
    hasInput: false,
    hasOutput: true,
    allowedOutputLayers: ['access'],
  },
  paramsSchema,
  topologyDisplay: {
    params: ['businessScenario', 'concurrentUsers', 'targetThroughputRps'],
  },
}
