/**
 * 宿主容器层 -> 运行时层 连线定义
 * 包含关系：运行时运行在宿主容器上，无需网络参数
 */

import type { EdgeTypeDefinition } from '../spec'

export const hostRuntimeEdge: EdgeTypeDefinition = {
  sourceLayerId: 'host',
  targetLayerId: 'runtime',
}
