/**
 * 连线参数共用 Schema：多条连线共享同一套参数定义时在此抽取
 */

import type { FormSchema } from '../spec'

/** 客户端出站连线的网络参数 Schema（client -> access / client -> host 共用） */
export const clientNetworkParamsSchema: FormSchema = {
  sections: [
    {
      id: 'network',
      label: '网络参数',
      fields: [
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
        {
          key: 'messageSizeBytes',
          label: '报文大小 (bytes)',
          type: 'number',
          default: 1024,
          min: 1,
        },
      ],
    },
  ],
}

/** 客户端出站连线在拓扑图上展示的字段 */
export const clientNetworkEdgeDisplay = { params: ['networkEnv'] }
