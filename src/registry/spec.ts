/**
 * 层与节点定义规范
 *
 * 约定：
 * - 层（Layer）：拓扑中的一类节点集合，如「客户端层」「依赖层」。有唯一 id、展示名、图标、可选数量上限等。
 * - 依赖层子类型（DependencyNodeType）：依赖层下的可拖入节点类型，如 Redis、数据库。有 kind、展示名。
 * - 属性配置：每层通过「表单 Schema」定义环境约束 / 负载目标 / 可调配置的字段（名称、描述、类型、默认值等），由动态表单渲染，不硬编码。
 * - 扩展方式：通过 register 向注册表追加或覆盖定义，业务层统一从 registry 读取，不写死层/节点列表。
 */

// ========== 校验类型 ==========

/** 校验上下文：提供当前表单所有字段值及外部上下文（如 constraints -> tunables 的联动） */
export interface ValidationContext {
  /** 当前表单内所有字段值（可能是嵌套对象，通过 dot-path 写入） */
  formValues: Record<string, unknown>
  /** 外部上下文，例如编辑可调配置时传入的同节点环境约束 */
  externalContext?: Record<string, unknown>
}

/** 字段级校验器：返回错误信息字符串表示校验失败，返回 undefined 表示通过 */
export type FieldValidator = (
  value: unknown,
  ctx: ValidationContext,
) => string | undefined

/** 跨字段校验规则：检查多个字段之间的逻辑约束 */
export interface CrossFieldRule {
  /** 错误信息应挂载到哪个字段的 key（用于定位展示位置） */
  fieldKey: string
  /** 校验函数：返回错误信息表示校验失败，返回 undefined 表示通过 */
  check: (ctx: ValidationContext) => string | undefined
}

// ========== 字段与表单定义 ==========

/** 单字段定义：key 为 dot-path（如 spec.vCpu），label/description 用于展示，type 决定控件，default 为默认值 */
export interface FieldDefinition {
  key: string
  label: string
  description?: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'stringArray'
  default: unknown
  /** select 时必填：{ value, label }[] */
  options?: { value: string | number | boolean; label: string }[]
  placeholder?: string
  min?: number
  max?: number
  step?: number
  /** 字段级自定义校验器 */
  validate?: FieldValidator
}

/** 依赖层专用：区块归属「通用」或某类依赖（如 redis / database），用于分组、筛选或展示说明 */
export type SectionScope = 'generic' | 'redis' | 'database'

/** 区块条件显示：当 context 中指定字段等于指定值时才渲染该区块 */
export interface SectionVisibleWhen {
  /** 字段 dot-path（在外部 context 对象中查找，如 constraints 中的 clientType） */
  field: string
  /** 匹配值：字段值等于此值时显示 */
  value: unknown
}

/** 表单区块（卡片标题 + 字段列表） */
export interface FormSection {
  id: string
  label: string
  description?: string
  /** 依赖层专用：不填视为通用；redis / database 表示该区块仅对应此类依赖 */
  sectionScope?: SectionScope
  /** 条件显示：不填则始终显示；填写后仅当 context 中对应字段匹配时渲染 */
  visibleWhen?: SectionVisibleWhen
  fields: FieldDefinition[]
}

/** 完整表单 Schema：多区块，驱动动态表单渲染与默认值生成 */
export interface FormSchema {
  sections: FormSection[]
  /** 跨字段校验规则：用于检查同一表单内多个字段之间的逻辑约束 */
  crossRules?: CrossFieldRule[]
}

/**
 * 拓扑图节点卡片上要展示的字段：来自环境约束 / 负载目标 / 可调配置的 dot-path 列表
 */
export interface TopologyDisplayConfig {
  /** 在卡片上展示的环境约束字段 key（dot-path，如 spec.vCpu） */
  constraints?: string[]
  /** 在卡片上展示的负载目标字段 key（dot-path，如 targetThroughputRps） */
  objectives?: string[]
  /** 在卡片上展示的可调配置字段 key（dot-path，如 gc、tomcatMaxThreads） */
  tunables?: string[]
}

/**
 * 节点输入输出规则：控制拓扑图中连线的合法性
 * - 是否有输入/输出：无输入则无「上端口」，无输出则无「下端口」
 * - 是否只接受指定层的输入/输出：限制连线只能来自/指向指定 layerId
 */
export interface NodeIoRules {
  /** 是否有输入端口（可被作为边的 target），默认 true */
  hasInput?: boolean
  /** 是否有输出端口（可被作为边的 source），默认 true */
  hasOutput?: boolean
  /** 仅接受来自这些 layerId 的输入；不设或空表示接受任意层 */
  allowedInputLayers?: string[]
  /** 仅允许连到这些 layerId 的输出；不设或空表示允许连到任意层 */
  allowedOutputLayers?: string[]
}

/** 单层定义：id 唯一，label 用于展示，icon 用于节点列表/拓扑图，maxCount 为该层在图中最多出现次数（不设则不限） */
export interface LayerDefinition {
  id: string
  label: string
  icon: string
  /** 拓扑图节点卡片主题色：blue | gray | green | orange 等，不设则用 blue */
  theme?: string
  /** 该层节点在图中最多几个，不设或 0 表示不限制 */
  maxCount?: number
  /** 该层节点的输入输出规则（是否有输入/输出、是否只接受指定层的连线） */
  ioRules?: NodeIoRules
  /** 仅依赖层使用：该层下可拖入的子节点类型，无则层本身可拖（若 maxCount 允许） */
  children?: DependencyNodeTypeDefinition[]
  /** 在拓扑图节点卡片上展示哪些字段（key 为对应 schema 中的 dot-path） */
  topologyDisplay?: TopologyDisplayConfig
  /** 环境约束表单 Schema：硬件/基础设施的物理边界，不能或很难改 */
  constraintsSchema?: FormSchema
  /** 负载目标表单 Schema：业务方的性能期望和负载画像 */
  objectivesSchema?: FormSchema
  /** 可调配置表单 Schema：基于约束和目标来决定的调优旋钮 */
  tunablesSchema?: FormSchema
  /** 兼容：无 constraintsSchema 时使用的默认环境约束（逐步迁移后可删） */
  defaultConstraints?: unknown
  /** 兼容：无 objectivesSchema 时使用的默认负载目标（逐步迁移后可删） */
  defaultObjectives?: unknown
  /** 兼容：无 tunablesSchema 时使用的默认可调配置（逐步迁移后可删） */
  defaultTunables?: unknown
}

/** 依赖层子节点在拓扑中的角色：仅客户端 / 既有 client 又有 server（拓扑上为两个独立节点组合） */
export type DependencyClientServer = 'client_only' | 'client_and_server'

/** 依赖层下的子节点类型：kind 唯一，label 用于展示；各子类型拥有自己的 schema 与拓扑展示 */
export interface DependencyNodeTypeDefinition {
  kind: string
  label: string
  /** 是否仅 client，或既有 client 又有 server（拖入时自动创建并关联两个节点，配置完全分开） */
  clientServer: DependencyClientServer
  /** 该子类型的输入输出规则（覆盖依赖层的 ioRules） */
  ioRules?: NodeIoRules

  /** client_only 时：环境约束 Schema；client_and_server 时：仅作备用 */
  constraintsSchema?: FormSchema
  /** client_only 时：负载目标 Schema；client_and_server 时：仅作备用 */
  objectivesSchema?: FormSchema
  /** client_only 时：可调配置 Schema；client_and_server 时：仅作备用 */
  tunablesSchema?: FormSchema

  /** client_and_server 时：Server 侧环境约束 Schema */
  serverConstraintsSchema?: FormSchema
  /** client_and_server 时：Server 侧负载目标 Schema */
  serverObjectivesSchema?: FormSchema
  /** client_and_server 时：Server 侧可调配置 Schema */
  serverTunablesSchema?: FormSchema

  /** client_and_server 时：Client 侧环境约束 Schema */
  clientConstraintsSchema?: FormSchema
  /** client_and_server 时：Client 侧负载目标 Schema */
  clientObjectivesSchema?: FormSchema
  /** client_and_server 时：Client 侧可调配置 Schema */
  clientTunablesSchema?: FormSchema

  /** 该子类型在拓扑图卡片上展示的字段（client_only 用；client_and_server 时用 server/client 各自 topologyDisplay） */
  topologyDisplay?: TopologyDisplayConfig
  /** client_and_server 时：Server 节点在拓扑上的展示字段 */
  serverTopologyDisplay?: TopologyDisplayConfig
  /** client_and_server 时：Client 节点在拓扑上的展示字段 */
  clientTopologyDisplay?: TopologyDisplayConfig
}

/** 层在拓扑中的排序与插入顺序：按该数组顺序依次比较 */
export type LayerOrder = string[]

// ========== 连线类型定义 ==========

/**
 * 连线类型定义：按 sourceLayerId + targetLayerId 唯一标识
 * 用于为特定层之间的连线注册可编辑的参数 Schema
 */
export interface EdgeTypeDefinition {
  /** 源节点层 ID */
  sourceLayerId: string
  /** 目标节点层 ID */
  targetLayerId: string
  /** 连线参数表单 Schema */
  paramsSchema?: FormSchema
  /** 连线上要展示的参数字段 key 列表（显示为 edge label） */
  edgeDisplay?: { params?: string[] }
}

// ========== 扩展注册类型 ==========

/** 扩展用：注册单个层（同 id 会覆盖） */
export type RegisterLayer = (def: LayerDefinition) => void

/** 扩展用：向依赖层追加一种子节点类型（同 kind 会覆盖） */
export type RegisterDependencyNodeType = (def: DependencyNodeTypeDefinition) => void

/** 扩展用：注册连线类型（同 sourceLayerId+targetLayerId 会覆盖） */
export type RegisterEdgeType = (def: EdgeTypeDefinition) => void
