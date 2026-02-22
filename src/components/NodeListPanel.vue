<script setup lang="ts">
import type { DependencyKind, LayerId } from '@/types/layers'
import { getLayers } from '@/registry/layers'
import { NTag } from 'naive-ui'

type NonDepLayerId = 'client' | 'access' | 'host' | 'runtime'

defineProps<{
  canAddLayer: (layerId: NonDepLayerId) => boolean
}>()

type DragPayload =
  | { type: 'layer'; layerId: NonDepLayerId; label: string }
  | { type: 'dependency'; kind: DependencyKind; label: string }

const layers = getLayers().map((l) => ({
  layerId: l.id as LayerId,
  label: l.label,
  icon: l.icon,
  children: (l.children ?? []).map((c) => ({ kind: c.kind as DependencyKind, label: c.label })),
}))

function isLayerDraggable(layer: (typeof layers)[number], canAddLayer: (id: NonDepLayerId) => boolean) {
  if (layer.children.length > 0) return false
  if (layer.layerId === 'dependency') return false
  return canAddLayer(layer.layerId as NonDepLayerId)
}

const PALETTE_DROP_MARKER = 'application/x-java-doctor-palette'

function onDragStart(e: DragEvent, payload: DragPayload) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData(PALETTE_DROP_MARKER, '1')
  e.dataTransfer.setData('application/json', JSON.stringify(payload))
  e.dataTransfer.setData('text/plain', payload.label)
}

function onLayerDragStart(e: DragEvent, layer: (typeof layers)[number]) {
  onDragStart(e, { type: 'layer', layerId: layer.layerId as NonDepLayerId, label: layer.label })
}

function onChildDragStart(e: DragEvent, kind: DependencyKind, label: string) {
  onDragStart(e, { type: 'dependency', kind, label })
}

function checkCanAdd(layerId: LayerId, canAddLayer: (id: NonDepLayerId) => boolean): boolean {
  if (layerId === 'dependency') return false
  return canAddLayer(layerId)
}
</script>

<template>
  <div class="node-list-panel">
    <div class="panel-header">
      <span class="panel-title">节点列表</span>
      <span class="panel-hint">拖拽添加</span>
    </div>
    <div class="panel-body">
      <ul class="layer-list">
        <li v-for="layer in layers" :key="layer.layerId" class="layer-block">
          <div
            class="layer-header"
            :class="{
              'layer-header-draggable': isLayerDraggable(layer, canAddLayer),
              'layer-header-disabled': layer.children.length === 0 && layer.layerId !== 'dependency' && !checkCanAdd(layer.layerId, canAddLayer),
            }"
            :draggable="isLayerDraggable(layer, canAddLayer)"
            @dragstart="
              isLayerDraggable(layer, canAddLayer) && onLayerDragStart($event, layer)
            "
          >
            <span class="layer-icon">{{ layer.icon }}</span>
            <span class="layer-label">{{ layer.label }}</span>
            <NTag
              v-if="layer.children.length === 0 && layer.layerId !== 'dependency' && !checkCanAdd(layer.layerId, canAddLayer)"
              size="tiny"
              :bordered="false"
            >
              已添加
            </NTag>
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
              <svg class="node-item-drag-hint" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.node-list-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border);
  background: var(--bg-card);
  box-shadow: var(--shadow-panel);
  overflow: hidden;
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
}

.panel-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-hint {
  font-size: 0.6875rem;
  color: var(--text-faint);
  font-weight: 500;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.625rem;
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
  padding: 0.4rem 0.625rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-subtle);
  border-radius: var(--radius);
  border: 1px solid transparent;
  user-select: none;
}

.layer-header-draggable {
  cursor: grab;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
}

.layer-header-draggable:active {
  cursor: grabbing;
}

.layer-header-draggable:hover {
  border-color: var(--accent);
  background: var(--accent-surface);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.layer-header-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.layer-header-disabled .layer-label {
  color: var(--text-muted);
}

.layer-icon {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm);
  background: var(--bg-active);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6875rem;
  font-weight: 700;
  flex-shrink: 0;
  letter-spacing: -0.02em;
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
  padding: 0 0 0 0.75rem;
  border-left: 2px solid var(--border);
  margin-left: 0.6875rem;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: grab;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
}

.node-item:active {
  cursor: grabbing;
}

.node-item:hover {
  border-color: var(--accent);
  background: var(--accent-surface);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.node-item:hover .node-item-drag-hint {
  opacity: 0.6;
}

.node-item-icon {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm);
  background: #eef2ff;
  color: #4338ca;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6875rem;
  font-weight: 700;
  flex-shrink: 0;
}

.node-item-label {
  flex: 1;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-item-drag-hint {
  flex-shrink: 0;
  color: var(--text-faint);
  opacity: 0;
  transition: opacity var(--transition-fast);
}
</style>
