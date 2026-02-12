<script setup lang="ts">
import { computed } from 'vue'
import type { FormSchema, FieldDefinition, SectionScope } from '@/registry/spec'
import { getByPath, setByPath } from '@/registry/schemaBuild'

const props = withDefaults(
  defineProps<{
    schema: FormSchema
    model: object
    showReset?: boolean
  }>(),
  { showReset: false }
)

const emit = defineEmits<{
  reset: []
}>()

function fieldValue(field: FieldDefinition) {
  return getByPath(props.model, field.key)
}

function setFieldValue(field: FieldDefinition, value: unknown) {
  setByPath(props.model as Record<string, unknown>, field.key, value)
}

function onInput(field: FieldDefinition, e: Event) {
  const el = e.target as HTMLInputElement | HTMLSelectElement
  if (field.type === 'number') {
    const n = el.value === '' ? 0 : Number(el.value)
    setFieldValue(field, n)
  } else {
    setFieldValue(field, el.value)
  }
}

function onSelect(field: FieldDefinition, e: Event) {
  const el = e.target as HTMLSelectElement
  const opt = field.options?.find((o) => String(o.value) === el.value)
  if (opt !== undefined) setFieldValue(field, opt.value)
}

function onStringArrayInput(field: FieldDefinition, e: Event) {
  const el = e.target as HTMLTextAreaElement
  const arr = el.value.split('\n').map((s) => s.trim()).filter(Boolean)
  setFieldValue(field, arr)
}

function stringArrayDisplayValue(field: FieldDefinition): string {
  const v = fieldValue(field)
  if (Array.isArray(v)) return v.join('\n')
  return ''
}

const hasSections = computed(() => props.schema.sections.length > 0)

const scopeLabels: Record<SectionScope, string> = {
  generic: '通用',
  redis: 'Redis',
  database: '数据库',
}
</script>

<template>
  <div v-if="hasSections" class="dynamic-form">
    <div v-for="section in schema.sections" :key="section.id" class="card">
      <h3 class="card-title">
        {{ section.label }}
        <span v-if="section.sectionScope" class="card-scope" :class="`scope-${section.sectionScope}`">
          {{ scopeLabels[section.sectionScope] }}
        </span>
      </h3>
      <p v-if="section.description" class="card-desc">{{ section.description }}</p>
      <div v-if="section.fields.length" class="form-grid">
        <div
          v-for="field in section.fields"
          :key="field.key"
          class="field"
          :class="{ 'field-full': field.type === 'string' && (field.key === 'jvmOptions' || field.key === 'note') }"
        >
          <label :for="`field-${field.key}`">{{ field.label }}</label>
          <template v-if="field.type === 'select'">
            <select
              :id="`field-${field.key}`"
              :value="String(fieldValue(field))"
              @change="onSelect(field, $event)"
            >
              <option
                v-for="opt in field.options"
                :key="String(opt.value)"
                :value="String(opt.value)"
              >
                {{ opt.label }}
              </option>
            </select>
          </template>
          <template v-else-if="field.type === 'stringArray'">
            <textarea
              :id="`field-${field.key}`"
              :value="stringArrayDisplayValue(field)"
              rows="4"
              placeholder="每行一项"
              @input="onStringArrayInput(field, $event)"
            />
          </template>
          <template v-else>
            <input
              :id="`field-${field.key}`"
              :type="field.type === 'number' ? 'number' : 'text'"
              :value="field.type === 'number' ? (fieldValue(field) as number) : (fieldValue(field) as string)"
              :placeholder="field.placeholder"
              :min="field.min"
              :max="field.max"
              :step="field.step"
              @input="onInput(field, $event)"
            />
          </template>
          <span v-if="field.description" class="hint">{{ field.description }}</span>
        </div>
      </div>
    </div>
    <div v-if="showReset" class="card-actions">
      <button type="button" class="btn btn-secondary" @click="emit('reset')">恢复默认</button>
    </div>
  </div>
</template>

<style scoped>
.dynamic-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1.5rem;
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-scope {
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}

.card-scope.scope-generic {
  background: var(--bg-hover);
  color: var(--text-muted);
}

.card-scope.scope-redis {
  background: #fef2f2;
  color: #b91c1c;
}

.card-scope.scope-database {
  background: #eff6ff;
  color: #1d4ed8;
}

.card-desc {
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin: 0 0 1rem 0;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field-full {
  grid-column: 1 / -1;
}

.field label {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 500;
}

.field input,
.field select,
.field textarea {
  padding: 0.5rem 0.75rem;
  background: var(--bg-page);
  border: 1px solid var(--border-input);
  border-radius: var(--radius);
  color: var(--text-primary);
  font-size: 0.875rem;
}

.field textarea {
  resize: vertical;
  min-height: 80px;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
}

.hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.card-actions {
  margin-top: 0.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  font-size: 0.875rem;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn:hover {
  background: var(--border);
}

.btn-secondary {
  color: var(--text-secondary);
}
</style>
