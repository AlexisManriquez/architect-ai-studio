import type { ItemDef, ItemType } from "@/types/room";

export type ExtendedItemType = ItemType
  | "bed-king" | "bed-queen" | "bed-twin"
  | "nightstand" | "dresser" | "desk" | "office-chair"
  | "bathtub" | "shower" | "toilet" | "sink-bathroom" | "sink-kitchen"
  | "refrigerator" | "stove" | "dishwasher"
  | "washer" | "dryer" | "wardrobe";

export interface ExtendedItemDef {
  type: string;
  label: string;
  width: number;
  height: number;
  color: string;
  category: "seating" | "tables" | "kitchen" | "wall-element" | "bedroom" | "bathroom" | "office" | "laundry" | "storage";
  isWallElement?: boolean;
}

export const ASSET_CATALOG: Record<string, ExtendedItemDef> = {
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
  // Bedroom
  "bed-king": { type: "bed-king", label: "King Bed", width: 200, height: 210, color: "primary", category: "bedroom" },
  "bed-queen": { type: "bed-queen", label: "Queen Bed", width: 160, height: 210, color: "primary", category: "bedroom" },
  "bed-twin": { type: "bed-twin", label: "Twin Bed", width: 100, height: 200, color: "primary", category: "bedroom" },
  "nightstand": { type: "nightstand", label: "Nightstand", width: 50, height: 45, color: "accent", category: "bedroom" },
  "dresser": { type: "dresser", label: "Dresser", width: 120, height: 50, color: "accent", category: "bedroom" },
  "wardrobe": { type: "wardrobe", label: "Wardrobe", width: 120, height: 60, color: "muted", category: "storage" },
  // Office
  "desk": { type: "desk", label: "Desk", width: 140, height: 70, color: "accent", category: "office" },
  "office-chair": { type: "office-chair", label: "Office Chair", width: 55, height: 55, color: "secondary", category: "office" },
  // Bathroom
  "bathtub": { type: "bathtub", label: "Bathtub", width: 170, height: 75, color: "ring", category: "bathroom" },
  "shower": { type: "shower", label: "Shower", width: 90, height: 90, color: "ring", category: "bathroom" },
  "toilet": { type: "toilet", label: "Toilet", width: 40, height: 70, color: "muted", category: "bathroom" },
  "sink-bathroom": { type: "sink-bathroom", label: "Bathroom Sink", width: 60, height: 45, color: "ring", category: "bathroom" },
  // Kitchen appliances
  "sink-kitchen": { type: "sink-kitchen", label: "Kitchen Sink", width: 80, height: 60, color: "ring", category: "kitchen" },
  "refrigerator": { type: "refrigerator", label: "Refrigerator", width: 80, height: 75, color: "muted", category: "kitchen" },
  "stove": { type: "stove", label: "Stove/Oven", width: 75, height: 65, color: "muted", category: "kitchen" },
  "dishwasher": { type: "dishwasher", label: "Dishwasher", width: 60, height: 60, color: "muted", category: "kitchen" },
  // Laundry
  "washer": { type: "washer", label: "Washer", width: 65, height: 65, color: "muted", category: "laundry" },
  "dryer": { type: "dryer", label: "Dryer", width: 65, height: 65, color: "muted", category: "laundry" },
};

export function createDefaultRoom() {
  const roomWidth = 600;
  const roomDepth = 500;
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
