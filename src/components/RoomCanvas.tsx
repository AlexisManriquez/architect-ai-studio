import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import type { RoomState, PlacedItem } from "@/types/room";
import { ASSET_CATALOG } from "@/data/assetCatalog";
import { useAppContext } from "@/context/AppContext";
import ActionLog, { type ActionEntry } from "@/components/ActionLog";

interface RoomCanvasProps {
  roomState: RoomState;
  highlightIds?: string[];
  actions?: ActionEntry[];
}

export interface RoomCanvasHandle {
  getSvgElement: () => SVGSVGElement | null;
}

const WALL_THICKNESS = 12;
const PADDING = 40;

const RoomCanvas = forwardRef<RoomCanvasHandle, RoomCanvasProps>(
  ({ roomState, highlightIds = [], actions = [] }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);

    // Drag state
    const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const { activeRoom, updateItemPosition } = useAppContext();
    const { roomWidth, roomDepth, items } = roomState;

    useImperativeHandle(ref, () => ({
      getSvgElement: () => svgRef.current,
    }));

    // Auto-fit on mount/resize
    useEffect(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const sx = (rect.width - PADDING * 2) / (roomWidth + WALL_THICKNESS * 2);
      const sy = (rect.height - PADDING * 2) / (roomDepth + WALL_THICKNESS * 2);
      const s = Math.min(sx, sy, 1.5);
      setScale(s);
      setOffset({
        x: (rect.width - roomWidth * s) / 2,
        y: (rect.height - roomDepth * s) / 2,
      });
    }, [roomWidth, roomDepth]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale((s) => Math.max(0.2, Math.min(3, s * delta)));
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      if (draggingItemId) return; // don't pan while dragging
      if (e.button === 1 || e.button === 0) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      }
    }, [offset, draggingItemId]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
      if (draggingItemId && activeRoom) {
        // Convert screen coords to canvas coords
        const newX = (e.clientX - offset.x) / scale - dragOffset.x;
        const newY = (e.clientY - offset.y) / scale - dragOffset.y;
        // Clamp within room bounds
        const def = items.find(i => i.id === draggingItemId);
        if (def) {
          const itemDef = ASSET_CATALOG[def.type];
          const isRotated = def.rotation === 90 || def.rotation === 270;
          const w = isRotated ? (itemDef?.height || 0) : (itemDef?.width || 0);
          const h = isRotated ? (itemDef?.width || 0) : (itemDef?.height || 0);
          const clampedX = Math.max(0, Math.min(newX, roomWidth - w));
          const clampedY = Math.max(0, Math.min(newY, roomDepth - h));
          updateItemPosition(activeRoom.id, draggingItemId, clampedX, clampedY);
        }
        return;
      }
      if (!isPanning) return;
      setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }, [isPanning, panStart, draggingItemId, dragOffset, offset, scale, activeRoom, items, roomWidth, roomDepth, updateItemPosition]);

    const handleMouseUp = useCallback(() => {
      setIsPanning(false);
      setDraggingItemId(null);
    }, []);

    const handleItemMouseDown = useCallback((e: React.MouseEvent, item: PlacedItem) => {
      e.stopPropagation();
      const itemX = (e.clientX - offset.x) / scale - item.x;
      const itemY = (e.clientY - offset.y) / scale - item.y;
      setDragOffset({ x: itemX, y: itemY });
      setDraggingItemId(item.id);
    }, [offset, scale]);

    const renderItem = (item: PlacedItem) => {
      const def = ASSET_CATALOG[item.type];
      if (!def) return null;

      const colorMap: Record<string, string> = {
        primary: "hsl(var(--primary))",
        secondary: "hsl(var(--secondary))",
        accent: "hsl(var(--accent))",
        muted: "hsl(var(--muted))",
        ring: "hsl(var(--ring))",
      };
      const fill = colorMap[def.color] || "hsl(var(--muted))";

      const isRotated = item.rotation === 90 || item.rotation === 270;
      const w = isRotated ? def.height : def.width;
      const h = isRotated ? def.width : def.height;
      const isHighlighted = highlightIds.includes(item.id);
      const isHovered = hoveredItem === item.id;
      const isDragging = draggingItemId === item.id;

      return (
        <g
          key={item.id}
          transform={`translate(${item.x}, ${item.y})`}
          onMouseEnter={() => setHoveredItem(item.id)}
          onMouseLeave={() => setHoveredItem(null)}
          onMouseDown={(e) => handleItemMouseDown(e, item)}
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
        >
          {/* Highlight glow */}
          {isHighlighted && (
            <rect
              width={w + 8}
              height={h + 8}
              x={-4}
              y={-4}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={3}
              rx={6}
              opacity={0.7}
            >
              <animate attributeName="opacity" values="0.7;0.3;0.7" dur="1.5s" repeatCount="3" />
            </rect>
          )}
          {/* Drag shadow */}
          {isDragging && (
            <rect
              width={w + 4}
              height={h + 4}
              x={-2}
              y={-2}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              strokeDasharray="4 2"
              rx={5}
              opacity={0.5}
            />
          )}
          <rect
            width={w}
            height={h}
            fill={fill}
            stroke={isDragging ? "hsl(var(--primary))" : isHovered ? "hsl(var(--primary))" : "hsl(var(--foreground))"}
            strokeWidth={isDragging ? 3 : isHovered ? 2.5 : 1.5}
            rx={4}
            opacity={isDragging ? 0.9 : 0.85}
          />
          <text
            x={w / 2}
            y={h / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="hsl(var(--foreground))"
            fontSize={Math.min(14, w / 6)}
            fontWeight={600}
            style={{ userSelect: "none", pointerEvents: "none" }}
          >
            {def.label}
          </text>
          {/* Hover tooltip overlay */}
          {isHovered && !isDragging && (
            <g>
              <rect
                x={w / 2 - 60}
                y={-28}
                width={120}
                height={22}
                rx={4}
                fill="hsl(var(--popover))"
                stroke="hsl(var(--border))"
                strokeWidth={1}
              />
              <text
                x={w / 2}
                y={-14}
                textAnchor="middle"
                fill="hsl(var(--popover-foreground))"
                fontSize={10}
                style={{ pointerEvents: "none" }}
              >
                {def.label} ({item.x}, {item.y}) {item.rotation}°
              </text>
            </g>
          )}
        </g>
      );
    };

    // Grid
    const gridLines = [];
    const gridStep = 50;
    for (let x = 0; x <= roomWidth; x += gridStep) {
      gridLines.push(
        <line key={`gx-${x}`} x1={x} y1={0} x2={x} y2={roomDepth} stroke="hsl(var(--border))" strokeWidth={0.5} />
      );
    }
    for (let y = 0; y <= roomDepth; y += gridStep) {
      gridLines.push(
        <line key={`gy-${y}`} x1={0} y1={y} x2={roomWidth} y2={y} stroke="hsl(var(--border))" strokeWidth={0.5} />
      );
    }

    return (
      <div
        ref={containerRef}
        className="flex-1 bg-background overflow-hidden relative"
        style={{ cursor: draggingItemId ? "grabbing" : isPanning ? "grabbing" : "grab" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Room stats toolbar */}
        <div className="absolute top-3 left-3 z-10 flex gap-2">
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-1 text-xs text-muted-foreground">
            🏠 {roomWidth / 100}m × {roomDepth / 100}m
          </div>
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-1 text-xs text-muted-foreground">
            🪑 {items.length} item{items.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Action log overlay */}
        <ActionLog actions={actions} />

        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0 }}
        >
          <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
            {gridLines}

            {/* Walls */}
            <rect x={-WALL_THICKNESS} y={-WALL_THICKNESS} width={roomWidth + WALL_THICKNESS * 2} height={WALL_THICKNESS} fill="hsl(var(--foreground))" />
            <rect x={-WALL_THICKNESS} y={0} width={WALL_THICKNESS} height={roomDepth} fill="hsl(var(--foreground))" />
            <rect x={roomWidth} y={0} width={WALL_THICKNESS} height={roomDepth} fill="hsl(var(--foreground))" />

            {/* Floor label */}
            <text x={roomWidth / 2} y={roomDepth + 25} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={12}>
              {roomWidth / 100}m × {roomDepth / 100}m — Open side ↓
            </text>

            {items.map(renderItem)}
          </g>
        </svg>

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 flex gap-1">
          <button
            onClick={() => setScale((s) => Math.min(3, s * 1.2))}
            className="w-8 h-8 rounded bg-card border border-border flex items-center justify-center text-foreground hover:bg-accent text-lg font-bold"
          >+</button>
          <button
            onClick={() => setScale((s) => Math.max(0.2, s * 0.8))}
            className="w-8 h-8 rounded bg-card border border-border flex items-center justify-center text-foreground hover:bg-accent text-lg font-bold"
          >−</button>
        </div>
      </div>
    );
  }
);

RoomCanvas.displayName = "RoomCanvas";
export default RoomCanvas;
