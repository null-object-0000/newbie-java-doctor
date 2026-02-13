/**
 * 层与节点定义规范
 *
 * 约定：
 * - 层（Layer）：拓扑中的一类节点集合，如「客户端层」「依赖层」。有唯一 id、展示名、图标、可选数量上限等。
 * - 依赖层子类型（DependencyNodeType）：依赖层下的可拖入节点类型，如 Redis、数据库。有 kind、展示名。
 * - 属性配置：每层通过「表单 Schema」定义核心参数/核心配置的字段（名称、描述、类型、默认值等），由动态表单渲染，不硬编码。
 * - 扩展方式：通过 register 向注册表追加或覆盖定义，业务层统一从 registry 读取，不写死层/节点列表。
 */

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
}

/** 依赖层专用：区块归属「通用」或某类依赖（如 redis / database），用于分组、筛选或展示说明 */
export type SectionScope = 'generic' | 'redis' | 'database'

/** 表单区块（卡片标题 + 字段列表） */
export interface FormSection {
  id: string
  label: string
  description?: string
  /** 依赖层专用：不填视为通用；redis / database 表示该区块仅对应此类依赖 */
  sectionScope?: SectionScope
  fields: FieldDefinition[]
}

/** 完整表单 Schema：多区块，驱动动态表单渲染与默认值生成 */
export interface FormSchema {
  sections: FormSection[]
}

/** 拓扑图节点卡片上要展示的字段：来自核心参数/核心配置的 dot-path 列表 */
export interface TopologyDisplayConfig {
  /** 在卡片上展示的核心参数字段 key（dot-path，如 businessScenario、spec.vCpu） */
  params?: string[]
  /** 在卡片上展示的核心配置字段 key（dot-path） */
  config?: string[]
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
  /** 仅依赖层使用：该层下可拖入的子节点类型，无则层本身可拖（若 maxCount 允许） */
  children?: DependencyNodeTypeDefinition[]
  /** 在拓扑图节点卡片上展示哪些参数/配置字段（key 为 paramsSchema/configSchema 中的 dot-path） */
  topologyDisplay?: TopologyDisplayConfig
  /** 核心参数表单 Schema（字段名、描述、类型、默认值等）；有则用 buildFromSchema 生成 defaultParams */
  paramsSchema?: FormSchema
  /** 核心配置表单 Schema；有则用 buildFromSchema 生成 defaultConfig，无则本层无核心配置 */
  configSchema?: FormSchema
  /** 兼容：无 paramsSchema 时使用的默认参数（逐步迁移后可删） */
  defaultParams?: unknown
  /** 兼容：无 configSchema 时使用的默认配置（逐步迁移后可删） */
  defaultConfig?: unknown
}

/** 依赖层下的子节点类型：kind 唯一，label 用于展示；各子类型拥有自己的 schema 与拓扑展示 */
export interface DependencyNodeTypeDefinition {
  kind: string
  label: string
  /** 该子类型的核心参数 Schema，不继承父级 */
  paramsSchema?: FormSchema
  /** 该子类型的核心配置 Schema，不继承父级 */
  configSchema?: FormSchema
  /** 该子类型在拓扑图卡片上展示的参数字段 */
  topologyDisplay?: TopologyDisplayConfig
}

/** 层在拓扑中的排序与插入顺序：按该数组顺序依次比较 */
export type LayerOrder = string[]

/** 扩展用：注册单个层（同 id 会覆盖） */
export type RegisterLayer = (def: LayerDefinition) => void

/** 扩展用：向依赖层追加一种子节点类型（同 kind 会覆盖） */
export type RegisterDependencyNodeType = (def: DependencyNodeTypeDefinition) => void
