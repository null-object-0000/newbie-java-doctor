/**
 * 连线类型注册入口：汇总所有默认连线类型定义
 */

import type { EdgeTypeDefinition } from '../spec'
import { clientAccessEdge } from './clientAccess'
import { clientHostEdge } from './clientHost'

/** 默认连线类型列表（在 layers/index.ts 中注册到注册表） */
export const defaultEdgeTypes: EdgeTypeDefinition[] = [
  clientAccessEdge,
  clientHostEdge,
]
