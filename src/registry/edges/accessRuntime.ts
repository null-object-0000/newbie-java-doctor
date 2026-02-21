/**
 * 接入网关层 -> 运行时层 连线定义
 * 跳过宿主层直连运行时的场景；接入层由运维管控，暂不纳入调优排障
 */

import type { EdgeTypeDefinition } from '../spec'

export const accessRuntimeEdge: EdgeTypeDefinition = {
  sourceLayerId: 'access',
  targetLayerId: 'runtime',
}
