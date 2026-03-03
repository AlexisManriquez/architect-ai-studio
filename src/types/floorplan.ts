export type RoomType =
  | "living-room"
  | "bedroom"
  | "bathroom"
  | "kitchen"
  | "dining-room"
  | "office"
  | "garage"
  | "hallway"
  | "closet"
  | "laundry"
  | "entry";

export interface FloorPlanRoom {
  id: string;
  name: string;
  type: RoomType;
  x: number;       // cm from origin (top-left of floor plan)
  y: number;       // cm from origin
  width: number;   // cm
  height: number;  // cm
}

export interface FloorPlanDoor {
  id: string;
  /** Room IDs this door connects. "exterior" for outside. */
  roomId1: string;
  roomId2: string | "exterior";
  /** Position along the shared wall edge */
  x: number;
  y: number;
  width: number;   // door width in cm (typically 90)
  orientation: "horizontal" | "vertical";
}

export interface FloorPlanWindow {
  id: string;
  roomId: string;
  x: number;
  y: number;
  width: number;   // window width in cm (typically 100)
  orientation: "horizontal" | "vertical";
  wall: "north" | "south" | "east" | "west";
}

export interface FloorPlan {
  id: string;
  name: string;
  totalWidth: number;   // cm — bounding box
  totalHeight: number;  // cm
  rooms: FloorPlanRoom[];
  doors: FloorPlanDoor[];
  windows: FloorPlanWindow[];
}

/** The app can be in floor plan mode or room (furniture) mode */
export type AppMode = "floorplan" | "room";

export const ROOM_TYPE_COLORS: Record<RoomType, string> = {
  "living-room": "210 60% 85%",
  "bedroom": "240 50% 88%",
  "bathroom": "190 60% 82%",
  "kitchen": "120 40% 85%",
  "dining-room": "35 60% 85%",
  "office": "270 40% 88%",
  "garage": "220 10% 82%",
  "hallway": "220 15% 90%",
  "closet": "220 10% 88%",
  "laundry": "180 30% 86%",
  "entry": "30 30% 88%",
};

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  "living-room": "Living Room",
  "bedroom": "Bedroom",
  "bathroom": "Bathroom",
  "kitchen": "Kitchen",
  "dining-room": "Dining Room",
  "office": "Office",
  "garage": "Garage",
  "hallway": "Hallway",
  "closet": "Closet",
  "laundry": "Laundry",
  "entry": "Entry",
};
