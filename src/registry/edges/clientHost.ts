/**
 * 客户端层 -> 宿主容器层 连线参数定义
 * 跳过接入网关直连宿主时，仍需配置网络环境等链路属性
 */

import type { EdgeTypeDefinition } from '../spec'
import { clientNetworkParamsSchema, clientNetworkEdgeDisplay } from './shared'

export const clientHostEdge: EdgeTypeDefinition = {
  sourceLayerId: 'client',
  targetLayerId: 'host',
  paramsSchema: clientNetworkParamsSchema,
  edgeDisplay: clientNetworkEdgeDisplay,
}
