/**
 * 依赖层定义：无父级共用 schema；各子类型（children）拥有自己的
 * paramsSchema / configSchema / topologyDisplay，拓扑与表单均按 kind 使用子类型 schema。
 */

import type { LayerDefinition, FormSchema, DependencyNodeTypeDefinition } from '../spec'

// ---------- Redis 子类型 ----------
const redisParamsSchema: FormSchema = {
  sections: [
    {
      id: 'redis_params',
      label: '核心参数 — Redis Server',
      fields: [
        { key: 'memoryGb', label: '内存容量 (GB)', type: 'number', default: 8, min: 0 },
        { key: 'shardCount', label: '分片数量', type: 'number', default: 1, min: 1 },
      ],
    },
  ],
}

const redisConfigSchema: FormSchema = {
  sections: [
    {
      id: 'redis_client',
      label: '核心配置 — Redis Client',
      fields: [
        {
          key: 'redisClient',
          label: '客户端类型',
          type: 'select',
          default: 'lettuce',
          options: [
            { value: 'jedis', label: 'Jedis' },
            { value: 'lettuce', label: 'Lettuce' },
            { value: 'redisson', label: 'Redisson' },
          ],
        },
      ],
    },
  ],
}

// ---------- Database 子类型 ----------
const databaseParamsSchema: FormSchema = {
  sections: [
    {
      id: 'database_params',
      label: '核心参数 — Database Server',
      fields: [
        { key: 'engine', label: '引擎', type: 'string', default: 'MySQL', placeholder: 'MySQL' },
        { key: 'cpu', label: 'CPU', type: 'number', default: 8, min: 0 },
        { key: 'memoryGb', label: '内存 (GB)', type: 'number', default: 16, min: 0 },
        { key: 'maxConnections', label: '最大连接数', type: 'number', default: 500, min: 0 },
        { key: 'maxIops', label: '最大 IOPS', type: 'number', default: 5000, min: 0 },
        { key: 'storageGb', label: '储存空间 (GB)', type: 'number', default: 500, min: 0 },
      ],
    },
  ],
}

// ---------- 子类型定义（各自 schema + topology） ----------
const redisChild: DependencyNodeTypeDefinition = {
  kind: 'redis',
  label: 'Redis',
  paramsSchema: redisParamsSchema,
  configSchema: redisConfigSchema,
  topologyDisplay: {
    params: ['memoryGb', 'shardCount'],
    config: ['redisClient'],
  },
}

const databaseChild: DependencyNodeTypeDefinition = {
  kind: 'database',
  label: '数据库',
  paramsSchema: databaseParamsSchema,
  topologyDisplay: {
    params: ['engine', 'cpu', 'memoryGb', 'maxConnections'],
  },
}

const httpApiChild: DependencyNodeTypeDefinition = {
  kind: 'http_api',
  label: '三方接口',
  topologyDisplay: {},
}

const customChild: DependencyNodeTypeDefinition = {
  kind: 'custom',
  label: '自定义依赖',
  topologyDisplay: {},
}

export const dependencyLayer: LayerDefinition = {
  id: 'dependency',
  label: '依赖层',
  icon: 'D',
  theme: 'blue',
  children: [redisChild, databaseChild, httpApiChild, customChild],
}
