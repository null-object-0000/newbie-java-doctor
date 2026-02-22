/**
 * 接入网关层定义：环境约束 Schema 与层元信息
 */

import type { LayerDefinition, FormSchema } from '../spec'

const constraintsSchema: FormSchema = {
  sections: [
    {
      id: 'main',
      label: '核心节点',
      description: '此环节由运维管控，暂不纳入调优排障，仅用以完善链路。',
      fields: [
        {
          key: 'nodes',
          label: '节点列表',
          description: '如 Tengine、Nginx、API Gateway',
          type: 'stringArray',
          default: ['Tengine'],
        },
      ],
    },
  ],
}

export const accessLayer: LayerDefinition = {
  id: 'access',
  label: '接入网关层',
  icon: 'G',
  theme: 'gray',
  maxCount: 1,
  ioRules: {
    hasInput: true,
    hasOutput: true,
    allowedInputLayers: ['client'],
    allowedOutputLayers: ['host', 'runtime'],
  },
  constraintsSchema,
  topologyDisplay: {
    constraints: ['nodes'],
  },
}
