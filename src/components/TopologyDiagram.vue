<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Graph, Shape, Snapline } from '@antv/x6'
import { getLayerIcon, getLayerTheme } from '@/registry/layers'
import type { TopologyNode, TopologyEdge, DependencyKind } from '@/types/layers'

const CARD_WIDTH = 260
const CARD_HEIGHT = 128
const GAP = 28
const PADDING = 40
const PORT_R = 3
const COLOR_PORT = '#C2C8D5'
const COLOR_PORT_ACTIVE = '#5F95FF'

const props = withDefaults(
  defineProps<{
    nodes: TopologyNode[]
    edges: TopologyEdge[]
    layerDisplayFields?: Record<string, { label: string; displayText: string }[]>
    visible?: boolean
  }>(),
  { layerDisplayFields: () => ({}), visible: true }
)

const emit = defineEmits<{
  remove: [nodeId: string]
  edit: [node: TopologyNode]
  drop: [
    payload:
      | { type: 'layer'; layerId: 'client' | 'access' | 'host' | 'runtime' }
      | { type: 'dependency'; kind: DependencyKind; label: string },
  ]
  nodeMoved: [payload: { nodeId: string; x: number; y: number }]
  edgeVerticesChanged: [payload: { edgeId: string; vertices: { x: number; y: number }[] }]
  edgeConnected: [payload: { source: string; target: string }]
}>()

const containerRef = ref<HTMLElement | null>(null)
/**
 * node:moved 之后只需同步位置，不需要重建 HTML 内容。
 * 避免拖拽结束后不必要的 HTML 重渲染。
 */
const positionOnlyRef = ref(false)
let graph: Graph | null = null

function getNodePosition(index: number) {
  return {
    x: PADDING,
    y: PADDING + index * (CARD_HEIGHT + GAP),
  }
}

// ---- 端口配置 ----
const basePortAttrs = {
  r: PORT_R,
  magnet: true,
  stroke: COLOR_PORT,
  strokeWidth: 1,
  fill: COLOR_PORT,
  style: { visibility: 'hidden' as const },
}

function createPortGroup(position: 'top' | 'bottom') {
  return { position, attrs: { circle: { ...basePortAttrs } } }
}

const PORTS = {
  groups: {
    top: createPortGroup('top'),
    bottom: createPortGroup('bottom'),
  },
  items: [
    { id: 'top', group: 'top' },
    { id: 'bottom', group: 'bottom' },
  ],
}

const SHAPE_NAME = 'topology-node'
const EDGE_SHAPE = 'topology-edge'
let shapeRegistered = false

function registerShapes() {
  if (shapeRegistered) return
  shapeRegistered = true

  Graph.registerEdge(
    EDGE_SHAPE,
    {
      inherit: 'edge',
      attrs: {
        line: {
          stroke: COLOR_PORT_ACTIVE,
          strokeWidth: 2,
          targetMarker: { name: 'block', size: 8 },
        },
      },
    },
    true,
  )

  Shape.HTML.register({
    shape: SHAPE_NAME,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    effect: ['data'],
    html(cell) {
      const data = cell.getData() as { raw?: TopologyNode; displayFields?: { label: string; displayText: string }[] }
      const node = data?.raw
      if (!node) return document.createElement('div')

      const theme = getLayerTheme(node.layerId)
      const wrap = document.createElement('div')
      wrap.className = `topology-card topology-card-${theme}`
      wrap.setAttribute('draggable', 'false')
      wrap.addEventListener('dragstart', (e) => e.preventDefault())
      if (node.nodeSource === 'user') wrap.classList.add('user')

      const header = document.createElement('div')
      header.className = 'topology-card-header'

      const icon = document.createElement('div')
      icon.className = 'topology-card-icon'
      icon.textContent = getLayerIcon(node.layerId)

      const title = document.createElement('div')
      title.className = 'topology-card-title'
      title.textContent = node.label

      const actions = document.createElement('div')
      actions.className = 'topology-card-actions'

      if (node.nodeSource === 'user') {
        const removeBtn = document.createElement('span')
        removeBtn.className = 'op'
        removeBtn.title = '删除节点'
        removeBtn.textContent = '\u2716\uFE0F'
        removeBtn.dataset.action = 'remove'
        actions.appendChild(removeBtn)
      }

      header.appendChild(icon)
      header.appendChild(title)
      header.appendChild(actions)
      wrap.appendChild(header)

      const displayFields = data?.displayFields ?? []
      if (displayFields.length > 0) {
        const body = document.createElement('div')
        body.className = 'topology-card-body'
        for (const row of displayFields) {
          const line = document.createElement('div')
          line.className = 'topology-card-field'
          line.textContent = `${row.label}: ${row.displayText}`
          body.appendChild(line)
        }
        wrap.appendChild(body)
      }

      return wrap
    },
  })
}

function handleNodeClick(_args: { e: MouseEvent; node: { id: string; getData: () => { raw?: TopologyNode } } }) {
  const { e, node } = _args as unknown as { e: MouseEvent; node: { id: string; getData: () => { raw?: TopologyNode } } }
  const target = e.target as HTMLElement
  const data = node.getData()
  const raw = data?.raw

  if (target.closest('[data-action="remove"]')) {
    if (raw?.id) emit('remove', raw.id)
    return
  }
  if (raw) emit('edit', raw)
}

// ---- 端口工具函数 ----
function isPortConnected(nodeId: string, portId: string): boolean {
  if (!graph) return false
  const node = graph.getCellById(nodeId)
  if (!node || !graph.isNode(node)) return false
  const edges = graph.getConnectedEdges(node)
  return edges.some(
    (e) =>
      (e.getSourceCellId() === nodeId && e.getSourcePortId() === portId) ||
      (e.getTargetCellId() === nodeId && e.getTargetPortId() === portId),
  )
}

function setPortVisible(
  node: ReturnType<Graph['getCellById']>,
  portId: string,
  visible: boolean,
) {
  if (!node || !graph?.isNode(node)) return
  ;(node as { setPortProp: (a: string, b: string, c: string) => void }).setPortProp(
    portId,
    'attrs/circle/style/visibility',
    visible ? 'visible' : 'hidden',
  )
}

function setPortColor(
  node: ReturnType<Graph['getCellById']>,
  portId: string,
  color: string,
) {
  if (!node || !graph?.isNode(node)) return
  const n = node as { setPortProp: (a: string, b: string, c: string) => void }
  n.setPortProp(portId, 'attrs/circle/fill', color)
  n.setPortProp(portId, 'attrs/circle/stroke', color)
}

function showNodePorts(node: { id: string; getPorts: () => { id: string }[] }, show: boolean) {
  if (!graph) return
  const cell = graph.getCellById(node.id)
  if (!cell || !graph.isNode(cell)) return
  const ports = node.getPorts()
  for (let i = 0; i < ports.length; i++) {
    const p = ports[i]
    if (!p) continue
    const portId = p.id as string
    if (show) {
      setPortVisible(cell, portId, true)
    } else {
      const connected = isPortConnected(node.id, portId)
      setPortVisible(cell, portId, connected)
      setPortColor(cell, portId, connected ? COLOR_PORT_ACTIVE : COLOR_PORT)
    }
  }
}

// ---- 核心：增量同步（永远不 clearCells，只增删改差异部分） ----
function syncGraph() {
  if (!graph || !containerRef.value) return

  const dataNodes = props.nodes
  const dataEdges = props.edges
  const displayFieldsMap = props.layerDisplayFields ?? {}

  // --- 同步节点 ---
  const dataNodeIds = new Set(dataNodes.map((n) => n.id))
  const graphNodes = graph.getNodes()

  // 1) 删除图上多余的节点（在图中但不在数据里）
  for (const gn of graphNodes) {
    if (!dataNodeIds.has(gn.id)) {
      graph.removeCell(gn)
    }
  }

  // 2) 添加缺失的节点 / 更新已有节点
  let addedNew = false
  dataNodes.forEach((node, i) => {
    const pos =
      node.x != null && node.y != null
        ? { x: node.x, y: node.y }
        : getNodePosition(i)
    const existing = graph!.getCellById(node.id)
    if (existing && graph!.isNode(existing)) {
      // 已存在：只更新位置
      existing.setPosition(pos.x, pos.y)
      // 仅位置变更时跳过数据更新（避免 HTML 重渲染闪烁）
      if (!positionOnlyRef.value) {
        existing.setData({ raw: node, displayFields: displayFieldsMap[node.layerId] ?? [] })
      }
    } else {
      // 不存在：添加新节点
      graph!.addNode({
        id: node.id,
        shape: SHAPE_NAME,
        x: pos.x,
        y: pos.y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        data: { raw: node, displayFields: displayFieldsMap[node.layerId] ?? [] },
        ports: PORTS,
        movable: true,
      })
      addedNew = true
    }
  })

  // --- 同步边 ---
  const dataEdgeIds = new Set(dataEdges.map((e) => e.id))
  const graphEdges = graph.getEdges()

  // 1) 删除图上多余的边
  for (const ge of graphEdges) {
    if (!dataEdgeIds.has(ge.id)) {
      graph.removeCell(ge)
    }
  }

  // 2) 添加缺失的边
  for (const edge of dataEdges) {
    const existing = graph.getCellById(edge.id)
    if (!existing) {
      graph.addEdge({
        id: edge.id,
        shape: EDGE_SHAPE,
        source: { cell: edge.source, port: 'bottom' },
        target: { cell: edge.target, port: 'top' },
        vertices: edge.vertices ?? [],
        connector: { name: 'smooth', args: { direction: 'V' } },
      })
      addedNew = true
    }
  }

  // --- 端口激活色 ---
  dataEdges.forEach((edge) => {
    const src = graph!.getCellById(edge.source)
    const tgt = graph!.getCellById(edge.target)
    if (src && graph!.isNode(src)) {
      setPortVisible(src, 'bottom', true)
      setPortColor(src, 'bottom', COLOR_PORT_ACTIVE)
    }
    if (tgt && graph!.isNode(tgt)) {
      setPortVisible(tgt, 'top', true)
      setPortColor(tgt, 'top', COLOR_PORT_ACTIVE)
    }
  })

  positionOnlyRef.value = false
  if (addedNew) graph.centerContent()
}

// ---- 缩放 ----
function zoomIn() {
  if (graph) graph.zoom(0.2)
}

function zoomOut() {
  if (graph) graph.zoom(-0.2)
}

function resetView() {
  if (graph) {
    graph.zoomTo(1)
    graph.centerContent()
  }
}

// ---- 拖拽 drop（只接受节点列表） ----
const PALETTE_DROP_MARKER = 'application/x-java-doctor-palette'

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  // 只接受从节点列表（NodeListPanel）发起的拖拽，其它 drop 一律忽略
  if (!e.dataTransfer?.getData(PALETTE_DROP_MARKER)) return
  const raw = e.dataTransfer.getData('application/json')
  if (!raw) return
  try {
    const payload = JSON.parse(raw) as
      | { type: 'layer'; layerId: 'client' | 'access' | 'host' | 'runtime' }
      | { type: 'dependency'; kind: DependencyKind; label: string }
    if (payload.type === 'layer' && payload.layerId) {
      if (props.nodes.some((n) => n.layerId === payload.layerId)) return
      emit('drop', { type: 'layer', layerId: payload.layerId })
    } else if (payload.type === 'dependency' && payload.kind != null && payload.label != null) {
      emit('drop', { type: 'dependency', kind: payload.kind, label: payload.label })
    }
  } catch {
    // ignore
  }
}

// ---- 生命周期 ----
onMounted(() => {
  if (!containerRef.value) return

  registerShapes()

  graph = new Graph({
    container: containerRef.value,
    autoResize: true,
    grid: true,
    panning: { enabled: true, eventTypes: ['leftMouseDown', 'mouseWheel'] },
    mousewheel: {
      enabled: true,
      minScale: 0.5,
      maxScale: 3,
    },
    background: { color: '#fafafa' },
    interacting: () => ({
      nodeMovable: true,
      edgeMovable: true,
      vertexMovable: true,
      vertexAddable: true,
      vertexDeletable: true,
    }),
  })

  graph.use(new Snapline({ enabled: true }))

  graph.on('node:click', handleNodeClick)
  graph.on('node:mouseenter', ({ node }: { node: { id: string; getPorts: () => { id: string }[] } }) => {
    showNodePorts(node, true)
  })
  graph.on('node:mouseleave', ({ node }: { node: { id: string; getPorts: () => { id: string }[] } }) => {
    showNodePorts(node, false)
  })
  graph.on('node:moved', ({ node }: { node: { id: string; getPosition: () => { x: number; y: number } } }) => {
    const pos = node.getPosition()
    positionOnlyRef.value = true
    emit('nodeMoved', { nodeId: node.id, x: pos.x, y: pos.y })
  })
  graph.on('edge:change:vertices', ({ edge }: { edge: { id: string; getVertices: () => Array<{ x: number; y: number }> } }) => {
    const raw = edge.getVertices()
    const vertices = raw.map((v: { x: number; y: number }) => ({ x: v.x, y: v.y }))
    emit('edgeVerticesChanged', { edgeId: edge.id, vertices })
  })
  graph.on('edge:connected', ({ edge, isNew }: { edge: { getSourceCellId: () => string; getTargetCellId: () => string }; isNew: boolean }) => {
    if (!isNew) return
    const source = edge.getSourceCellId()
    const target = edge.getTargetCellId()
    emit('edgeConnected', { source, target })
    graph!.removeCell(edge as unknown as import('@antv/x6').Cell)
  })

  syncGraph()
})

onUnmounted(() => {
  graph?.dispose()
  graph = null
})

watch(
  () => [props.nodes, props.edges, props.layerDisplayFields],
  () => syncGraph(),
  { deep: true },
)

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      positionOnlyRef.value = false
      nextTick(() => syncGraph())
    }
  },
)
</script>

<template>
  <div
    class="zoom-pan-container"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <div ref="containerRef" class="x6-container" />
    <div class="zoom-controls">
      <button type="button" title="放大" @click="zoomIn">+</button>
      <button type="button" title="缩小" @click="zoomOut">&minus;</button>
      <button type="button" title="重置视图" @click="resetView">&#x27F2;</button>
    </div>
  </div>
</template>

<style scoped>
.zoom-pan-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.x6-container {
  width: 100%;
  height: 100%;
}

.zoom-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 10;
}

.zoom-controls button {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 1.1rem;
  cursor: pointer;
  line-height: 1;
  box-shadow: var(--shadow-sm);
  transition: background 0.15s, border-color 0.15s;
}

.zoom-controls button:hover {
  background: var(--bg-hover);
  border-color: var(--accent);
  color: var(--accent);
}
</style>

<style>
/* 拓扑卡片 */
.topology-card {
  display: flex;
  flex-direction: column;
  border: 1px solid #5f95ff;
  border-radius: 8px;
  box-sizing: border-box;
  padding: 12px 12px 14px;
  width: 100%;
  height: 100%;
  background: #fff;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  overflow: hidden;
}

.topology-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.topology-card.user {
  border-color: var(--accent-dim);
}

.topology-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.topology-card-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.topology-card-blue .topology-card-icon {
  background: #f0f5ff;
  color: #1d39c4;
}

.topology-card-gray .topology-card-icon {
  background: #f5f5f5;
  color: #595959;
}

.topology-card-green .topology-card-icon {
  background: #e6fffb;
  color: #08979c;
}

.topology-card-orange .topology-card-icon {
  background: #fff7e6;
  color: #fa8c16;
}

.topology-card-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topology-card-actions {
  margin-left: auto;
  color: var(--text-muted);
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.topology-card-actions .op {
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}

.topology-card-actions .op:hover {
  background: var(--bg-hover);
  color: var(--accent);
}

.topology-card-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 6px;
  padding-bottom: 2px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.topology-card-field {
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
