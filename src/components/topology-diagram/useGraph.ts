import { ref, shallowRef, nextTick } from 'vue'
import type { Ref } from 'vue'
import { Graph, Snapline, Keyboard } from '@antv/x6'
import { register } from '@antv/x6-vue-shape'
import TopologyCard from './TopologyCard.vue'
import type { TopologyNode, TopologyEdge } from '@/types/layers'
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  GAP,
  GROUP_CLIENT_SERVER_GAP,
  PADDING,
  PORT_R,
  COLOR_PORT,
  COLOR_PORT_ACTIVE,
  EDGE_COLORS,
  SHAPE_NAME,
  EDGE_SHAPE,
} from './constants'
import type { SyncData, GraphEventCallbacks } from './constants'

// ========== Shape Registration (global, once) ==========

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

  register({
    shape: SHAPE_NAME,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    component: TopologyCard,
  })
}

// ========== Position Calculation ==========

function getNodePosition(index: number) {
  return {
    x: PADDING,
    y: PADDING + index * (CARD_HEIGHT + GAP),
  }
}

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
      map[node.id] = { x: baseX + dx, y: baseY }
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

function getPortsForNode(
  nodeId: string,
  nodes: TopologyNode[],
  nodePortConfig: Record<string, { hasInput: boolean; hasOutput: boolean }>,
) {
  const node = nodes.find((n) => n.id === nodeId)
  if (node?.dependencyRole === 'server' && node.dependencyGroupId != null) {
    return { groups: PORTS.groups, items: [] }
  }
  const cfg = nodePortConfig[nodeId]
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

// ========== Port Utility Functions ==========

type NodeWithPorts = {
  getPorts: () => { id: string }[]
  setPortProp: (a: string, b: string, c: string) => void
}

function isPortConnected(g: Graph, nodeId: string, portId: string): boolean {
  const node = g.getCellById(nodeId)
  if (!node || !g.isNode(node)) return false
  const edges = g.getConnectedEdges(node)
  return edges.some(
    (e) =>
      (e.getSourceCellId() === nodeId && e.getSourcePortId() === portId) ||
      (e.getTargetCellId() === nodeId && e.getTargetPortId() === portId),
  )
}

function hasPort(g: Graph, node: ReturnType<Graph['getCellById']>, portId: string): boolean {
  if (!node || !g.isNode(node)) return false
  const n = node as unknown as NodeWithPorts
  const ports = n.getPorts?.()
  return Array.isArray(ports) && ports.some((p) => p.id === portId)
}

function setPortVisible(
  g: Graph,
  node: ReturnType<Graph['getCellById']>,
  portId: string,
  visible: boolean,
) {
  if (!hasPort(g, node, portId)) return
  ;(node as unknown as NodeWithPorts).setPortProp(
    portId,
    'attrs/circle/style/visibility',
    visible ? 'visible' : 'hidden',
  )
}

function setPortColor(
  g: Graph,
  node: ReturnType<Graph['getCellById']>,
  portId: string,
  color: string,
) {
  if (!hasPort(g, node, portId)) return
  const n = node as unknown as NodeWithPorts
  n.setPortProp(portId, 'attrs/circle/fill', color)
  n.setPortProp(portId, 'attrs/circle/stroke', color)
}

function showNodePortsOnGraph(
  g: Graph,
  node: { id: string; getPorts: () => { id: string }[] },
  show: boolean,
) {
  const cell = g.getCellById(node.id)
  if (!cell || !g.isNode(cell)) return
  const ports = node.getPorts()
  for (let i = 0; i < ports.length; i++) {
    const p = ports[i]
    if (!p) continue
    const portId = p.id as string
    if (show) {
      setPortVisible(g, cell, portId, true)
    } else {
      const connected = isPortConnected(g, node.id, portId)
      setPortVisible(g, cell, portId, connected)
      setPortColor(g, cell, portId, connected ? COLOR_PORT_ACTIVE : COLOR_PORT)
    }
  }
}

// ========== Passive Event Listener Patch ==========

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

function setupPassivePatch(container: HTMLElement): MutationObserver {
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
  container.insertBefore = function <T extends Node>(newChild: T, refChild: Node | null): T {
    if (newChild instanceof HTMLElement) {
      patchPassiveEventListeners(newChild)
      newChild.querySelectorAll?.('*')?.forEach((el) => {
        if (el instanceof HTMLElement) patchPassiveEventListeners(el)
      })
    }
    return origInsert(newChild, refChild) as T
  }
  const observer = new MutationObserver((mutations) => {
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
  observer.observe(container, { childList: true, subtree: true })
  return observer
}

// ========== Main Composable ==========

export function useGraph(
  containerRef: Ref<HTMLElement | null>,
  getData: () => SyncData,
) {
  const graph = shallowRef<Graph | null>(null)
  const selectedEdgeId = ref<string | null>(null)
  const positionOnlyRef = ref(false)
  let deferEdgeSync = false
  let passivePatchObserver: MutationObserver | null = null
  let callbacks: GraphEventCallbacks | null = null

  const EDGE_REMOVE_TOOL = [{ name: 'button-remove', args: { distance: 20 } }]

  // ---------- Helpers ----------

  function isGroupEdge(edgeId: string): boolean {
    const data = getData()
    const edge = data.edges.find((e) => e.id === edgeId)
    if (!edge) return false
    const src = data.nodes.find((n) => n.id === edge.source)
    const tgt = data.nodes.find((n) => n.id === edge.target)
    return !!(
      src?.dependencyGroupId &&
      src.dependencyGroupId === tgt?.dependencyGroupId &&
      src.dependencyRole === 'client' &&
      tgt?.dependencyRole === 'server'
    )
  }

  // ---------- Edge Selection ----------

  function selectEdge(edgeId: string | null) {
    if (!graph.value) return
    if (selectedEdgeId.value) {
      const prev = graph.value.getCellById(selectedEdgeId.value)
      if (prev && graph.value.isEdge(prev)) {
        prev.setAttrByPath('line/strokeWidth', 2)
        ;(prev as unknown as { setTools: (t: unknown[]) => void }).setTools([])
      }
    }
    selectedEdgeId.value = edgeId
    if (edgeId) {
      const edge = graph.value.getCellById(edgeId)
      if (edge && graph.value.isEdge(edge)) {
        edge.setAttrByPath('line/strokeWidth', 3)
        if (!isGroupEdge(edgeId)) {
          ;(edge as unknown as { setTools: (t: unknown[]) => void }).setTools(EDGE_REMOVE_TOOL)
        }
      }
    }
  }

  // ---------- Delete Selected ----------

  function deleteSelected() {
    if (!callbacks) return
    if (selectedEdgeId.value) {
      if (isGroupEdge(selectedEdgeId.value)) return
      const edgeId = selectedEdgeId.value
      callbacks.onEdgeRemoved(edgeId)
      selectEdge(null)
      return
    }
    const data = getData()
    const selectedNodeId = data.selectedNodeId
    if (selectedNodeId) {
      const node = data.nodes.find((n) => n.id === selectedNodeId)
      if (
        node?.nodeSource === 'user' &&
        !(node.dependencyRole === 'server' && node.dependencyGroupId)
      ) {
        callbacks.onRemove(selectedNodeId)
      }
    }
  }

  // ---------- Core: Incremental Sync ----------

  function syncGraph() {
    if (!graph.value || !containerRef.value) return
    doSyncGraph(getData())
  }

  function doSyncGraph(data: SyncData) {
    const g = graph.value
    if (!g || !containerRef.value) return

    const { nodes: dataNodes, edges: dataEdges, nodeDisplayFields, edgeDisplayFields, nodePortConfig, selectedNodeId } = data

    // --- Sync Nodes ---
    const dataNodeIds = new Set(dataNodes.map((n) => n.id))
    const graphNodes = g.getNodes()

    for (const gn of graphNodes) {
      if (!dataNodeIds.has(gn.id)) g.removeCell(gn)
    }

    const depPositionMap = buildDependencyPositionMap(dataNodes)

    let addedNew = false
    dataNodes.forEach((node, i) => {
      const pos =
        depPositionMap[node.id] ??
        (node.x != null && node.y != null ? { x: node.x, y: node.y } : getNodePosition(i))
      const existing = g.getCellById(node.id)
      const isServerFollowingClient =
        node.dependencyRole === 'server' && node.dependencyGroupId != null
      const isSelected = node.id === selectedNodeId
      if (existing && g.isNode(existing)) {
        existing.setPosition(pos.x, pos.y)
        if (
          typeof (existing as unknown as { setMovable?: (v: boolean) => void }).setMovable ===
          'function'
        ) {
          ;(existing as unknown as { setMovable: (v: boolean) => void }).setMovable(
            !isServerFollowingClient,
          )
        }
        if (!positionOnlyRef.value) {
          existing.setData({
            raw: node,
            displayFields: nodeDisplayFields[node.id] ?? [],
            selected: isSelected,
          })
        }
      } else {
        g.addNode({
          id: node.id,
          shape: SHAPE_NAME,
          x: pos.x,
          y: pos.y,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          data: {
            raw: node,
            displayFields: nodeDisplayFields[node.id] ?? [],
            selected: isSelected,
          },
          ports: getPortsForNode(node.id, dataNodes, nodePortConfig),
          movable: !isServerFollowingClient,
        })
        addedNew = true
      }
    })

    if (deferEdgeSync) {
      positionOnlyRef.value = false
      return
    }

    // --- Sync Edges ---
    const dataEdgeIds = new Set(dataEdges.map((e) => e.id))
    const graphEdges = g.getEdges()

    for (const ge of graphEdges) {
      if (!dataEdgeIds.has(ge.id)) g.removeCell(ge)
    }

    function getEdgeEndpoints(edge: TopologyEdge): {
      source: { cell: string; port: string }
      target: { cell: string; port: string } | { cell: string; anchor: { name: string } }
      isGroup: boolean
    } {
      const srcNode = dataNodes.find((n) => n.id === edge.source)
      const tgtNode = dataNodes.find((n) => n.id === edge.target)
      const isGroup =
        srcNode?.dependencyGroupId &&
        srcNode.dependencyGroupId === tgtNode?.dependencyGroupId &&
        srcNode.dependencyRole === 'client' &&
        tgtNode?.dependencyRole === 'server'
      if (isGroup) {
        return {
          source: { cell: edge.source, port: 'right' },
          target: { cell: edge.target, anchor: { name: 'left' } },
          isGroup: true,
        }
      }
      return {
        source: { cell: edge.source, port: 'bottom' },
        target: { cell: edge.target, port: 'top' },
        isGroup: false,
      }
    }

    function getEdgeColor(edge: TopologyEdge): string {
      return getEdgeEndpoints(edge).isGroup
        ? EDGE_COLORS.group_client_server
        : EDGE_COLORS.default
    }

    function buildEdgeLabels(edgeId: string) {
      const fields = edgeDisplayFields[edgeId]
      if (!fields?.length) return []
      const text = fields.map((f) => f.displayText).join(' / ')
      return [
        {
          attrs: {
            label: { text, fill: '#555', fontSize: 11, fontFamily: 'inherit' },
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

    for (const edge of dataEdges) {
      const stroke = getEdgeColor(edge)
      const { source, target, isGroup } = getEdgeEndpoints(edge)
      const labels = buildEdgeLabels(edge.id)
      const existing = g.getCellById(edge.id)
      if (!existing) {
        g.addEdge({
          id: edge.id,
          shape: EDGE_SHAPE,
          source,
          target,
          vertices: edge.vertices ?? [],
          labels,
          connector: { name: 'smooth', args: { direction: isGroup ? 'H' : 'V' } },
          tools: [],
          attrs: {
            line: { stroke, strokeWidth: 2, targetMarker: { name: 'block', size: 8 } },
          },
        })
        addedNew = true
      } else {
        existing.setAttrByPath('line/stroke', stroke)
        ;(existing as unknown as { setLabels: (l: unknown[]) => void }).setLabels(labels)
        if (isGroup) {
          ;(existing as unknown as { setSource: (s: typeof source) => void }).setSource(source)
          ;(existing as unknown as { setTarget: (t: typeof target) => void }).setTarget(target)
        }
      }
    }

    // --- Port active colors ---
    dataEdges.forEach((edge) => {
      const src = g.getCellById(edge.source)
      const tgt = g.getCellById(edge.target)
      const { isGroup } = getEdgeEndpoints(edge)
      const portColor = getEdgeColor(edge)
      if (src && g.isNode(src)) {
        if (isGroup) {
          if (hasPort(g, src, 'right')) {
            setPortVisible(g, src, 'right', true)
            setPortColor(g, src, 'right', portColor)
          }
        } else {
          const srcHasOutput = nodePortConfig[edge.source]?.hasOutput !== false
          if (srcHasOutput && hasPort(g, src, 'bottom')) {
            setPortVisible(g, src, 'bottom', true)
            setPortColor(g, src, 'bottom', portColor)
          }
        }
      }
      if (tgt && g.isNode(tgt) && !isGroup) {
        const tgtHasInput = nodePortConfig[edge.target]?.hasInput !== false
        if (tgtHasInput && hasPort(g, tgt, 'top')) {
          setPortVisible(g, tgt, 'top', true)
          setPortColor(g, tgt, 'top', portColor)
        }
      }
    })

    positionOnlyRef.value = false

    if (selectedEdgeId.value) {
      const sel = g.getCellById(selectedEdgeId.value)
      if (sel && g.isEdge(sel)) {
        sel.setAttrByPath('line/strokeWidth', 3)
        if (!isGroupEdge(selectedEdgeId.value)) {
          ;(sel as unknown as { setTools: (t: unknown[]) => void }).setTools(EDGE_REMOVE_TOOL)
        }
      }
    }
  }

  // ---------- Zoom & View ----------

  function zoomIn() {
    if (graph.value) graph.value.zoom(0.2)
  }

  function zoomOut() {
    if (graph.value) graph.value.zoom(-0.2)
  }

  function resetView() {
    if (graph.value) {
      graph.value.zoomTo(1)
      graph.value.centerContent()
    }
  }

  function fitContent() {
    if (graph.value) graph.value.zoomToFit({ padding: 40, maxScale: 1.5 })
  }

  // ---------- Selected Node Visual ----------

  function updateSelectedNodeVisual(newId: string | null, oldId: string | null) {
    const g = graph.value
    if (!g) return
    if (oldId) {
      const old = g.getCellById(oldId)
      if (old && g.isNode(old)) {
        const d = (old as unknown as { getData: () => Record<string, unknown> }).getData()
        ;(old as unknown as { setData: (d: Record<string, unknown>) => void }).setData({
          ...d,
          selected: false,
        })
      }
    }
    if (newId) {
      const node = g.getCellById(newId)
      if (node && g.isNode(node)) {
        const d = (node as unknown as { getData: () => Record<string, unknown> }).getData()
        ;(node as unknown as { setData: (d: Record<string, unknown>) => void }).setData({
          ...d,
          selected: true,
        })
      }
    }
  }

  // ---------- Init & Dispose ----------

  function initGraph(cb: GraphEventCallbacks) {
    const container = containerRef.value
    if (!container) return

    callbacks = cb
    registerShapes()
    passivePatchObserver = setupPassivePatch(container)

    const g: Graph = new Graph({
      container,
      autoResize: true,
      grid: true,
      panning: { enabled: true, eventTypes: ['leftMouseDown', 'mouseWheel'] },
      mousewheel: { enabled: true, minScale: 0.5, maxScale: 3 },
      background: { color: '#ffffff' },
      connecting: {
        snap: { radius: 30 },
        allowBlank: false,
        allowLoop: false,
        allowMulti: false,
        highlight: true,
        connector: { name: 'smooth' },
        connectionPoint: 'anchor',
        createEdge() {
          return g.createEdge({
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
          return !getData().edges.some(
            (e) => e.source === sourceCell.id && e.target === targetCell.id,
          )
        },
      },
      highlighting: {
        magnetAdsorbed: {
          name: 'stroke',
          args: { padding: 4, attrs: { strokeWidth: 4, stroke: '#5F95FF', opacity: 0.6 } },
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
        const dataNode = getData().nodes.find((n) => n.id === cell.id)
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

    container.querySelectorAll?.('*')?.forEach((el) => {
      if (el instanceof HTMLElement) patchPassiveEventListeners(el)
    })

    // Plugins
    g.use(new Snapline({ enabled: true }))
    g.use(
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

    // Keyboard shortcuts
    g.bindKey(['ctrl+z', 'meta+z'], (e: KeyboardEvent) => {
      e.preventDefault()
      cb.onUndo()
    })
    g.bindKey(['ctrl+shift+z', 'meta+shift+z'], (e: KeyboardEvent) => {
      e.preventDefault()
      cb.onRedo()
    })
    g.bindKey(['delete', 'backspace'], (e: KeyboardEvent) => {
      e.preventDefault()
      deleteSelected()
    })
    g.bindKey('escape', () => {
      selectEdge(null)
      cb.onSelect(null)
    })

    // ---- Node Events ----
    g.on('node:click', ({ e, node }: { e: MouseEvent; node: { id: string; getData: () => { raw?: TopologyNode } } }) => {
      const target = e.target as HTMLElement
      const nodeData = node.getData()
      const raw = nodeData?.raw

      selectEdge(null)
      cb.onEdgeSelect(null)

      if (target.closest('[data-action="remove"]')) {
        if (raw?.id) cb.onRemove(raw.id)
        return
      }
      if (raw) {
        cb.onSelect(raw)
        cb.onEdit(raw)
      }
    })

    g.on(
      'node:mouseenter',
      ({ node }: { node: { id: string; getPorts: () => { id: string }[] } }) => {
        showNodePortsOnGraph(g, node, true)
      },
    )
    g.on(
      'node:mouseleave',
      ({ node }: { node: { id: string; getPorts: () => { id: string }[] } }) => {
        showNodePortsOnGraph(g, node, false)
      },
    )

    g.on(
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
        const dataNode = getData().nodes.find((n) => n.id === node.id)
        const isServerNode =
          dataNode?.dependencyRole === 'server' && dataNode.dependencyGroupId != null
        if (isServerNode && dataNode.x != null && dataNode.y != null) {
          node.setPosition(dataNode.x, dataNode.y)
          return
        }
        const pos = node.getPosition()
        positionOnlyRef.value = true
        cb.onNodeMoved({ nodeId: node.id, x: pos.x, y: pos.y })
      },
    )

    // ---- Context Menu Events ----
    g.on('node:contextmenu', ({ e, node }: { e: MouseEvent; node: { id: string } }) => {
      e.preventDefault()
      e.stopPropagation()
      cb.onNodeContextMenu(e, node.id)
    })
    g.on('edge:contextmenu', ({ e, edge }: { e: MouseEvent; edge: { id: string } }) => {
      e.preventDefault()
      e.stopPropagation()
      cb.onEdgeContextMenu(e, edge.id)
    })
    g.on('blank:contextmenu', ({ e }: { e: MouseEvent }) => {
      e.preventDefault()
      cb.onBlankContextMenu(e)
    })

    // ---- Edge Events ----
    g.on('edge:click', ({ edge }: { edge: { id: string } }) => {
      selectEdge(edge.id)
      cb.onSelect(null)
      const dataEdge = getData().edges.find((e) => e.id === edge.id)
      cb.onEdgeSelect(dataEdge ?? null)
    })
    g.on('edge:mouseenter', ({ edge }: { edge: { id: string } }) => {
      const cell = g.getCellById(edge.id)
      if (cell && g.isEdge(cell) && edge.id !== selectedEdgeId.value) {
        cell.setAttrByPath('line/strokeWidth', 3)
      }
    })
    g.on('edge:mouseleave', ({ edge }: { edge: { id: string } }) => {
      const cell = g.getCellById(edge.id)
      if (cell && g.isEdge(cell) && edge.id !== selectedEdgeId.value) {
        cell.setAttrByPath('line/strokeWidth', 2)
      }
    })

    g.on('blank:click', () => {
      selectEdge(null)
      cb.onSelect(null)
      cb.onEdgeSelect(null)
    })

    // ---- Edge lifecycle events ----
    g.on(
      'edge:change:vertices',
      ({ edge }: { edge: { id: string; getVertices: () => Array<{ x: number; y: number }> } }) => {
        const raw = edge.getVertices()
        const vertices = raw.map((v: { x: number; y: number }) => ({ x: v.x, y: v.y }))
        cb.onEdgeVerticesChanged({ edgeId: edge.id, vertices })
      },
    )
    g.on(
      'edge:connected',
      ({
        edge,
        isNew,
      }: {
        edge: { getSourceCellId: () => string; getTargetCellId: () => string }
        isNew: boolean
      }) => {
        if (!isNew) return
        const source = edge.getSourceCellId()
        const target = edge.getTargetCellId()
        cb.onEdgeConnected({ source, target })
        g.removeCell(edge as unknown as import('@antv/x6').Cell)
      },
    )
    g.on('cell:removed', ({ cell }: { cell: import('@antv/x6').Cell }) => {
      if (g.isEdge(cell)) {
        if (selectedEdgeId.value === cell.id) selectEdge(null)
        cb.onEdgeRemoved(cell.id)
      }
    })

    graph.value = g

    // Phase 1: sync nodes only (ports not yet mounted in DOM)
    deferEdgeSync = true
    syncGraph()
    deferEdgeSync = false

    // Phase 2: poll for port DOM mount, then sync edges
    let portPollCount = 0
    const MAX_PORT_POLLS = 60
    const pollPortsAndSyncEdges = () => {
      if (!graph.value || !containerRef.value) return
      portPollCount++
      const hasPorts = containerRef.value.querySelector('circle[magnet="true"]') !== null
      if (hasPorts || portPollCount >= MAX_PORT_POLLS) {
        doSyncGraph(getData())
        nextTick(() => {
          graph.value?.zoomToFit({ padding: 40, maxScale: 1.5 })
        })
        return
      }
      requestAnimationFrame(pollPortsAndSyncEdges)
    }
    requestAnimationFrame(pollPortsAndSyncEdges)
  }

  function disposeGraph() {
    passivePatchObserver?.disconnect()
    passivePatchObserver = null
    graph.value?.dispose()
    graph.value = null
    callbacks = null
  }

  return {
    graph,
    selectedEdgeId,
    positionOnlyRef,

    initGraph,
    disposeGraph,
    syncGraph,

    selectEdge,
    isGroupEdge,
    deleteSelected,
    updateSelectedNodeVisual,

    zoomIn,
    zoomOut,
    resetView,
    fitContent,
  }
}
