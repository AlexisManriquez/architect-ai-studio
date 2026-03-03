export type ItemType =
  | "sofa-2-seater"
  | "sofa-3-seater"
  | "armchair"
  | "dining-chair"
  | "coffee-table"
  | "dining-table"
  | "bookshelf"
  | "tv-stand"
  | "side-table"
  | "kitchen-island"
  | "counter"
  | "cabinet"
  | "window"
  | "doorway";

export interface ItemDef {
  type: ItemType;
  label: string;
  width: number;   // cm
  height: number;  // cm (depth in top-down)
  color: string;   // HSL token name
  category: "seating" | "tables" | "kitchen" | "wall-element";
  isWallElement?: boolean;
}

export interface PlacedItem {
  id: string;
  type: ItemType;
  x: number;       // cm from left wall interior
  y: number;       // cm from back wall interior
  rotation: number; // degrees
  wallId?: string;  // for wall elements
}

export interface Wall {
  id: string;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RoomState {
  walls: Wall[];
  items: PlacedItem[];
  roomWidth: number;   // cm
  roomDepth: number;   // cm
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[]; // base64 encoded images
}
