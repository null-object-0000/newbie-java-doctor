<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { Graph, Shape, Snapline, Keyboard } from '@antv/x6'
import { NButton, NButtonGroup, NTooltip } from 'naive-ui'
import { getLayerIcon, getLayerTheme } from '@/registry/layers'
import type { TopologyNode, TopologyEdge, DependencyKind } from '@/types/layers'

const CARD_WIDTH = 260
const CARD_HEIGHT = 128
const GAP = 28
/** client 与 server 之间的水平间距（预留连线上显示内容） */
const GROUP_CLIENT_SERVER_GAP = 72
const PADDING = 40
const PORT_R = 3
const COLOR_PORT = '#C2C8D5'

/** 连线含义与颜色：不同语义用不同颜色区分（需对外引用时可抽到单独 constants 文件） */
const EDGE_COLORS = {
  /** 默认：层与层之间的数据/请求流向 */
  default: '#5F95FF',
  /** 依赖组内：客户端 → 服务端（应用连接依赖） */
  group_client_server: '#52c41a',
} as const

const COLOR_PORT_ACTIVE = EDGE_COLORS.default

const props = withDefaults(
  defineProps<{
    nodes: TopologyNode[]
    edges: TopologyEdge[]
    layerDisplayFields?: Record<string, { label: string; displayText: string }[]>
    /** 各节点是否有输入/输出端口（不传则默认都有） */
    nodePortConfig?: Record<string, { hasInput: boolean; hasOutput: boolean }>
    visible?: boolean
    /** 撤销/重做由外部（完整 JSON 状态）提供 */
    canUndo?: boolean
    canRedo?: boolean
  }>(),
  { layerDisplayFields: () => ({}), nodePortConfig: () => ({}), visible: true, canUndo: false, canRedo: false }
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
  undo: []
  redo: []
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

/** 为依赖层同组（dependencyGroupId）节点计算并排布局，其余节点按行占位；返回 nodeId -> { x, y } */
function buildDependencyPositionMap(
  dataNodes: TopologyNode[],
): Record<string, { x: number; y: number }> {
  const map: Record<string, { x: number; y: number }> = {}
  const used = new Set<string>()
  const rows: TopologyNode[][] = []

  for (const node of dataNodes) {
    if (used.has(node.id)) continue
    if (node.dependencyGroupId) {
      const mate = dataNodes.find(
        (n) => n.id !== node.id && n.dependencyGroupId === node.dependencyGroupId,
      )
      if (mate) {
        const ordered = node.dependencyRole === 'client' ? [node, mate] : [mate, node]
        rows.push(ordered)
        used.add(node.id)
        used.add(mate.id)
      } else {
        rows.push([node])
        used.add(node.id)
      }
    } else {
      rows.push([node])
      used.add(node.id)
    }
  }

  rows.forEach((row, rowIndex) => {
    const first = row[0]
    if (!first) return
    const hasStoredPosition = first.x != null && first.y != null
    const baseX = (hasStoredPosition ? first.x : null) ?? PADDING
    const baseY = (hasStoredPosition ? first.y : null) ?? PADDING + rowIndex * (CARD_HEIGHT + GAP)
    const isClientServerRow = row.length === 2 && first.dependencyGroupId != null
    row.forEach((node, slot) => {
      const dx =
        isClientServerRow && slot === 1
          ? CARD_WIDTH + GROUP_CLIENT_SERVER_GAP
          : slot * (CARD_WIDTH + GAP)
      map[node.id] = {
        x: baseX + dx,
        y: baseY,
      }
    })
  })
  return map
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

function createPortGroup(position: 'top' | 'bottom' | 'left' | 'right') {
  return { position, attrs: { circle: { ...basePortAttrs } } }
}

const PORTS = {
  groups: {
    top: createPortGroup('top'),
    bottom: createPortGroup('bottom'),
    left: createPortGroup('left'),
    right: createPortGroup('right'),
  },
  items: [
    { id: 'top', group: 'top' },
    { id: 'bottom', group: 'bottom' },
    { id: 'left', group: 'left' },
    { id: 'right', group: 'right' },
  ],
}

function getPortsForNode(nodeId: string) {
  const node = props.nodes.find((n) => n.id === nodeId)
  if (node?.dependencyRole === 'server' && node.dependencyGroupId != null) {
    return { groups: PORTS.groups, items: [] }
  }
  const cfg = props.nodePortConfig?.[nodeId]
  const hasInput = cfg?.hasInput !== false
  const hasOutput = cfg?.hasOutput !== false
  const hasSidePorts = node?.dependencyGroupId != null
  const items: { id: string; group: string }[] = []
  if (hasInput) items.push({ id: 'top', group: 'top' })
  if (hasOutput) items.push({ id: 'bottom', group: 'bottom' })
  if (hasSidePorts) {
    items.push({ id: 'left', group: 'left' })
    items.push({ id: 'right', group: 'right' })
  }
  return {
    groups: PORTS.groups,
    items: items.length > 0 ? items : PORTS.items,
  }
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
          stroke: EDGE_COLORS.default,
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
      if (node.dependencyRole === 'server' && node.dependencyGroupId) wrap.classList.add('topology-card-follows-client')

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

      const canRemove = node.nodeSource === 'user' && !(node.dependencyRole === 'server' && node.dependencyGroupId)
      if (canRemove) {
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

type NodeWithPorts = { getPorts: () => { id: string }[]; setPortProp: (a: string, b: string, c: string) => void }

function hasPort(
  node: ReturnType<Graph['getCellById']>,
  portId: string,
): boolean {
  if (!node || !graph?.isNode(node)) return false
  const n = node as unknown as NodeWithPorts
  const ports = n.getPorts?.()
  return Array.isArray(ports) && ports.some((p) => p.id === portId)
}

function setPortVisible(
  node: ReturnType<Graph['getCellById']>,
  portId: string,
  visible: boolean,
) {
  if (!hasPort(node, portId)) return
  ;(node as unknown as NodeWithPorts).setPortProp(
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
  if (!hasPort(node, portId)) return
  const n = node as unknown as NodeWithPorts
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
  doSyncGraph()
}

function doSyncGraph() {
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

  const dependencyPositionMap = buildDependencyPositionMap(dataNodes)

  // 2) 添加缺失的节点 / 更新已有节点
  let addedNew = false
  dataNodes.forEach((node, i) => {
    const pos =
      dependencyPositionMap[node.id] ??
      (node.x != null && node.y != null
        ? { x: node.x, y: node.y }
        : getNodePosition(i))
    const existing = graph!.getCellById(node.id)
    const isServerFollowingClient =
      node.dependencyRole === 'server' && node.dependencyGroupId != null
    if (existing && graph!.isNode(existing)) {
      existing.setPosition(pos.x, pos.y)
      if (typeof (existing as { setMovable?: (v: boolean) => void }).setMovable === 'function') {
        (existing as { setMovable: (v: boolean) => void }).setMovable(!isServerFollowingClient)
      }
      if (!positionOnlyRef.value) {
        existing.setData({ raw: node, displayFields: displayFieldsMap[node.id] ?? [] })
      }
    } else {
      graph!.addNode({
        id: node.id,
        shape: SHAPE_NAME,
        x: pos.x,
        y: pos.y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        data: { raw: node, displayFields: displayFieldsMap[node.id] ?? [] },
        ports: getPortsForNode(node.id),
        movable: !isServerFollowingClient,
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

  /** 同组 client→server 的边：client 用 right 端口，server 无端口用 anchor left；其余边使用下→上 */
  function getEdgeEndpoints(edge: TopologyEdge): {
    source: { cell: string; port: string } | { cell: string; port: string }
    target: { cell: string; port: string } | { cell: string; anchor: { name: string } }
    isGroupEdge: boolean
  } {
    const srcNode = dataNodes.find((n) => n.id === edge.source)
    const tgtNode = dataNodes.find((n) => n.id === edge.target)
    const isGroupEdge =
      srcNode?.dependencyGroupId &&
      srcNode.dependencyGroupId === tgtNode?.dependencyGroupId &&
      srcNode.dependencyRole === 'client' &&
      tgtNode?.dependencyRole === 'server'
    if (isGroupEdge) {
      return {
        source: { cell: edge.source, port: 'right' },
        target: { cell: edge.target, anchor: { name: 'left' } },
        isGroupEdge: true,
      }
    }
    return {
      source: { cell: edge.source, port: 'bottom' },
      target: { cell: edge.target, port: 'top' },
      isGroupEdge: false,
    }
  }

  /** 按语义返回连线颜色（与 EDGE_COLORS 一致） */
  function getEdgeColor(edge: TopologyEdge): string {
    return getEdgeEndpoints(edge).isGroupEdge ? EDGE_COLORS.group_client_server : EDGE_COLORS.default
  }

  // 2) 添加缺失的边 / 同步已有边的颜色与端点（server 无端口时用 anchor）
  for (const edge of dataEdges) {
    const stroke = getEdgeColor(edge)
    const { source, target, isGroupEdge } = getEdgeEndpoints(edge)
    const existing = graph.getCellById(edge.id)
    if (!existing) {
      graph.addEdge({
        id: edge.id,
        shape: EDGE_SHAPE,
        source,
        target,
        vertices: edge.vertices ?? [],
        connector: { name: 'smooth', args: { direction: isGroupEdge ? 'H' : 'V' } },
        attrs: {
          line: {
            stroke,
            strokeWidth: 2,
            targetMarker: { name: 'block', size: 8 },
          },
        },
      })
      addedNew = true
    } else {
      existing.setAttrByPath('line/stroke', stroke)
      if (isGroupEdge) {
        existing.setSource(source)
        existing.setTarget(target)
      }
    }
  }

  // --- 端口激活色（与连线语义一致；server 无端口故不设置）---
  dataEdges.forEach((edge) => {
    const src = graph!.getCellById(edge.source)
    const tgt = graph!.getCellById(edge.target)
    const { isGroupEdge } = getEdgeEndpoints(edge)
    const portColor = getEdgeColor(edge)
    if (src && graph!.isNode(src)) {
      if (isGroupEdge) {
        if (hasPort(src, 'right')) {
          setPortVisible(src, 'right', true)
          setPortColor(src, 'right', portColor)
        }
      } else {
        const srcHasOutput = props.nodePortConfig?.[edge.source]?.hasOutput !== false
        if (srcHasOutput && hasPort(src, 'bottom')) {
          setPortVisible(src, 'bottom', true)
          setPortColor(src, 'bottom', portColor)
        }
      }
    }
    if (tgt && graph!.isNode(tgt) && !isGroupEdge) {
      const tgtHasInput = props.nodePortConfig?.[edge.target]?.hasInput !== false
      if (tgtHasInput && hasPort(tgt, 'top')) {
        setPortVisible(tgt, 'top', true)
        setPortColor(tgt, 'top', portColor)
      }
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

function onUndo() {
  if (props.canUndo) emit('undo')
}

function onRedo() {
  if (props.canRedo) emit('redo')
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

// ---- 消除 passive 警告：X6 内部对 touchstart/mousewheel 未传 passive ----
const PASSIVE_TYPES = new Set(['touchstart', 'touchmove', 'touchend', 'mousewheel', 'wheel'])
function patchPassiveEventListeners(el: HTMLElement) {
  if ((el as { __passivePatched?: boolean }).__passivePatched) return
  ;(el as { __passivePatched?: boolean }).__passivePatched = true
  const orig = el.addEventListener.bind(el)
  el.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    const usePassive =
      PASSIVE_TYPES.has(type) &&
      (options === undefined || typeof options === 'boolean')
    orig(type, listener, usePassive ? { passive: true } : options)
  } as typeof el.addEventListener
}
let passivePatchObserver: MutationObserver | null = null
/** 对容器及其后续动态添加的子节点都加上 passive 补丁（X6 会在内部创建子 div 并绑定 wheel） */
function patchPassiveForContainerAndDescendants(container: HTMLElement) {
  patchPassiveEventListeners(container)
  // 同步劫持 appendChild/insertBefore，在子节点挂载前就打补丁，避免 X6 先绑定 wheel 再被 MutationObserver 补丁（异步太晚）
  const origAppend = container.appendChild.bind(container)
  container.appendChild = function <T extends Node>(child: T): T {
    if (child instanceof HTMLElement) {
      patchPassiveEventListeners(child)
      child.querySelectorAll?.('*')?.forEach((el) => {
        if (el instanceof HTMLElement) patchPassiveEventListeners(el)
      })
    }
    return origAppend(child) as T
  }
  const origInsert = container.insertBefore.bind(container)
  container.insertBefore = function <T extends Node>(newChild: T, refChild: Node | null): T {
    if (newChild instanceof HTMLElement) {
      patchPassiveEventListeners(newChild)
      newChild.querySelectorAll?.('*')?.forEach((el) => {
        if (el instanceof HTMLElement) patchPassiveEventListeners(el)
      })
    }
    return origInsert(newChild, refChild) as T
  }
  passivePatchObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement) {
          patchPassiveEventListeners(node)
          node.querySelectorAll?.('*')?.forEach((child) => {
            if (child instanceof HTMLElement) patchPassiveEventListeners(child)
          })
        }
      }
    }
  })
  passivePatchObserver.observe(container, { childList: true, subtree: true })
}

// ---- 生命周期 ----
onMounted(() => {
  if (!containerRef.value) return

  registerShapes()

  patchPassiveForContainerAndDescendants(containerRef.value)

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
    interacting: ((_graph: import('@antv/x6').Graph, cellView: import('@antv/x6').CellView | undefined) => {
      if (!cellView?.cell) {
        return {
          nodeMovable: true,
          edgeMovable: true,
          vertexMovable: true,
          vertexAddable: true,
          vertexDeletable: true,
        }
      }
      const cell = cellView.cell
      // 优先用 props.nodes 判断，避免 getData 未同步导致 server 仍可拖
      const dataNode = props.nodes.find((n) => n.id === cell.id)
      const isServerNode =
        cell.isNode?.() &&
        (dataNode
          ? dataNode.dependencyRole === 'server' && dataNode.dependencyGroupId != null
          : !!(
              (cell.getData?.() as { raw?: TopologyNode } | undefined)?.raw?.dependencyRole ===
                'server' && (cell.getData?.() as { raw?: TopologyNode } | undefined)?.raw?.dependencyGroupId
            ))
      return {
        nodeMovable: !isServerNode,
        edgeMovable: true,
        vertexMovable: true,
        vertexAddable: true,
        vertexDeletable: true,
      }
    }) as import('@antv/x6').CellViewInteracting,
  })

  // X6 会在容器内创建子元素并绑定 wheel，同步 patch 已存在的子树
  containerRef.value.querySelectorAll?.('*')?.forEach((el) => {
    if (el instanceof HTMLElement) patchPassiveEventListeners(el)
  })

  graph.use(new Snapline({ enabled: true }))
  graph.use(
    new Keyboard({
      enabled: true,
      global: true,
      guard(e) {
        const target = e.target as HTMLElement
        const tag = target?.tagName?.toLowerCase()
        const editable = target?.isContentEditable
        if (tag === 'input' || tag === 'textarea' || editable) return false
        return true
      },
    }),
  )

  graph.bindKey(['ctrl+z', 'meta+z'], (e) => {
    e.preventDefault()
    if (props.canUndo) emit('undo')
  })
  graph.bindKey(['ctrl+shift+z', 'meta+shift+z'], (e) => {
    e.preventDefault()
    if (props.canRedo) emit('redo')
  })

  graph.on('node:click', handleNodeClick)
  graph.on('node:mouseenter', ({ node }: { node: { id: string; getPorts: () => { id: string }[] } }) => {
    showNodePorts(node, true)
  })
  graph.on('node:mouseleave', ({ node }: { node: { id: string; getPorts: () => { id: string }[] } }) => {
    showNodePorts(node, false)
  })
  graph.on('node:moved', ({ node }: { node: { id: string; getPosition: () => { x: number; y: number }; setPosition: (x: number, y: number) => void } }) => {
    const dataNode = props.nodes.find((n) => n.id === node.id)
    const isServerNode =
      dataNode?.dependencyRole === 'server' && dataNode.dependencyGroupId != null
    if (isServerNode && dataNode.x != null && dataNode.y != null) {
      node.setPosition(dataNode.x, dataNode.y)
      return
    }
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
  passivePatchObserver?.disconnect()
  passivePatchObserver = null
  graph?.dispose()
  graph = null
})

watch(
  () => [props.nodes, props.edges, props.layerDisplayFields, props.nodePortConfig],
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
      <NButtonGroup vertical size="small">
        <NTooltip placement="left">
          <template #trigger>
            <NButton secondary :disabled="!canUndo" @click="onUndo">↶</NButton>
          </template>
          撤销 (Ctrl+Z)
        </NTooltip>
        <NTooltip placement="left">
          <template #trigger>
            <NButton secondary :disabled="!canRedo" @click="onRedo">↷</NButton>
          </template>
          重做 (Ctrl+Shift+Z)
        </NTooltip>
        <NTooltip placement="left">
          <template #trigger>
            <NButton secondary @click="zoomIn">+</NButton>
          </template>
          放大
        </NTooltip>
        <NTooltip placement="left">
          <template #trigger>
            <NButton secondary @click="zoomOut">&minus;</NButton>
          </template>
          缩小
        </NTooltip>
        <NTooltip placement="left">
          <template #trigger>
            <NButton secondary @click="resetView">&#x27F2;</NButton>
          </template>
          重置视图
        </NTooltip>
      </NButtonGroup>
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
}

.x6-container {
  width: 100%;
  height: 100%;
}

.zoom-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 10;
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

.topology-card-follows-client {
  cursor: default;
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
