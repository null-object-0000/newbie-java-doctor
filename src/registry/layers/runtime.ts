/**
 * 运行时层定义：核心参数 / 核心配置 Schema 与层元信息
 */

import type { LayerDefinition, FormSchema, CrossFieldRule } from '../spec'
import { getByPath } from '../schemaBuild'

const paramsSchema: FormSchema = {
  sections: [
    {
      id: 'main',
      label: '核心参数',
      fields: [
        { key: 'jdkVersion', label: 'JDK 版本', type: 'string', default: '21', placeholder: '21' },
        { key: 'logLinesPerRequest', label: '单次请求日志条数', type: 'number', default: 5, min: 0 },
        { key: 'logSizeBytesPerRequest', label: '单次请求日志大小 (bytes)', type: 'number', default: 512, min: 0 },
      ],
    },
  ],
}

const configCrossRules: CrossFieldRule[] = [
  {
    fieldKey: 'tomcatMaxConnections',
    check: ({ formValues }) => {
      const maxConn = getByPath(formValues, 'tomcatMaxConnections') as number
      const maxThreads = getByPath(formValues, 'tomcatMaxThreads') as number
      if (typeof maxConn === 'number' && typeof maxThreads === 'number' && maxConn <= maxThreads)
        return `max-connections (${maxConn}) 应大于 threads.max (${maxThreads})`
    },
  },
  {
    fieldKey: 'tomcatMinSpareThreads',
    check: ({ formValues }) => {
      const minSpare = getByPath(formValues, 'tomcatMinSpareThreads') as number
      const maxThreads = getByPath(formValues, 'tomcatMaxThreads') as number
      if (typeof minSpare === 'number' && typeof maxThreads === 'number' && minSpare > maxThreads)
        return `min-spare (${minSpare}) 不应超过 threads.max (${maxThreads})`
    },
  },
  {
    fieldKey: 'tomcatAcceptCount',
    check: ({ formValues }) => {
      const acceptCount = getByPath(formValues, 'tomcatAcceptCount') as number
      const maxConn = getByPath(formValues, 'tomcatMaxConnections') as number
      if (typeof acceptCount === 'number' && typeof maxConn === 'number' && acceptCount > maxConn)
        return `accept-count (${acceptCount}) 通常不应超过 max-connections (${maxConn})`
    },
  },
  {
    fieldKey: 'logbackDiscardingThreshold',
    check: ({ formValues }) => {
      const threshold = getByPath(formValues, 'logbackDiscardingThreshold') as number
      if (typeof threshold === 'number' && threshold > 100)
        return '丢弃阈值不应超过 100%'
    },
  },
]

const configSchema: FormSchema = {
  sections: [
    {
      id: 'runtime',
      label: '核心配置 — 运行时 / Web 容器',
      fields: [
        { key: 'gc', label: '垃圾回收器', type: 'string', default: 'G1GC', placeholder: 'G1GC' },
        { key: 'jvmOptions', label: 'JVM 配置', type: 'string', default: '-Xms4g -Xmx4g', placeholder: '-Xms4g -Xmx4g' },
        {
          key: 'virtualThreadsEnabled',
          label: 'spring.threads.virtual.enabled',
          type: 'select',
          default: true,
          options: [
            { value: true, label: 'true（虚拟线程）' },
            { value: false, label: 'false' },
          ],
        },
        { key: 'tomcatMaxThreads', label: 'server.tomcat.threads.max', type: 'number', default: 200, min: 1 },
        { key: 'tomcatMinSpareThreads', label: 'server.tomcat.threads.min-spare', type: 'number', default: 10, min: 0 },
        { key: 'tomcatMaxConnections', label: 'server.tomcat.max-connections', type: 'number', default: 10000, min: 1 },
        { key: 'tomcatAcceptCount', label: 'server.tomcat.accept-count', type: 'number', default: 100, min: 0 },
      ],
    },
    {
      id: 'logback',
      label: '核心配置 — Logback',
      fields: [
        { key: 'logbackMaxFileSize', label: 'RollingFileAppender maxFileSize', type: 'string', default: '100MB', placeholder: '100MB' },
        { key: 'logbackMaxHistory', label: 'maxHistory', type: 'number', default: 30, min: 0 },
        { key: 'logbackQueueSize', label: 'AsyncAppender queueSize', type: 'number', default: 256, min: 0 },
        { key: 'logbackDiscardingThreshold', label: 'discardingThreshold (%)', type: 'number', default: 20, min: 0 },
        { key: 'logbackMaxFlushTimeMs', label: 'maxFlushTime (ms)', type: 'number', default: 5000, min: 0 },
        {
          key: 'logbackNeverBlock',
          label: 'neverBlock',
          type: 'select',
          default: false,
          options: [
            { value: false, label: 'false（队列满时阻塞）' },
            { value: true, label: 'true（丢弃不阻塞）' },
          ],
        },
      ],
    },
  ],
  crossRules: configCrossRules,
}

export const runtimeLayer: LayerDefinition = {
  id: 'runtime',
  label: '运行时层',
  icon: 'J',
  theme: 'orange',
  maxCount: 1,
  paramsSchema,
  configSchema,
  topologyDisplay: {
    params: ['jdkVersion'],
    config: ['gc', 'tomcatMaxThreads'],
  },
}
