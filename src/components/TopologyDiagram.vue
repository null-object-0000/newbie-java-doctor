<script setup lang="ts">
import { ref, reactive, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { Graph, Shape, Snapline, Keyboard } from '@antv/x6'
import { NButton, NTooltip, NDropdown } from 'naive-ui'
import { getLayerIcon, getLayerTheme } from '@/registry/layers'
import type { TopologyNode, TopologyEdge, DependencyKind } from '@/types/layers'

// ========== Constants ==========
const CARD_WIDTH = 260
const CARD_HEIGHT = 128
const GAP = 28
/** client 与 server 之间的水平间距（预留连线上显示内容） */
const GROUP_CLIENT_SERVER_GAP = 72
const PADDING = 40
const PORT_R = 4
const COLOR_PORT = '#C2C8D5'

/** 连线含义与颜色 */
const EDGE_COLORS = {
  default: '#5F95FF',
  group_client_server: '#52c41a',
} as const

const COLOR_PORT_ACTIVE = EDGE_COLORS.default

// ========== Props ==========
const props = withDefaults(
  defineProps<{
    nodes: TopologyNode[]
    edges: TopologyEdge[]
    nodeDisplayFields?: Record<string, { label: string; displayText: string }[]>
    /** 连线上展示的字段（key 为 edgeId） */
    edgeDisplayFields?: Record<string, { label: string; displayText: string }[]>
    /** 各节点是否有输入/输出端口（不传则默认都有） */
    nodePortConfig?: Record<string, { hasInput: boolean; hasOutput: boolean }>
    visible?: boolean
    /** 撤销/重做由外部（完整 JSON 状态）提供 */
    canUndo?: boolean
    canRedo?: boolean
    /** 当前选中的节点 id（与编辑面板同步） */
    selectedNodeId?: string | null
  }>(),
  {
    nodeDisplayFields: () => ({}),
    edgeDisplayFields: () => ({}),
    nodePortConfig: () => ({}),
    visible: true,
    canUndo: false,
    canRedo: false,
    selectedNodeId: null,
  },
)

// ========== Emits ==========
const emit = defineEmits<{
  remove: [nodeId: string]
  edit: [node: TopologyNode]
  select: [node: TopologyNode | null]
  edgeSelect: [edge: TopologyEdge | null]
  drop: [
    payload:
      | { type: 'layer'; layerId: 'client' | 'access' | 'host' | 'runtime'; x: number; y: number }
      | { type: 'dependency'; kind: DependencyKind; label: string; x: number; y: number },
  ]
  nodeMoved: [payload: { nodeId: string; x: number; y: number }]
  edgeVerticesChanged: [payload: { edgeId: string; vertices: { x: number; y: number }[] }]
  edgeConnected: [payload: { source: string; target: string }]
  edgeRemoved: [edgeId: string]
  undo: []
  redo: []
}>()

// ========== Refs & State ==========
const containerRef = ref<HTMLElement | null>(null)
/**
 * node:moved 之后只需同步位置，不需要重建 HTML 内容。
 * 避免拖拽结束后不必要的 HTML 重渲染。
 */
const positionOnlyRef = ref(false)
/**
 * 初始渲染时 HTML 自定义节点的 port 元素需要浏览器完成绘制才会挂载到 DOM，
 * 在此之前创建的边无法正确解析 port 锚点。设为 true 时 doSyncGraph 跳过边同步，
 * 等节点绑定 port 后再置为 false 并重新 sync。
 */
let deferEdgeSync = false
let graph: Graph | null = null

// ---- Selection state ----
const selectedEdgeId = ref<string | null>(null)
const hasSelection = computed(() => !!props.selectedNodeId || !!selectedEdgeId.value)

// ---- Context Menu state ----
type CtxOption =
  | { label: string; key: string; disabled?: boolean }
  | { type: 'divider'; key: string }

const ctxMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  options: [] as CtxOption[],
})
let ctxTarget: { type: 'node' | 'edge' | 'blank'; id?: string } = { type: 'blank' }

// ========== Position Calculation ==========
function getNodePosition(index: number) {
  return {
    x: PADDING,
    y: PADDING + index * (CARD_HEIGHT + GAP),
  }
}

/** 为依赖层同组（dependencyGroupId）节点计算并排布局，其余节点按行占位 */
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

// ========== Port Configuration ==========
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

// ========== Shape Registration ==========
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
      const data = cell.getData() as {
        raw?: TopologyNode
        displayFields?: { label: string; displayText: string }[]
        selected?: boolean
      }
      const node = data?.raw
      if (!node) return document.createElement('div')

      const theme = getLayerTheme(node.layerId)
      const wrap = document.createElement('div')
      wrap.className = `topology-card topology-card-${theme}`
      wrap.setAttribute('draggable', 'false')
      wrap.addEventListener('dragstart', (e) => e.preventDefault())
      if (node.nodeSource === 'user') wrap.classList.add('user')
      if (data?.selected) wrap.classList.add('topology-card-selected')
      if (node.dependencyRole === 'server' && node.dependencyGroupId)
        wrap.classList.add('topology-card-follows-client')

      // ---- Header ----
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

      const canRemove =
        node.nodeSource === 'user' &&
        !(node.dependencyRole === 'server' && node.dependencyGroupId)
      if (canRemove) {
        const removeBtn = document.createElement('span')
        removeBtn.className = 'op op-danger'
        removeBtn.title = '删除节点 (Delete)'
        removeBtn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
        removeBtn.dataset.action = 'remove'
        actions.appendChild(removeBtn)
      }

      header.appendChild(icon)
      header.appendChild(title)
      header.appendChild(actions)
      wrap.appendChild(header)

      // ---- Body: display fields ----
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

// ========== Node Click Handler ==========
function handleNodeClick(_args: {
  e: MouseEvent
  node: { id: string; getData: () => { raw?: TopologyNode } }
}) {
  const { e, node } = _args as unknown as {
    e: MouseEvent
    node: { id: string; getData: () => { raw?: TopologyNode } }
  }
  const target = e.target as HTMLElement
  const data = node.getData()
  const raw = data?.raw

  // 点击节点时清除边选中
  selectEdge(null)
  emit('edgeSelect', null)

  if (target.closest('[data-action="remove"]')) {
    if (raw?.id) emit('remove', raw.id)
    return
  }
  if (raw) {
    emit('select', raw)
    emit('edit', raw)
  }
}

/** 连线选中时显示的删除按钮配置（仅选中时显示） */
const EDGE_REMOVE_TOOL = [{ name: 'button-remove', args: { distance: 20 } }]

/** 判断连线是否是同组 client→server 的组内连线（不可删除） */
function isGroupEdge(edgeId: string): boolean {
  const edge = props.edges.find((e) => e.id === edgeId)
  if (!edge) return false
  const src = props.nodes.find((n) => n.id === edge.source)
  const tgt = props.nodes.find((n) => n.id === edge.target)
  return !!(
    src?.dependencyGroupId &&
    src.dependencyGroupId === tgt?.dependencyGroupId &&
    src.dependencyRole === 'client' &&
    tgt?.dependencyRole === 'server'
  )
}

// ========== Edge Selection ==========
function selectEdge(edgeId: string | null) {
  if (!graph) return
  // 取消之前的选中：恢复线宽并移除删除按钮
  if (selectedEdgeId.value) {
    const prev = graph.getCellById(selectedEdgeId.value)
    if (prev && graph.isEdge(prev)) {
      prev.setAttrByPath('line/strokeWidth', 2)
      ;(prev as unknown as { setTools: (t: unknown[]) => void }).setTools([])
    }
  }
  selectedEdgeId.value = edgeId
  // 设置新的选中：加粗并显示删除按钮（组内连线不显示删除按钮）
  if (edgeId) {
    const edge = graph.getCellById(edgeId)
    if (edge && graph.isEdge(edge)) {
      edge.setAttrByPath('line/strokeWidth', 3)
      if (!isGroupEdge(edgeId)) {
        ;(edge as unknown as { setTools: (t: unknown[]) => void }).setTools(EDGE_REMOVE_TOOL)
      }
    }
  }
}

// ========== Context Menu ==========
function showNodeContextMenu(e: MouseEvent, nodeId: string) {
  const raw = props.nodes.find((n) => n.id === nodeId)
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
  const groupEdge = isGroupEdge(edgeId)
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
      const node = props.nodes.find((n) => n.id === ctxTarget.id)
      if (node) {
        emit('select', node)
        emit('edit', node)
      }
      break
    }
    case 'delete-node': {
      if (ctxTarget.id) emit('remove', ctxTarget.id)
      break
    }
    case 'edit-edge': {
      const edge = props.edges.find((e) => e.id === ctxTarget.id)
      if (edge) {
        selectEdge(edge.id)
        emit('select', null)
        emit('edgeSelect', edge)
      }
      break
    }
    case 'delete-edge': {
      if (ctxTarget.id) {
        emit('edgeRemoved', ctxTarget.id)
        emit('edgeSelect', null)
        if (selectedEdgeId.value === ctxTarget.id) selectEdge(null)
      }
      break
    }
    case 'fit-content':
      fitContent()
      break
    case 'reset-zoom':
      resetView()
      break
  }
}

function onCtxMenuClickOutside() {
  ctxMenu.show = false
}

// ========== Delete selected ==========
function deleteSelected() {
  if (selectedEdgeId.value) {
    if (isGroupEdge(selectedEdgeId.value)) return
    emit('edgeRemoved', selectedEdgeId.value)
    selectEdge(null)
    return
  }
  if (props.selectedNodeId) {
    const node = props.nodes.find((n) => n.id === props.selectedNodeId)
    if (
      node?.nodeSource === 'user' &&
      !(node.dependencyRole === 'server' && node.dependencyGroupId)
    ) {
      emit('remove', props.selectedNodeId)
    }
  }
}

// ========== Port Utility Functions ==========
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

type NodeWithPorts = {
  getPorts: () => { id: string }[]
  setPortProp: (a: string, b: string, c: string) => void
}

function hasPort(node: ReturnType<Graph['getCellById']>, portId: string): boolean {
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

function showNodePorts(
  node: { id: string; getPorts: () => { id: string }[] },
  show: boolean,
) {
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

// ========== Core: Incremental Sync ==========
function syncGraph() {
  if (!graph || !containerRef.value) return
  doSyncGraph()
}

function doSyncGraph() {
  if (!graph || !containerRef.value) return

  const dataNodes = props.nodes
  const dataEdges = props.edges
  const displayFieldsMap = props.nodeDisplayFields ?? {}
  const edgeDisplayMap = props.edgeDisplayFields ?? {}

  // --- Sync Nodes ---
  const dataNodeIds = new Set(dataNodes.map((n) => n.id))
  const graphNodes = graph.getNodes()

  // 1) 删除图上多余的节点
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
      (node.x != null && node.y != null ? { x: node.x, y: node.y } : getNodePosition(i))
    const existing = graph!.getCellById(node.id)
    const isServerFollowingClient =
      node.dependencyRole === 'server' && node.dependencyGroupId != null
    const isSelected = node.id === props.selectedNodeId
    if (existing && graph!.isNode(existing)) {
      existing.setPosition(pos.x, pos.y)
      if (
        typeof (existing as unknown as { setMovable?: (v: boolean) => void }).setMovable === 'function'
      ) {
        ;(existing as unknown as { setMovable: (v: boolean) => void }).setMovable(
          !isServerFollowingClient,
        )
      }
      if (!positionOnlyRef.value) {
        existing.setData({
          raw: node,
          displayFields: displayFieldsMap[node.id] ?? [],
          selected: isSelected,
        })
      }
    } else {
      graph!.addNode({
        id: node.id,
        shape: SHAPE_NAME,
        x: pos.x,
        y: pos.y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        data: {
          raw: node,
          displayFields: displayFieldsMap[node.id] ?? [],
          selected: isSelected,
        },
        ports: getPortsForNode(node.id),
        movable: !isServerFollowingClient,
      })
      addedNew = true
    }
  })

  // 若处于延迟边同步阶段，仅同步节点，跳过边和 centerContent
  if (deferEdgeSync) {
    positionOnlyRef.value = false
    return
  }

  // --- Sync Edges ---
  const dataEdgeIds = new Set(dataEdges.map((e) => e.id))
  const graphEdges = graph.getEdges()

  // 1) 删除图上多余的边
  for (const ge of graphEdges) {
    if (!dataEdgeIds.has(ge.id)) {
      graph.removeCell(ge)
    }
  }

  /** 同组 client->server 的边 */
  function getEdgeEndpoints(edge: TopologyEdge): {
    source: { cell: string; port: string }
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

  function getEdgeColor(edge: TopologyEdge): string {
    return getEdgeEndpoints(edge).isGroupEdge
      ? EDGE_COLORS.group_client_server
      : EDGE_COLORS.default
  }

  /** 生成连线上的标签文案（如「公网」） */
  function buildEdgeLabelText(edgeId: string): string {
    const fields = edgeDisplayMap[edgeId]
    if (!fields?.length) return ''
    return fields.map((f) => f.displayText).join(' / ')
  }

  /** 构建 X6 edge labels 配置 */
  function buildEdgeLabels(edgeId: string) {
    const text = buildEdgeLabelText(edgeId)
    if (!text) return []
    return [
      {
        attrs: {
          label: {
            text,
            fill: '#555',
            fontSize: 11,
            fontFamily: 'inherit',
          },
          rect: {
            ref: 'label',
            fill: '#fff',
            stroke: '#ddd',
            strokeWidth: 1,
            rx: 3,
            ry: 3,
            refWidth: 8,
            refHeight: 4,
            refX: -4,
            refY: -2,
          },
        },
        position: { distance: 0.5 },
      },
    ]
  }

  // 2) 添加缺失的边 / 同步已有边
  for (const edge of dataEdges) {
    const stroke = getEdgeColor(edge)
    const { source, target, isGroupEdge } = getEdgeEndpoints(edge)
    const labels = buildEdgeLabels(edge.id)
    const existing = graph.getCellById(edge.id)
    if (!existing) {
      graph.addEdge({
        id: edge.id,
        shape: EDGE_SHAPE,
        source,
        target,
        vertices: edge.vertices ?? [],
        labels,
        connector: { name: 'smooth', args: { direction: isGroupEdge ? 'H' : 'V' } },
        tools: [], // 删除按钮仅在选中该连线时显示，见 selectEdge
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
      // 同步连线标签
      ;(existing as unknown as { setLabels: (l: unknown[]) => void }).setLabels(labels)
      if (isGroupEdge) {
        ;(existing as unknown as { setSource: (s: typeof source) => void }).setSource(source)
        ;(existing as unknown as { setTarget: (t: typeof target) => void }).setTarget(target)
      }
    }
  }

  // --- Port active colors ---
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

  // 若当前有选中的连线，确保其显示删除按钮（sync 可能重建边；组内连线不显示）
  if (selectedEdgeId.value) {
    const sel = graph.getCellById(selectedEdgeId.value)
    if (sel && graph.isEdge(sel)) {
      sel.setAttrByPath('line/strokeWidth', 3)
      if (!isGroupEdge(selectedEdgeId.value)) {
        ;(sel as unknown as { setTools: (t: unknown[]) => void }).setTools(EDGE_REMOVE_TOOL)
      }
    }
  }
}

// ========== Zoom & View ==========
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

function fitContent() {
  if (graph) graph.zoomToFit({ padding: 40, maxScale: 1.5 })
}

function onUndo() {
  if (props.canUndo) emit('undo')
}

function onRedo() {
  if (props.canRedo) emit('redo')
}

// ========== Drag & Drop ==========
const PALETTE_DROP_MARKER = 'application/x-java-doctor-palette'

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
    if (graph) {
      const local = graph.clientToLocal({ x: e.clientX, y: e.clientY })
      x = local.x - CARD_WIDTH / 2
      y = local.y - CARD_HEIGHT / 2
    }

    if (payload.type === 'layer' && payload.layerId) {
      if (props.nodes.some((n) => n.layerId === payload.layerId)) return
      emit('drop', { type: 'layer', layerId: payload.layerId, x, y })
    } else if (
      payload.type === 'dependency' &&
      payload.kind != null &&
      payload.label != null
    ) {
      emit('drop', { type: 'dependency', kind: payload.kind, label: payload.label, x, y })
    }
  } catch {
    // ignore
  }
}

// ========== Passive Event Listener Patch ==========
const PASSIVE_TYPES = new Set([
  'touchstart',
  'touchmove',
  'touchend',
  'mousewheel',
  'wheel',
])

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

function patchPassiveForContainerAndDescendants(container: HTMLElement) {
  patchPassiveEventListeners(container)
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
  container.insertBefore = function <T extends Node>(
    newChild: T,
    refChild: Node | null,
  ): T {
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

// ========== Lifecycle ==========
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
    // 连线配置：改善端口连接体验
    connecting: {
      snap: { radius: 30 },
      allowBlank: false,
      allowLoop: false,
      allowMulti: false,
      highlight: true,
      connector: { name: 'smooth' },
      connectionPoint: 'anchor',
      createEdge() {
        return graph!.createEdge({
          shape: 'edge',
          attrs: {
            line: {
              stroke: EDGE_COLORS.default,
              strokeWidth: 2,
              strokeDasharray: '5 5',
              targetMarker: { name: 'block', size: 8 },
            },
          },
        })
      },
      validateMagnet({ magnet }) {
        return magnet?.getAttribute('magnet') !== 'false'
      },
      validateConnection(args) {
        const sourceCell = (args as { sourceCell?: { id: string } | null }).sourceCell
        const targetCell = (args as { targetCell?: { id: string } | null }).targetCell
        if (!sourceCell?.id || !targetCell?.id) return false
        if (sourceCell.id === targetCell.id) return false
        return !props.edges.some(
          (e) => e.source === sourceCell.id && e.target === targetCell.id,
        )
      },
    },
    // 端口磁吸高亮
    highlighting: {
      magnetAdsorbed: {
        name: 'stroke',
        args: {
          padding: 4,
          attrs: {
            strokeWidth: 4,
            stroke: '#5F95FF',
            opacity: 0.6,
          },
        },
      },
    },
    interacting: ((cellView: import('@antv/x6').CellView | undefined) => {
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
      const dataNode = props.nodes.find((n) => n.id === cell.id)
      const isServerNode =
        cell.isNode?.() &&
        (dataNode
          ? dataNode.dependencyRole === 'server' && dataNode.dependencyGroupId != null
          : !!((cell.getData?.() as { raw?: TopologyNode } | undefined)?.raw
              ?.dependencyRole === 'server' &&
              (cell.getData?.() as { raw?: TopologyNode } | undefined)?.raw
                ?.dependencyGroupId))
      return {
        nodeMovable: !isServerNode,
        edgeMovable: true,
        vertexMovable: true,
        vertexAddable: true,
        vertexDeletable: true,
      }
    }) as import('@antv/x6').CellViewInteracting,
  })

  // Passive patch for X6-created sub-elements
  containerRef.value.querySelectorAll?.('*')?.forEach((el) => {
    if (el instanceof HTMLElement) patchPassiveEventListeners(el)
  })

  // Plugins
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

  // ---- Keyboard Shortcuts ----
  graph.bindKey(['ctrl+z', 'meta+z'], (e) => {
    e.preventDefault()
    if (props.canUndo) emit('undo')
  })
  graph.bindKey(['ctrl+shift+z', 'meta+shift+z'], (e) => {
    e.preventDefault()
    if (props.canRedo) emit('redo')
  })
  graph.bindKey(['delete', 'backspace'], (e) => {
    e.preventDefault()
    deleteSelected()
  })
  graph.bindKey('escape', () => {
    selectEdge(null)
    emit('select', null)
  })

  // ---- Node Events ----
  graph.on('node:click', handleNodeClick)
  graph.on(
    'node:mouseenter',
    ({ node }: { node: { id: string; getPorts: () => { id: string }[] } }) => {
      showNodePorts(node, true)
    },
  )
  graph.on(
    'node:mouseleave',
    ({ node }: { node: { id: string; getPorts: () => { id: string }[] } }) => {
      showNodePorts(node, false)
    },
  )
  graph.on(
    'node:moved',
    ({
      node,
    }: {
      node: {
        id: string
        getPosition: () => { x: number; y: number }
        setPosition: (x: number, y: number) => void
      }
    }) => {
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
    },
  )

  // ---- Context Menu Events ----
  graph.on(
    'node:contextmenu',
    ({ e, node }: { e: MouseEvent; node: { id: string } }) => {
      e.preventDefault()
      e.stopPropagation()
      showNodeContextMenu(e, node.id)
    },
  )
  graph.on(
    'edge:contextmenu',
    ({ e, edge }: { e: MouseEvent; edge: { id: string } }) => {
      e.preventDefault()
      e.stopPropagation()
      showEdgeContextMenu(e, edge.id)
    },
  )
  graph.on('blank:contextmenu', ({ e }: { e: MouseEvent }) => {
    e.preventDefault()
    showBlankContextMenu(e)
  })

  // ---- Edge Events ----
  graph.on('edge:click', ({ edge }: { edge: { id: string } }) => {
    // 选中连线
    selectEdge(edge.id)
    // 取消节点选中
    emit('select', null)
    // 通知父组件选中了哪条连线（用于打开连线编辑面板）
    const dataEdge = props.edges.find((e) => e.id === edge.id)
    emit('edgeSelect', dataEdge ?? null)
  })
  graph.on('edge:mouseenter', ({ edge }: { edge: { id: string } }) => {
    if (!graph) return
    const cell = graph.getCellById(edge.id)
    if (cell && graph.isEdge(cell) && edge.id !== selectedEdgeId.value) {
      cell.setAttrByPath('line/strokeWidth', 3)
    }
  })
  graph.on('edge:mouseleave', ({ edge }: { edge: { id: string } }) => {
    if (!graph) return
    const cell = graph.getCellById(edge.id)
    if (cell && graph.isEdge(cell) && edge.id !== selectedEdgeId.value) {
      cell.setAttrByPath('line/strokeWidth', 2)
    }
  })

  graph.on('blank:click', () => {
    selectEdge(null)
    emit('select', null)
    emit('edgeSelect', null)
  })

  // ---- Edge lifecycle events ----
  graph.on(
    'edge:change:vertices',
    ({
      edge,
    }: {
      edge: { id: string; getVertices: () => Array<{ x: number; y: number }> }
    }) => {
      const raw = edge.getVertices()
      const vertices = raw.map((v: { x: number; y: number }) => ({
        x: v.x,
        y: v.y,
      }))
      emit('edgeVerticesChanged', { edgeId: edge.id, vertices })
    },
  )
  graph.on(
    'edge:connected',
    ({
      edge,
      isNew,
    }: {
      edge: {
        getSourceCellId: () => string
        getTargetCellId: () => string
      }
      isNew: boolean
    }) => {
      if (!isNew) return
      const source = edge.getSourceCellId()
      const target = edge.getTargetCellId()
      emit('edgeConnected', { source, target })
      graph!.removeCell(edge as unknown as import('@antv/x6').Cell)
    },
  )
  graph.on('cell:removed', ({ cell }: { cell: import('@antv/x6').Cell }) => {
    if (graph!.isEdge(cell)) {
      if (selectedEdgeId.value === cell.id) selectEdge(null)
      emit('edgeRemoved', cell.id)
    }
  })

  // Phase 1：仅同步节点，跳过边——此时 HTML 节点的 port 元素尚未挂载到 DOM，
  // 若此时创建边，X6 无法解析 port 锚点，会 fallback 到节点中心。
  deferEdgeSync = true
  syncGraph()
  deferEdgeSync = false

  // Phase 2：轮询检测 port 元素是否已挂载到 DOM（circle[magnet="true"]），
  // 一旦检测到即同步边；附带上限防止无限轮询。
  let portPollCount = 0
  const MAX_PORT_POLLS = 60 // ≈ 60 帧 ≈ 1s@60fps
  const pollPortsAndSyncEdges = () => {
    if (!graph || !containerRef.value) return
    portPollCount++
    const hasPorts = containerRef.value.querySelector('circle[magnet="true"]') !== null
    if (hasPorts || portPollCount >= MAX_PORT_POLLS) {
      doSyncGraph()
      return
    }
    requestAnimationFrame(pollPortsAndSyncEdges)
  }
  requestAnimationFrame(pollPortsAndSyncEdges)
})

onUnmounted(() => {
  passivePatchObserver?.disconnect()
  passivePatchObserver = null
  graph?.dispose()
  graph = null
})

// ========== Watchers ==========
watch(
  () => [props.nodes, props.edges, props.nodeDisplayFields, props.edgeDisplayFields, props.nodePortConfig],
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

// 选中节点变化时更新视觉状态
watch(
  () => props.selectedNodeId,
  (newId, oldId) => {
    if (!graph) return
    if (oldId) {
      const old = graph.getCellById(oldId)
      if (old && graph.isNode(old)) {
        const data = (old as unknown as { getData: () => Record<string, unknown> }).getData()
        ;(old as unknown as { setData: (d: Record<string, unknown>) => void }).setData({
          ...data,
          selected: false,
        })
      }
    }
    if (newId) {
      const node = graph.getCellById(newId)
      if (node && graph.isNode(node)) {
        const data = (
          node as unknown as { getData: () => Record<string, unknown> }
        ).getData()
        ;(node as unknown as { setData: (d: Record<string, unknown>) => void }).setData({
          ...data,
          selected: true,
        })
      }
    }
  },
)
</script>

<template>
  <div
    class="zoom-pan-container"
    @dragover="onDragOver"
    @drop="onDrop"
    @contextmenu.prevent
  >
    <div ref="containerRef" class="x6-container" />

    <!-- Toolbar -->
    <div class="diagram-toolbar">
      <!-- Undo / Redo -->
      <div class="toolbar-group">
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn" :disabled="!canUndo" @click="onUndo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
            </button>
          </template>
          撤销 (Ctrl+Z)
        </NTooltip>
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn" :disabled="!canRedo" @click="onRedo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"></path></svg>
            </button>
          </template>
          重做 (Ctrl+Shift+Z)
        </NTooltip>
      </div>

      <div class="toolbar-divider" />

      <!-- Zoom -->
      <div class="toolbar-group">
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn" @click="zoomIn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </button>
          </template>
          放大
        </NTooltip>
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn" @click="zoomOut">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </button>
          </template>
          缩小
        </NTooltip>
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn" @click="fitContent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>
            </button>
          </template>
          适应画布
        </NTooltip>
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn" @click="resetView">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
            </button>
          </template>
          重置视图
        </NTooltip>
      </div>

      <div class="toolbar-divider" />

      <!-- Delete selected -->
      <div class="toolbar-group">
        <NTooltip placement="left">
          <template #trigger>
            <button class="toolbar-btn toolbar-btn-danger" :disabled="!hasSelection" @click="deleteSelected">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </template>
          删除选中 (Delete)
        </NTooltip>
      </div>
    </div>

    <!-- Context Menu -->
    <NDropdown
      placement="bottom-start"
      trigger="manual"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :options="ctxMenu.options"
      :show="ctxMenu.show"
      @select="onCtxMenuSelect"
      @clickoutside="onCtxMenuClickOutside"
    />
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

/* ---- Toolbar ---- */
.diagram-toolbar {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.toolbar-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.toolbar-divider {
  height: 1px;
  margin: 2px 4px;
  background: var(--border, #e2e8f0);
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary, #334155);
  transition: background 0.15s, color 0.15s;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--bg-hover, #f1f5f9);
  color: var(--accent, #4f46e5);
}

.toolbar-btn:active:not(:disabled) {
  background: var(--bg-active, #e2e8f0);
}

.toolbar-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.toolbar-btn-danger:hover:not(:disabled) {
  color: #ef4444;
  background: #fef2f2;
}

.toolbar-btn svg {
  flex-shrink: 0;
}
</style>

<style>
/* ---- Topology Card ---- */
.topology-card {
  display: flex;
  flex-direction: column;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  box-sizing: border-box;
  padding: 12px 12px 14px;
  width: 100%;
  height: 100%;
  background: #fff;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  overflow: hidden;
}

.topology-card:hover {
  border-color: var(--accent, #4f46e5);
  box-shadow: 0 2px 12px rgba(79, 70, 229, 0.12);
}

/* 选中状态 */
.topology-card-selected {
  border-color: var(--accent, #4f46e5) !important;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.18), 0 2px 12px rgba(79, 70, 229, 0.12) !important;
}

.topology-card.user {
  border-color: var(--accent-dim, #6366f1);
}

.topology-card-follows-client {
  cursor: default;
}

/* ---- Card Header ---- */
.topology-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
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
  color: var(--text-primary, #0f172a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Card Actions ---- */
.topology-card-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.topology-card:hover .topology-card-actions {
  opacity: 1;
}

.topology-card-actions .op {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--text-muted, #64748b);
  transition: background 0.15s, color 0.15s;
}

.topology-card-actions .op:hover {
  background: var(--bg-hover, #f1f5f9);
  color: var(--accent, #4f46e5);
}

.topology-card-actions .op-danger:hover {
  background: #fef2f2;
  color: #ef4444;
}

/* ---- Card Body ---- */
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
  color: var(--text-muted, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
