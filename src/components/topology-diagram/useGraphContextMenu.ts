import { reactive } from 'vue'
import type { Ref } from 'vue'
import type { TopologyNode, TopologyEdge } from '@/types/layers'

type CtxOption =
  | { label: string; key: string; disabled?: boolean }
  | { type: 'divider'; key: string }

interface ContextMenuDeps {
  getNodes: () => TopologyNode[]
  getEdges: () => TopologyEdge[]
  isGroupEdge: (edgeId: string) => boolean
  selectEdge: (id: string | null) => void
  selectedEdgeId: Ref<string | null>
  fitContent: () => void
  resetView: () => void
  onEditNode: (node: TopologyNode) => void
  onDeleteNode: (id: string) => void
  onEditEdge: (edge: TopologyEdge) => void
  onDeleteEdge: (id: string) => void
}

export function useGraphContextMenu(deps: ContextMenuDeps) {
  const ctxMenu = reactive({
    show: false,
    x: 0,
    y: 0,
    options: [] as CtxOption[],
  })

  let ctxTarget: { type: 'node' | 'edge' | 'blank'; id?: string } = { type: 'blank' }

  function showNodeContextMenu(e: MouseEvent, nodeId: string) {
    const raw = deps.getNodes().find((n) => n.id === nodeId)
    ctxTarget = { type: 'node', id: nodeId }
    const canRemove =
      raw?.nodeSource === 'user' &&
      !(raw?.dependencyRole === 'server' && raw?.dependencyGroupId)
    ctxMenu.options = [
      { label: '编辑属性', key: 'edit-node' },
      { type: 'divider', key: 'd1' },
      { label: '删除节点', key: 'delete-node', disabled: !canRemove },
    ]
    ctxMenu.x = e.clientX
    ctxMenu.y = e.clientY
    ctxMenu.show = true
  }

  function showEdgeContextMenu(e: MouseEvent, edgeId: string) {
    ctxTarget = { type: 'edge', id: edgeId }
    const groupEdge = deps.isGroupEdge(edgeId)
    ctxMenu.options = [
      { label: '编辑属性', key: 'edit-edge' },
      { type: 'divider', key: 'd1' },
      { label: '删除连线', key: 'delete-edge', disabled: groupEdge },
    ]
    ctxMenu.x = e.clientX
    ctxMenu.y = e.clientY
    ctxMenu.show = true
  }

  function showBlankContextMenu(e: MouseEvent) {
    ctxTarget = { type: 'blank' }
    ctxMenu.options = [
      { label: '适应画布', key: 'fit-content' },
      { label: '重置缩放', key: 'reset-zoom' },
    ]
    ctxMenu.x = e.clientX
    ctxMenu.y = e.clientY
    ctxMenu.show = true
  }

  function onCtxMenuSelect(key: string) {
    ctxMenu.show = false
    switch (key) {
      case 'edit-node': {
        const node = deps.getNodes().find((n) => n.id === ctxTarget.id)
        if (node) deps.onEditNode(node)
        break
      }
      case 'delete-node': {
        if (ctxTarget.id) deps.onDeleteNode(ctxTarget.id)
        break
      }
      case 'edit-edge': {
        const edge = deps.getEdges().find((e) => e.id === ctxTarget.id)
        if (edge) deps.onEditEdge(edge)
        break
      }
      case 'delete-edge': {
        if (ctxTarget.id) deps.onDeleteEdge(ctxTarget.id)
        break
      }
      case 'fit-content':
        deps.fitContent()
        break
      case 'reset-zoom':
        deps.resetView()
        break
    }
  }

  function onCtxMenuClickOutside() {
    ctxMenu.show = false
  }

  return {
    ctxMenu,
    showNodeContextMenu,
    showEdgeContextMenu,
    showBlankContextMenu,
    onCtxMenuSelect,
    onCtxMenuClickOutside,
  }
}
