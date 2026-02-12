/**
 * 依赖层定义：核心参数 / 核心配置 Schema、子节点类型与层元信息
 *
 * 通过 sectionScope 区分：
 * - generic：通用（全依赖层共用）
 * - redis：仅 Redis 相关
 * - database：仅数据库相关
 */

import type { LayerDefinition, FormSchema } from '../spec'

const paramsSchema: FormSchema = {
  sections: [
    {
      id: 'generic_params',
      label: '通用参数',
      sectionScope: 'generic',
      description: '全依赖层共用的参数，当前无；以下为 Redis / 数据库 独有。',
      fields: [],
    },
    {
      id: 'redis',
      label: '核心参数 — Redis Server',
      sectionScope: 'redis',
      fields: [
        { key: 'redis.memoryGb', label: '内存容量 (GB)', type: 'number', default: 8, min: 0 },
        { key: 'redis.shardCount', label: '分片数量', type: 'number', default: 1, min: 1 },
      ],
    },
    {
      id: 'database',
      label: '核心参数 — Database Server',
      sectionScope: 'database',
      fields: [
        { key: 'database.engine', label: '引擎', type: 'string', default: 'MySQL', placeholder: 'MySQL' },
        { key: 'database.cpu', label: 'CPU', type: 'number', default: 8, min: 0 },
        { key: 'database.memoryGb', label: '内存 (GB)', type: 'number', default: 16, min: 0 },
        { key: 'database.maxConnections', label: '最大连接数', type: 'number', default: 500, min: 0 },
        { key: 'database.maxIops', label: '最大 IOPS', type: 'number', default: 5000, min: 0 },
        { key: 'database.storageGb', label: '储存空间 (GB)', type: 'number', default: 500, min: 0 },
      ],
    },
  ],
}

const configSchema: FormSchema = {
  sections: [
    {
      id: 'generic_config',
      label: '通用配置',
      sectionScope: 'generic',
      description: '全依赖层共用的配置，当前无；以下为 Redis 客户端等独有。',
      fields: [],
    },
    {
      id: 'redis_client',
      label: '核心配置 — Redis Client',
      sectionScope: 'redis',
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

export const dependencyLayer: LayerDefinition = {
  id: 'dependency',
  label: '依赖层',
  icon: 'D',
  theme: 'blue',
  paramsSchema,
  configSchema,
  topologyDisplay: {
    params: ['redis.memoryGb', 'database.engine'],
    config: ['redisClient'],
  },
  children: [
    { kind: 'redis', label: 'Redis' },
    { kind: 'database', label: '数据库' },
    { kind: 'http_api', label: '三方接口' },
    { kind: 'custom', label: '自定义依赖' },
  ],
}
