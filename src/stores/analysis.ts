import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useTopologyStore } from './topology'
import { runAnalysis } from '@/engine'
import type { AnalysisResult, NodeStatus } from '@/engine/types'

export const useAnalysisStore = defineStore('analysis', () => {
  const topologyStore = useTopologyStore()

  const analysisResult = ref<AnalysisResult | null>(null)
  const isAnalyzing = ref(false)
  /** 数据变更后结果是否过期 */
  const isStale = ref(false)

  const hasResult = computed(() => analysisResult.value !== null)

  /** nodeId -> NodeStatus 映射，供拓扑图快速查询 */
  const nodeStatusMap = computed<Record<string, NodeStatus>>(() => {
    if (!analysisResult.value) return {}
    const map: Record<string, NodeStatus> = {}
    for (const status of analysisResult.value.nodeStatuses) {
      map[status.nodeId] = status
    }
    return map
  })

  function analyze(): void {
    isAnalyzing.value = true
    try {
      const state = topologyStore.getFullState()
      analysisResult.value = runAnalysis(state)
      isStale.value = false
    } finally {
      isAnalyzing.value = false
    }
  }

  function clearResult(): void {
    analysisResult.value = null
    isStale.value = false
  }

  // 拓扑数据变更时标记结果过期
  watch(
    () => [
      topologyStore.topology,
      topologyStore.nodeConstraints,
      topologyStore.nodeObjectives,
      topologyStore.nodeTunables,
      topologyStore.edgeParams,
    ],
    () => {
      if (analysisResult.value) {
        isStale.value = true
      }
    },
    { deep: true },
  )

  return {
    analysisResult,
    isAnalyzing,
    isStale,
    hasResult,
    nodeStatusMap,
    analyze,
    clearResult,
  }
})
