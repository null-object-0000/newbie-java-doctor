<script setup lang="ts">
import { computed } from 'vue'
import { NFormItem, NInput, NInputNumber, NSelect, NDynamicTags, NButton, NText } from 'naive-ui'
import type { SelectOption } from 'naive-ui'
import type { FormSchema, FormSection, FieldDefinition, SectionScope, ValidationContext } from '@/registry/spec'
import { getByPath, setByPath } from '@/registry/schemaBuild'

const props = withDefaults(
  defineProps<{
    schema: FormSchema
    model: object
    showReset?: boolean
    /** 在写入 model 前调用（用于撤销栈等） */
    beforeChange?: () => void
    /** 外部上下文对象，用于 section.visibleWhen 条件判断（如 params 驱动 config 联动） */
    context?: object
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

function isSectionVisible(section: FormSection): boolean {
  if (!section.visibleWhen) return true
  const { field, value } = section.visibleWhen
  const ctx = props.context ?? props.model
  return getByPath(ctx, field) === value
}

const visibleSections = computed(() => props.schema.sections.filter(isSectionVisible))
const hasSections = computed(() => visibleSections.value.length > 0)

const validationErrors = computed<Record<string, string>>(() => {
  const errors: Record<string, string> = {}
  const ctx: ValidationContext = {
    formValues: props.model as Record<string, unknown>,
    externalContext: props.context as Record<string, unknown> | undefined,
  }
  for (const section of visibleSections.value) {
    for (const field of section.fields) {
      if (field.validate) {
        const msg = field.validate(fieldValue(field), ctx)
        if (msg) errors[field.key] = msg
      }
    }
  }
  if (props.schema.crossRules) {
    for (const rule of props.schema.crossRules) {
      if (errors[rule.fieldKey]) continue
      const msg = rule.check(ctx)
      if (msg) errors[rule.fieldKey] = msg
    }
  }
  return errors
})

defineExpose({
  validationErrors,
  isValid: computed(() => Object.keys(validationErrors.value).length === 0),
})

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
  <div v-if="hasSections" class="dynamic-form" :class="{ 'single-section': visibleSections.length === 1 }">
    <template v-for="(section, idx) in visibleSections" :key="section.id">
      <!-- 多个 section 时用轻量子标题分隔 -->
      <div v-if="visibleSections.length > 1" class="sub-section">
        <div class="sub-section-header">
          <span class="sub-section-title">{{ section.label }}</span>
          <NText
            v-if="section.sectionScope"
            :type="scopeTypes[section.sectionScope]"
            class="card-scope"
          >
            {{ scopeLabels[section.sectionScope] }}
          </NText>
        </div>
        <NText v-if="section.description" depth="3" class="card-desc">
          {{ section.description }}
        </NText>
        <div v-if="section.fields.length" class="form-grid">
          <NFormItem
            v-for="field in section.fields"
            :key="field.key"
            :label="field.label"
            :validation-status="validationErrors[field.key] ? 'error' : undefined"
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
            <template v-if="validationErrors[field.key] || field.description" #feedback>
              {{ validationErrors[field.key] || field.description }}
            </template>
          </NFormItem>
        </div>
        <div v-if="idx < visibleSections.length - 1" class="sub-divider" />
      </div>
      <!-- 单个 section 时直接渲染字段 -->
      <div v-else class="section-inline">
        <NText v-if="section.description" depth="3" class="card-desc">
          {{ section.description }}
        </NText>
        <div v-if="section.fields.length" class="form-grid">
          <NFormItem
            v-for="field in section.fields"
            :key="field.key"
            :label="field.label"
            :validation-status="validationErrors[field.key] ? 'error' : undefined"
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
            <template v-if="validationErrors[field.key] || field.description" #feedback>
              {{ validationErrors[field.key] || field.description }}
            </template>
          </NFormItem>
        </div>
      </div>
    </template>
    <div v-if="showReset" class="card-actions">
      <NButton secondary @click="emit('reset')">恢复默认</NButton>
    </div>
  </div>
</template>

<style scoped>
.dynamic-form {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.sub-section {
  padding: 0;
}

.sub-section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.375rem;
  margin-bottom: 0.625rem;
  border-bottom: 1px solid var(--border);
}

.sub-section-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.sub-divider {
  height: 0;
  margin: 0.875rem 0;
  border-top: 1px dashed var(--border);
}

.card-scope {
  font-size: 0.6875rem;
  font-weight: 500;
}

.card-desc {
  display: block;
  font-size: 0.8125rem;
  margin-bottom: 0.75rem;
  color: var(--text-muted);
  line-height: 1.6;
}

.section-inline {
  /* no extra chrome */
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.25rem 0.75rem;
}

.field-full {
  grid-column: 1 / -1;
}

.card-actions {
  margin-top: 0.375rem;
  padding-top: 0.875rem;
  border-top: 1px solid var(--border);
}
</style>
