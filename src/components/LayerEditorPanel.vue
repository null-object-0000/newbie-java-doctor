<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LayerId } from '@/types/layers'
import { getLayerLabel } from '@/registry/layers'
import LayerEditorContent from '@/components/LayerEditorContent.vue'

const props = defineProps<{
  layerId: LayerId
}>()

defineEmits<{
  close: []
}>()

type Section = 'params' | 'config'
const activeSection = ref<Section>('params')

const layerTitle = computed(() => getLayerLabel(props.layerId))
</script>

<template>
  <div class="layer-editor-panel">
    <header class="panel-header">
      <h2 class="panel-title">编辑：{{ layerTitle }}</h2>
      <button type="button" class="panel-close" title="关闭" @click="$emit('close')">×</button>
    </header>
    <div class="panel-tabs">
      <button
        type="button"
        class="panel-tab"
        :class="{ active: activeSection === 'params' }"
        @click="activeSection = 'params'"
      >
        核心参数
      </button>
      <button
        type="button"
        class="panel-tab"
        :class="{ active: activeSection === 'config' }"
        @click="activeSection = 'config'"
      >
        核心配置
      </button>
    </div>
    <div class="panel-body">
      <LayerEditorContent :layer-id="layerId" :section="activeSection" />
    </div>
  </div>
</template>

<style scoped>
.layer-editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-card);
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

.panel-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.panel-close {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.panel-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.panel-tabs {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
  padding: 0 1.25rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-page);
}

.panel-tab {
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color 0.15s;
}

.panel-tab:hover {
  color: var(--text-secondary);
}

.panel-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.panel-body {
  flex: 1;
  overflow: auto;
  padding: 1rem 1.25rem;
}
</style>
