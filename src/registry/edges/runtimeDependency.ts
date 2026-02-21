/**
 * 运行时层 -> 依赖层 连线定义
 * 结构性连接：表示应用调用了该依赖；网络参数在依赖节点自身的 client/server 定义中
 */

import type { EdgeTypeDefinition } from '../spec'

export const runtimeDependencyEdge: EdgeTypeDefinition = {
  sourceLayerId: 'runtime',
  targetLayerId: 'dependency',
}
