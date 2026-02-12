/**
 * 接入网关层定义：核心参数 Schema 与层元信息
 */

import type { LayerDefinition, FormSchema } from '../spec'

const paramsSchema: FormSchema = {
  sections: [
    {
      id: 'main',
      label: '核心节点',
      fields: [
        {
          key: 'nodes',
          label: '节点列表',
          description: '如 Tengine、Nginx、API Gateway',
          type: 'stringArray',
          default: ['Tengine', 'Nginx', 'API Gateway'],
        },
        {
          key: 'note',
          label: '说明',
          type: 'string',
          default: '此环节由运维管控，暂不纳入调优排障，仅用以完善链路。',
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
  paramsSchema,
  topologyDisplay: {
    params: ['nodes'],
  },
}
