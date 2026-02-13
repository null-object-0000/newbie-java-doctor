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

// ---------- 三方接口子类型 ----------
const httpApiParamsSchema: FormSchema = {
  sections: [
    {
      id: 'http_api_params',
      label: '核心参数 — 三方接口',
      fields: [
        {
          key: 'clientType',
          label: 'HTTP 客户端',
          type: 'select',
          default: 'okhttp',
          options: [
            { value: 'java_http', label: 'Java HttpClient' },
            { value: 'okhttp', label: 'OkHttp' },
            { value: 'apache', label: 'Apache HttpClient' },
          ],
        },
        {
          key: 'networkEnv',
          label: '网络环境',
          type: 'select',
          default: 'intra_dc',
          options: [
            { value: 'public', label: '公网' },
            { value: 'intra_dc', label: '内网同中心' },
            { value: 'cross_dc', label: '内网跨中心' },
          ],
        },
        { key: 'messageSizeBytes', label: '消息大小 (bytes)', type: 'number', default: 1024, min: 0 },
        { key: 'targetQps', label: '目标 QPS', type: 'number', default: 1000, min: 0 },
        { key: 'slaRtMs', label: 'SLA 响应时间 (ms)', type: 'number', default: 200, min: 0 },
      ],
    },
  ],
}

const httpApiConfigSchema: FormSchema = {
  sections: [
    {
      id: 'http_api_config',
      label: '核心配置 — HTTP 客户端',
      fields: [
        { key: 'timeoutMs', label: '超时 (ms)', type: 'number', default: 5000, min: 0 },
      ],
    },
  ],
}

const httpApiChild: DependencyNodeTypeDefinition = {
  kind: 'http_api',
  label: '三方接口',
  paramsSchema: httpApiParamsSchema,
  configSchema: httpApiConfigSchema,
  topologyDisplay: {
    params: ['clientType', 'networkEnv', 'targetQps', 'slaRtMs'],
    config: ['timeoutMs'],
  },
}

export const dependencyLayer: LayerDefinition = {
  id: 'dependency',
  label: '依赖层',
  icon: 'D',
  theme: 'blue',
  ioRules: {
    hasInput: true,
    hasOutput: false,
    allowedInputLayers: ['runtime'],
  },
  children: [redisChild, databaseChild, httpApiChild],
}
