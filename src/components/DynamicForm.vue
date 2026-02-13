<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NFormItem, NInput, NInputNumber, NSelect, NDynamicTags, NButton, NText } from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import type { FormSchema, FieldDefinition, SectionScope } from '@/registry/spec'
import { getByPath, setByPath } from '@/registry/schemaBuild'

const props = withDefaults(
  defineProps<{
    schema: FormSchema
    model: object
    showReset?: boolean
    /** 在写入 model 前调用（用于撤销栈等） */
    beforeChange?: () => void
  }>(),
  { showReset: false },
)

const emit = defineEmits<{
  reset: []
}>()

function fieldValue(field: FieldDefinition) {
  return getByPath(props.model, field.key)
}

function setFieldValue(field: FieldDefinition, value: unknown) {
  props.beforeChange?.()
  setByPath(props.model as Record<string, unknown>, field.key, value)
}

function onNumberUpdate(field: FieldDefinition, value: number | null) {
  setFieldValue(field, value ?? 0)
}

function onStringUpdate(field: FieldDefinition, value: string) {
  setFieldValue(field, value)
}

function onSelectUpdate(field: FieldDefinition, value: string | number | boolean) {
  const opt = field.options?.find((o) => String(o.value) === String(value))
  if (opt !== undefined) setFieldValue(field, opt.value)
}

function onTagsUpdate(field: FieldDefinition, value: string[]) {
  setFieldValue(field, value)
}

function selectOptions(field: FieldDefinition): SelectOption[] {
  return (field.options ?? []).map((o) => ({ label: o.label, value: String(o.value) }))
}

function tagValues(field: FieldDefinition): string[] {
  const v = fieldValue(field)
  if (Array.isArray(v)) return v as string[]
  return []
}

const hasSections = computed(() => props.schema.sections.length > 0)

const scopeLabels: Record<SectionScope, string> = {
  generic: '通用',
  redis: 'Redis',
  database: '数据库',
}

const scopeTypes: Record<SectionScope, 'default' | 'error' | 'info'> = {
  generic: 'default',
  redis: 'error',
  database: 'info',
}
</script>

<template>
  <div v-if="hasSections" class="dynamic-form">
    <NCard
      v-for="section in schema.sections"
      :key="section.id"
      size="small"
    >
      <template #header>
        <span class="card-title-text">{{ section.label }}</span>
        <NText
          v-if="section.sectionScope"
          :type="scopeTypes[section.sectionScope]"
          class="card-scope"
        >
          {{ scopeLabels[section.sectionScope] }}
        </NText>
      </template>
      <NText v-if="section.description" depth="3" class="card-desc">
        {{ section.description }}
      </NText>
      <div v-if="section.fields.length" class="form-grid">
        <NFormItem
          v-for="field in section.fields"
          :key="field.key"
          :label="field.label"
          :class="{ 'field-full': field.type === 'string' && (field.key === 'jvmOptions' || field.key === 'note') }"
        >
          <NSelect
            v-if="field.type === 'select'"
            :value="String(fieldValue(field))"
            :options="selectOptions(field)"
            @update:value="onSelectUpdate(field, $event)"
          />
          <NDynamicTags
            v-else-if="field.type === 'stringArray'"
            :value="tagValues(field)"
            @update:value="onTagsUpdate(field, $event)"
          />
          <NInputNumber
            v-else-if="field.type === 'number'"
            :value="fieldValue(field) as number"
            :placeholder="field.placeholder"
            :min="field.min"
            :max="field.max"
            :step="field.step"
            style="width: 100%"
            @update:value="onNumberUpdate(field, $event)"
          />
          <NInput
            v-else
            :value="(fieldValue(field) as string)"
            :placeholder="field.placeholder"
            :type="field.key === 'jvmOptions' || field.key === 'note' ? 'textarea' : 'text'"
            :rows="field.key === 'jvmOptions' || field.key === 'note' ? 4 : undefined"
            @update:value="onStringUpdate(field, $event)"
          />
          <template v-if="field.description" #feedback>
            {{ field.description }}
          </template>
        </NFormItem>
      </div>
    </NCard>
    <div v-if="showReset" class="card-actions">
      <NButton secondary @click="emit('reset')">恢复默认</NButton>
    </div>
  </div>
</template>

<style scoped>
.dynamic-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.card-title-text {
  font-weight: 600;
}

.card-scope {
  margin-left: 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
}

.card-desc {
  display: block;
  font-size: 0.8125rem;
  margin-bottom: 1rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.5rem 1rem;
}

.field-full {
  grid-column: 1 / -1;
}

.card-actions {
  margin-top: 0.25rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}
</style>
