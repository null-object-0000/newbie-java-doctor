/**
 * 接入网关层 -> 宿主容器层 连线定义
 * 接入层由运维管控，暂不纳入调优排障，此连线为结构性连接
 */

import type { EdgeTypeDefinition } from '../spec'

export const accessHostEdge: EdgeTypeDefinition = {
  sourceLayerId: 'access',
  targetLayerId: 'host',
}
