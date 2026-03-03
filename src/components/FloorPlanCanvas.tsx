import { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import type { FloorPlan, FloorPlanRoom } from "@/types/floorplan";
import { ROOM_TYPE_COLORS, ROOM_TYPE_LABELS } from "@/types/floorplan";
import ActionLog, { type ActionEntry } from "@/components/ActionLog";

interface FloorPlanCanvasProps {
  floorPlan: FloorPlan;
  actions?: ActionEntry[];
  onEnterRoom: (room: FloorPlanRoom) => void;
}

export interface FloorPlanCanvasHandle {
  getSvgElement: () => SVGSVGElement | null;
}

const WALL_THICKNESS = 10;
const PADDING = 60;

const FloorPlanCanvas = forwardRef<FloorPlanCanvasHandle, FloorPlanCanvasProps>(
  ({ floorPlan, actions = [], onEnterRoom }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      getSvgElement: () => svgRef.current,
    }));

    // Auto-fit
    useEffect(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const sx = (rect.width - PADDING * 2) / (floorPlan.totalWidth + WALL_THICKNESS * 2);
      const sy = (rect.height - PADDING * 2) / (floorPlan.totalHeight + WALL_THICKNESS * 2);
      const s = Math.min(sx, sy, 1.5);
      setScale(s);
      setOffset({
        x: (rect.width - floorPlan.totalWidth * s) / 2,
        y: (rect.height - floorPlan.totalHeight * s) / 2,
      });
    }, [floorPlan.totalWidth, floorPlan.totalHeight]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale((s) => Math.max(0.2, Math.min(3, s * delta)));
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      if (e.button === 0 || e.button === 1) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      }
    }, [offset]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
      if (!isPanning) return;
      setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }, [isPanning, panStart]);

    const handleMouseUp = useCallback(() => setIsPanning(false), []);

    const renderRoom = (room: FloorPlanRoom) => {
      const isHovered = hoveredRoom === room.id;
      const color = ROOM_TYPE_COLORS[room.type] || "220 15% 90%";
      const sqft = Math.round((room.width * room.height) / 929); // cm² to sqft
      const label = room.name || ROOM_TYPE_LABELS[room.type];

      return (
        <g
          key={room.id}
          onClick={(e) => { e.stopPropagation(); onEnterRoom(room); }}
          onMouseEnter={() => setHoveredRoom(room.id)}
          onMouseLeave={() => setHoveredRoom(null)}
          style={{ cursor: "pointer" }}
        >
          {/* Room fill */}
          <rect
            x={room.x}
            y={room.y}
            width={room.width}
            height={room.height}
            fill={`hsl(${color})`}
            stroke="hsl(var(--foreground))"
            strokeWidth={isHovered ? 3 : 2}
            opacity={isHovered ? 1 : 0.9}
          />
          {/* Room label */}
          <text
            x={room.x + room.width / 2}
            y={room.y + room.height / 2 - 8}
            textAnchor="middle"
            dominantBaseline="central"
            fill="hsl(var(--foreground))"
            fontSize={Math.min(16, room.width / 8)}
            fontWeight={700}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {label}
          </text>
          {/* Dimensions */}
          <text
            x={room.x + room.width / 2}
            y={room.y + room.height / 2 + 10}
            textAnchor="middle"
            dominantBaseline="central"
            fill="hsl(var(--muted-foreground))"
            fontSize={Math.min(11, room.width / 12)}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {(room.width / 100).toFixed(1)}m × {(room.height / 100).toFixed(1)}m
          </text>
          {/* Sqft */}
          <text
            x={room.x + room.width / 2}
            y={room.y + room.height / 2 + 24}
            textAnchor="middle"
            dominantBaseline="central"
            fill="hsl(var(--muted-foreground))"
            fontSize={Math.min(10, room.width / 14)}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            ~{sqft} sqft
          </text>
          {/* Hover overlay */}
          {isHovered && (
            <rect
              x={room.x}
              y={room.y}
              width={room.width}
              height={room.height}
              fill="hsl(var(--primary))"
              opacity={0.08}
              style={{ pointerEvents: "none" }}
            />
          )}
        </g>
      );
    };

    const renderDoor = (door: typeof floorPlan.doors[0]) => {
      const isHorizontal = door.orientation === "horizontal";
      const dw = isHorizontal ? door.width : 12;
      const dh = isHorizontal ? 12 : door.width;
      return (
        <g key={door.id}>
          {/* Clear the wall behind the door */}
          <rect
            x={door.x - 1}
            y={door.y - 1}
            width={dw + 2}
            height={dh + 2}
            fill="hsl(var(--background))"
          />
          {/* Door opening indicator */}
          <rect
            x={door.x}
            y={door.y}
            width={dw}
            height={dh}
            fill="hsl(var(--background))"
            stroke="hsl(var(--accent))"
            strokeWidth={2}
            strokeDasharray="6,3"
          />
        </g>
      );
    };

    const renderWindow = (win: typeof floorPlan.windows[0]) => {
      const isHorizontal = win.orientation === "horizontal";
      const ww = isHorizontal ? win.width : 6;
      const wh = isHorizontal ? 6 : win.width;
      return (
        <g key={win.id}>
          <rect
            x={win.x}
            y={win.y}
            width={ww}
            height={wh}
            fill="hsl(190 80% 70%)"
            stroke="hsl(190 60% 50%)"
            strokeWidth={1.5}
          />
          {/* Double line for window symbol */}
          {isHorizontal ? (
            <line x1={win.x} y1={win.y + 3} x2={win.x + ww} y2={win.y + 3} stroke="hsl(190 60% 50%)" strokeWidth={1} />
          ) : (
            <line x1={win.x + 3} y1={win.y} x2={win.x + 3} y2={win.y + wh} stroke="hsl(190 60% 50%)" strokeWidth={1} />
          )}
        </g>
      );
    };

    // Calculate total sqft
    const totalSqft = floorPlan.rooms.reduce((sum, r) => sum + Math.round((r.width * r.height) / 929), 0);

    return (
      <div
        ref={containerRef}
        className="flex-1 bg-background overflow-hidden cursor-grab active:cursor-grabbing relative"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Stats bar */}
        <div className="absolute top-3 left-3 z-10 flex gap-2">
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-1 text-xs text-muted-foreground">
            🏠 {floorPlan.name || "Floor Plan"}
          </div>
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-1 text-xs text-muted-foreground">
            🚪 {floorPlan.rooms.length} rooms · ~{totalSqft} sqft
          </div>
        </div>

        {/* Hint */}
        <div className="absolute bottom-12 left-3 z-10">
          <div className="bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-1.5 text-xs text-muted-foreground">
            Click a room to enter & furnish it
          </div>
        </div>

        <ActionLog actions={actions} />

        <svg ref={svgRef} width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
          <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
            {/* Outer boundary */}
            <rect
              x={-WALL_THICKNESS}
              y={-WALL_THICKNESS}
              width={floorPlan.totalWidth + WALL_THICKNESS * 2}
              height={floorPlan.totalHeight + WALL_THICKNESS * 2}
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeWidth={WALL_THICKNESS}
            />

            {/* Rooms */}
            {floorPlan.rooms.map(renderRoom)}

            {/* Doors (rendered on top of walls) */}
            {floorPlan.doors.map(renderDoor)}

            {/* Windows */}
            {floorPlan.windows.map(renderWindow)}

            {/* Overall dimensions */}
            <text
              x={floorPlan.totalWidth / 2}
              y={floorPlan.totalHeight + 30}
              textAnchor="middle"
              fill="hsl(var(--muted-foreground))"
              fontSize={12}
            >
              {(floorPlan.totalWidth / 100).toFixed(1)}m × {(floorPlan.totalHeight / 100).toFixed(1)}m
            </text>
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

FloorPlanCanvas.displayName = "FloorPlanCanvas";
export default FloorPlanCanvas;
