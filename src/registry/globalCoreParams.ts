/**
 * 全局核心参数：全链路共用的核心参数（如业务场景），不属于某一层
 */

import type { FormSchema, FieldDefinition } from './spec'
import { buildFromSchema } from './schemaBuild'
import type { GlobalCoreParams } from '@/types/layers'

const GLOBAL_CORE_PARAMS_SCHEMA: FormSchema = {
  sections: [
    {
      id: 'global',
      label: '全局核心参数',
      description: '全链路共用，需使用者提供',
      fields: [
        {
          key: 'businessScenario',
          label: '业务场景',
          type: 'select',
          default: 'io',
          options: [
            { value: 'io', label: 'IO 密集型' },
            { value: 'compute', label: '计算密集型' },
          ],
        },
      ],
    },
  ],
}

export function getGlobalCoreParamsSchema(): FormSchema {
  return JSON.parse(JSON.stringify(GLOBAL_CORE_PARAMS_SCHEMA))
}

export function getDefaultGlobalCoreParams(): GlobalCoreParams {
  return buildFromSchema(GLOBAL_CORE_PARAMS_SCHEMA) as GlobalCoreParams
}

function findFieldInSchema(schema: FormSchema, key: string): FieldDefinition | undefined {
  for (const section of schema.sections) {
    const field = section.fields.find((f) => f.key === key)
    if (field) return field
  }
  return undefined
}

export function getGlobalCoreParamsFieldLabel(key: string): string {
  const field = findFieldInSchema(GLOBAL_CORE_PARAMS_SCHEMA, key)
  return field?.label ?? key
}

export function getGlobalCoreParamsValueLabel(key: string, value: unknown): string {
  const field = findFieldInSchema(GLOBAL_CORE_PARAMS_SCHEMA, key)
  if (field?.type === 'select' && field.options?.length) {
    const opt = field.options.find(
      (o) => o.value === value || String(o.value) === String(value)
    )
    if (opt) return opt.label
  }
  if (value == null) return '—'
  return String(value)
}

/** 全局核心参数中的字段 key 列表（用于判断某 key 是否从全局取） */
export const GLOBAL_CORE_PARAM_KEYS = ['businessScenario'] as const

export function isGlobalCoreParamKey(key: string): boolean {
  return (GLOBAL_CORE_PARAM_KEYS as readonly string[]).includes(key)
}
