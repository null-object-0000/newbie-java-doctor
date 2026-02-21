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
  EdgeTypeDefinition,
  LayerOrder,
  RegisterLayer,
  RegisterDependencyNodeType,
  RegisterEdgeType,
  FormSchema,
  FieldDefinition,
  NodeIoRules,
} from '../spec'
import { buildFromSchema } from '../schemaBuild'
import { clientLayer } from './client'
import { accessLayer } from './access'
import { hostLayer } from './host'
import { runtimeLayer } from './runtime'
import { dependencyLayer } from './dependency'
import { defaultEdgeTypes } from '../edges/index'

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

/**
 * 深拷贝，保留函数引用（JSON.parse/stringify 会丢弃函数，导致 crossRules.check / validate 丢失）
 */
function deepClone<T>(x: T): T {
  if (x === null || x === undefined) return x
  if (typeof x === 'function') return x
  if (Array.isArray(x)) return x.map((item) => deepClone(item)) as unknown as T
  if (typeof x === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(x as Record<string, unknown>)) {
      result[key] = deepClone((x as Record<string, unknown>)[key])
    }
    return result as T
  }
  return x
}

const layers: LayerDefinition[] = defaultLayers.map((l) => deepClone(l))
let layerOrder: LayerOrder = [...DEFAULT_LAYER_ORDER]

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

// ---------- 连线类型注册表 ----------

function edgeTypeKey(sourceLayerId: string, targetLayerId: string): string {
  return `${sourceLayerId}->${targetLayerId}`
}

const edgeTypes = new Map<string, EdgeTypeDefinition>()
for (const def of defaultEdgeTypes) {
  edgeTypes.set(edgeTypeKey(def.sourceLayerId, def.targetLayerId), deepClone(def))
}

/** 注册或覆盖一种连线类型（同 sourceLayerId+targetLayerId 覆盖） */
export const registerEdgeType: RegisterEdgeType = (def) => {
  edgeTypes.set(edgeTypeKey(def.sourceLayerId, def.targetLayerId), deepClone(def))
}

/** 根据源/目标层 ID 获取连线类型定义 */
export function getEdgeType(sourceLayerId: string, targetLayerId: string): EdgeTypeDefinition | undefined {
  return edgeTypes.get(edgeTypeKey(sourceLayerId, targetLayerId))
}

/** 获取连线参数表单 Schema（只读深拷贝） */
export function getEdgeParamsSchema(sourceLayerId: string, targetLayerId: string): FormSchema | undefined {
  const def = getEdgeType(sourceLayerId, targetLayerId)
  return def?.paramsSchema ? deepClone(def.paramsSchema) : undefined
}

/** 获取连线参数默认值 */
export function getEdgeDefaultParams(sourceLayerId: string, targetLayerId: string): Record<string, unknown> {
  const def = getEdgeType(sourceLayerId, targetLayerId)
  if (def?.paramsSchema) return buildFromSchema(def.paramsSchema)
  return {}
}

/** 获取连线上需要展示的参数字段 key 列表 */
export function getEdgeDisplayConfig(sourceLayerId: string, targetLayerId: string): { params: string[] } | undefined {
  const def = getEdgeType(sourceLayerId, targetLayerId)
  if (!def?.edgeDisplay?.params?.length) return undefined
  return { params: [...def.edgeDisplay.params] }
}

/** 获取连线参数 Schema 中指定字段的 label */
export function getEdgeFieldLabel(sourceLayerId: string, targetLayerId: string, key: string): string {
  const schema = getEdgeType(sourceLayerId, targetLayerId)?.paramsSchema
  return findFieldLabelInSchema(schema, key)
}

/** 将连线参数字段值格式化为展示文案 */
export function getEdgeValueLabel(sourceLayerId: string, targetLayerId: string, key: string, value: unknown): string {
  const schema = getEdgeType(sourceLayerId, targetLayerId)?.paramsSchema
  const field = findFieldInSchema(schema, key)
  if (field?.type === 'select' && field.options?.length) {
    const opt = field.options.find((o) => o.value === value || String(o.value) === String(value))
    if (opt) return opt.label
  }
  if (value == null) return '—'
  if (Array.isArray(value)) {
    if (value.length > 2) return `${value.length} 项`
    return value.map((v) => (v != null ? String(v) : '')).join(', ')
  }
  return String(value)
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

/** 按 kind 取依赖子类型定义（含其 schema、topologyDisplay） */
export function getDependencyNodeType(kind: string): DependencyNodeTypeDefinition | undefined {
  return getDependencyNodeTypes().find((c) => c.kind === kind)
}

/** 按 kind 取依赖子类型展示名 */
export function getDependencyNodeTypeLabel(kind: string): string {
  const list = getDependencyNodeTypes()
  return list.find((c) => c.kind === kind)?.label ?? kind
}

/** 按 kind 取依赖子类型 clientServer（client_only | client_and_server） */
export function getDependencyClientServer(kind: string): 'client_only' | 'client_and_server' {
  const child = getDependencyNodeType(kind)
  return child?.clientServer ?? 'client_only'
}

/** 层在拓扑图中的主题色（如 blue/gray/green/orange），不设则 blue */
export function getLayerTheme(layerId: string): string {
  return getLayerById(layerId)?.theme ?? 'blue'
}

/** 节点输入输出规则：依赖层按子类型取（子类型优先），否则取层定义；未设的字段视为默认（有输入/输出、不限制层） */
export function getNodeIoRules(
  layerId: string,
  dependencyKind?: string
): Required<NodeIoRules> {
  const layer = getLayerById(layerId)
  const base: NodeIoRules = layer?.ioRules ?? {}
  let rules: NodeIoRules = { ...base }
  if (layerId === 'dependency' && dependencyKind) {
    const child = getDependencyNodeType(dependencyKind)
    if (child?.ioRules) {
      rules = { ...base, ...child.ioRules }
    }
  }
  return {
    hasInput: rules.hasInput !== false,
    hasOutput: rules.hasOutput !== false,
    allowedInputLayers: rules.allowedInputLayers ?? [],
    allowedOutputLayers: rules.allowedOutputLayers ?? [],
  }
}

/** 校验一条边是否符合节点输入输出规则；用于 addEdge 前校验 */
export function validateEdge(
  source: { layerId: string; dependencyKind?: string },
  target: { layerId: string; dependencyKind?: string }
): { valid: boolean; message?: string } {
  const srcRules = getNodeIoRules(source.layerId, source.dependencyKind)
  const tgtRules = getNodeIoRules(target.layerId, target.dependencyKind)
  if (!srcRules.hasOutput) {
    return { valid: false, message: '源节点不允许输出连线' }
  }
  if (!tgtRules.hasInput) {
    return { valid: false, message: '目标节点不接受输入连线' }
  }
  if (
    tgtRules.allowedInputLayers.length > 0 &&
    !tgtRules.allowedInputLayers.includes(source.layerId)
  ) {
    const names = tgtRules.allowedInputLayers.map((id) => getLayerLabel(id)).join('、')
    return {
      valid: false,
      message: `目标节点仅接受来自「${names}」的输入`,
    }
  }
  if (
    srcRules.allowedOutputLayers.length > 0 &&
    !srcRules.allowedOutputLayers.includes(target.layerId)
  ) {
    const names = srcRules.allowedOutputLayers.map((id) => getLayerLabel(id)).join('、')
    return {
      valid: false,
      message: `源节点仅允许连到「${names}」`,
    }
  }
  return { valid: true }
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

/** 依赖层节点角色：client_and_server 时按 role 取 server/client 各自 schema */
export type DependencyRole = 'client' | 'server'

function getDependencySchemaByRole(
  child: DependencyNodeTypeDefinition | undefined,
  role: DependencyRole | undefined,
  kind: 'params' | 'config'
): FormSchema | undefined {
  if (!child) return undefined
  const isServer = role === 'server'
  const isClient = role === 'client'
  if (child.clientServer === 'client_and_server') {
    if (kind === 'params') return isServer ? child.serverParamsSchema : isClient ? child.clientParamsSchema : undefined
    return isServer ? child.serverConfigSchema : isClient ? child.clientConfigSchema : undefined
  }
  return kind === 'params' ? child.paramsSchema : child.configSchema
}

/** 该层核心参数表单 Schema（只读）。依赖层需传 dependencyKind；client_and_server 时传 dependencyRole 取 server/client 各自 schema */
export function getParamsSchema(
  layerId: string,
  dependencyKind?: string,
  dependencyRole?: DependencyRole
): FormSchema | undefined {
  if (layerId === 'dependency' && dependencyKind) {
    const child = getDependencyNodeType(dependencyKind)
    const schema = getDependencySchemaByRole(child, dependencyRole, 'params')
    return schema ? deepClone(schema) : undefined
  }
  const layer = getLayerById(layerId)
  return layer?.paramsSchema ? deepClone(layer.paramsSchema) : undefined
}

/** 该层核心配置表单 Schema（只读）。依赖层需传 dependencyKind；client_and_server 时传 dependencyRole 取 server/client 各自 schema */
export function getConfigSchema(
  layerId: string,
  dependencyKind?: string,
  dependencyRole?: DependencyRole
): FormSchema | undefined {
  if (layerId === 'dependency' && dependencyKind) {
    const child = getDependencyNodeType(dependencyKind)
    const schema = getDependencySchemaByRole(child, dependencyRole, 'config')
    return schema ? deepClone(schema) : undefined
  }
  const layer = getLayerById(layerId)
  return layer?.configSchema ? deepClone(layer.configSchema) : undefined
}

/** 该层核心参数默认值（深拷贝）。依赖层需传 dependencyKind、dependencyRole（client_and_server 时） */
export function getDefaultParams(
  layerId: string,
  dependencyKind?: string,
  dependencyRole?: DependencyRole
): unknown {
  if (layerId === 'dependency' && dependencyKind) {
    const child = getDependencyNodeType(dependencyKind)
    const schema = getDependencySchemaByRole(child, dependencyRole, 'params')
    if (schema) return buildFromSchema(schema)
    return {}
  }
  const layer = getLayerById(layerId)
  if (!layer) return undefined
  if (layer.paramsSchema) return buildFromSchema(layer.paramsSchema) as Record<string, unknown>
  if (layer.defaultParams != null) return deepClone(layer.defaultParams)
  return undefined
}

/** 该层核心配置默认值（深拷贝）。依赖层需传 dependencyKind、dependencyRole（client_and_server 时） */
export function getDefaultConfig(
  layerId: string,
  dependencyKind?: string,
  dependencyRole?: DependencyRole
): unknown {
  if (layerId === 'dependency' && dependencyKind) {
    const child = getDependencyNodeType(dependencyKind)
    const schema = getDependencySchemaByRole(child, dependencyRole, 'config')
    if (schema) return buildFromSchema(schema)
    return {}
  }
  const layer = getLayerById(layerId)
  if (!layer) return undefined
  if (layer.configSchema) return buildFromSchema(layer.configSchema)
  if (layer.defaultConfig != null) return deepClone(layer.defaultConfig)
  return undefined
}

/** 该层在拓扑图卡片上要展示的参数/配置 key 列表。依赖层需传 dependencyKind、dependencyRole（client_and_server 时取 server/client 各自 topologyDisplay） */
export function getTopologyDisplayConfig(
  layerId: string,
  dependencyKind?: string,
  dependencyRole?: DependencyRole
): { params: string[]; config: string[] } | undefined {
  if (layerId === 'dependency' && dependencyKind) {
    const child = getDependencyNodeType(dependencyKind)
    const disp =
      child?.clientServer === 'client_and_server' && dependencyRole === 'server'
        ? child.serverTopologyDisplay
        : child?.clientServer === 'client_and_server' && dependencyRole === 'client'
          ? child.clientTopologyDisplay
          : child?.topologyDisplay
    if (!disp || (!disp.params?.length && !disp.config?.length)) return undefined
    return { params: disp.params ?? [], config: disp.config ?? [] }
  }
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

/** 该层某参数/配置字段在拓扑图上的展示名。依赖层需传 dependencyKind、dependencyRole（client_and_server 时） */
export function getTopologyDisplayFieldLabel(
  layerId: string,
  source: 'params' | 'config',
  key: string,
  dependencyKind?: string,
  dependencyRole?: DependencyRole
): string {
  if (layerId === 'dependency' && dependencyKind) {
    const child = getDependencyNodeType(dependencyKind)
    const schema = getDependencySchemaByRole(child, dependencyRole, source === 'params' ? 'params' : 'config')
    return findFieldLabelInSchema(schema, key)
  }
  const layer = getLayerById(layerId)
  const schema = source === 'params' ? layer?.paramsSchema : layer?.configSchema
  return findFieldLabelInSchema(schema, key)
}

/** 将字段值格式化为拓扑图展示文案。依赖层需传 dependencyKind、dependencyRole（client_and_server 时） */
export function getTopologyDisplayValueLabel(
  layerId: string,
  source: 'params' | 'config',
  key: string,
  value: unknown,
  dependencyKind?: string,
  dependencyRole?: DependencyRole
): string {
  let schema: FormSchema | undefined
  if (layerId === 'dependency' && dependencyKind) {
    const child = getDependencyNodeType(dependencyKind)
    schema = getDependencySchemaByRole(child, dependencyRole, source === 'params' ? 'params' : 'config')
  } else {
    const layer = getLayerById(layerId)
    schema = source === 'params' ? layer?.paramsSchema : layer?.configSchema
  }
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

