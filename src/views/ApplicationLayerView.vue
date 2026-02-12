<script setup lang="ts">
import { ref, watch } from 'vue'
import { useTopologyStore } from '@/stores/topology'
import { storeToRefs } from 'pinia'

const props = withDefaults(
  defineProps<{ onlyTab?: 'runtime' | 'dependency'; section?: 'params' | 'config' }>(),
  { onlyTab: undefined, section: 'params' }
)

const tab = ref<'runtime' | 'dependency'>(props.onlyTab ?? 'runtime')
watch(
  () => props.onlyTab,
  (v) => {
    if (v) tab.value = v
  },
  { immediate: true }
)
const store = useTopologyStore()
const {
  runtimeParams,
  runtimeConfig,
  dependencyParams,
  dependencyConfig,
} = storeToRefs(store)

const redisClientOptions = [
  { value: 'jedis' as const, label: 'Jedis' },
  { value: 'lettuce' as const, label: 'Lettuce' },
  { value: 'redisson' as const, label: 'Redisson' },
]
</script>

<template>
  <div class="layer-view">
    <header class="page-header">
      <h2>应用层 (Application Layer)</h2>
      <p v-if="!onlyTab" class="desc">包含<strong>运行时层</strong>（业务逻辑与 Java 运行时）与<strong>依赖层</strong>（HTTP/Redis/DB 等客户端与目标服务）。</p>
    </header>

    <div v-if="!onlyTab" class="tabs">
      <button
        type="button"
        class="tab"
        :class="{ active: tab === 'runtime' }"
        @click="tab = 'runtime'"
      >
        运行时层
      </button>
      <button
        type="button"
        class="tab"
        :class="{ active: tab === 'dependency' }"
        @click="tab = 'dependency'"
      >
        依赖层
      </button>
    </div>

    <!-- Runtime Layer -->
    <template v-if="tab === 'runtime'">
      <template v-if="section === 'params'">
        <div class="card">
          <h3 class="card-title">核心参数</h3>
          <div class="form-grid">
            <div class="field">
              <label>JDK 版本</label>
              <input v-model="runtimeParams.jdkVersion" type="text" placeholder="21" />
            </div>
            <div class="field">
              <label>单次请求日志条数</label>
              <input v-model.number="runtimeParams.logLinesPerRequest" type="number" min="0" />
            </div>
            <div class="field">
              <label>单次请求日志大小 (bytes)</label>
              <input v-model.number="runtimeParams.logSizeBytesPerRequest" type="number" min="0" />
            </div>
          </div>
        </div>
      </template>

      <template v-if="section === 'config'">
        <div class="card config-card">
          <h3 class="card-title">核心配置 — 运行时 / Web 容器</h3>
        <div class="form-grid">
          <div class="field">
            <label>垃圾回收器</label>
            <input v-model="runtimeConfig.gc" type="text" placeholder="G1GC" />
          </div>
          <div class="field full">
            <label>JVM 配置</label>
            <input v-model="runtimeConfig.jvmOptions" type="text" placeholder="-Xms4g -Xmx4g" />
          </div>
          <div class="field">
            <label>spring.threads.virtual.enabled</label>
            <select v-model="runtimeConfig.virtualThreadsEnabled">
              <option :value="true">true（虚拟线程）</option>
              <option :value="false">false</option>
            </select>
          </div>
          <div class="field">
            <label>server.tomcat.threads.max</label>
            <input v-model.number="runtimeConfig.tomcatMaxThreads" type="number" min="1" />
          </div>
          <div class="field">
            <label>server.tomcat.threads.min-spare</label>
            <input v-model.number="runtimeConfig.tomcatMinSpareThreads" type="number" min="0" />
          </div>
          <div class="field">
            <label>server.tomcat.max-connections</label>
            <input v-model.number="runtimeConfig.tomcatMaxConnections" type="number" min="1" />
          </div>
          <div class="field">
            <label>server.tomcat.accept-count</label>
            <input v-model.number="runtimeConfig.tomcatAcceptCount" type="number" min="0" />
          </div>
        </div>
      </div>

      <div class="card config-card">
        <h3 class="card-title">核心配置 — Logback</h3>
        <div class="form-grid">
          <div class="field">
            <label>RollingFileAppender maxFileSize</label>
            <input v-model="runtimeConfig.logbackMaxFileSize" type="text" placeholder="100MB" />
          </div>
          <div class="field">
            <label>maxHistory</label>
            <input v-model.number="runtimeConfig.logbackMaxHistory" type="number" min="0" />
          </div>
          <div class="field">
            <label>AsyncAppender queueSize</label>
            <input v-model.number="runtimeConfig.logbackQueueSize" type="number" min="0" />
          </div>
          <div class="field">
            <label>discardingThreshold (%)</label>
            <input v-model.number="runtimeConfig.logbackDiscardingThreshold" type="number" min="0" />
          </div>
          <div class="field">
            <label>maxFlushTime (ms)</label>
            <input v-model.number="runtimeConfig.logbackMaxFlushTimeMs" type="number" min="0" />
          </div>
          <div class="field">
            <label>neverBlock</label>
            <select v-model="runtimeConfig.logbackNeverBlock">
              <option :value="false">false（队列满时阻塞）</option>
              <option :value="true">true（丢弃不阻塞）</option>
            </select>
          </div>
        </div>
        <div class="card-actions">
          <button type="button" class="btn btn-secondary" @click="store.resetRuntime">恢复默认</button>
        </div>
      </div>
      </template>
    </template>

    <!-- Dependency Layer -->
    <template v-else>
      <template v-if="section === 'params'">
        <div class="card">
          <h3 class="card-title">核心参数 — Redis Server</h3>
        <div class="form-grid" v-if="dependencyParams.redis">
          <div class="field">
            <label>内存容量 (GB)</label>
            <input v-model.number="dependencyParams.redis.memoryGb" type="number" min="0" />
          </div>
          <div class="field">
            <label>分片数量</label>
            <input v-model.number="dependencyParams.redis.shardCount" type="number" min="1" />
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">核心参数 — Database Server</h3>
        <div class="form-grid" v-if="dependencyParams.database">
          <div class="field">
            <label>引擎</label>
            <input v-model="dependencyParams.database.engine" type="text" placeholder="MySQL" />
          </div>
          <div class="field">
            <label>CPU</label>
            <input v-model.number="dependencyParams.database.cpu" type="number" min="0" />
          </div>
          <div class="field">
            <label>内存 (GB)</label>
            <input v-model.number="dependencyParams.database.memoryGb" type="number" min="0" />
          </div>
          <div class="field">
            <label>最大连接数</label>
            <input v-model.number="dependencyParams.database.maxConnections" type="number" min="0" />
          </div>
          <div class="field">
            <label>最大 IOPS</label>
            <input v-model.number="dependencyParams.database.maxIops" type="number" min="0" />
          </div>
          <div class="field">
            <label>储存空间 (GB)</label>
            <input v-model.number="dependencyParams.database.storageGb" type="number" min="0" />
          </div>
        </div>
      </div>
      </template>

      <template v-if="section === 'config'">
        <div class="card config-card">
          <h3 class="card-title">核心配置 — Redis Client</h3>
        <div class="form-grid">
          <div class="field">
            <label>客户端类型</label>
            <select v-model="dependencyConfig.redisClient">
              <option v-for="opt in redisClientOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>
        <p class="hint-block">HTTP Client（Java HTTP Client / OkHttp / Apache HttpClient）的配置可根据依赖层核心参数自动计算推荐，此处预留扩展。</p>
        <div class="card-actions">
          <button type="button" class="btn btn-secondary" @click="store.resetDependency">恢复默认</button>
        </div>
      </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.layer-view {
  max-width: 800px;
}

.page-header {
  margin-bottom: 1.5rem;
}

.page-header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
}

.desc {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0;
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 1.5rem;
}

.tab {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.9rem;
}

.tab:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tab.active {
  background: var(--bg-hover);
  color: var(--accent);
  border-color: var(--accent);
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  margin-bottom: 1.25rem;
}

.config-card {
  border-color: var(--accent-dim);
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field.full {
  grid-column: 1 / -1;
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
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.field input:focus,
.field select:focus {
  outline: none;
  border-color: var(--accent);
}

.hint-block {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 1rem 0 0 0;
  padding: 0.75rem;
  background: var(--bg-page);
  border-radius: var(--radius);
}

.card-actions {
  margin-top: 1rem;
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
