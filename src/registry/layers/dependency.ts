/**
 * 依赖层定义：无父级共用 schema；各子类型（children）拥有自己的
 * constraintsSchema / objectivesSchema / tunablesSchema / topologyDisplay，
 * 拓扑与表单均按 kind 使用子类型 schema。
 * client_only：仅一个节点；client_and_server：Server + Client 两节点组合，配置完全分开。
 */

import type { LayerDefinition, FormSchema, DependencyNodeTypeDefinition, CrossFieldRule } from '../spec'
import { getByPath } from '../schemaBuild'

// ---------- Redis 子类型（client_and_server：Server 与 Client 配置分开） ----------
const redisServerConstraintsSchema: FormSchema = {
  sections: [
    {
      id: 'redis_server_constraints',
      label: 'Redis Server',
      fields: [
        { key: 'memoryGb', label: '内存容量 (GB)', type: 'number', default: 8, min: 0 },
        { key: 'shardCount', label: '分片数量', type: 'number', default: 1, min: 1 },
      ],
    },
  ],
}

const redisClientConstraintsSchema: FormSchema = {
  sections: [
    {
      id: 'redis_client_constraints',
      label: 'Redis Client',
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
const databaseServerConstraintsSchema: FormSchema = {
  sections: [
    {
      id: 'database_server_constraints',
      label: 'Database Server',
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
  serverConstraintsSchema: redisServerConstraintsSchema,
  clientConstraintsSchema: redisClientConstraintsSchema,
  serverTopologyDisplay: { constraints: ['memoryGb', 'shardCount'] },
  clientTopologyDisplay: { constraints: ['redisClient'] },
}

const databaseChild: DependencyNodeTypeDefinition = {
  kind: 'database',
  label: '数据库',
  clientServer: 'client_and_server',
  serverConstraintsSchema: databaseServerConstraintsSchema,
  serverTopologyDisplay: {
    constraints: ['engine', 'cpu', 'memoryGb', 'maxConnections'],
  },
}

// ---------- 三方接口子类型（client_and_server：Server 与 Client 配置分开） ----------
const httpApiServerConstraintsSchema: FormSchema = {
  sections: [
    {
      id: 'http_api_server_sla',
      label: '下游服务特征',
      fields: [
        {
          key: 'avgRtMs',
          label: '平均响应时间 (ms)',
          type: 'number',
          default: 200,
          min: 1,
          description: '该服务正常负载下的平均响应耗时',
        },
        {
          key: 'rateLimitQps',
          label: '限流阈值 (QPS)',
          type: 'number',
          default: 0,
          min: 0,
          description: '对方服务的限流上限，0 表示无限制或未知',
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
      ],
    },
  ],
}

const httpApiClientConstraintsSchema: FormSchema = {
  sections: [
    {
      id: 'http_api_client_type',
      label: 'HTTP 客户端',
      fields: [
        {
          key: 'clientType',
          label: 'HTTP 客户端',
          type: 'select',
          default: 'apache',
          options: [
            { value: 'apache', label: 'Apache HttpClient' },
            { value: 'okhttp', label: 'OkHttp' },
            { value: 'java_http', label: 'Java HttpClient' },
          ],
        },
      ],
    },
  ],
}

const httpApiClientTunablesCrossRules: CrossFieldRule[] = [
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

const httpApiClientTunablesSchema: FormSchema = {
  sections: [
    // ---- Apache HttpClient ----
    {
      id: 'apache_pool',
      label: '连接池',
      description: '对应 PoolingHttpClientConnectionManager 配置',
      visibleWhen: { field: 'clientType', value: 'apache' },
      fields: [
        {
          key: 'apache.maxConnPerRoute',
          label: 'maxConnPerRoute',
          type: 'number',
          default: 5,
          min: 1,
          description: '每个目标主机的最大连接数，Spring Boot 默认 5',
        },
        {
          key: 'apache.maxConnTotal',
          label: 'maxConnTotal',
          type: 'number',
          default: 25,
          min: 1,
          description: '连接池总大小，Spring Boot 默认 25',
        },
      ],
    },
    {
      id: 'apache_timeout',
      label: '超时配置',
      visibleWhen: { field: 'clientType', value: 'apache' },
      fields: [
        { key: 'apache.connectTimeoutMs', label: 'connectTimeout (ms)', type: 'number', default: 10000, min: 0 },
        {
          key: 'apache.socketTimeoutMs',
          label: 'socketTimeout (ms)',
          type: 'number',
          default: 10000,
          min: 0,
          description: '等待响应数据的超时时间',
        },
      ],
    },
    // ---- OkHttp ----
    {
      id: 'okhttp_pool',
      label: '连接池',
      description: '对应 new ConnectionPool() 配置。OkHttp 同步调用无并发连接数上限',
      visibleWhen: { field: 'clientType', value: 'okhttp' },
      fields: [
        {
          key: 'okhttp.maxIdleConnections',
          label: 'maxIdleConnections',
          type: 'number',
          default: 5,
          min: 0,
          description: '最大空闲连接数，影响连接复用效率',
        },
        {
          key: 'okhttp.keepAliveDurationMs',
          label: 'keepAliveDuration (ms)',
          type: 'number',
          default: 300000,
          min: 0,
        },
      ],
    },
    {
      id: 'okhttp_timeout',
      label: '超时配置',
      visibleWhen: { field: 'clientType', value: 'okhttp' },
      fields: [
        { key: 'okhttp.connectTimeoutMs', label: 'connectTimeout (ms)', type: 'number', default: 10000, min: 0 },
        { key: 'okhttp.readTimeoutMs', label: 'readTimeout (ms)', type: 'number', default: 10000, min: 0 },
      ],
    },
    // ---- Java HttpClient ----
    {
      id: 'java_http_settings',
      label: 'Java HttpClient',
      description: 'JDK 内置 HTTP 客户端，连接池由 JVM 内部管理，不可配置',
      visibleWhen: { field: 'clientType', value: 'java_http' },
      fields: [
        {
          key: 'javaHttp.version',
          label: 'HTTP 版本',
          type: 'select',
          default: 'HTTP_2',
          options: [
            { value: 'HTTP_1_1', label: 'HTTP/1.1' },
            { value: 'HTTP_2', label: 'HTTP/2' },
          ],
        },
        {
          key: 'javaHttp.connectTimeoutMs',
          label: 'connectTimeout (ms)',
          type: 'number',
          default: 0,
          min: 0,
          description: '0 表示无限制（JDK 默认）',
        },
      ],
    },
  ],
  crossRules: httpApiClientTunablesCrossRules,
}

const httpApiChild: DependencyNodeTypeDefinition = {
  kind: 'http_api',
  label: '三方接口',
  clientServer: 'client_and_server',
  serverConstraintsSchema: httpApiServerConstraintsSchema,
  clientConstraintsSchema: httpApiClientConstraintsSchema,
  clientTunablesSchema: httpApiClientTunablesSchema,
  serverTopologyDisplay: { constraints: ['avgRtMs', 'rateLimitQps'] },
  clientTopologyDisplay: { constraints: ['clientType'] },
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
