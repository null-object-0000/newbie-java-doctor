<script setup lang="ts">
import { useTopologyStore } from '@/stores/topology'
import { storeToRefs } from 'pinia'
import type { DiskType, Arch } from '@/types/layers'

defineProps<{
  section: 'params' | 'config'
}>()

const store = useTopologyStore()
const { hostParams, hostConfig } = storeToRefs(store)

const diskOptions: { value: DiskType; label: string }[] = [
  { value: 'ssd', label: 'SSD' },
  { value: 'nvme', label: 'NVMe' },
  { value: 'hdd', label: 'HDD' },
]

const archOptions: { value: Arch; label: string }[] = [
  { value: 'x86', label: 'X86' },
  { value: 'arm', label: 'ARM' },
]

const tcpTwReuseOptions = [
  { value: 0 as const, label: '0：关' },
  { value: 1 as const, label: '1：全局开启' },
  { value: 2 as const, label: '2：只对 loopback 开启' },
]
</script>

<template>
  <div class="layer-view">
    <template v-if="section === 'params'">
      <header class="page-header">
        <h2>宿主容器层 (Host Layer)</h2>
        <p class="desc">物理边界，决定资源的「天花板」与 OS 内核行为。以下为<strong>核心参数</strong>。</p>
      </header>

      <div class="card">
        <h3 class="card-title">规格维度 (Computing Specification)</h3>
      <div class="form-grid">
        <div class="field">
          <label>vCPU（逻辑核数）</label>
          <input v-model.number="hostParams.spec.vCpu" type="number" min="1" />
        </div>
        <div class="field">
          <label>单核频率 (GHz)</label>
          <input v-model.number="hostParams.spec.cpuFreqGhz" type="number" min="0.1" step="0.1" />
        </div>
        <div class="field">
          <label>内存 (GB)</label>
          <input v-model.number="hostParams.spec.memoryGb" type="number" min="1" />
        </div>
        <div class="field">
          <label>Architecture</label>
          <select v-model="hostParams.spec.architecture">
            <option v-for="opt in archOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">存储维度 (Storage / IOPS)</h3>
      <div class="form-grid">
        <div class="field">
          <label>Disk Type</label>
          <select v-model="hostParams.storage.diskType">
            <option v-for="opt in diskOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>IOPS 上限</label>
          <input v-model.number="hostParams.storage.iopsLimit" type="number" min="0" />
        </div>
        <div class="field">
          <label>Throughput (MB/s)</label>
          <input v-model.number="hostParams.storage.throughputMbPerSec" type="number" min="0" />
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">网络维度 (Network Throughput)</h3>
      <div class="form-grid">
        <div class="field">
          <label>NIC 带宽 (Gbps)</label>
          <input v-model.number="hostParams.network.nicBandwidthGbps" type="number" min="0" />
        </div>
        <div class="field">
          <label>PPS 上限</label>
          <input v-model.number="hostParams.network.ppsLimit" type="number" min="0" />
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">软件环境与内核 (OS & Kernel)</h3>
      <div class="form-grid">
        <div class="field">
          <label>OS Version</label>
          <input v-model="hostParams.os.osVersion" type="text" placeholder="如 AlmaLinux, Ubuntu" />
        </div>
        <div class="field">
          <label>Kernel Version</label>
          <input v-model="hostParams.os.kernelVersion" type="text" placeholder="如 5.14" />
        </div>
      </div>
    </div>
    </template>

    <template v-if="section === 'config'">
      <header class="page-header">
        <h2>宿主容器层 (Host Layer)</h2>
        <p class="desc">以下为<strong>核心配置</strong>（可调优）。</p>
      </header>

      <div class="card config-card">
        <h3 class="card-title">核心配置（可调优）— net</h3>
      <div class="form-grid">
        <div class="field">
          <label>net.ipv4.tcp_tw_reuse</label>
          <select v-model="hostConfig.net.tcpTwReuse">
            <option v-for="opt in tcpTwReuseOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <span class="hint">TIME-WAIT 端口复用</span>
        </div>
        <div class="field">
          <label>net.ipv4.ip_local_port_range</label>
          <input v-model="hostConfig.net.ipLocalPortRange" type="text" placeholder="32768 60999" />
        </div>
        <div class="field">
          <label>net.ipv4.tcp_max_tw_buckets</label>
          <input v-model.number="hostConfig.net.tcpMaxTwBuckets" type="number" min="0" />
        </div>
      </div>
    </div>

    <div class="card config-card">
      <h3 class="card-title">核心配置（可调优）— fs</h3>
      <div class="form-grid">
        <div class="field">
          <label>ulimit -n / fs.nr_open / fs.file-max</label>
          <span class="hint">进程最大打开文件句柄数</span>
        </div>
        <div class="field">
          <label>ulimit -n</label>
          <input v-model.number="hostConfig.fs.ulimitN" type="number" min="0" />
        </div>
        <div class="field">
          <label>fs.nr_open</label>
          <input v-model.number="hostConfig.fs.fsNrOpen" type="number" min="0" />
        </div>
        <div class="field">
          <label>fs.file-max</label>
          <input v-model.number="hostConfig.fs.fsFileMax" type="number" min="0" />
        </div>
      </div>
      <div class="card-actions">
        <button type="button" class="btn btn-secondary" @click="store.resetHost">恢复默认</button>
      </div>
    </div>
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

.hint {
  font-size: 0.75rem;
  color: var(--text-muted);
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
