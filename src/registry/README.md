# 层与节点注册表

层（Layer）和依赖子类型（DependencyNodeType）的定义与顺序统一由本目录维护，支持在应用启动后动态扩展。每层的**属性配置**（环境约束、负载目标、可调配置的默认值）也与层定义放在一起。

**一层一文件**：`layers/` 下按层拆分，便于维护：
- `layers/client.ts` — 客户端层
- `layers/access.ts` — 接入网关层
- `layers/host.ts` — 宿主容器层
- `layers/runtime.ts` — 运行时层
- `layers/dependency.ts` — 依赖层
- `layers/index.ts` — 注册表入口（组装默认层列表、可变状态与只读 API）

## 概念

每层的节点属性分为三类：

| 分类 | 英文 Key | 含义 | 举例 |
|------|----------|------|------|
| **环境约束** | `constraints` | 硬件/基础设施的物理边界，不能或很难改 | vCPU、内存、磁盘类型、JDK 版本 |
| **负载目标** | `objectives` | 业务方的性能期望和负载画像 | 并发用户数、目标 RPS、预期失败率 |
| **可调配置** | `tunables` | 基于约束和目标来决定的调优旋钮 | GC 类型、JVM 参数、Tomcat 线程数 |

## 规范

- **层**：见 `spec.ts` 的 `LayerDefinition`（id、label、icon、theme、maxCount、children、**topologyDisplay**、**constraintsSchema**、**objectivesSchema**、**tunablesSchema**）。
- **拓扑图展示**：每层可设 `topologyDisplay: { constraints?: string[], objectives?: string[], tunables?: string[] }`，列出要在拓扑图节点卡片上展示的字段 key（dot-path），展示名从对应 schema 解析。
- **动态表单 Schema**：每层通过 `constraintsSchema`、`objectivesSchema`、`tunablesSchema`（`FormSchema`）定义各类属性的**字段**（key、label、description、type、default、options 等），由 `DynamicForm` 按 schema 渲染，不硬编码表单项。默认值由 `buildFromSchema(schema)` 生成。业务通过 `getConstraintsSchema(layerId)`、`getObjectivesSchema(layerId)`、`getTunablesSchema(layerId)` 取 schema，通过 `getDefaultConstraints(layerId)`、`getDefaultObjectives(layerId)`、`getDefaultTunables(layerId)` 取深拷贝默认值。
- **依赖子类型**：见 `DependencyNodeTypeDefinition`（kind、label）。
- **只读**：业务通过 `layers/index.ts` 的 `getLayers()`、`getLayerById()`、`getLayerLabel()`、`getLayerIcon()`、`getLayerTheme()`、`getLayerOrder()`、`getLayerMaxCount()`、`getDependencyNodeTypes()`、`getDependencyNodeTypeLabel()`、`getDefaultConstraints()`、`getDefaultObjectives()`、`getDefaultTunables()` 等获取数据。
- **扩展**：调用 `registerLayer(def)` 注册或覆盖一层；调用 `registerDependencyNodeType(def)` 向依赖层追加或覆盖一种子节点类型（同 id/kind 会覆盖）。

## 如何新增一层

1. 调用 `registerLayer({ id: 'my_layer', label: '我的层', icon: 'M', theme: 'blue', maxCount: 1 })`。
2. 若需参与拓扑排序，在 `layers/index.ts` 的默认 `layerOrder` 中已有该 id，或自行调用 `setLayerOrder([...])` 设置顺序。
3. Store 的 `addLayerNode` 目前仅接受 `client | access | host | runtime`；若新层也要从节点列表拖入，需在 store 与 NodeListPanel 的 `canAddLayer` 等处扩展类型与逻辑。

## 如何新增一种依赖节点类型

1. 调用 `registerDependencyNodeType({ kind: 'mq', label: '消息队列' })`。
2. 节点列表的依赖层下会多出「消息队列」可拖入；添加依赖弹窗的选项也会多出该项。
3. 若 store/类型里对 `DependencyKind` 有字面量联合类型，需在 `types/layers.ts` 中扩展该联合类型。
