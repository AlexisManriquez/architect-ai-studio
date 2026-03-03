import type { ItemDef, ItemType } from "@/types/room";

export const ASSET_CATALOG: Record<ItemType, ItemDef> = {
  "sofa-2-seater": { type: "sofa-2-seater", label: "2-Seater Sofa", width: 160, height: 85, color: "primary", category: "seating" },
  "sofa-3-seater": { type: "sofa-3-seater", label: "3-Seater Sofa", width: 220, height: 85, color: "primary", category: "seating" },
  "armchair": { type: "armchair", label: "Armchair", width: 80, height: 80, color: "primary", category: "seating" },
  "dining-chair": { type: "dining-chair", label: "Dining Chair", width: 45, height: 45, color: "secondary", category: "seating" },
  "coffee-table": { type: "coffee-table", label: "Coffee Table", width: 120, height: 60, color: "accent", category: "tables" },
  "dining-table": { type: "dining-table", label: "Dining Table", width: 180, height: 90, color: "accent", category: "tables" },
  "bookshelf": { type: "bookshelf", label: "Bookshelf", width: 100, height: 35, color: "accent", category: "tables" },
  "tv-stand": { type: "tv-stand", label: "TV Stand", width: 150, height: 40, color: "accent", category: "tables" },
  "side-table": { type: "side-table", label: "Side Table", width: 50, height: 50, color: "accent", category: "tables" },
  "kitchen-island": { type: "kitchen-island", label: "Kitchen Island", width: 180, height: 90, color: "muted", category: "kitchen" },
  "counter": { type: "counter", label: "Counter", width: 200, height: 60, color: "muted", category: "kitchen" },
  "cabinet": { type: "cabinet", label: "Cabinet", width: 80, height: 50, color: "muted", category: "kitchen" },
  "window": { type: "window", label: "Window", width: 100, height: 15, color: "ring", category: "wall-element", isWallElement: true },
  "doorway": { type: "doorway", label: "Doorway", width: 90, height: 15, color: "ring", category: "wall-element", isWallElement: true },
};

export function createDefaultRoom() {
  const roomWidth = 600; // cm
  const roomDepth = 500; // cm
  return {
    roomWidth,
    roomDepth,
    walls: [
      { id: "back", label: "Back Wall", x1: 0, y1: 0, x2: roomWidth, y2: 0 },
      { id: "left", label: "Left Wall", x1: 0, y1: 0, x2: 0, y2: roomDepth },
      { id: "right", label: "Right Wall", x1: roomWidth, y1: 0, x2: roomWidth, y2: roomDepth },
    ],
    items: [] as any[],
  };
}
