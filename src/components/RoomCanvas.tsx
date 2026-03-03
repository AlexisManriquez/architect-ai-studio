import { useRef, useState, useCallback, useEffect } from "react";
import type { RoomState, PlacedItem } from "@/types/room";
import { ASSET_CATALOG } from "@/data/assetCatalog";

interface RoomCanvasProps {
  roomState: RoomState;
}

const WALL_THICKNESS = 12;
const PADDING = 40;

export default function RoomCanvas({ roomState }: RoomCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const { roomWidth, roomDepth, walls, items } = roomState;

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
    if (e.button === 1 || e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  }, [offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

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

    return (
      <g
        key={item.id}
        transform={`translate(${item.x}, ${item.y}) rotate(${item.rotation}, ${def.width / 2}, ${def.height / 2})`}
      >
        <rect
          width={def.width}
          height={def.height}
          fill={fill}
          stroke="hsl(var(--foreground))"
          strokeWidth={1.5}
          rx={4}
          opacity={0.85}
        />
        <text
          x={def.width / 2}
          y={def.height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="hsl(var(--foreground))"
          fontSize={Math.min(14, def.width / 6)}
          fontWeight={600}
          style={{ userSelect: "none" }}
        >
          {def.label}
        </text>
      </g>
    );
  };

  // Grid
  const gridLines = [];
  const gridStep = 50; // 50cm grid
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
      className="flex-1 bg-background overflow-hidden cursor-grab active:cursor-grabbing relative"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0 }}
      >
        <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
          {/* Grid */}
          {gridLines}

          {/* Walls */}
          {/* Back wall */}
          <rect x={-WALL_THICKNESS} y={-WALL_THICKNESS} width={roomWidth + WALL_THICKNESS * 2} height={WALL_THICKNESS} fill="hsl(var(--foreground))" />
          {/* Left wall */}
          <rect x={-WALL_THICKNESS} y={0} width={WALL_THICKNESS} height={roomDepth} fill="hsl(var(--foreground))" />
          {/* Right wall */}
          <rect x={roomWidth} y={0} width={WALL_THICKNESS} height={roomDepth} fill="hsl(var(--foreground))" />

          {/* Floor area label */}
          <text x={roomWidth / 2} y={roomDepth + 25} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={12}>
            {roomWidth / 100}m × {roomDepth / 100}m — Open side ↓
          </text>

          {/* Items */}
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
