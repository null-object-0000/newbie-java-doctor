/**
 * 层注册表入口：从各层文件组装默认层列表，维护可变注册表与只读 API
 *
 * 使用方式：
 * - 只读：getLayers()、getLayerById()、getParamsSchema()、getDefaultParams() 等
 * - 扩展：registerLayer(def)、registerDependencyNodeType(def)
 */

import type {
  LayerDefinition,
  DependencyNodeTypeDefinition,
  LayerOrder,
  RegisterLayer,
  RegisterDependencyNodeType,
  FormSchema,
  FieldDefinition,
} from '../spec'
import { buildFromSchema } from '../schemaBuild'
import { clientLayer } from './client'
import { accessLayer } from './access'
import { hostLayer } from './host'
import { runtimeLayer } from './runtime'
import { dependencyLayer } from './dependency'

// ---------- 默认层列表（一层一文件，此处仅组装顺序） ----------

const DEFAULT_LAYER_ORDER: LayerOrder = [
  'client',
  'access',
  'host',
  'runtime',
  'dependency',
]

const defaultLayers: LayerDefinition[] = [
  clientLayer,
  accessLayer,
  hostLayer,
  runtimeLayer,
  dependencyLayer,
]

// ---------- 可变的注册表（深拷贝默认，便于扩展） ----------

const layers: LayerDefinition[] = JSON.parse(JSON.stringify(defaultLayers))
let layerOrder: LayerOrder = [...DEFAULT_LAYER_ORDER]

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}

/** 注册或覆盖一层（同 id 覆盖）；paramsSchema/configSchema 或 defaultParams/defaultConfig 会深拷贝存储 */
export const registerLayer: RegisterLayer = (def) => {
  const idx = layers.findIndex((l) => l.id === def.id)
  const next: LayerDefinition = {
    ...def,
    children: def.children ? [...def.children] : undefined,
    paramsSchema: def.paramsSchema ? deepClone(def.paramsSchema) : undefined,
    configSchema: def.configSchema ? deepClone(def.configSchema) : undefined,
    defaultParams: def.defaultParams != null ? deepClone(def.defaultParams) : undefined,
    defaultConfig: def.defaultConfig != null ? deepClone(def.defaultConfig) : undefined,
  }
  if (idx >= 0) {
    layers[idx] = next
  } else {
    layers.push(next)
    if (!layerOrder.includes(def.id)) layerOrder.push(def.id)
  }
}

/** 向依赖层追加或覆盖一种子节点类型（同 kind 覆盖） */
export const registerDependencyNodeType: RegisterDependencyNodeType = (def) => {
  const dep = layers.find((l) => l.id === 'dependency')
  if (!dep) return
  const children = dep.children ?? []
  const i = children.findIndex((c) => c.kind === def.kind)
  if (i >= 0) children[i] = { ...def }
  else children.push({ ...def })
  dep.children = children
}

// ---------- 只读 API ----------

/** 所有层定义（顺序与 layerOrder 一致） */
export function getLayers(): LayerDefinition[] {
  const order = getLayerOrder()
  return order
    .map((id) => layers.find((l) => l.id === id))
    .filter((l): l is LayerDefinition => !!l)
}

/** 按 id 取层定义 */
export function getLayerById(id: string): LayerDefinition | undefined {
  return layers.find((l) => l.id === id)
}

/** 层展示名 */
export function getLayerLabel(id: string): string {
  return getLayerById(id)?.label ?? id
}

/** 层图标（用于节点列表/拓扑图） */
export function getLayerIcon(id: string): string {
  return getLayerById(id)?.icon ?? '•'
}

/** 层顺序（用于插入新节点时排序） */
export function getLayerOrder(): LayerOrder {
  return [...layerOrder]
}

/** 设置层顺序（扩展时可调） */
export function setLayerOrder(order: LayerOrder): void {
  layerOrder = [...order]
}

/** 该层在图中最大数量，不设或 0 表示不限制 */
export function getLayerMaxCount(layerId: string): number {
  const max = getLayerById(layerId)?.maxCount
  if (max == null || max <= 0) return Number.POSITIVE_INFINITY
  return max
}

/** 依赖层下的子节点类型列表（用于节点列表、弹窗选项等） */
export function getDependencyNodeTypes(): DependencyNodeTypeDefinition[] {
  const dep = getLayerById('dependency')
  return dep?.children ? [...dep.children] : []
}

/** 按 kind 取依赖子类型展示名 */
export function getDependencyNodeTypeLabel(kind: string): string {
  const list = getDependencyNodeTypes()
  return list.find((c) => c.kind === kind)?.label ?? kind
}

/** 层在拓扑图中的主题色（如 blue/gray/green/orange），不设则 blue */
export function getLayerTheme(layerId: string): string {
  return getLayerById(layerId)?.theme ?? 'blue'
}

/** 所有层 id -> label（兼容原有 Record 用法） */
export function getLayerLabels(): Record<string, string> {
  return layers.reduce<Record<string, string>>((acc, l) => {
    acc[l.id] = l.label
    return acc
  }, {})
}

/** 所有依赖子类型 kind -> label（兼容原有 Record 用法） */
export function getDependencyKindLabels(): Record<string, string> {
  const list = getDependencyNodeTypes()
  return list.reduce<Record<string, string>>((acc, c) => {
    acc[c.kind] = c.label
    return acc
  }, {})
}

/** 该层核心参数表单 Schema（只读）；无则返回 undefined */
export function getParamsSchema(layerId: string): FormSchema | undefined {
  const layer = getLayerById(layerId)
  return layer?.paramsSchema ? deepClone(layer.paramsSchema) : undefined
}

/** 该层核心配置表单 Schema（只读）；无则返回 undefined */
export function getConfigSchema(layerId: string): FormSchema | undefined {
  const layer = getLayerById(layerId)
  return layer?.configSchema ? deepClone(layer.configSchema) : undefined
}

/** 该层核心参数默认值（深拷贝）；有 paramsSchema 则由 schema 生成，否则用 defaultParams */
export function getDefaultParams(layerId: string): unknown {
  const layer = getLayerById(layerId)
  if (!layer) return undefined
  if (layer.paramsSchema) {
    const base = buildFromSchema(layer.paramsSchema) as Record<string, unknown>
    if (layerId === 'dependency') return { httpClients: [], ...base }
    return base
  }
  if (layer.defaultParams != null) return deepClone(layer.defaultParams)
  return undefined
}

/** 该层核心配置默认值（深拷贝）；有 configSchema 则由 schema 生成，否则用 defaultConfig */
export function getDefaultConfig(layerId: string): unknown {
  const layer = getLayerById(layerId)
  if (!layer) return undefined
  if (layer.configSchema) return buildFromSchema(layer.configSchema)
  if (layer.defaultConfig != null) return deepClone(layer.defaultConfig)
  return undefined
}

/** 该层在拓扑图卡片上要展示的参数/配置 key 列表（只读） */
export function getTopologyDisplayConfig(layerId: string): { params: string[]; config: string[] } | undefined {
  const layer = getLayerById(layerId)
  const disp = layer?.topologyDisplay
  if (!disp || (!disp.params?.length && !disp.config?.length)) return undefined
  return {
    params: disp.params ?? [],
    config: disp.config ?? [],
  }
}

/** 从 Schema 中按 key 查找字段定义 */
function findFieldInSchema(schema: FormSchema | undefined, key: string): FieldDefinition | undefined {
  if (!schema) return undefined
  for (const section of schema.sections) {
    const field = section.fields.find((f) => f.key === key)
    if (field) return field
  }
  return undefined
}

/** 从 Schema 中按 key 查找字段的 label（用于拓扑图展示） */
function findFieldLabelInSchema(schema: FormSchema | undefined, key: string): string {
  const field = findFieldInSchema(schema, key)
  return field?.label ?? key
}

/** 该层某参数/配置字段在拓扑图上的展示名（来自 schema，无则返回 key） */
export function getTopologyDisplayFieldLabel(
  layerId: string,
  source: 'params' | 'config',
  key: string
): string {
  const layer = getLayerById(layerId)
  const schema = source === 'params' ? layer?.paramsSchema : layer?.configSchema
  return findFieldLabelInSchema(schema, key)
}

/** 将字段值格式化为拓扑图展示文案：枚举型从 schema options 取 label，否则按类型格式化 */
export function getTopologyDisplayValueLabel(
  layerId: string,
  source: 'params' | 'config',
  key: string,
  value: unknown
): string {
  const layer = getLayerById(layerId)
  const schema = source === 'params' ? layer?.paramsSchema : layer?.configSchema
  const field = findFieldInSchema(schema, key)

  if (field?.type === 'select' && field.options?.length) {
    const opt = field.options.find(
      (o) => o.value === value || String(o.value) === String(value)
    )
    if (opt) return opt.label
  }

  if (value == null) return '—'
  if (Array.isArray(value)) {
    if (value.length > 2) return `${value.length} 项`
    return value.map((v) => (v != null ? String(v) : '')).join(', ')
  }
  return String(value)
}
