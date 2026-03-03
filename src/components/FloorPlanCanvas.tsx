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

const WALL_THICKNESS = 8;
const INNER_WALL = 4;
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

    useEffect(() => {
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

    // Check if a wall is shared with another room (for internal walls)
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

    const renderRoom = (room: FloorPlanRoom) => {
      const isHovered = hoveredRoom === room.id;
      const color = ROOM_TYPE_COLORS[room.type as keyof typeof ROOM_TYPE_COLORS] || "220 15% 90%";
      const sqft = Math.round((room.width * room.height) / 929);
      const label = room.name || ROOM_TYPE_LABELS[room.type as keyof typeof ROOM_TYPE_LABELS] || room.type;
      const fontSize = Math.min(14, Math.max(8, Math.min(room.width, room.height) / 10));

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
            opacity={isHovered ? 1 : 0.85}
          />

          {/* Internal walls — draw thinner lines for shared walls */}
          {(["north", "south", "east", "west"] as const).map(side => {
            if (!isSharedWall(room, side)) return null;
            const key = `${room.id}-wall-${side}`;
            switch (side) {
              case "north":
                return <line key={key} x1={room.x} y1={room.y} x2={room.x + room.width} y2={room.y} stroke="hsl(var(--foreground))" strokeWidth={INNER_WALL} />;
              case "south":
                return <line key={key} x1={room.x} y1={room.y + room.height} x2={room.x + room.width} y2={room.y + room.height} stroke="hsl(var(--foreground))" strokeWidth={INNER_WALL} />;
              case "west":
                return <line key={key} x1={room.x} y1={room.y} x2={room.x} y2={room.y + room.height} stroke="hsl(var(--foreground))" strokeWidth={INNER_WALL} />;
              case "east":
                return <line key={key} x1={room.x + room.width} y1={room.y} x2={room.x + room.width} y2={room.y + room.height} stroke="hsl(var(--foreground))" strokeWidth={INNER_WALL} />;
            }
          })}

          {/* Room label */}
          <text
            x={room.x + room.width / 2}
            y={room.y + room.height / 2 - fontSize * 0.8}
            textAnchor="middle"
            dominantBaseline="central"
            fill="hsl(var(--foreground))"
            fontSize={fontSize}
            fontWeight={700}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {label}
          </text>
          {/* Dimensions */}
          <text
            x={room.x + room.width / 2}
            y={room.y + room.height / 2 + fontSize * 0.4}
            textAnchor="middle"
            dominantBaseline="central"
            fill="hsl(var(--muted-foreground))"
            fontSize={Math.max(7, fontSize * 0.75)}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {(room.width / 100).toFixed(1)}m × {(room.height / 100).toFixed(1)}m
          </text>
          {/* Sqft */}
          <text
            x={room.x + room.width / 2}
            y={room.y + room.height / 2 + fontSize * 1.4}
            textAnchor="middle"
            dominantBaseline="central"
            fill="hsl(var(--muted-foreground))"
            fontSize={Math.max(6, fontSize * 0.65)}
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
              opacity={0.12}
              style={{ pointerEvents: "none" }}
            />
          )}
        </g>
      );
    };

    const renderDoor = (door: typeof floorPlan.doors[0]) => {
      const isHorizontal = door.orientation === "horizontal";
      const dw = isHorizontal ? door.width : 14;
      const dh = isHorizontal ? 14 : door.width;
      const arcRadius = door.width * 0.5;
      
      return (
        <g key={door.id}>
          {/* Clear wall behind door */}
          <rect
            x={door.x - 2}
            y={door.y - 2}
            width={dw + 4}
            height={dh + 4}
            fill="hsl(var(--background))"
          />
          {/* Door opening line */}
          <rect
            x={door.x}
            y={door.y}
            width={dw}
            height={dh}
            fill="hsl(var(--background))"
            stroke="hsl(var(--accent-foreground))"
            strokeWidth={1.5}
            strokeDasharray="6,3"
          />
          {/* Door swing arc */}
          {isHorizontal ? (
            <path
              d={`M ${door.x},${door.y + dh / 2} A ${arcRadius} ${arcRadius} 0 0 1 ${door.x + arcRadius},${door.y + dh / 2 + arcRadius}`}
              fill="none"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              opacity={0.5}
            />
          ) : (
            <path
              d={`M ${door.x + dw / 2},${door.y} A ${arcRadius} ${arcRadius} 0 0 1 ${door.x + dw / 2 + arcRadius},${door.y + arcRadius}`}
              fill="none"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              opacity={0.5}
            />
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
          <rect
            x={win.x}
            y={win.y}
            width={ww}
            height={wh}
            fill="hsl(190 80% 70%)"
            stroke="hsl(190 60% 50%)"
            strokeWidth={1.5}
          />
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

    // Compute the outer boundary as the convex hull of all room edges
    const renderOuterWalls = () => {
      if (floorPlan.rooms.length === 0) return null;

      // For each room, draw exterior walls (walls NOT shared with another room)
      return floorPlan.rooms.map(room => {
        const walls: JSX.Element[] = [];
        const id = room.id;

        if (!isSharedWall(room, "north")) {
          walls.push(
            <line key={`${id}-ext-n`} x1={room.x} y1={room.y} x2={room.x + room.width} y2={room.y}
              stroke="hsl(var(--foreground))" strokeWidth={WALL_THICKNESS} strokeLinecap="round" />
          );
        }
        if (!isSharedWall(room, "south")) {
          walls.push(
            <line key={`${id}-ext-s`} x1={room.x} y1={room.y + room.height} x2={room.x + room.width} y2={room.y + room.height}
              stroke="hsl(var(--foreground))" strokeWidth={WALL_THICKNESS} strokeLinecap="round" />
          );
        }
        if (!isSharedWall(room, "west")) {
          walls.push(
            <line key={`${id}-ext-w`} x1={room.x} y1={room.y} x2={room.x} y2={room.y + room.height}
              stroke="hsl(var(--foreground))" strokeWidth={WALL_THICKNESS} strokeLinecap="round" />
          );
        }
        if (!isSharedWall(room, "east")) {
          walls.push(
            <line key={`${id}-ext-e`} x1={room.x + room.width} y1={room.y} x2={room.x + room.width} y2={room.y + room.height}
              stroke="hsl(var(--foreground))" strokeWidth={WALL_THICKNESS} strokeLinecap="round" />
          );
        }

        return <g key={`ext-${id}`}>{walls}</g>;
      });
    };

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
          {floorPlan.rooms.length > 0 && (
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-1 text-xs text-muted-foreground">
              🚪 {floorPlan.rooms.length} rooms · ~{totalSqft} sqft
            </div>
          )}
        </div>

        {/* Hint */}
        {floorPlan.rooms.length > 0 && (
          <div className="absolute bottom-12 left-3 z-10">
            <div className="bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-1.5 text-xs text-muted-foreground">
              Click a room to enter & furnish it
            </div>
          </div>
        )}

        <ActionLog actions={actions} />

        <svg ref={svgRef} width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
          <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
            {/* Room fills first */}
            {floorPlan.rooms.map(renderRoom)}

            {/* Outer walls (thick exterior) */}
            {renderOuterWalls()}

            {/* Doors (rendered on top of walls) */}
            {floorPlan.doors.map(renderDoor)}

            {/* Windows */}
            {floorPlan.windows.map(renderWindow)}

            {/* Overall dimensions label */}
            {floorPlan.rooms.length > 0 && (
              <text
                x={floorPlan.totalWidth / 2}
                y={floorPlan.totalHeight + 30}
                textAnchor="middle"
                fill="hsl(var(--muted-foreground))"
                fontSize={12}
              >
                {(floorPlan.totalWidth / 100).toFixed(1)}m × {(floorPlan.totalHeight / 100).toFixed(1)}m
              </text>
            )}
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
