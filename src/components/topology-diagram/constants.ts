import type { TopologyNode, TopologyEdge, DependencyKind } from '@/types/layers'

export const CARD_WIDTH = 260
export const CARD_HEIGHT = 128
export const GAP = 28
/** client 与 server 之间的水平间距（预留连线上显示内容） */
export const GROUP_CLIENT_SERVER_GAP = 72
export const PADDING = 40
export const PORT_R = 4
export const COLOR_PORT = '#C2C8D5'

export const EDGE_COLORS = {
  default: '#5F95FF',
  group_client_server: '#52c41a',
} as const

export const COLOR_PORT_ACTIVE = EDGE_COLORS.default

export const SHAPE_NAME = 'topology-node'
export const EDGE_SHAPE = 'topology-edge'

export const PALETTE_DROP_MARKER = 'application/x-java-doctor-palette'

export interface DisplayField {
  label: string
  displayText: string
}

export interface NodeStatusInfo {
  status: 'ok' | 'warning' | 'error'
  summary: string
}

export interface SyncData {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
  nodeDisplayFields: Record<string, DisplayField[]>
  edgeDisplayFields: Record<string, DisplayField[]>
  nodePortConfig: Record<string, { hasInput: boolean; hasOutput: boolean }>
  nodeStatusMap: Record<string, NodeStatusInfo>
  selectedNodeId: string | null
}

export type DropPayload =
  | { type: 'layer'; layerId: 'client' | 'access' | 'host' | 'runtime'; x: number; y: number }
  | { type: 'dependency'; kind: DependencyKind; label: string; x: number; y: number }

export interface GraphEventCallbacks {
  onRemove: (nodeId: string) => void
  onSelect: (node: TopologyNode | null) => void
  onEdit: (node: TopologyNode) => void
  onEdgeSelect: (edge: TopologyEdge | null) => void
  onNodeMoved: (payload: { nodeId: string; x: number; y: number }) => void
  onEdgeVerticesChanged: (payload: { edgeId: string; vertices: { x: number; y: number }[] }) => void
  onEdgeConnected: (payload: { source: string; target: string }) => void
  onEdgeRemoved: (edgeId: string) => void
  onUndo: () => void
  onRedo: () => void
  onNodeContextMenu: (e: MouseEvent, nodeId: string) => void
  onEdgeContextMenu: (e: MouseEvent, edgeId: string) => void
  onBlankContextMenu: (e: MouseEvent) => void
}
