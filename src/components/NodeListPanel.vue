<script setup lang="ts">
import type { LayerId, DependencyKind } from '@/types/layers'
import { LAYER_LABELS, DEPENDENCY_KIND_LABELS } from '@/stores/topology'

/** 是否允许再拖入该层（客户端/接入/宿主/运行时各最多 1 个） */
defineProps<{
  canAddLayer: (layerId: 'client' | 'access' | 'host' | 'runtime') => boolean
}>()

/** 拖拽数据类型：整层（层下无节点时）或依赖层子节点 */
type DragPayload =
  | { type: 'layer'; layerId: 'client' | 'access' | 'host' | 'runtime' }
  | { type: 'dependency'; kind: DependencyKind; label: string }

/** 层配置：层 id、展示名、该层下可拖拽的子节点（空则层本身可拖） */
const layers: {
  layerId: LayerId
  label: string
  children: { kind: DependencyKind; label: string }[]
}[] = [
  { layerId: 'client', label: LAYER_LABELS.client, children: [] },
  { layerId: 'access', label: LAYER_LABELS.access, children: [] },
  { layerId: 'host', label: LAYER_LABELS.host, children: [] },
  { layerId: 'runtime', label: LAYER_LABELS.runtime, children: [] },
  {
    layerId: 'dependency',
    label: LAYER_LABELS.dependency,
    children: [
      { kind: 'redis', label: DEPENDENCY_KIND_LABELS.redis },
      { kind: 'database', label: DEPENDENCY_KIND_LABELS.database },
      { kind: 'http_api', label: DEPENDENCY_KIND_LABELS.http_api },
      { kind: 'custom', label: DEPENDENCY_KIND_LABELS.custom },
    ],
  },
]

/** 层下无节点：层本身可拖；有节点：仅子节点可拖。且需满足 canAddLayer 才能拖入该层。 */
function isLayerDraggable(layer: (typeof layers)[number], canAddLayer: (id: 'client' | 'access' | 'host' | 'runtime') => boolean) {
  if (layer.children.length > 0) return false
  if (layer.layerId === 'dependency') return false
  return canAddLayer(layer.layerId)
}

function getLayerIcon(layerId: LayerId): string {
  const icons: Record<LayerId, string> = {
    client: 'C',
    access: 'G',
    host: 'H',
    runtime: 'J',
    dependency: 'D',
  }
  return icons[layerId] ?? '•'
}

function onDragStart(e: DragEvent, payload: DragPayload) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('application/json', JSON.stringify(payload))
  e.dataTransfer.setData('text/plain', payload.type === 'layer' ? LAYER_LABELS[payload.layerId] : payload.label)
}

function onLayerDragStart(e: DragEvent, layerId: 'client' | 'access' | 'host' | 'runtime') {
  onDragStart(e, { type: 'layer', layerId })
}

function onChildDragStart(e: DragEvent, kind: DependencyKind, label: string) {
  onDragStart(e, { type: 'dependency', kind, label })
}
</script>

<template>
  <div class="node-list-panel">
    <header class="panel-header">
      <h2 class="panel-title">节点列表</h2>
      <p class="panel-desc">
        拖拽层名或子节点到拓扑图中添加；连线由用户在图中自行连接。
      </p>
    </header>
    <div class="panel-body">
      <ul class="layer-list">
        <li v-for="layer in layers" :key="layer.layerId" class="layer-block">
          <div
            class="layer-header"
            :class="{
              'layer-header-draggable': isLayerDraggable(layer, canAddLayer),
              'layer-header-disabled': layer.children.length === 0 && layer.layerId !== 'dependency' && !canAddLayer(layer.layerId),
            }"
            :draggable="isLayerDraggable(layer, canAddLayer)"
            @dragstart="
              isLayerDraggable(layer, canAddLayer) && onLayerDragStart($event, layer.layerId)
            "
          >
            <span class="layer-icon">{{ getLayerIcon(layer.layerId) }}</span>
            <span class="layer-label">{{ layer.label }}</span>
            <span
              v-if="layer.children.length === 0 && layer.layerId !== 'dependency' && !canAddLayer(layer.layerId)"
              class="layer-badge"
            >已添加</span>
          </div>
          <ul v-if="layer.children.length" class="node-list">
            <li
              v-for="item in layer.children"
              :key="item.kind"
              class="node-item"
              draggable="true"
              @dragstart="onChildDragStart($event, item.kind, item.label)"
            >
              <span class="node-item-icon">D</span>
              <span class="node-item-label">{{ item.label }}</span>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.node-list-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  min-width: 0;
}

.panel-header {
  flex-shrink: 0;
  padding: 1rem 1rem 0.75rem;
  border-bottom: 1px solid var(--border);
}

.panel-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.25rem 0;
}

.panel-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.4;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.5rem;
}

.layer-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.layer-block {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.layer-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-page);
  border-radius: var(--radius);
  border: 1px solid transparent;
  user-select: none;
}

.layer-header-draggable {
  cursor: grab;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.layer-header-draggable:active {
  cursor: grabbing;
}

.layer-header-draggable:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.layer-header-disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.layer-header-disabled .layer-label {
  color: var(--text-muted);
}

.layer-badge {
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--bg-hover);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  flex-shrink: 0;
}

.layer-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #e2e8f0;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 600;
  flex-shrink: 0;
}

.layer-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-list {
  list-style: none;
  margin: 0;
  padding: 0;
  padding-left: 0.5rem;
  border-left: 2px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: var(--bg-page);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: grab;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.node-item:active {
  cursor: grabbing;
}

.node-item:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.node-item-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #f0f5ff;
  color: #1d39c4;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 600;
  flex-shrink: 0;
}

.node-item-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-primary);
}
</style>
