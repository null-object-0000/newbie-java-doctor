<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { DependencyKind } from '@/types/layers'
import { getDependencyNodeTypes } from '@/registry/layers'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [opts: { layerId: 'dependency'; dependencyKind?: DependencyKind; customLabel?: string }]
}>()

const dependencyKind = ref<DependencyKind | ''>('redis')
const customLabel = ref('')

/** 依赖类型选项来自 registry，支持扩展 */
const dependencyKindOptions = computed(() =>
  getDependencyNodeTypes().map((c) => ({ value: c.kind as DependencyKind, label: c.label }))
)

const showCustomLabel = () =>
  dependencyKind.value === 'http_api' || dependencyKind.value === 'custom'

watch(
  () => props.visible,
  (v) => {
    if (v) {
      const types = getDependencyNodeTypes()
      dependencyKind.value = (types[0]?.kind as DependencyKind) ?? ''
      customLabel.value = ''
    }
  }
)

function submit() {
  const opts: { layerId: 'dependency'; dependencyKind?: DependencyKind; customLabel?: string } = {
    layerId: 'dependency',
  }
  if (dependencyKind.value) {
    opts.dependencyKind = dependencyKind.value
    if (showCustomLabel()) opts.customLabel = customLabel.value.trim() || undefined
  }
  emit('submit', opts)
  emit('close')
}

function cancel() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-backdrop" @click.self="cancel">
      <div class="modal">
        <h3 class="modal-title">添加依赖节点</h3>
        <p class="modal-desc">选择依赖类型（如 Redis、数据库或三方接口）后添加至拓扑图。</p>
        <div class="form">
          <div class="field">
            <label>依赖类型</label>
            <select v-model="dependencyKind">
              <option value="">—</option>
              <option v-for="opt in dependencyKindOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div v-if="showCustomLabel()" class="field">
            <label>名称（如：支付接口、风控服务）</label>
            <input v-model="customLabel" type="text" placeholder="选填" />
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="cancel">取消</button>
          <button type="button" class="btn btn-primary" @click="submit">添加</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 1.5rem;
  min-width: 320px;
  max-width: 90vw;
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
}

.modal-desc {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin: 0 0 1rem 0;
  line-height: 1.5;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field label {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 500;
}

.field input,
.field select {
  padding: 0.5rem 0.75rem;
  background: var(--bg-page);
  border: 1px solid var(--border-input);
  border-radius: var(--radius);
  color: var(--text-primary);
  font-size: 0.875rem;
}

.field input:focus,
.field select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}

.btn-secondary {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border);
}

.btn-secondary:hover {
  background: var(--border);
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.btn-primary:hover {
  background: var(--accent-hover);
}
</style>
