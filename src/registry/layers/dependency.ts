/**
 * 依赖层定义：无父级共用 schema；各子类型（children）拥有自己的
 * paramsSchema / configSchema / topologyDisplay，拓扑与表单均按 kind 使用子类型 schema。
 * client_only：仅一个节点，params/config 即 client；client_and_server：Server + Client 两节点组合，配置完全分开。
 */

import type { LayerDefinition, FormSchema, DependencyNodeTypeDefinition, CrossFieldRule } from '../spec'
import { getByPath } from '../schemaBuild'

// ---------- Redis 子类型（client_and_server：Server 与 Client 配置分开） ----------
const redisServerParamsSchema: FormSchema = {
  sections: [
    {
      id: 'redis_server_params',
      label: '核心参数 — Redis Server',
      fields: [
        { key: 'memoryGb', label: '内存容量 (GB)', type: 'number', default: 8, min: 0 },
        { key: 'shardCount', label: '分片数量', type: 'number', default: 1, min: 1 },
      ],
    },
  ],
}

const redisClientConfigSchema: FormSchema = {
  sections: [
    {
      id: 'redis_client_config',
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

// ---------- Database 子类型（client_and_server） ----------
const databaseServerParamsSchema: FormSchema = {
  sections: [
    {
      id: 'database_server_params',
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
  clientServer: 'client_and_server',
  serverParamsSchema: redisServerParamsSchema,
  clientConfigSchema: redisClientConfigSchema,
  serverTopologyDisplay: { params: ['memoryGb', 'shardCount'] },
  clientTopologyDisplay: { config: ['redisClient'] },
}

const databaseChild: DependencyNodeTypeDefinition = {
  kind: 'database',
  label: '数据库',
  clientServer: 'client_and_server',
  serverParamsSchema: databaseServerParamsSchema,
  serverTopologyDisplay: {
    params: ['engine', 'cpu', 'memoryGb', 'maxConnections'],
  },
}

// ---------- 三方接口子类型（client_and_server：Server 与 Client 配置分开） ----------
const httpApiServerParamsSchema: FormSchema = {
  sections: [
    {
      id: 'http_api_server_params',
      label: '核心参数 — 三方接口 Server',
      fields: [
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

const httpApiClientParamsSchema: FormSchema = {
  sections: [
    {
      id: 'http_api_client_params',
      label: '核心参数 — HTTP Client',
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
      ],
    },
  ],
}

const httpApiClientConfigCrossRules: CrossFieldRule[] = [
  {
    fieldKey: 'okhttp.maxRequestsPerHost',
    check: ({ formValues }) => {
      const perHost = getByPath(formValues, 'okhttp.maxRequestsPerHost') as number
      const total = getByPath(formValues, 'okhttp.maxRequests') as number
      if (typeof perHost === 'number' && typeof total === 'number' && perHost > total)
        return `MaxRequestsPerHost (${perHost}) 不应超过 MaxRequests (${total})`
    },
  },
  {
    fieldKey: 'apache.maxConnPerRoute',
    check: ({ formValues }) => {
      const perRoute = getByPath(formValues, 'apache.maxConnPerRoute') as number
      const total = getByPath(formValues, 'apache.maxConnTotal') as number
      if (typeof perRoute === 'number' && typeof total === 'number' && perRoute > total)
        return `MaxConnPerRoute (${perRoute}) 不应超过 MaxConnTotal (${total})`
    },
  },
]

const httpApiClientConfigSchema: FormSchema = {
  sections: [
    {
      id: 'http_api_client_config_java_http',
      label: '核心配置 — Java HttpClient',
      visibleWhen: { field: 'clientType', value: 'java_http' },
      fields: [
        {
          key: 'javaHttp.version',
          label: 'Version',
          type: 'select',
          default: 'HTTP_2',
          options: [
            { value: 'HTTP_1_1', label: 'HTTP/1.1' },
            { value: 'HTTP_2', label: 'HTTP/2' },
          ],
        },
        { key: 'javaHttp.executor', label: 'Executor', type: 'string', default: '', placeholder: 'e.g. virtual / fixedThreadPool(10)' },
        { key: 'javaHttp.timeoutMs', label: 'Timeout (ms)', type: 'number', default: 5000, min: 0 },
      ],
    },
    {
      id: 'http_api_client_config_okhttp',
      label: '核心配置 — OkHttp',
      visibleWhen: { field: 'clientType', value: 'okhttp' },
      fields: [
        { key: 'okhttp.maxRequestsPerHost', label: 'Dispatcher.MaxRequestsPerHost', type: 'number', default: 5, min: 1 },
        { key: 'okhttp.maxRequests', label: 'Dispatcher.MaxRequests', type: 'number', default: 64, min: 1 },
        { key: 'okhttp.maxIdleConnections', label: 'ConnectionPool.MaxIdleConnections', type: 'number', default: 5, min: 0 },
        { key: 'okhttp.keepAliveDurationMs', label: 'ConnectionPool.KeepAliveDuration (ms)', type: 'number', default: 300000, min: 0 },
        { key: 'okhttp.connectTimeoutMs', label: 'connectTimeout (ms)', type: 'number', default: 10000, min: 0 },
        { key: 'okhttp.readTimeoutMs', label: 'readTimeout (ms)', type: 'number', default: 10000, min: 0 },
        { key: 'okhttp.writeTimeoutMs', label: 'writeTimeout (ms)', type: 'number', default: 10000, min: 0 },
      ],
    },
    {
      id: 'http_api_client_config_apache',
      label: '核心配置 — Apache HttpClient',
      visibleWhen: { field: 'clientType', value: 'apache' },
      fields: [
        { key: 'apache.maxConnTotal', label: 'MaxConnTotal', type: 'number', default: 25, min: 1 },
        { key: 'apache.maxConnPerRoute', label: 'MaxConnPerRoute', type: 'number', default: 5, min: 1 },
        { key: 'apache.timeToLiveMs', label: 'ConnectionConfig.TimeToLive (ms)', type: 'number', default: -1 },
        { key: 'apache.connectionRequestTimeoutMs', label: 'connectionRequestTimeout (ms)', type: 'number', default: 180000, min: 0 },
        { key: 'apache.responseTimeoutMs', label: 'responseTimeout (ms)', type: 'number', default: 0, min: 0 },
      ],
    },
  ],
  crossRules: httpApiClientConfigCrossRules,
}

const httpApiChild: DependencyNodeTypeDefinition = {
  kind: 'http_api',
  label: '三方接口',
  clientServer: 'client_and_server',
  serverParamsSchema: httpApiServerParamsSchema,
  clientParamsSchema: httpApiClientParamsSchema,
  clientConfigSchema: httpApiClientConfigSchema,
  serverTopologyDisplay: { params: ['networkEnv', 'targetQps', 'slaRtMs'] },
  clientTopologyDisplay: { params: ['clientType'] },
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
