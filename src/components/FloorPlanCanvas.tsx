import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import type { FloorPlan, FloorPlanRoom } from "@/types/floorplan";
import { ROOM_TYPE_COLORS, ROOM_TYPE_LABELS } from "@/types/floorplan";
import ActionLog, { type ActionEntry } from "@/components/ActionLog";
import { useAppContext } from "@/context/AppContext";
import { Pencil, Eraser, Undo2 } from "lucide-react";

interface FloorPlanCanvasProps {
  floorPlan: FloorPlan;
  actions?: ActionEntry[];
  onEnterRoom: (room: FloorPlanRoom) => void;
  onAnnotationChange?: (count: number) => void;
}

export interface FloorPlanCanvasHandle {
  getSvgElement: () => SVGSVGElement | null;
  hasAnnotations: () => boolean;
  clearAnnotations: () => void;
  getAnnotationCount: () => number;
  getAnnotations: () => { id: string; points: { x: number; y: number }[] }[];
}

const WALL_THICKNESS = 8;
const INNER_WALL = 4;
const PADDING = 60;
const SNAP_GRID = 10;

function snapTo(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

interface Annotation {
  id: string;
  points: { x: number; y: number }[];
}

const FloorPlanCanvas = forwardRef<FloorPlanCanvasHandle, FloorPlanCanvasProps>(
  ({ floorPlan, actions = [], onEnterRoom, onAnnotationChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);

    // Drag state
    const [draggingRoomId, setDraggingRoomId] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const didDragRef = useRef(false);

    // Annotation/drawing state
    const [drawMode, setDrawMode] = useState(false);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);

    const { updateRoomPosition, setFloorPlan } = useAppContext();

    // Count real annotations (exclude in-progress temp stroke)
    const realAnnotationCount = annotations.filter(a => a.id !== "__drawing__").length;

    useImperativeHandle(ref, () => ({
      getSvgElement: () => svgRef.current,
      hasAnnotations: () => annotations.filter(a => a.id !== "__drawing__").length > 0,
      clearAnnotations: () => setAnnotations([]),
      getAnnotationCount: () => annotations.filter(a => a.id !== "__drawing__").length,
      getAnnotations: () => annotations.filter(a => a.id !== "__drawing__"),
    }));

    // Notify parent when annotation count changes
    useEffect(() => {
      onAnnotationChange?.(realAnnotationCount);
    }, [realAnnotationCount, onAnnotationChange]);

    // Auto-fit on mount/resize
    useEffect(() => {
      if (draggingRoomId) return;
      if (!containerRef.current || floorPlan.totalWidth === 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const sx = (rect.width - PADDING * 2) / (floorPlan.totalWidth + WALL_THICKNESS * 2);
      const sy = (rect.height - PADDING * 2) / (floorPlan.totalHeight + WALL_THICKNESS * 2);
      const s = Math.min(sx, sy, 1.5);
      setScale(s);
      setOffset({
        x: (rect.width - floorPlan.totalWidth * s) / 2,
        y: (rect.height - floorPlan.totalHeight * s) / 2,
      });
    }, [floorPlan.totalWidth, floorPlan.totalHeight, draggingRoomId]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale((s) => Math.max(0.2, Math.min(3, s * delta)));
    }, []);

    // Convert screen coords to canvas coords
    const screenToCanvas = useCallback((clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const cx = clientX - (rect?.left ?? 0);
      const cy = clientY - (rect?.top ?? 0);
      return {
        x: (cx - offset.x) / scale,
        y: (cy - offset.y) / scale,
      };
    }, [offset, scale]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      if (drawMode) {
        // Start drawing
        const pt = screenToCanvas(e.clientX, e.clientY);
        currentStrokeRef.current = [pt];
        setIsDrawing(true);
        return;
      }
      if (draggingRoomId) return;
      if (e.button === 0 || e.button === 1) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      }
    }, [offset, draggingRoomId, drawMode, screenToCanvas]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
      if (drawMode && isDrawing) {
        const pt = screenToCanvas(e.clientX, e.clientY);
        currentStrokeRef.current.push(pt);
        // Force re-render by updating annotations with a temporary in-progress stroke
        setAnnotations(prev => {
          const withoutCurrent = prev.filter(a => a.id !== "__drawing__");
          return [...withoutCurrent, { id: "__drawing__", points: [...currentStrokeRef.current] }];
        });
        return;
      }
      if (draggingRoomId) {
        didDragRef.current = true;
        const rawX = (e.clientX - offset.x) / scale - dragOffset.x;
        const rawY = (e.clientY - offset.y) / scale - dragOffset.y;
        const snappedX = snapTo(Math.max(0, rawX), SNAP_GRID);
        const snappedY = snapTo(Math.max(0, rawY), SNAP_GRID);
        setFloorPlan(prev => ({
          ...prev,
          rooms: prev.rooms.map(r =>
            r.id === draggingRoomId ? { ...r, x: snappedX, y: snappedY } : r
          ),
        }));
        return;
      }
      if (!isPanning) return;
      setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }, [isPanning, panStart, draggingRoomId, dragOffset, offset, scale, setFloorPlan, drawMode, isDrawing, screenToCanvas]);

    const handleMouseUp = useCallback(() => {
      if (drawMode && isDrawing) {
        setIsDrawing(false);
        const points = currentStrokeRef.current;
        if (points.length > 1) {
          setAnnotations(prev => {
            const withoutTemp = prev.filter(a => a.id !== "__drawing__");
            return [...withoutTemp, { id: crypto.randomUUID().slice(0, 8), points }];
          });
        } else {
          // Remove temp stroke if too short
          setAnnotations(prev => prev.filter(a => a.id !== "__drawing__"));
        }
        currentStrokeRef.current = [];
        return;
      }
      if (draggingRoomId) {
        const room = floorPlan.rooms.find(r => r.id === draggingRoomId);
        if (room) {
          updateRoomPosition(draggingRoomId, room.x, room.y);
        }
        setDraggingRoomId(null);
      }
      setIsPanning(false);
    }, [draggingRoomId, floorPlan.rooms, updateRoomPosition, drawMode, isDrawing]);

    const handleRoomMouseDown = useCallback((e: React.MouseEvent, room: FloorPlanRoom) => {
      if (drawMode) return; // don't drag rooms while drawing
      e.stopPropagation();
      didDragRef.current = false;
      const roomX = (e.clientX - offset.x) / scale - room.x;
      const roomY = (e.clientY - offset.y) / scale - room.y;
      setDragOffset({ x: roomX, y: roomY });
      setDraggingRoomId(room.id);
    }, [offset, scale, drawMode]);

    const handleRoomClick = useCallback((e: React.MouseEvent, room: FloorPlanRoom) => {
      if (drawMode) return;
      if (!didDragRef.current) {
        e.stopPropagation();
        onEnterRoom(room);
      }
    }, [onEnterRoom, drawMode]);

    const clearAnnotations = useCallback(() => {
      setAnnotations([]);
    }, []);

    const undoLastStroke = useCallback(() => {
      setAnnotations(prev => {
        const real = prev.filter(a => a.id !== "__drawing__");
        if (real.length === 0) return prev;
        return real.slice(0, -1);
      });
    }, []);

    // Check if a wall is shared with another room
    const isSharedWall = useCallback((room: FloorPlanRoom, side: "north" | "south" | "east" | "west") => {
      return floorPlan.rooms.some(other => {
        if (other.id === room.id) return false;
        switch (side) {
          case "north": return Math.abs(other.y + other.height - room.y) < 2 && other.x < room.x + room.width && other.x + other.width > room.x;
          case "south": return Math.abs(room.y + room.height - other.y) < 2 && other.x < room.x + room.width && other.x + other.width > room.x;
          case "west": return Math.abs(other.x + other.width - room.x) < 2 && other.y < room.y + room.height && other.y + other.height > room.y;
          case "east": return Math.abs(room.x + room.width - other.x) < 2 && other.y < room.y + room.height && other.y + other.height > room.y;
        }
      });
    }, [floorPlan.rooms]);

    const pointsToPath = (points: { x: number; y: number }[]) => {
      if (points.length < 2) return "";
      return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    };

    const renderRoom = (room: FloorPlanRoom) => {
      const isHovered = hoveredRoom === room.id;
      const isDragging = draggingRoomId === room.id;
      const color = ROOM_TYPE_COLORS[room.type as keyof typeof ROOM_TYPE_COLORS] || "220 15% 90%";
      const sqft = Math.round((room.width * room.height) / 929);
      const label = room.name || ROOM_TYPE_LABELS[room.type as keyof typeof ROOM_TYPE_LABELS] || room.type;
      const fontSize = Math.min(14, Math.max(8, Math.min(room.width, room.height) / 10));

      return (
        <g
          key={room.id}
          onMouseDown={(e) => handleRoomMouseDown(e, room)}
          onClick={(e) => handleRoomClick(e, room)}
          onMouseEnter={() => !drawMode && setHoveredRoom(room.id)}
          onMouseLeave={() => setHoveredRoom(null)}
          style={{ cursor: drawMode ? "crosshair" : isDragging ? "grabbing" : "grab" }}
          opacity={isDragging ? 0.7 : 1}
        >
          <rect x={room.x} y={room.y} width={room.width} height={room.height}
            fill={`hsl(${color})`} opacity={isHovered ? 1 : 0.85} />
          {isDragging && (
            <rect x={room.x - 3} y={room.y - 3} width={room.width + 6} height={room.height + 6}
              fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="6 3" rx={4} />
          )}
          {(["north", "south", "east", "west"] as const).map(side => {
            if (!isSharedWall(room, side)) return null;
            const key = `${room.id}-wall-${side}`;
            switch (side) {
              case "north": return <line key={key} x1={room.x} y1={room.y} x2={room.x + room.width} y2={room.y} stroke="hsl(var(--foreground))" strokeWidth={INNER_WALL} />;
              case "south": return <line key={key} x1={room.x} y1={room.y + room.height} x2={room.x + room.width} y2={room.y + room.height} stroke="hsl(var(--foreground))" strokeWidth={INNER_WALL} />;
              case "west": return <line key={key} x1={room.x} y1={room.y} x2={room.x} y2={room.y + room.height} stroke="hsl(var(--foreground))" strokeWidth={INNER_WALL} />;
              case "east": return <line key={key} x1={room.x + room.width} y1={room.y} x2={room.x + room.width} y2={room.y + room.height} stroke="hsl(var(--foreground))" strokeWidth={INNER_WALL} />;
            }
          })}
          <text x={room.x + room.width / 2} y={room.y + room.height / 2 - fontSize * 0.8}
            textAnchor="middle" dominantBaseline="central" fill="hsl(var(--foreground))"
            fontSize={fontSize} fontWeight={700} style={{ pointerEvents: "none", userSelect: "none" }}>{label}</text>
          <text x={room.x + room.width / 2} y={room.y + room.height / 2 + fontSize * 0.4}
            textAnchor="middle" dominantBaseline="central" fill="hsl(var(--muted-foreground))"
            fontSize={Math.max(7, fontSize * 0.75)} style={{ pointerEvents: "none", userSelect: "none" }}>
            {(room.width / 100).toFixed(1)}m × {(room.height / 100).toFixed(1)}m
          </text>
          <text x={room.x + room.width / 2} y={room.y + room.height / 2 + fontSize * 1.4}
            textAnchor="middle" dominantBaseline="central" fill="hsl(var(--muted-foreground))"
            fontSize={Math.max(6, fontSize * 0.65)} style={{ pointerEvents: "none", userSelect: "none" }}>
            ~{sqft} sqft
          </text>
          {isHovered && !isDragging && (
            <rect x={room.x} y={room.y} width={room.width} height={room.height}
              fill="hsl(var(--primary))" opacity={0.12} style={{ pointerEvents: "none" }} />
          )}
        </g>
      );
    };

    const renderDoor = (door: typeof floorPlan.doors[0]) => {
      const isHorizontal = door.orientation === "horizontal";
      const dw = isHorizontal ? door.width : 14;
      const dh = isHorizontal ? 14 : door.width;

      if (door.isOpening) {
        return (
          <g key={door.id}>
            <rect x={door.x - 2} y={door.y - 2} width={dw + 4} height={dh + 4} fill="hsl(var(--background))" />
            {isHorizontal ? (
              <line x1={door.x} y1={door.y + dh / 2} x2={door.x + dw} y2={door.y + dh / 2}
                stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4,4" opacity={0.5} />
            ) : (
              <line x1={door.x + dw / 2} y1={door.y} x2={door.x + dw / 2} y2={door.y + dh}
                stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4,4" opacity={0.5} />
            )}
          </g>
        );
      }

      const arcRadius = door.width * 0.5;
      return (
        <g key={door.id}>
          <rect x={door.x - 2} y={door.y - 2} width={dw + 4} height={dh + 4} fill="hsl(var(--background))" />
          <rect x={door.x} y={door.y} width={dw} height={dh}
            fill="hsl(var(--background))" stroke="hsl(var(--accent-foreground))" strokeWidth={1.5} strokeDasharray="6,3" />
          {isHorizontal ? (
            <path d={`M ${door.x},${door.y + dh / 2} A ${arcRadius} ${arcRadius} 0 0 1 ${door.x + arcRadius},${door.y + dh / 2 + arcRadius}`}
              fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1} opacity={0.5} />
          ) : (
            <path d={`M ${door.x + dw / 2},${door.y} A ${arcRadius} ${arcRadius} 0 0 1 ${door.x + dw / 2 + arcRadius},${door.y + arcRadius}`}
              fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={1} opacity={0.5} />
          )}
        </g>
      );
    };

    const renderWindow = (win: typeof floorPlan.windows[0]) => {
      const isHorizontal = win.orientation === "horizontal";
      const ww = isHorizontal ? win.width : 8;
      const wh = isHorizontal ? 8 : win.width;
      return (
        <g key={win.id}>
          <rect x={win.x} y={win.y} width={ww} height={wh}
            fill="hsl(190 80% 70%)" stroke="hsl(190 60% 50%)" strokeWidth={1.5} />
          {isHorizontal ? (
            <>
              <line x1={win.x} y1={win.y + 2.5} x2={win.x + ww} y2={win.y + 2.5} stroke="hsl(190 60% 50%)" strokeWidth={0.8} />
              <line x1={win.x} y1={win.y + 5.5} x2={win.x + ww} y2={win.y + 5.5} stroke="hsl(190 60% 50%)" strokeWidth={0.8} />
            </>
          ) : (
            <>
              <line x1={win.x + 2.5} y1={win.y} x2={win.x + 2.5} y2={win.y + wh} stroke="hsl(190 60% 50%)" strokeWidth={0.8} />
              <line x1={win.x + 5.5} y1={win.y} x2={win.x + 5.5} y2={win.y + wh} stroke="hsl(190 60% 50%)" strokeWidth={0.8} />
            </>
          )}
        </g>
      );
    };

    const renderOuterWalls = () => {
      if (floorPlan.rooms.length === 0) return null;
      return floorPlan.rooms.map(room => {
        const walls: JSX.Element[] = [];
        const id = room.id;
        if (!isSharedWall(room, "north")) {
          walls.push(<line key={`${id}-ext-n`} x1={room.x} y1={room.y} x2={room.x + room.width} y2={room.y}
            stroke="hsl(var(--foreground))" strokeWidth={WALL_THICKNESS} strokeLinecap="round" />);
        }
        if (!isSharedWall(room, "south")) {
          walls.push(<line key={`${id}-ext-s`} x1={room.x} y1={room.y + room.height} x2={room.x + room.width} y2={room.y + room.height}
            stroke="hsl(var(--foreground))" strokeWidth={WALL_THICKNESS} strokeLinecap="round" />);
        }
        if (!isSharedWall(room, "west")) {
          walls.push(<line key={`${id}-ext-w`} x1={room.x} y1={room.y} x2={room.x} y2={room.y + room.height}
            stroke="hsl(var(--foreground))" strokeWidth={WALL_THICKNESS} strokeLinecap="round" />);
        }
        if (!isSharedWall(room, "east")) {
          walls.push(<line key={`${id}-ext-e`} x1={room.x + room.width} y1={room.y} x2={room.x + room.width} y2={room.y + room.height}
            stroke="hsl(var(--foreground))" strokeWidth={WALL_THICKNESS} strokeLinecap="round" />);
        }
        return <g key={`ext-${id}`}>{walls}</g>;
      });
    };

    const totalSqft = floorPlan.rooms.reduce((sum, r) => sum + Math.round((r.width * r.height) / 929), 0);

    return (
      <div
        ref={containerRef}
        className="flex-1 bg-background overflow-hidden relative"
        style={{ cursor: drawMode ? "crosshair" : draggingRoomId ? "grabbing" : isPanning ? "grabbing" : "grab" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Stats bar */}
        <div className="absolute top-3 left-3 z-10 flex gap-2">
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-1 text-xs text-muted-foreground">
            {floorPlan.name || "Floor Plan"}
          </div>
          {floorPlan.rooms.length > 0 && (
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-1 text-xs text-muted-foreground">
              {floorPlan.rooms.length} rooms · ~{totalSqft} sqft
            </div>
          )}
        </div>

        {/* Drawing tools toolbar */}
        <div className="absolute top-3 right-14 z-10 flex gap-1">
          <button
            onClick={() => setDrawMode(!drawMode)}
            className={`w-9 h-9 rounded-md border flex items-center justify-center transition-colors ${
              drawMode
                ? "bg-primary text-primary-foreground border-primary shadow-md"
                : "bg-card/90 backdrop-blur-sm border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            title={drawMode ? "Switch to pointer mode" : "Draw annotations to guide the AI (arrows, marks, scribbles)"}
          >
            <Pencil className="w-4 h-4" />
          </button>
          {realAnnotationCount > 0 && (
            <>
              <button
                onClick={undoLastStroke}
                className="w-9 h-9 rounded-md bg-card/90 backdrop-blur-sm border border-border flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                title="Undo last stroke"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={clearAnnotations}
                className="w-9 h-9 rounded-md bg-card/90 backdrop-blur-sm border border-border flex items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
                title="Clear all annotations"
              >
                <Eraser className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Draw mode indicator */}
        {drawMode && (
          <div className="absolute top-14 right-14 z-10">
            <div className="bg-primary/90 backdrop-blur-sm text-primary-foreground rounded-md px-3 py-1.5 text-xs font-medium shadow-md">
              Drawing mode — draw arrows, circles, or marks to guide the AI
            </div>
          </div>
        )}

        {/* Annotation pending indicator (when NOT in draw mode but annotations exist) */}
        {!drawMode && realAnnotationCount > 0 && (
          <div className="absolute top-14 right-14 z-10">
            <div className="bg-orange-500/90 backdrop-blur-sm text-white rounded-md px-3 py-1.5 text-xs font-medium shadow-md">
              {realAnnotationCount} annotation{realAnnotationCount !== 1 ? "s" : ""} will be sent with your next message
            </div>
          </div>
        )}

        {/* Hint */}
        {floorPlan.rooms.length > 0 && !drawMode && (
          <div className="absolute bottom-12 left-3 z-10">
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-1.5 text-xs text-muted-foreground">
              Drag rooms to reposition · Click to enter & furnish · Pencil to draw annotations for the AI
            </div>
          </div>
        )}
        {drawMode && (
          <div className="absolute bottom-12 left-3 z-10">
            <div className="bg-primary/10 backdrop-blur-sm border border-primary/30 rounded-md px-3 py-1.5 text-xs text-foreground">
              Draw arrows to expand walls, scribble to delete rooms, draw boxes to add rooms — then describe in chat
            </div>
          </div>
        )}

        <ActionLog actions={actions} />

        <svg ref={svgRef} width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
          <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
            {floorPlan.rooms.map(renderRoom)}
            {renderOuterWalls()}
            {floorPlan.doors.map(renderDoor)}
            {floorPlan.windows.map(renderWindow)}

            {/* Render annotations */}
            {annotations.map(annotation => (
              <path
                key={annotation.id}
                d={pointsToPath(annotation.points)}
                fill="none"
                stroke="hsl(0 90% 55%)"
                strokeWidth={4 / scale}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85}
                style={{ pointerEvents: "none" }}
              />
            ))}

            {floorPlan.rooms.length > 0 && (
              <text x={floorPlan.totalWidth / 2} y={floorPlan.totalHeight + 30}
                textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={12}>
                {(floorPlan.totalWidth / 100).toFixed(1)}m × {(floorPlan.totalHeight / 100).toFixed(1)}m
              </text>
            )}
          </g>
        </svg>

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 flex gap-1">
          <button onClick={() => setScale((s) => Math.min(3, s * 1.2))}
            className="w-8 h-8 rounded bg-card border border-border flex items-center justify-center text-foreground hover:bg-accent text-lg font-bold">+</button>
          <button onClick={() => setScale((s) => Math.max(0.2, s * 0.8))}
            className="w-8 h-8 rounded bg-card border border-border flex items-center justify-center text-foreground hover:bg-accent text-lg font-bold">-</button>
        </div>
      </div>
    );
  }
);

FloorPlanCanvas.displayName = "FloorPlanCanvas";
export default FloorPlanCanvas;
