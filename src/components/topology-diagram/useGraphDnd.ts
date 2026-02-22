import type { ShallowRef } from 'vue'
import type { Graph } from '@antv/x6'
import type { TopologyNode, DependencyKind } from '@/types/layers'
import { CARD_WIDTH, CARD_HEIGHT, PADDING, PALETTE_DROP_MARKER } from './constants'
import type { DropPayload } from './constants'

export function useGraphDnd(deps: {
  graph: ShallowRef<Graph | null>
  getNodes: () => TopologyNode[]
  onDrop: (payload: DropPayload) => void
}) {
  function onDragOver(e: DragEvent) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    if (!e.dataTransfer?.getData(PALETTE_DROP_MARKER)) return
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as
        | { type: 'layer'; layerId: 'client' | 'access' | 'host' | 'runtime' }
        | { type: 'dependency'; kind: DependencyKind; label: string }

      let x = PADDING
      let y = PADDING
      if (deps.graph.value) {
        const local = deps.graph.value.clientToLocal({ x: e.clientX, y: e.clientY })
        x = local.x - CARD_WIDTH / 2
        y = local.y - CARD_HEIGHT / 2
      }

      if (payload.type === 'layer' && payload.layerId) {
        if (deps.getNodes().some((n) => n.layerId === payload.layerId)) return
        deps.onDrop({ type: 'layer', layerId: payload.layerId, x, y })
      } else if (
        payload.type === 'dependency' &&
        payload.kind != null &&
        payload.label != null
      ) {
        deps.onDrop({ type: 'dependency', kind: payload.kind, label: payload.label, x, y })
      }
    } catch {
      // ignore invalid drag data
    }
  }

  return { onDragOver, onDrop }
}
