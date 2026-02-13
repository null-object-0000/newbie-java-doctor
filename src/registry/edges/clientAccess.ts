/**
 * 客户端层 -> 接入网关层 连线参数定义
 * 网络环境等属于连接链路属性，放在连线上而非节点上
 */

import type { EdgeTypeDefinition } from '../spec'
import { clientNetworkParamsSchema, clientNetworkEdgeDisplay } from './shared'

export const clientAccessEdge: EdgeTypeDefinition = {
  sourceLayerId: 'client',
  targetLayerId: 'access',
  paramsSchema: clientNetworkParamsSchema,
  edgeDisplay: clientNetworkEdgeDisplay,
}
