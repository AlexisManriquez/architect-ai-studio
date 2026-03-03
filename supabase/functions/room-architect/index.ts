import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Asset Catalog ──────────────────────────────────────────────────────────
const ASSET_CATALOG: Record<string, { label: string; width: number; height: number; isWallElement?: boolean }> = {
  "sofa-2-seater": { label: "2-Seater Sofa", width: 160, height: 85 },
  "sofa-3-seater": { label: "3-Seater Sofa", width: 220, height: 85 },
  "armchair": { label: "Armchair", width: 80, height: 80 },
  "dining-chair": { label: "Dining Chair", width: 45, height: 45 },
  "coffee-table": { label: "Coffee Table", width: 120, height: 60 },
  "dining-table": { label: "Dining Table", width: 180, height: 90 },
  "bookshelf": { label: "Bookshelf", width: 100, height: 35 },
  "tv-stand": { label: "TV Stand", width: 150, height: 40 },
  "side-table": { label: "Side Table", width: 50, height: 50 },
  "kitchen-island": { label: "Kitchen Island", width: 180, height: 90 },
  "counter": { label: "Counter", width: 200, height: 60 },
  "cabinet": { label: "Cabinet", width: 80, height: 50 },
  "window": { label: "Window", width: 100, height: 15, isWallElement: true },
  "doorway": { label: "Doorway", width: 90, height: 15, isWallElement: true },
  "bed-king": { label: "King Bed", width: 200, height: 210 },
  "bed-queen": { label: "Queen Bed", width: 160, height: 210 },
  "bed-twin": { label: "Twin Bed", width: 100, height: 200 },
  "nightstand": { label: "Nightstand", width: 50, height: 45 },
  "dresser": { label: "Dresser", width: 120, height: 50 },
  "desk": { label: "Desk", width: 140, height: 70 },
  "office-chair": { label: "Office Chair", width: 55, height: 55 },
  "bathtub": { label: "Bathtub", width: 170, height: 75 },
  "shower": { label: "Shower", width: 90, height: 90 },
  "toilet": { label: "Toilet", width: 40, height: 70 },
  "sink-bathroom": { label: "Bathroom Sink", width: 60, height: 45 },
  "sink-kitchen": { label: "Kitchen Sink", width: 80, height: 60 },
  "refrigerator": { label: "Refrigerator", width: 80, height: 75 },
  "stove": { label: "Stove/Oven", width: 75, height: 65 },
  "dishwasher": { label: "Dishwasher", width: 60, height: 60 },
  "washer": { label: "Washer", width: 65, height: 65 },
  "dryer": { label: "Dryer", width: 65, height: 65 },
  "wardrobe": { label: "Wardrobe", width: 120, height: 60 },
};

// ─── Room types ─────────────────────────────────────────────────────────────
const ROOM_TYPES = [
  "living-room", "bedroom", "bathroom", "kitchen", "dining-room",
  "office", "garage", "hallway", "closet", "laundry", "entry",
] as const;

// ─── Types ──────────────────────────────────────────────────────────────────
interface PlacedItem {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
}

interface RoomState {
  roomWidth: number;
  roomDepth: number;
  items: PlacedItem[];
}

interface FloorPlanRoom {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FloorPlanDoor {
  id: string;
  roomId1: string;
  roomId2: string;
  x: number;
  y: number;
  width: number;
  orientation: "horizontal" | "vertical";
}

interface FloorPlanWindow {
  id: string;
  roomId: string;
  x: number;
  y: number;
  width: number;
  orientation: "horizontal" | "vertical";
  wall: "north" | "south" | "east" | "west";
}

interface FloorPlan {
  id: string;
  name: string;
  totalWidth: number;
  totalHeight: number;
  rooms: FloorPlanRoom[];
  doors: FloorPlanDoor[];
  windows: FloorPlanWindow[];
}

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

// ─── Floor Plan Tools ───────────────────────────────────────────────────────

const floorPlanTools = [
  {
    type: "function",
    function: {
      name: "generate_floor_plan",
      description: "Generate a complete floor plan from a description. Creates rooms, doors, and windows. Use for prompts like '3 bedroom 2 bath house' or 'open concept studio'. Returns the full floor plan.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name for the floor plan" },
          rooms: {
            type: "array",
            description: "Array of rooms to create. Position them so they tile together without gaps/overlaps. All coordinates in cm.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: [...ROOM_TYPES] },
                x: { type: "number", description: "X position in cm" },
                y: { type: "number", description: "Y position in cm" },
                width: { type: "number", description: "Width in cm" },
                height: { type: "number", description: "Height in cm" },
              },
              required: ["name", "type", "x", "y", "width", "height"],
              additionalProperties: false,
            },
          },
          doors: {
            type: "array",
            description: "Doors between rooms or to exterior. Place on shared walls between adjacent rooms.",
            items: {
              type: "object",
              properties: {
                roomId1_index: { type: "number", description: "Index of first room in rooms array" },
                roomId2_index: { type: "number", description: "Index of second room (-1 for exterior)" },
                x: { type: "number", description: "X position of door" },
                y: { type: "number", description: "Y position of door" },
                width: { type: "number", description: "Door width in cm (typically 90)" },
                orientation: { type: "string", enum: ["horizontal", "vertical"] },
              },
              required: ["roomId1_index", "roomId2_index", "x", "y", "width", "orientation"],
              additionalProperties: false,
            },
          },
          windows: {
            type: "array",
            description: "Windows on exterior walls.",
            items: {
              type: "object",
              properties: {
                roomId_index: { type: "number", description: "Index of room in rooms array" },
                x: { type: "number", description: "X position" },
                y: { type: "number", description: "Y position" },
                width: { type: "number", description: "Window width in cm (typically 100-120)" },
                orientation: { type: "string", enum: ["horizontal", "vertical"] },
                wall: { type: "string", enum: ["north", "south", "east", "west"] },
              },
              required: ["roomId_index", "x", "y", "width", "orientation", "wall"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "rooms", "doors", "windows"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_room",
      description: "Add a single room to the existing floor plan.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: [...ROOM_TYPES] },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
        },
        required: ["name", "type", "x", "y", "width", "height"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resize_room",
      description: "Resize an existing room by ID. Adjusts width and/or height.",
      parameters: {
        type: "object",
        properties: {
          room_id: { type: "string" },
          width: { type: "number", description: "New width in cm (optional)" },
          height: { type: "number", description: "New height in cm (optional)" },
          x: { type: "number", description: "New x position (optional, for repositioning after resize)" },
          y: { type: "number", description: "New y position (optional)" },
        },
        required: ["room_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_room",
      description: "Move a room to a new position.",
      parameters: {
        type: "object",
        properties: {
          room_id: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
        },
        required: ["room_id", "x", "y"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_room",
      description: "Remove a room from the floor plan by ID.",
      parameters: {
        type: "object",
        properties: {
          room_id: { type: "string" },
        },
        required: ["room_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_door",
      description: "Add a door between two rooms or to exterior.",
      parameters: {
        type: "object",
        properties: {
          room_id_1: { type: "string" },
          room_id_2: { type: "string", description: "Second room ID or 'exterior'" },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          orientation: { type: "string", enum: ["horizontal", "vertical"] },
        },
        required: ["room_id_1", "room_id_2", "x", "y", "width", "orientation"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_window",
      description: "Add a window to a room's exterior wall.",
      parameters: {
        type: "object",
        properties: {
          room_id: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          orientation: { type: "string", enum: ["horizontal", "vertical"] },
          wall: { type: "string", enum: ["north", "south", "east", "west"] },
        },
        required: ["room_id", "x", "y", "width", "orientation", "wall"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_rooms",
      description: "List all rooms in the floor plan with their IDs, positions, and dimensions.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
];

// ─── Furniture Tools (existing) ─────────────────────────────────────────────

const furnitureTools = [
  {
    type: "function",
    function: {
      name: "validate_placement",
      description: "Check if a furniture position is valid (no clipping, no overlaps). Call before place_item.",
      parameters: {
        type: "object",
        properties: {
          item_type: { type: "string", enum: Object.keys(ASSET_CATALOG) },
          x: { type: "number" },
          y: { type: "number" },
          rotation: { type: "number", enum: [0, 90, 180, 270] },
          exclude_item_id: { type: "string" },
        },
        required: ["item_type", "x", "y", "rotation"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "place_item",
      description: "Place new furniture. x,y = top-left corner in cm.",
      parameters: {
        type: "object",
        properties: {
          item_type: { type: "string", enum: Object.keys(ASSET_CATALOG) },
          x: { type: "number" },
          y: { type: "number" },
          rotation: { type: "number", enum: [0, 90, 180, 270] },
        },
        required: ["item_type", "x", "y", "rotation"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_item",
      description: "Move furniture to absolute position.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          rotation: { type: "number", enum: [0, 90, 180, 270] },
        },
        required: ["item_id", "x", "y", "rotation"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "nudge_item",
      description: "Move furniture by relative offset. dx neg=left, pos=right. dy neg=north, pos=south.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string" },
          dx: { type: "number" },
          dy: { type: "number" },
          rotation: { type: "number", enum: [0, 90, 180, 270] },
        },
        required: ["item_id", "dx", "dy"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_item",
      description: "Remove furniture by ID.",
      parameters: {
        type: "object",
        properties: { item_id: { type: "string" } },
        required: ["item_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_items",
      description: "List all placed furniture with IDs and positions.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
];

// ─── Collision Detection ────────────────────────────────────────────────────
function getItemBounds(type: string, x: number, y: number, rotation: number) {
  const def = ASSET_CATALOG[type];
  if (!def) return null;
  const isRotated = rotation === 90 || rotation === 270;
  const w = isRotated ? def.height : def.width;
  const h = isRotated ? def.width : def.height;
  return { x, y, w, h, x2: x + w, y2: y + h };
}

function validatePlacement(
  roomState: RoomState, itemType: string, x: number, y: number, rotation: number, excludeId?: string
): { valid: boolean; reason?: string } {
  const bounds = getItemBounds(itemType, x, y, rotation);
  if (!bounds) return { valid: false, reason: `Unknown item type: ${itemType}` };
  if (bounds.x < 0 || bounds.y < 0 || bounds.x2 > roomState.roomWidth || bounds.y2 > roomState.roomDepth) {
    return { valid: false, reason: `Item clips room bounds. Room: ${roomState.roomWidth}×${roomState.roomDepth}cm. Item: (${bounds.x},${bounds.y}) to (${bounds.x2},${bounds.y2}).` };
  }
  for (const item of roomState.items) {
    if (excludeId && item.id === excludeId) continue;
    const other = getItemBounds(item.type, item.x, item.y, item.rotation);
    if (!other) continue;
    if (bounds.x < other.x2 && bounds.x2 > other.x && bounds.y < other.y2 && bounds.y2 > other.y) {
      return { valid: false, reason: `Overlaps with ${ASSET_CATALOG[item.type]?.label || item.type} (id: ${item.id}).` };
    }
  }
  return { valid: true };
}

// ─── Floor Plan Tool Processor ──────────────────────────────────────────────
function processFloorPlanTool(
  name: string, args: Record<string, unknown>, floorPlan: FloorPlan
): { result: string; floorPlan: FloorPlan; action?: string } {
  switch (name) {
    case "generate_floor_plan": {
      const rooms: FloorPlanRoom[] = (args.rooms as any[]).map((r, i) => ({
        id: generateId(),
        name: r.name,
        type: r.type,
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      }));

      const totalWidth = Math.max(...rooms.map(r => r.x + r.width));
      const totalHeight = Math.max(...rooms.map(r => r.y + r.height));

      const doors: FloorPlanDoor[] = ((args.doors as any[]) || []).map((d) => ({
        id: generateId(),
        roomId1: d.roomId1_index >= 0 ? rooms[d.roomId1_index]?.id || "exterior" : "exterior",
        roomId2: d.roomId2_index >= 0 ? rooms[d.roomId2_index]?.id || "exterior" : "exterior",
        x: Math.round(d.x),
        y: Math.round(d.y),
        width: Math.round(d.width),
        orientation: d.orientation,
      }));

      const windows: FloorPlanWindow[] = ((args.windows as any[]) || []).map((w) => ({
        id: generateId(),
        roomId: w.roomId_index >= 0 ? rooms[w.roomId_index]?.id || "" : "",
        x: Math.round(w.x),
        y: Math.round(w.y),
        width: Math.round(w.width),
        orientation: w.orientation,
        wall: w.wall,
      }));

      const newPlan: FloorPlan = {
        id: generateId(),
        name: (args.name as string) || "Floor Plan",
        totalWidth,
        totalHeight,
        rooms,
        doors,
        windows,
      };

      const totalSqft = rooms.reduce((s, r) => s + Math.round((r.width * r.height) / 929), 0);
      return {
        result: JSON.stringify({ success: true, rooms: rooms.length, doors: doors.length, windows: windows.length, totalSqft }),
        floorPlan: newPlan,
        action: `Generated "${newPlan.name}" — ${rooms.length} rooms, ~${totalSqft} sqft`,
      };
    }

    case "add_room": {
      const id = generateId();
      const room: FloorPlanRoom = {
        id,
        name: args.name as string,
        type: args.type as string,
        x: Math.round(args.x as number),
        y: Math.round(args.y as number),
        width: Math.round(args.width as number),
        height: Math.round(args.height as number),
      };
      const updated = {
        ...floorPlan,
        rooms: [...floorPlan.rooms, room],
        totalWidth: Math.max(floorPlan.totalWidth, room.x + room.width),
        totalHeight: Math.max(floorPlan.totalHeight, room.y + room.height),
      };
      return { result: JSON.stringify({ success: true, room_id: id }), floorPlan: updated, action: `Added ${room.name}` };
    }

    case "resize_room": {
      const roomId = args.room_id as string;
      const room = floorPlan.rooms.find(r => r.id === roomId);
      if (!room) return { result: JSON.stringify({ success: false, reason: "Room not found" }), floorPlan };
      const updated = {
        ...floorPlan,
        rooms: floorPlan.rooms.map(r => r.id === roomId ? {
          ...r,
          width: args.width != null ? Math.round(args.width as number) : r.width,
          height: args.height != null ? Math.round(args.height as number) : r.height,
          x: args.x != null ? Math.round(args.x as number) : r.x,
          y: args.y != null ? Math.round(args.y as number) : r.y,
        } : r),
      };
      // Recalculate bounds
      updated.totalWidth = Math.max(...updated.rooms.map(r => r.x + r.width));
      updated.totalHeight = Math.max(...updated.rooms.map(r => r.y + r.height));
      return { result: JSON.stringify({ success: true }), floorPlan: updated, action: `Resized ${room.name}` };
    }

    case "move_room": {
      const roomId = args.room_id as string;
      const room = floorPlan.rooms.find(r => r.id === roomId);
      if (!room) return { result: JSON.stringify({ success: false, reason: "Room not found" }), floorPlan };
      const updated = {
        ...floorPlan,
        rooms: floorPlan.rooms.map(r => r.id === roomId ? {
          ...r, x: Math.round(args.x as number), y: Math.round(args.y as number),
        } : r),
      };
      updated.totalWidth = Math.max(...updated.rooms.map(r => r.x + r.width));
      updated.totalHeight = Math.max(...updated.rooms.map(r => r.y + r.height));
      return { result: JSON.stringify({ success: true }), floorPlan: updated, action: `Moved ${room.name}` };
    }

    case "remove_room": {
      const roomId = args.room_id as string;
      const room = floorPlan.rooms.find(r => r.id === roomId);
      if (!room) return { result: JSON.stringify({ success: false, reason: "Room not found" }), floorPlan };
      const updated = {
        ...floorPlan,
        rooms: floorPlan.rooms.filter(r => r.id !== roomId),
        doors: floorPlan.doors.filter(d => d.roomId1 !== roomId && d.roomId2 !== roomId),
        windows: floorPlan.windows.filter(w => w.roomId !== roomId),
      };
      if (updated.rooms.length > 0) {
        updated.totalWidth = Math.max(...updated.rooms.map(r => r.x + r.width));
        updated.totalHeight = Math.max(...updated.rooms.map(r => r.y + r.height));
      }
      return { result: JSON.stringify({ success: true }), floorPlan: updated, action: `Removed ${room.name}` };
    }

    case "add_door": {
      const door: FloorPlanDoor = {
        id: generateId(),
        roomId1: args.room_id_1 as string,
        roomId2: args.room_id_2 as string,
        x: Math.round(args.x as number),
        y: Math.round(args.y as number),
        width: Math.round(args.width as number),
        orientation: args.orientation as "horizontal" | "vertical",
      };
      return {
        result: JSON.stringify({ success: true, door_id: door.id }),
        floorPlan: { ...floorPlan, doors: [...floorPlan.doors, door] },
        action: `Added door`,
      };
    }

    case "add_window": {
      const win: FloorPlanWindow = {
        id: generateId(),
        roomId: args.room_id as string,
        x: Math.round(args.x as number),
        y: Math.round(args.y as number),
        width: Math.round(args.width as number),
        orientation: args.orientation as "horizontal" | "vertical",
        wall: args.wall as "north" | "south" | "east" | "west",
      };
      return {
        result: JSON.stringify({ success: true, window_id: win.id }),
        floorPlan: { ...floorPlan, windows: [...floorPlan.windows, win] },
        action: `Added window`,
      };
    }

    case "list_rooms": {
      const roomList = floorPlan.rooms.map(r => ({
        id: r.id, name: r.name, type: r.type,
        position: { x: r.x, y: r.y }, size: { width: r.width, height: r.height },
        sqft: Math.round((r.width * r.height) / 929),
      }));
      return { result: JSON.stringify({ rooms: roomList, doors: floorPlan.doors.length, windows: floorPlan.windows.length }), floorPlan };
    }

    default:
      return { result: JSON.stringify({ error: `Unknown tool: ${name}` }), floorPlan };
  }
}

// ─── Furniture Tool Processor ───────────────────────────────────────────────
function processFurnitureTool(
  name: string, args: Record<string, unknown>, roomState: RoomState
): { result: string; roomState: RoomState; action?: string } {
  switch (name) {
    case "validate_placement": {
      const r = validatePlacement(roomState, args.item_type as string, args.x as number, args.y as number, args.rotation as number, args.exclude_item_id as string | undefined);
      return { result: JSON.stringify(r), roomState };
    }
    case "place_item": {
      const itemType = args.item_type as string;
      const x = Math.round(args.x as number);
      const y = Math.round(args.y as number);
      const rotation = args.rotation as number;
      const validation = validatePlacement(roomState, itemType, x, y, rotation);
      if (!validation.valid) return { result: JSON.stringify({ success: false, reason: validation.reason }), roomState };
      const id = generateId();
      const newItem: PlacedItem = { id, type: itemType, x, y, rotation };
      const label = ASSET_CATALOG[newItem.type]?.label || newItem.type;
      return { result: JSON.stringify({ success: true, item_id: id, label }), roomState: { ...roomState, items: [...roomState.items, newItem] }, action: `Placed ${label} at (${x}, ${y})` };
    }
    case "remove_item": {
      const itemId = args.item_id as string;
      const exists = roomState.items.find(i => i.id === itemId);
      if (!exists) return { result: JSON.stringify({ success: false, reason: "Item not found" }), roomState };
      const label = ASSET_CATALOG[exists.type]?.label || exists.type;
      return { result: JSON.stringify({ success: true }), roomState: { ...roomState, items: roomState.items.filter(i => i.id !== itemId) }, action: `Removed ${label}` };
    }
    case "move_item": {
      const item = roomState.items.find(i => i.id === (args.item_id as string));
      if (!item) return { result: JSON.stringify({ success: false, reason: "Item not found" }), roomState };
      const x = Math.round(args.x as number), y = Math.round(args.y as number), rot = args.rotation as number;
      const v = validatePlacement(roomState, item.type, x, y, rot, item.id);
      if (!v.valid) return { result: JSON.stringify({ success: false, reason: v.reason }), roomState };
      const label = ASSET_CATALOG[item.type]?.label || item.type;
      return { result: JSON.stringify({ success: true }), roomState: { ...roomState, items: roomState.items.map(i => i.id === item.id ? { ...i, x, y, rotation: rot } : i) }, action: `Moved ${label} to (${x}, ${y})` };
    }
    case "nudge_item": {
      const item = roomState.items.find(i => i.id === (args.item_id as string));
      if (!item) return { result: JSON.stringify({ success: false, reason: "Item not found" }), roomState };
      const dx = Math.round(args.dx as number), dy = Math.round(args.dy as number);
      const newX = item.x + dx, newY = item.y + dy;
      const newRot = (args.rotation as number) ?? item.rotation;
      const v = validatePlacement(roomState, item.type, newX, newY, newRot, item.id);
      if (!v.valid) return { result: JSON.stringify({ success: false, reason: v.reason }), roomState };
      const label = ASSET_CATALOG[item.type]?.label || item.type;
      return { result: JSON.stringify({ success: true }), roomState: { ...roomState, items: roomState.items.map(i => i.id === item.id ? { ...i, x: newX, y: newY, rotation: newRot } : i) }, action: `Nudged ${label} by (${dx > 0 ? "+" : ""}${dx}, ${dy > 0 ? "+" : ""}${dy})cm` };
    }
    case "list_items": {
      const items = roomState.items.map(i => {
        const def = ASSET_CATALOG[i.type];
        return { id: i.id, type: i.type, label: def?.label || i.type, position: { x: i.x, y: i.y }, rotation: i.rotation };
      });
      return { result: JSON.stringify({ items }), roomState };
    }
    default:
      return { result: JSON.stringify({ error: `Unknown tool: ${name}` }), roomState };
  }
}

// ─── Multimodal Content Builder ─────────────────────────────────────────────
function buildUserContent(text: string, images: string[] = []) {
  if (images.length === 0) return text;
  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  for (const img of images) {
    parts.push({ type: "image_url", image_url: { url: `data:image/png;base64,${img}` } });
  }
  parts.push({ type: "text", text });
  return parts;
}

// ─── System Prompts ─────────────────────────────────────────────────────────

function buildFloorPlanSystemPrompt(floorPlan: FloorPlan): string {
  const roomsSummary = floorPlan.rooms.length === 0
    ? "No rooms yet — floor plan is empty."
    : "CURRENT ROOMS:\n" + floorPlan.rooms.map(r =>
        `  • ${r.name} [id: ${r.id}] type=${r.type} at (${r.x},${r.y}) ${r.width}×${r.height}cm (~${Math.round((r.width * r.height) / 929)} sqft)`
      ).join("\n");

  return `You are a professional floor plan architect AI with VISION capabilities. You design house/apartment floor plans by placing rooms, doors, and windows.

YOU HAVE TWO INFORMATION SOURCES:
1. A SCREENSHOT IMAGE of the current floor plan (visual — look at it!)
2. PRECISE COORDINATE DATA below (numerical — use for exact positions)

═══ FLOOR PLAN: "${floorPlan.name}" ═══
Bounding box: ${floorPlan.totalWidth}cm × ${floorPlan.totalHeight}cm
${roomsSummary}
Doors: ${floorPlan.doors.length}
Windows: ${floorPlan.windows.length}

═══ COORDINATE SYSTEM ═══
Origin (0,0) = top-left corner. X → right, Y → down. All values in cm.
Room positions are their top-left corner.
100cm = 1 meter. 1 sqft ≈ 929 cm².

═══ ROOM TYPES AVAILABLE ═══
${ROOM_TYPES.join(", ")}

═══ DESIGN GUIDELINES ═══
• Rooms should tile together with shared walls (no gaps between adjacent rooms).
• Standard room sizes (approximate):
  - Bedroom: 300×350cm (~113 sqft) to 450×500cm (~242 sqft)
  - Master bedroom: 400×450cm (~194 sqft) to 500×550cm (~296 sqft)
  - Bathroom: 200×250cm (~54 sqft) to 300×350cm (~113 sqft)
  - Kitchen: 300×350cm (~113 sqft) to 400×450cm (~194 sqft)
  - Living room: 400×450cm (~194 sqft) to 600×500cm (~323 sqft)
  - Hallway: 120×300cm+ (long and narrow)
  - Closet: 120×150cm (~19 sqft) to 200×250cm (~54 sqft)
• Place doors on shared walls between adjacent rooms.
  - Horizontal doors: placed on horizontal shared edges (same y, different x)
  - Vertical doors: placed on vertical shared edges (same x, different y)
• Place windows on exterior walls only.
• For multi-bedroom plans, use a hallway to connect bedrooms.
• The entry/front door should face south (bottom of plan).

═══ TOOLS ═══
1. **generate_floor_plan** — Create an entire floor plan at once. Best for initial generation.
2. **add_room** / **remove_room** / **resize_room** / **move_room** — Modify individual rooms.
3. **add_door** / **add_window** — Add connections and openings.
4. **list_rooms** — Inspect current layout.

═══ RULES ═══
1. When generating a floor plan, tile rooms edge-to-edge with no gaps.
2. Doors must be placed at shared wall boundaries between rooms.
3. All coordinates must be whole numbers.
4. Be conversational and brief (1-3 sentences after executing actions).
5. ALWAYS execute tools when the user asks you to DO something.
6. For sketch/image uploads, interpret the layout visually and recreate it.
7. If the user mentions square footage, convert: sqft × 929 = cm².
8. Keep hallways 120-150cm wide minimum.`;
}

function buildRoomSystemPrompt(roomState: RoomState, roomName: string): string {
  const { roomWidth, roomDepth, items } = roomState;
  const halfW = Math.round(roomWidth / 2);
  const halfD = Math.round(roomDepth / 2);

  const itemsSummary = items.length === 0
    ? "The room is currently EMPTY."
    : "CURRENT ITEMS:\n" + items.map(i => {
        const def = ASSET_CATALOG[i.type];
        return `  • ${def?.label || i.type} [id: ${i.id}] at (${i.x}, ${i.y}), rotation: ${i.rotation}°`;
      }).join("\n");

  return `You are a professional interior design AI. You furnish the room "${roomName}" by placing furniture.

═══ ROOM: "${roomName}" ═══
Dimensions: ${roomWidth}cm × ${roomDepth}cm (${(roomWidth / 100).toFixed(1)}m × ${(roomDepth / 100).toFixed(1)}m)
Origin: (0,0) = top-left. X → right, Y → down.
${itemsSummary}

═══ DIRECTION MAP ═══
WEST/LEFT = low x | EAST/RIGHT = high x | NORTH/BACK = low y | SOUTH/FRONT = high y
Center ≈ (${halfW}, ${halfD})

═══ AVAILABLE FURNITURE ═══
${Object.entries(ASSET_CATALOG).map(([k, v]) => `• ${k}: "${v.label}" ${v.width}×${v.height}cm`).join("\n")}

═══ RULES ═══
1. Calculate positions before placing. Item anchor = top-left corner.
2. Keep 5-10cm gaps between items.
3. If placement fails, correct and retry once.
4. Brief responses (1-3 sentences) after actions.
5. ALWAYS execute tools when asked to DO something.
6. "slightly/a bit" = 15-30cm. "a lot" = 80-120cm.
7. Against back wall: y=0. Against left wall: x=0. Against right wall: x=roomWidth-itemWidth.`;
}

// ─── Main Handler ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages: userMessages, mode, roomState, floorPlan, roomName, canvasScreenshot, images: userImages } = body;

    if (!userMessages || !Array.isArray(userMessages) || userMessages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages provided." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isFloorPlanMode = mode === "floorplan";
    let currentRoomState: RoomState = roomState || { roomWidth: 600, roomDepth: 500, items: [] };
    let currentFloorPlan: FloorPlan = floorPlan || { id: generateId(), name: "My Home", totalWidth: 0, totalHeight: 0, rooms: [], doors: [], windows: [] };
    const actionLog: string[] = [];
    const newItemIds: string[] = [];

    const systemPrompt = isFloorPlanMode
      ? buildFloorPlanSystemPrompt(currentFloorPlan)
      : buildRoomSystemPrompt(currentRoomState, roomName || "Room");

    const tools = isFloorPlanMode ? floorPlanTools : furnitureTools;

    // Build messages
    const aiMessages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
    ];

    for (let i = 0; i < userMessages.length; i++) {
      const msg = userMessages[i];
      if (i === userMessages.length - 1 && msg.role === "user") {
        const allImages: string[] = [];
        if (canvasScreenshot) allImages.push(canvasScreenshot);
        if (userImages && userImages.length > 0) allImages.push(...userImages);
        aiMessages.push({ role: "user", content: buildUserContent(msg.content, allImages) });
      } else {
        aiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // Tool-call loop
    let finalContent = "";
    const MAX_ITERATIONS = 20;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: aiMessages,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit reached. Please wait." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const errText = await response.text();
        console.error("AI gateway error:", status, errText);
        throw new Error(`AI gateway returned ${status}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error("Empty response from AI");

      const msg = choice.message;
      aiMessages.push(msg);

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown>;
          try {
            args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
          } catch {
            aiMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: "Invalid arguments" }) });
            continue;
          }

          if (isFloorPlanMode) {
            const { result, floorPlan: newPlan, action } = processFloorPlanTool(tc.function.name, args, currentFloorPlan);
            currentFloorPlan = newPlan;
            if (action) actionLog.push(action);
            aiMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
          } else {
            const { result, roomState: newState, action } = processFurnitureTool(tc.function.name, args, currentRoomState);
            currentRoomState = newState;
            if (action) actionLog.push(action);
            try { const p = JSON.parse(result); if (p.item_id) newItemIds.push(p.item_id); } catch {}
            aiMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
          }
        }
        continue;
      }

      finalContent = msg.content || "";
      break;
    }

    if (!finalContent && actionLog.length > 0) {
      finalContent = `Done! I made ${actionLog.length} changes.`;
    } else if (!finalContent) {
      finalContent = "I processed your request. Take a look!";
    }

    const responseBody: Record<string, unknown> = {
      message: finalContent,
      actionLog,
      newItemIds,
    };

    if (isFloorPlanMode) {
      responseBody.floorPlan = currentFloorPlan;
    } else {
      responseBody.roomState = currentRoomState;
    }

    return new Response(JSON.stringify(responseBody), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("room-architect error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
