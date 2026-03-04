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

// ─── Floor Plan Validation ──────────────────────────────────────────────────
function validateFloorPlanRooms(rooms: FloorPlanRoom[]): string[] {
  const warnings: string[] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      if (overlapX > 1 && overlapY > 1) {
        warnings.push(`OVERLAP: "${a.name}" and "${b.name}" overlap by ${overlapX}×${overlapY}cm. Fix positions so rooms share edges but don't overlap.`);
      }
    }
  }
  return warnings;
}

// ─── Comprehensive Floor Plan Inspector ─────────────────────────────────────
const PRIVATE_ROOM_TYPES = new Set(["bedroom", "bathroom", "closet", "laundry", "office"]);
const COMMON_ROOM_TYPES = new Set(["living-room", "kitchen", "dining-room", "hallway", "entry", "garage"]);
const EXTERIOR_SPACE_TYPES = new Set(["deck", "patio", "porch"]);

function inspectFloorPlan(floorPlan: FloorPlan): { issues: string[]; suggestions: string[] } {
  const issues: string[] = [];
  const suggestions: string[] = [];
  const { rooms, doors } = floorPlan;

  if (rooms.length === 0) return { issues: ["No rooms in floor plan."], suggestions: [] };

  // 1. Build adjacency graph from doors
  const adjacency: Record<string, Set<string>> = {};
  for (const r of rooms) adjacency[r.id] = new Set();
  adjacency["exterior"] = new Set();

  for (const door of doors) {
    const r1 = door.roomId1, r2 = door.roomId2;
    if (adjacency[r1]) adjacency[r1].add(r2);
    if (adjacency[r2]) adjacency[r2].add(r1);
  }

  // 2. Check connectivity — BFS from entry or any exterior door
  const entryRooms = rooms.filter(r => r.type === "entry");
  const roomsWithExteriorDoor = new Set(
    doors.filter(d => d.roomId1 === "exterior" || d.roomId2 === "exterior")
      .map(d => d.roomId1 === "exterior" ? d.roomId2 : d.roomId1)
  );
  
  const startNodes = new Set<string>();
  entryRooms.forEach(r => startNodes.add(r.id));
  roomsWithExteriorDoor.forEach(id => startNodes.add(id));
  
  if (startNodes.size === 0) {
    issues.push("NO ENTRY POINT: No room has an exterior door and no entry room exists. The house has no way in!");
  }

  // BFS to find all reachable rooms
  const visited = new Set<string>();
  const queue = [...startNodes];
  queue.forEach(id => visited.add(id));
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of (adjacency[current] || [])) {
      if (neighbor !== "exterior" && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  const unreachable = rooms.filter(r => !visited.has(r.id));
  for (const r of unreachable) {
    issues.push(`UNREACHABLE ROOM: "${r.name}" (${r.type}) has no door path to the entry. It is completely disconnected. Add doors to connect it to adjacent rooms.`);
  }

  // 3. Check bedroom accessibility — no bedroom should only be reachable through another bedroom
  const bedrooms = rooms.filter(r => r.type === "bedroom");
  for (const bed of bedrooms) {
    const neighbors = adjacency[bed.id] || new Set();
    // If ALL non-exterior neighbors are bedrooms, this is landlocked
    const nonExteriorNeighbors = [...neighbors].filter(n => n !== "exterior");
    if (nonExteriorNeighbors.length === 0) {
      // No doors at all
      if (!unreachable.find(r => r.id === bed.id)) {
        issues.push(`ISOLATED BEDROOM: "${bed.name}" has no doors connecting it to any room.`);
      }
    } else {
      const allNeighborsBedrooms = nonExteriorNeighbors.every(nId => {
        const nRoom = rooms.find(r => r.id === nId);
        return nRoom && nRoom.type === "bedroom";
      });
      if (allNeighborsBedrooms) {
        issues.push(`LANDLOCKED BEDROOM: "${bed.name}" can only be reached through another bedroom (${nonExteriorNeighbors.map(n => rooms.find(r=>r.id===n)?.name).join(", ")}). It MUST connect to a hallway or common area.`);
      }
    }
  }

  // 4. Check rooms without any doors
  for (const room of rooms) {
    const neighborCount = (adjacency[room.id] || new Set()).size;
    if (neighborCount === 0 && room.type !== "closet") {
      issues.push(`NO DOORS: "${room.name}" (${room.type}) has zero doors. Every room needs at least one door.`);
    }
  }

  // 5. Check exterior spaces are on perimeter
  const totalWidth = Math.max(...rooms.map(r => r.x + r.width));
  const totalHeight = Math.max(...rooms.map(r => r.y + r.height));
  const minX = Math.min(...rooms.map(r => r.x));
  const minY = Math.min(...rooms.map(r => r.y));

  for (const room of rooms) {
    // Check if room name suggests it's an exterior space
    const nameLC = room.name.toLowerCase();
    const isExterior = nameLC.includes("deck") || nameLC.includes("patio") || nameLC.includes("porch");
    if (isExterior) {
      const touchesEdge = room.x <= minX || room.y <= minY ||
        (room.x + room.width) >= totalWidth || (room.y + room.height) >= totalHeight;
      if (!touchesEdge) {
        issues.push(`INTERIOR EXTERIOR SPACE: "${room.name}" is an outdoor space but is surrounded by other rooms. It MUST be on the perimeter of the house with at least one side open to the outside.`);
      }
    }
  }

  // 6. Check garage connectivity AND perimeter placement
  const garages = rooms.filter(r => r.type === "garage");
  for (const garage of garages) {
    const neighbors = [...(adjacency[garage.id] || [])].filter(n => n !== "exterior");
    if (neighbors.length === 0) {
      const nearbyRooms = rooms.filter(r => r.id !== garage.id && sharesWall(garage, r));
      if (nearbyRooms.length > 0) {
        issues.push(`DISCONNECTED GARAGE: "${garage.name}" shares a wall with ${nearbyRooms.map(r => r.name).join(", ")} but has no door connecting them. Add a door to connect the garage to the house.`);
      } else {
        issues.push(`DETACHED GARAGE: "${garage.name}" doesn't share any wall with the house. Move it adjacent to the house or add a connecting hallway.`);
      }
    }

    // NEW: Check perimeter placement — garage must touch exterior bounding box
    const touchesEdge =
      garage.x <= minX + 2 ||
      garage.y <= minY + 2 ||
      (garage.x + garage.width) >= totalWidth - 2 ||
      (garage.y + garage.height) >= totalHeight - 2;

    if (!touchesEdge) {
      issues.push(`INTERIOR GARAGE: "${garage.name}" is surrounded by other rooms. A garage MUST be on the outer perimeter of the house so vehicles can enter. Move it to the edge of the floor plan.`);
    }
  }

  // 6b. Check bathroom accessibility
  const bathrooms = rooms.filter(r => r.type === "bathroom");
  for (const bath of bathrooms) {
    const neighbors = adjacency[bath.id] || new Set();
    const nonExteriorNeighbors = [...neighbors].filter(n => n !== "exterior");

    if (nonExteriorNeighbors.length > 0) {
      const connectedRooms = nonExteriorNeighbors.map(nId => rooms.find(r => r.id === nId)!).filter(Boolean);
      const connectedToCommon = connectedRooms.some(r => COMMON_ROOM_TYPES.has(r.type));
      const connectedToBedrooms = connectedRooms.filter(r => r.type === "bedroom");

      // If connected to multiple bedrooms and NO hallway/common area — awkward layout
      if (!connectedToCommon && connectedToBedrooms.length > 1) {
        issues.push(`AWKWARD BATHROOM: "${bath.name}" is only accessible by walking through multiple bedrooms (${connectedToBedrooms.map(b => b.name).join(", ")}). Ensure at least one door connects to a hallway, or restrict it to a single bedroom en-suite.`);
      }

      // Trapped behind utility room
      const trappedInUtility = connectedRooms.every(r => r.type === "laundry" || r.type === "closet");
      if (trappedInUtility) {
        issues.push(`TRAPPED BATHROOM: "${bath.name}" is only accessible through a closet or laundry room. It must connect to a hallway, bedroom, or living area.`);
      }
    }
  }

  // 7. Check for rooms that share walls but have no doors (potential missing connections)
  for (const room of rooms) {
    if (room.type === "hallway") {
      const wallSharers = rooms.filter(r => r.id !== room.id && sharesWall(room, r));
      for (const sharer of wallSharers) {
        const hasDoor = doors.some(d =>
          (d.roomId1 === room.id && d.roomId2 === sharer.id) ||
          (d.roomId1 === sharer.id && d.roomId2 === room.id)
        );
        if (!hasDoor && (sharer.type === "bedroom" || sharer.type === "bathroom")) {
          suggestions.push(`"${sharer.name}" shares a wall with "${room.name}" but has no door. Consider adding a door to connect them.`);
        }
      }
    }
  }

  // 8. Overlap check
  const overlapWarnings = validateFloorPlanRooms(rooms);
  issues.push(...overlapWarnings);

  // 9. Dead space detection — find large unused areas inside the bounding box
  // Use a simple grid-based approach (100cm cells)
  const CELL = 100; // 1m cells
  const gridW = Math.ceil(totalWidth / CELL);
  const gridH = Math.ceil(totalHeight / CELL);
  if (gridW > 0 && gridH > 0 && gridW < 200 && gridH < 200) {
    const grid = new Uint8Array(gridW * gridH); // 0 = empty, 1 = occupied
    for (const room of rooms) {
      const x1 = Math.floor((room.x - minX) / CELL);
      const y1 = Math.floor((room.y - minY) / CELL);
      const x2 = Math.ceil((room.x + room.width - minX) / CELL);
      const y2 = Math.ceil((room.y + room.height - minY) / CELL);
      for (let gy = Math.max(0, y1); gy < Math.min(gridH, y2); gy++) {
        for (let gx = Math.max(0, x1); gx < Math.min(gridW, x2); gx++) {
          grid[gy * gridW + gx] = 1;
        }
      }
    }
    // Find connected empty regions using flood fill
    const visited2 = new Uint8Array(gridW * gridH);
    const emptyRegions: { cells: number; minX: number; minY: number; maxX: number; maxY: number }[] = [];
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const idx = gy * gridW + gx;
        if (grid[idx] === 0 && visited2[idx] === 0) {
          // Check if this empty cell is on the exterior edge — if so, it's expected (non-rectangular footprint)
          // Flood fill to find the region
          let cells = 0;
          let rMinX = gx, rMinY = gy, rMaxX = gx, rMaxY = gy;
          let touchesExterior = false;
          const stack = [{ x: gx, y: gy }];
          visited2[gy * gridW + gx] = 1;
          while (stack.length > 0) {
            const { x, y } = stack.pop()!;
            cells++;
            if (x < rMinX) rMinX = x;
            if (y < rMinY) rMinY = y;
            if (x > rMaxX) rMaxX = x;
            if (y > rMaxY) rMaxY = y;
            // Check if on grid edge (exterior)
            if (x === 0 || y === 0 || x === gridW - 1 || y === gridH - 1) touchesExterior = true;
            for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
                const ni = ny * gridW + nx;
                if (grid[ni] === 0 && visited2[ni] === 0) {
                  visited2[ni] = 1;
                  stack.push({ x: nx, y: ny });
                }
              }
            }
          }
          // Only flag INTERIOR dead spaces (not touching exterior edge) that are significant (>2 sq meters)
          if (!touchesExterior && cells >= 2) {
            const areaSqm = cells; // each cell is ~1m²
            const centerX = Math.round((rMinX + rMaxX) / 2 * CELL + minX);
            const centerY = Math.round((rMinY + rMaxY) / 2 * CELL + minY);
            issues.push(`DEAD SPACE: ~${areaSqm}m² of unused interior space near (${centerX}, ${centerY})cm. This is unbuildable — every interior area must be assigned to a room. Either expand adjacent rooms to fill this gap or add a utility room/closet.`);
          }
        }
      }
    }
  }

  // 10. Check that small rooms (pantry, closet, laundry) are not creating unbuildable gaps
  // A room should have at least one wall shared with another room (not floating in space)
  for (const room of rooms) {
    const hasSharedWall = rooms.some(r => r.id !== room.id && sharesWall(room, r));
    if (!hasSharedWall) {
      issues.push(`FLOATING ROOM: "${room.name}" doesn't share any wall with other rooms. Every room must be physically connected to the house structure.`);
    }
  }

  return { issues, suggestions };
}

function sharesWall(a: FloorPlanRoom, b: FloorPlanRoom): boolean {
  // Check if two rooms share a wall edge (touching, not overlapping)
  const TOLERANCE = 2;
  // Vertical shared wall (a's right = b's left or vice versa)
  const verticalShare = (
    (Math.abs((a.x + a.width) - b.x) < TOLERANCE || Math.abs((b.x + b.width) - a.x) < TOLERANCE) &&
    Math.max(a.y, b.y) < Math.min(a.y + a.height, b.y + b.height) - TOLERANCE
  );
  // Horizontal shared wall (a's bottom = b's top or vice versa)
  const horizontalShare = (
    (Math.abs((a.y + a.height) - b.y) < TOLERANCE || Math.abs((b.y + b.height) - a.y) < TOLERANCE) &&
    Math.max(a.x, b.x) < Math.min(a.x + a.width, b.x + b.width) - TOLERANCE
  );
  return verticalShare || horizontalShare;
}

// ─── Floor Plan Tools ───────────────────────────────────────────────────────
const floorPlanTools = [
  {
    type: "function",
    function: {
      name: "generate_floor_plan",
      description: `Generate a complete floor plan. CRITICAL RULES for room placement:
1. Rooms MUST share exact wall edges — no gaps between adjacent rooms.
2. Rooms MUST NOT overlap (except sharing a wall edge at exactly the same coordinate).
3. Design CREATIVE, NON-RECTANGULAR layouts. Real houses have L-shapes, T-shapes, bump-outs, and staggered walls. NEVER make a perfect rectangle or grid.
4. Use a hallway (120-150cm wide) as the SPINE connecting bedrooms and bathrooms. EVERY bedroom must connect to a hallway or common area — NEVER require walking through one bedroom to reach another.
5. Vary room depths and widths — not all rooms in a row should have the same height.
6. Total dimensions should reflect realistic house sizes (e.g., a 1500sqft house ≈ 14m × 10m).
7. Extend some rooms (garage, master suite, living room) beyond the main wall line to create architectural interest.
8. EXTERIOR SPACES (decks, patios) MUST be on the perimeter of the house with at least one side open to the outside. Decks typically go on the BACK, porches on the FRONT. NEVER place a deck in the interior of the house.
9. Kitchen should be adjacent to dining/living areas. Butler's pantry goes BETWEEN kitchen and dining room. Laundry near bedrooms or kitchen. Garage connects via entry or mudroom, NEVER through a bedroom.`,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name for the floor plan" },
          rooms: {
            type: "array",
            description: "Array of rooms. Rooms MUST tile together with shared edges. Use precise coordinates so adjacent rooms share exact wall positions.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: [...ROOM_TYPES] },
                x: { type: "number", description: "X position in cm from left edge" },
                y: { type: "number", description: "Y position in cm from top edge" },
                width: { type: "number", description: "Width in cm (horizontal extent)" },
                height: { type: "number", description: "Height in cm (vertical extent)" },
              },
              required: ["name", "type", "x", "y", "width", "height"],
              additionalProperties: false,
            },
          },
          doors: {
            type: "array",
            description: "Doors between rooms. Position on shared wall edges.",
            items: {
              type: "object",
              properties: {
                roomId1_index: { type: "number", description: "Index of first room in rooms array" },
                roomId2_index: { type: "number", description: "Index of second room (-1 for exterior)" },
                x: { type: "number", description: "X position of door center on wall" },
                y: { type: "number", description: "Y position of door center on wall" },
                width: { type: "number", description: "Door width in cm (typically 90)" },
                orientation: { type: "string", enum: ["horizontal", "vertical"] },
              },
              required: ["roomId1_index", "roomId2_index", "x", "y", "width", "orientation"],
              additionalProperties: false,
            },
          },
          windows: {
            type: "array",
            description: "Windows on exterior walls only.",
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
      description: "Add a single room to the existing floor plan. Ensure it shares edges with existing rooms.",
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
      description: "Resize an existing room by ID.",
      parameters: {
        type: "object",
        properties: {
          room_id: { type: "string" },
          width: { type: "number" },
          height: { type: "number" },
          x: { type: "number" },
          y: { type: "number" },
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
        properties: { room_id: { type: "string" } },
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
  {
    type: "function",
    function: {
      name: "validate_floor_plan",
      description: `INSPECTOR TOOL — You MUST call this after generate_floor_plan and after making significant changes (adding/moving/removing rooms or doors). This validates:
1. Room connectivity — every room is reachable from the entry via doors
2. No landlocked bedrooms — bedrooms must connect to hallway/common area, not only through other bedrooms
3. Exterior spaces on perimeter — decks/patios are on the house edge
4. Garage connection — garage connects to the house
5. Missing doors — rooms sharing walls without doors
6. Overlapping rooms

If issues are found, you MUST fix them by adding doors, moving rooms, or restructuring the layout. Then call validate_floor_plan again to confirm fixes.`,
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
];

// ─── Furniture Tools ────────────────────────────────────────────────────────
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

// ─── Door & Window Auto-Correction ──────────────────────────────────────────

/** Find the shared wall segment between two rooms. Returns null if they don't share a wall. */
function findSharedWall(r1: FloorPlanRoom, r2: FloorPlanRoom): { orientation: "horizontal" | "vertical"; x: number; y: number; length: number } | null {
  const TOLERANCE = 5;
  // Vertical shared wall: r1's right = r2's left or vice versa
  if (Math.abs((r1.x + r1.width) - r2.x) < TOLERANCE) {
    const overlapStart = Math.max(r1.y, r2.y);
    const overlapEnd = Math.min(r1.y + r1.height, r2.y + r2.height);
    if (overlapEnd - overlapStart > 10) {
      return { orientation: "vertical", x: r1.x + r1.width, y: overlapStart, length: overlapEnd - overlapStart };
    }
  }
  if (Math.abs((r2.x + r2.width) - r1.x) < TOLERANCE) {
    const overlapStart = Math.max(r1.y, r2.y);
    const overlapEnd = Math.min(r1.y + r1.height, r2.y + r2.height);
    if (overlapEnd - overlapStart > 10) {
      return { orientation: "vertical", x: r1.x, y: overlapStart, length: overlapEnd - overlapStart };
    }
  }
  // Horizontal shared wall: r1's bottom = r2's top or vice versa
  if (Math.abs((r1.y + r1.height) - r2.y) < TOLERANCE) {
    const overlapStart = Math.max(r1.x, r2.x);
    const overlapEnd = Math.min(r1.x + r1.width, r2.x + r2.width);
    if (overlapEnd - overlapStart > 10) {
      return { orientation: "horizontal", x: overlapStart, y: r1.y + r1.height, length: overlapEnd - overlapStart };
    }
  }
  if (Math.abs((r2.y + r2.height) - r1.y) < TOLERANCE) {
    const overlapStart = Math.max(r1.x, r2.x);
    const overlapEnd = Math.min(r1.x + r1.width, r2.x + r2.width);
    if (overlapEnd - overlapStart > 10) {
      return { orientation: "horizontal", x: overlapStart, y: r1.y, length: overlapEnd - overlapStart };
    }
  }
  return null;
}

/** Snap a door to the correct position on the shared wall between its two rooms */
function snapDoorToWall(door: FloorPlanDoor, rooms: FloorPlanRoom[]): FloorPlanDoor {
  const room1 = rooms.find(r => r.id === door.roomId1);
  const room2 = rooms.find(r => r.id === door.roomId2);
  
  if (door.roomId1 === "exterior" || door.roomId2 === "exterior") {
    // Exterior door — snap to the room's exterior wall
    const room = room1 || room2;
    if (!room) return door;
    return snapDoorToExteriorWall(door, room);
  }
  
  if (!room1 || !room2) return door;
  
  const wall = findSharedWall(room1, room2);
  if (!wall) return door; // Can't find shared wall, keep as-is
  
  const corrected = { ...door, orientation: wall.orientation };
  if (wall.orientation === "horizontal") {
    corrected.y = wall.y;
    // Center door along the shared wall segment
    const wallCenter = wall.x + wall.length / 2;
    corrected.x = Math.round(wallCenter - door.width / 2);
    // Clamp to wall bounds
    corrected.x = Math.max(wall.x + 10, Math.min(corrected.x, wall.x + wall.length - door.width - 10));
  } else {
    corrected.x = wall.x;
    const wallCenter = wall.y + wall.length / 2;
    corrected.y = Math.round(wallCenter - door.width / 2);
    corrected.y = Math.max(wall.y + 10, Math.min(corrected.y, wall.y + wall.length - door.width - 10));
  }
  return corrected;
}

function snapDoorToExteriorWall(door: FloorPlanDoor, room: FloorPlanRoom): FloorPlanDoor {
  // Find which exterior wall is closest to the door's current position
  const distances = [
    { wall: "north" as const, dist: Math.abs(door.y - room.y), orientation: "horizontal" as const, y: room.y, x: room.x + room.width / 2 - door.width / 2 },
    { wall: "south" as const, dist: Math.abs(door.y - (room.y + room.height)), orientation: "horizontal" as const, y: room.y + room.height, x: room.x + room.width / 2 - door.width / 2 },
    { wall: "west" as const, dist: Math.abs(door.x - room.x), orientation: "vertical" as const, x: room.x, y: room.y + room.height / 2 - door.width / 2 },
    { wall: "east" as const, dist: Math.abs(door.x - (room.x + room.width)), orientation: "vertical" as const, x: room.x + room.width, y: room.y + room.height / 2 - door.width / 2 },
  ];
  distances.sort((a, b) => a.dist - b.dist);
  const best = distances[0];
  return { ...door, x: Math.round(best.x), y: Math.round(best.y), orientation: best.orientation };
}

/** Snap a window to the correct position on the room's exterior wall */
function snapWindowToWall(win: FloorPlanWindow, room: FloorPlanRoom): FloorPlanWindow {
  if (!room) return win;
  const corrected = { ...win };
  switch (win.wall) {
    case "north":
      corrected.y = room.y;
      corrected.x = Math.max(room.x + 15, Math.min(Math.round(win.x), room.x + room.width - win.width - 15));
      corrected.orientation = "horizontal";
      break;
    case "south":
      corrected.y = room.y + room.height;
      corrected.x = Math.max(room.x + 15, Math.min(Math.round(win.x), room.x + room.width - win.width - 15));
      corrected.orientation = "horizontal";
      break;
    case "west":
      corrected.x = room.x;
      corrected.y = Math.max(room.y + 15, Math.min(Math.round(win.y), room.y + room.height - win.width - 15));
      corrected.orientation = "vertical";
      break;
    case "east":
      corrected.x = room.x + room.width;
      corrected.y = Math.max(room.y + 15, Math.min(Math.round(win.y), room.y + room.height - win.width - 15));
      corrected.orientation = "vertical";
      break;
  }
  return corrected;
}

// ─── Floor Plan Tool Processor ──────────────────────────────────────────────
function processFloorPlanTool(
  name: string, args: Record<string, unknown>, floorPlan: FloorPlan
): { result: string; floorPlan: FloorPlan; action?: string } {
  switch (name) {
    case "generate_floor_plan": {
      const rooms: FloorPlanRoom[] = (args.rooms as any[]).map((r) => ({
        id: generateId(),
        name: r.name,
        type: r.type,
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      }));

      const warnings = validateFloorPlanRooms(rooms);

      const totalWidth = Math.max(...rooms.map(r => r.x + r.width));
      const totalHeight = Math.max(...rooms.map(r => r.y + r.height));

      // Create doors and auto-snap to shared walls
      let doors: FloorPlanDoor[] = ((args.doors as any[]) || []).map((d) => ({
        id: generateId(),
        roomId1: d.roomId1_index >= 0 ? rooms[d.roomId1_index]?.id || "exterior" : "exterior",
        roomId2: d.roomId2_index >= 0 ? rooms[d.roomId2_index]?.id || "exterior" : "exterior",
        x: Math.round(d.x),
        y: Math.round(d.y),
        width: Math.round(d.width),
        orientation: d.orientation,
      }));
      // Auto-correct door positions to be on shared walls
      doors = doors.map(d => snapDoorToWall(d, rooms));

      // Create windows and auto-snap to exterior walls
      let windows: FloorPlanWindow[] = ((args.windows as any[]) || []).map((w) => ({
        id: generateId(),
        roomId: w.roomId_index >= 0 ? rooms[w.roomId_index]?.id || "" : "",
        x: Math.round(w.x),
        y: Math.round(w.y),
        width: Math.round(w.width),
        orientation: w.orientation,
        wall: w.wall,
      }));
      // Auto-correct window positions to be on room walls
      windows = windows.map(w => {
        const room = rooms.find(r => r.id === w.roomId);
        return room ? snapWindowToWall(w, room) : w;
      });

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
      
      // Auto-run inspection on the generated plan
      const inspection = inspectFloorPlan(newPlan);
      
      let resultStr = JSON.stringify({
        success: true,
        rooms: rooms.length,
        doors: doors.length,
        windows: windows.length,
        totalSqft,
        room_ids: rooms.map(r => ({ id: r.id, name: r.name })),
        warnings: warnings.length > 0 ? warnings : undefined,
        inspection: {
          passed: inspection.issues.length === 0,
          issues: inspection.issues,
          suggestions: inspection.suggestions,
          note: inspection.issues.length > 0
            ? "CRITICAL: The floor plan has issues. You MUST fix them NOW by adding doors, moving rooms, etc. Then call validate_floor_plan to confirm."
            : "Floor plan passed all checks!",
        },
      });

      return {
        result: resultStr,
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
      const updatedRooms = [...floorPlan.rooms, room];
      const warnings = validateFloorPlanRooms(updatedRooms);
      const updated = {
        ...floorPlan,
        rooms: updatedRooms,
        totalWidth: Math.max(floorPlan.totalWidth, room.x + room.width),
        totalHeight: Math.max(floorPlan.totalHeight, room.y + room.height),
      };
      return {
        result: JSON.stringify({ success: true, room_id: id, warnings: warnings.length > 0 ? warnings : undefined }),
        floorPlan: updated,
        action: `Added ${room.name}`,
      };
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
      let door: FloorPlanDoor = {
        id: generateId(),
        roomId1: args.room_id_1 as string,
        roomId2: args.room_id_2 as string,
        x: Math.round(args.x as number),
        y: Math.round(args.y as number),
        width: Math.round(args.width as number),
        orientation: args.orientation as "horizontal" | "vertical",
      };
      door = snapDoorToWall(door, floorPlan.rooms);
      return {
        result: JSON.stringify({ success: true, door_id: door.id }),
        floorPlan: { ...floorPlan, doors: [...floorPlan.doors, door] },
        action: `Added door`,
      };
    }

    case "add_window": {
      let win: FloorPlanWindow = {
        id: generateId(),
        roomId: args.room_id as string,
        x: Math.round(args.x as number),
        y: Math.round(args.y as number),
        width: Math.round(args.width as number),
        orientation: args.orientation as "horizontal" | "vertical",
        wall: args.wall as "north" | "south" | "east" | "west",
      };
      const winRoom = floorPlan.rooms.find(r => r.id === win.roomId);
      if (winRoom) win = snapWindowToWall(win, winRoom);
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

    case "validate_floor_plan": {
      const inspection = inspectFloorPlan(floorPlan);
      const passed = inspection.issues.length === 0;
      return {
        result: JSON.stringify({
          passed,
          issues: inspection.issues,
          suggestions: inspection.suggestions,
          summary: passed
            ? "✅ Floor plan passed all validation checks!"
            : `❌ Found ${inspection.issues.length} issue(s) that MUST be fixed. Read each issue and fix them by adding doors, moving rooms, or restructuring. Then call validate_floor_plan again.`,
        }),
        floorPlan,
        action: passed ? "✅ Floor plan validated — all checks passed" : `🔍 Inspector found ${inspection.issues.length} issue(s) to fix`,
      };
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
    parts.push({ type: "image_url", image_url: { url: img.startsWith("data:") ? img : `data:image/png;base64,${img}` } });
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

  return `You are an expert residential floor plan architect AI with VISION capabilities. You design precise, realistic house floor plans.

YOU HAVE TWO INFORMATION SOURCES:
1. A SCREENSHOT IMAGE of the current canvas (visual — examine it carefully!)
2. PRECISE COORDINATE DATA below (numerical — use for exact positions)

═══ FLOOR PLAN: "${floorPlan.name}" ═══
Bounding box: ${floorPlan.totalWidth}cm × ${floorPlan.totalHeight}cm
${roomsSummary}
Doors: ${floorPlan.doors.length}
Windows: ${floorPlan.windows.length}

═══ COORDINATE SYSTEM ═══
Origin (0,0) = top-left corner. X → right, Y → down. All values in cm.
Room positions are their top-left corner.
100cm = 1 meter ≈ 3.28 feet. 1 sqft ≈ 929 cm². 1 ft ≈ 30.48cm.

═══ ROOM TYPES ═══
${ROOM_TYPES.join(", ")}

═══ CRITICAL PLACEMENT RULES ═══

**RULE 1: SHARED WALLS — NO GAPS**
Adjacent rooms MUST share exact wall edges. If Room A ends at x=500 and Room B is next to it, Room B starts at x=500.

**RULE 2: NO OVERLAPPING ROOMS**
Rooms must never overlap.

**RULE 3: REALISTIC PROPORTIONS**
Use these as MINIMUM sizes (convert sqft → cm² by ×929):
  - Master Bedroom: 400-500cm × 400-500cm (170-270 sqft)
  - Bedroom: 300-400cm × 350-400cm (110-170 sqft)  
  - Bathroom: 200-300cm × 200-300cm (40-100 sqft)
  - Kitchen: 300-400cm × 300-400cm (100-170 sqft)
  - Living Room: 500-700cm × 400-500cm (215-375 sqft)
  - Garage: 500-700cm × 550-650cm (300-490 sqft)
  - Hallway: 120-150cm wide × length as needed
  - Closet: 150-200cm × 150-250cm (25-55 sqft)
  - Laundry: 200-250cm × 200-300cm (45-80 sqft)
  - Pantry: 150-200cm × 150-200cm (25-45 sqft)
  - Entry: 150-250cm × 150-250cm (25-70 sqft)

**RULE 4: CREATIVE, NON-RECTANGULAR LAYOUTS (VERY IMPORTANT)**
Real houses are NEVER perfect rectangles. You MUST design layouts with architectural character:
  - Create L-shaped, T-shaped, or U-shaped overall footprints by leaving gaps in the bounding box (not every corner needs a room).
  - Bump-outs: extend some rooms (e.g., master bedroom, living room, garage) beyond the main wall line by 100-200cm to create visual interest.
  - Staggered walls: not all rooms on the same row need identical depths. Vary room heights so the exterior silhouette is irregular.
  - Bay/nook extensions: a kitchen or dining room might extend outward from the main body.
  - Setbacks: the garage or a wing of bedrooms can be set back from the front facade.
  - Vary room dimensions — avoid making rooms the same width/height. Real homes have variety.
  
  EXAMPLES of non-rectangular techniques:
  - Garage protrudes 150cm forward from the main facade
  - Master suite extends 200cm beyond the back wall of the rest of the house
  - Living room has a bump-out bay window alcove
  - Bedroom wing is offset from the main body, connected by a short hallway
  - Entry foyer recesses 100cm inward, creating a covered porch effect
  
  DO NOT just stack rooms in a perfect grid. Think like a real architect designing a home with curb appeal.

**RULE 4B: NO DEAD SPACE (CRITICAL)**
Every square meter INSIDE the house footprint must be assigned to a room. If you place a small room (butler's pantry, closet) that doesn't span the full width/height between its neighbors, you create unbuildable dead space — walls with nothing behind them. 
  - When placing a room between two others, make sure it fills the entire gap OR adjacent rooms extend to fill remaining space.
  - A butler's pantry between kitchen and dining should span the full depth between the hallway and the exterior wall, not leave empty gaps on either side.
  - If a room is narrower than the space available, expand it or add a closet/utility room to fill the gap.
  - Think about what a BUILDER would see: every wall must have a room on both sides (or be an exterior wall).

**RULE 5: ROOM ACCESSIBILITY — EVERY ROOM MUST BE REACHABLE (CRITICAL)**
Think about how a person WALKS through the house. Every room must be accessible without passing through another private room:
  - EVERY bedroom MUST connect to a hallway or common area (living room, entry). NEVER place a bedroom behind another bedroom — no one should walk through someone's bedroom to reach another.
  - Bathrooms should connect to a hallway OR directly to their associated bedroom (en-suite), NOT only accessible through an unrelated room.
  - The hallway is the SPINE of the house. It connects bedrooms, bathrooms, and the main living area.
  - Closets and en-suite bathrooms CAN be accessed only through their parent bedroom — that is the ONLY exception.
  - Think about door placement: if two rooms share a wall but there's no door, they are NOT connected.

**RULE 6: EXTERIOR SPACES (DECKS, PATIOS, PORCHES)**
  - Decks, patios, and porches are OUTDOOR spaces. They MUST be on the PERIMETER of the house, touching an exterior edge.
  - A deck should NEVER be surrounded by rooms on all sides — it must have at least one side open to the outside (yard).
  - Typically decks are attached to the BACK of the house, accessible from the living room, kitchen, or dining room.
  - Porches go at the FRONT near the entry.
  - Decks/patios should NOT be counted in interior square footage.

**RULE 7: LOGICAL ROOM ADJACENCY**
  - Kitchen should be adjacent to or open to the dining room and/or living room (especially for "open concept").
  - Butler's pantry connects kitchen to dining room — it should be between them, not isolated.
  - Laundry room should be near bedrooms or kitchen, NOT in the middle of living spaces.
  - Garage connects to the house via entry, mudroom, or kitchen — NOT through a bedroom.
  - Master bathroom and master closet should be accessible FROM the master bedroom only.
  - Entry/foyer should be near the front of the house, connecting to the main living area.

**RULE 10: GARAGE PERIMETER (CRITICAL)**
  - Garages MUST share an exterior wall with the absolute outside of the house footprint. Never place a garage entirely surrounded by other rooms. Cars must be able to drive in from outside.

**RULE 11: BATHROOM ACCESSIBILITY (CRITICAL)**
  - Guest bathrooms MUST connect to a hallway or common area (living room, entry). They should NOT be accessible only through an unrelated room.
  - En-suite bathrooms MUST connect to exactly ONE bedroom. If a bathroom connects to multiple bedrooms without a hallway connection, that's an awkward layout.
  - Bathrooms must NEVER be trapped behind closets, laundry rooms, or utility spaces.

**RULE 8: SKETCH INTERPRETATION**
When the user uploads a floor plan image/sketch:
1. Study every room label, dimension annotation, and spatial relationship.
2. Count all rooms and identify their types from labels.
3. Measure RELATIVE proportions between rooms.
4. Preserve the EXACT spatial layout.
5. If dimensions are labeled, convert: feet × 30.48 = cm.
6. Reproduce the exact room arrangement.
7. Pay attention to hallways connecting rooms.

**RULE 9: HALLWAYS**
Use hallways (120-150cm wide) as the SPINE to connect bedrooms and bathrooms to the main living area. Every private room must be reachable from the hallway without passing through another private room.

═══ TOOLS ═══
1. **generate_floor_plan** — Create an entire floor plan.
2. **add_room** / **remove_room** / **resize_room** / **move_room** — Modify individual rooms.
3. **add_door** / **add_window** — Add doors and windows.
4. **list_rooms** — Inspect current layout.
5. **validate_floor_plan** — 🔍 INSPECTOR TOOL. Run after generating or significantly modifying the floor plan.

═══ MANDATORY VALIDATION WORKFLOW ═══
After calling generate_floor_plan, you MUST:
1. Call **validate_floor_plan** to inspect the result.
2. If issues are found, FIX them (add missing doors, move rooms, restructure layout).
3. Call **validate_floor_plan** AGAIN to confirm all issues are resolved.
4. Repeat until validation passes with zero issues.
This ensures every floor plan has proper room connectivity, no landlocked bedrooms, and logical flow.

═══ DOOR PLACEMENT ═══
- Doors go on SHARED WALLS between adjacent rooms.
- Horizontal door = horizontal shared edge. Vertical door = vertical shared edge.
- Exterior doors: use roomId2_index = -1.

═══ WINDOW PLACEMENT ═══
- Windows only on EXTERIOR walls.
- wall="north" = top edge, "south" = bottom, "east" = right, "west" = left.

═══ RESPONSE RULES ═══
1. ALWAYS execute tools when the user asks you to DO something.
2. Be conversational and brief (1-3 sentences after executing actions).
3. When recreating a sketch, describe what you see first, then generate the plan.
4. All coordinates must be whole numbers.
5. If the floor plan has issues (gaps, overlaps), fix them proactively.
6. ALWAYS call validate_floor_plan after generate_floor_plan — no exceptions.`;
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
${Object.entries(ASSET_CATALOG).filter(([,v]) => !v.isWallElement).map(([k, v]) => `• ${k}: "${v.label}" ${v.width}×${v.height}cm`).join("\n")}

═══ RULES ═══
1. Calculate positions before placing. Item anchor = top-left corner.
2. Keep 5-10cm gaps between items.
3. If placement fails, correct and retry once.
4. Brief responses (1-3 sentences) after actions.
5. ALWAYS execute tools when asked to DO something.
6. "slightly/a bit" = 15-30cm. "a lot" = 80-120cm.
7. Against back wall: y=0. Against left wall: x=0. Against right wall: x=roomWidth-itemWidth.`;
}

// ─── SSE Helper ─────────────────────────────────────────────────────────────
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Main Handler ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages: userMessages, mode, roomState, floorPlan, roomName, canvasScreenshot, images: userImages, hasReferenceSketch } = body;

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

    // Use Flash for text-only requests, Pro only when user uploads images (sketches)
    const hasUserImages = userImages && userImages.length > 0;
    const model = hasUserImages ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";

    // Build messages
    const aiMessages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
    ];

    for (let i = 0; i < userMessages.length; i++) {
      const msg = userMessages[i];
      if (i === userMessages.length - 1 && msg.role === "user") {
        const allImages: string[] = [];
        // Only include screenshot if floor plan has rooms (skip empty canvas)
        if (canvasScreenshot && !(isFloorPlanMode && currentFloorPlan.rooms.length === 0)) {
          allImages.push(canvasScreenshot);
        }
        if (userImages && userImages.length > 0) allImages.push(...userImages);
        
        let messageText = msg.content;
        if (hasReferenceSketch && allImages.length > 1) {
          messageText = `[REFERENCE: The second image is the ORIGINAL SKETCH that this floor plan is based on. Compare your current layout against it and fix any discrepancies the user mentions.]\n\n${messageText}`;
        }
        
        aiMessages.push({ role: "user", content: buildUserContent(messageText, allImages) });
      } else {
        aiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // ─── Streaming SSE Response ─────────────────────────────────────────────
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let finalContent = "";
          const MAX_ITERATIONS = 20;

          let consecutiveFailures = 0;

          for (let i = 0; i < MAX_ITERATIONS; i++) {
            // Send progress event
            if (i > 0) {
              controller.enqueue(encoder.encode(sseEvent("progress", { 
                step: i, 
                actions: actionLog.slice(-3) 
              })));
            }

            // Circuit breaker: stop after 3 consecutive failed validations
            if (isFloorPlanMode && consecutiveFailures >= 3) {
              console.log("Circuit breaker tripped — 3 consecutive validation failures");
              finalContent = "I apologize, but I got stuck trying to resolve some architectural conflicts with this specific layout. Could we try starting over with a slightly simpler description?";
              break;
            }

            // Force tool use on first call when no actions taken yet
            const currentToolChoice = (i === 0 && actionLog.length === 0) ? "required" : "auto";

            const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages: aiMessages,
                tools,
                tool_choice: currentToolChoice,
              }),
            });

            if (!response.ok) {
              const status = response.status;
              if (status === 429) {
                controller.enqueue(encoder.encode(sseEvent("error", { error: "Rate limit reached. Please wait." })));
                controller.close();
                return;
              }
              if (status === 402) {
                controller.enqueue(encoder.encode(sseEvent("error", { error: "AI credits exhausted." })));
                controller.close();
                return;
              }
              const errText = await response.text();
              console.error("AI gateway error:", status, errText);
              throw new Error(`AI gateway returned ${status}`);
            }

            const data = await response.json();
            const choice = data.choices?.[0];
            if (!choice) {
              console.error("Empty AI response, full data:", JSON.stringify(data).slice(0, 500));
              throw new Error("Empty response from AI");
            }

            const msg = choice.message;
            console.log(`Iteration ${i}: finish_reason=${choice.finish_reason}, has_tool_calls=${!!(msg.tool_calls?.length)}, content_length=${msg.content?.length || 0}`);
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
                  if (action) {
                    actionLog.push(action);
                    controller.enqueue(encoder.encode(sseEvent("action", { text: action })));
                  }
                  // Circuit breaker: track consecutive validation failures
                  if (tc.function.name === "validate_floor_plan") {
                    try {
                      const parsed = JSON.parse(result);
                      if (parsed.passed === false) {
                        consecutiveFailures++;
                      } else {
                        consecutiveFailures = 0;
                      }
                    } catch {}
                  }
                  aiMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
                } else {
                  const { result, roomState: newState, action } = processFurnitureTool(tc.function.name, args, currentRoomState);
                  currentRoomState = newState;
                  if (action) {
                    actionLog.push(action);
                    controller.enqueue(encoder.encode(sseEvent("action", { text: action })));
                  }
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
            finalContent = `Done! I made ${actionLog.length} changes to the floor plan.`;
          } else if (!finalContent) {
            finalContent = "I processed your request. Take a look!";
          }

          // Send the final result with all data
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

          controller.enqueue(encoder.encode(sseEvent("result", responseBody)));
          controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
          controller.close();
        } catch (e) {
          console.error("Stream error:", e);
          controller.enqueue(encoder.encode(sseEvent("error", { error: e instanceof Error ? e.message : "Unknown error" })));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("room-architect error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
