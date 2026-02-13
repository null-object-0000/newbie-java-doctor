/**
 * 客户端层定义：核心参数 Schema 与层元信息
 */

import type { LayerDefinition, FormSchema } from '../spec'

const paramsSchema: FormSchema = {
  sections: [
    {
      id: 'main',
      label: '核心参数',
      description: '需使用者提供（业务场景为全局核心参数，在未选节点时于右侧编辑）',
      fields: [
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
    allowedOutputLayers: ['access', 'host'],
  },
  paramsSchema,
  topologyDisplay: {
    params: ['businessScenario', 'concurrentUsers', 'targetThroughputRps'], // businessScenario 从全局核心参数取值展示
  },
}
