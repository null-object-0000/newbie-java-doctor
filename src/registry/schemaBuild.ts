/**
 * 根据 FormSchema 生成默认值对象，以及按 dot-path 读写对象属性（供动态表单绑定）
 */

import type { FormSchema } from './spec'

/** 按 dot-path 取值，如 "spec.vCpu" -> obj.spec.vCpu */
export function getByPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined
  const parts = path.split('.')
  let current: unknown = obj
  for (const p of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[p]
  }
  return current
}

/** 按 dot-path 写值，如 "spec.vCpu" 会确保 obj.spec 存在再赋值 */
export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let current: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!
    if (!(p in current) || typeof current[p] !== 'object') {
      current[p] = {}
    }
    current = current[p] as Record<string, unknown>
  }
  current[parts[parts.length - 1]!] = value
}

/** 根据 FormSchema 生成默认值对象（深拷贝默认值按 path 写入） */
export function buildFromSchema(schema: FormSchema): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const section of schema.sections) {
    for (const field of section.fields) {
      setByPath(result, field.key, field.default)
    }
  }
  return result
}
