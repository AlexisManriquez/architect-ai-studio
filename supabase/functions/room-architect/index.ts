import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-user-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  isOpening?: boolean;
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

// ─── Procedural Layout Engine ───────────────────────────────────────────────

/** Target area ratios for each room type (relative weight) */
const ROOM_AREA_WEIGHTS: Record<string, number> = {
  "living-room": 1.8,
  "kitchen": 1.2,
  "dining-room": 1.0,
  "bedroom": 1.3,
  "bathroom": 0.5,
  "office": 0.9,
  "garage": 2.2,
  "hallway": 0.4,
  "closet": 0.2,
  "laundry": 0.35,
  "entry": 0.25,
};

/** Minimum dimensions per room type in cm */
const ROOM_MIN_DIMS: Record<string, { minW: number; minH: number }> = {
  "living-room": { minW: 400, minH: 350 },
  "kitchen": { minW: 300, minH: 280 },
  "dining-room": { minW: 300, minH: 280 },
  "bedroom": { minW: 300, minH: 300 },
  "bathroom": { minW: 180, minH: 180 },
  "office": { minW: 250, minH: 250 },
  "garage": { minW: 500, minH: 500 },
  "hallway": { minW: 120, minH: 120 },
  "closet": { minW: 120, minH: 120 },
  "laundry": { minW: 180, minH: 180 },
  "entry": { minW: 150, minH: 150 },
};

interface LayoutRect {
  x: number; y: number; width: number; height: number;
}

// ─── Room Requirement Parser ────────────────────────────────────────────────
interface RoomReq { name: string; type: string; weight: number; }

interface RoomRequestInput { type: string; size?: "small" | "normal" | "large"; }

const SIZE_MULTIPLIERS: Record<string, number> = {
  small: 0.6,
  normal: 1.0,
  large: 1.6,
};

function parseRoomRequirements(requestedRooms: (string | RoomRequestInput)[]): RoomReq[] {
  return requestedRooms.map(r => {
    const roomType = typeof r === "string" ? r : r.type;
    const size = typeof r === "string" ? "normal" : (r.size || "normal");
    
    let baseType = roomType;
    const nameParts = roomType.split("-");
    if (nameParts.length > 1 && /^\d+$/.test(nameParts[nameParts.length - 1])) {
      baseType = nameParts.slice(0, -1).join("-");
    }
    if (baseType === "master-bedroom") baseType = "bedroom";
    if (baseType === "master-bathroom") baseType = "bathroom";
    const validType = ROOM_TYPES.includes(baseType as any) ? baseType : "bedroom";
    const baseWeight = ROOM_AREA_WEIGHTS[validType] || 1.0;
    const sizeMultiplier = SIZE_MULTIPLIERS[size] || 1.0;
    const weight = baseWeight * sizeMultiplier;
    const prettyName = roomType.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return { name: prettyName, type: validType, weight };
  });
}

// ─── Template-Based Zone+Spine Layout Engine ────────────────────────────────
// Replaces BSP with a deterministic architectural template:
// PRIVATE ZONE (back): Left Wing | Hallway Spine | Right Wing
// PUBLIC ZONE (front): Garage (left) | Living & Entry (right)
// Kitchen/Dining forced to right wing bottom → touches Living Area (open concept)
// Every private room borders the hallway → no isolated/walk-through rooms

const PRIVATE_WING_TYPES = new Set(["bedroom", "bathroom", "closet", "office", "laundry"]);

/**
 * Template-based procedural layout engine.
 * Uses a rigid zone topology with a central hallway spine.
 * Mathematically guarantees: no isolated rooms, no walk-through bathrooms,
 * garage on perimeter, kitchen adjacent to living area.
 */
function generateProceduralLayout(
  requestedRooms: (string | RoomRequestInput)[],
  totalSqft: number
): FloorPlanRoom[] {
  const allReqs = parseRoomRequirements(requestedRooms);

  // ── 1. Categorize rooms ──
  const garageReqs = allReqs.filter(r => r.type === "garage");
  const kitchenDiningReqs = allReqs.filter(r => r.type === "kitchen" || r.type === "dining-room");
  const privateReqs = allReqs.filter(r => PRIVATE_WING_TYPES.has(r.type));
  const outdoorReqs = allReqs.filter(r => r.type === "entry" && r.name.toLowerCase().match(/deck|patio|porch/));
  const publicReqs = allReqs.filter(r =>
    !PRIVATE_WING_TYPES.has(r.type) &&
    r.type !== "garage" &&
    r.type !== "kitchen" &&
    r.type !== "dining-room" &&
    !outdoorReqs.includes(r)
  );

  const hasGarage = garageReqs.length > 0;

  // ── 2. Calculate house dimensions from sqft ──
  // Aspect ratio ~4:5 (width slightly less than height) — realistic residential proportions
  const totalAreaCm2 = totalSqft * 929;
  const houseHeight = Math.round(Math.sqrt(totalAreaCm2 / 0.8));
  const houseWidth = Math.round(totalAreaCm2 / houseHeight);

  // ── 3. Zone heights ──
  const publicZoneFraction = 0.4;
  const privateZoneFraction = 0.6;
  const publicZoneHeight = Math.round(houseHeight * publicZoneFraction);
  const privateZoneHeight = houseHeight - publicZoneHeight;

  // ── 4. Hallway spine ──
  const hallwayWidthFraction = 0.12; // 12% of house width
  const hallwayWidth = Math.max(HALLWAY_WIDTH, Math.round(houseWidth * hallwayWidthFraction));
  const hallwayX = Math.round((houseWidth - hallwayWidth) / 2);

  const allRooms: FloorPlanRoom[] = [];

  // Only add hallway if there are 2+ private rooms to connect
  const needsHallway = privateReqs.length + kitchenDiningReqs.length >= 2;

  if (needsHallway) {
    allRooms.push({
      id: generateId(),
      name: "Hallway",
      type: "hallway",
      x: hallwayX,
      y: 0,
      width: hallwayWidth,
      height: privateZoneHeight,
    });
  }

  // ── 5. Distribute rooms into left and right wings ──
  const leftWing: RoomReq[] = [];
  const rightWing: RoomReq[] = [];
  let leftWeight = 0;
  // Kitchen/Dining always go to right wing (touching living area below)
  let rightWeight = kitchenDiningReqs.reduce((s, r) => s + r.weight, 0);

  // Balance remaining private rooms between wings
  for (const room of privateReqs) {
    if (leftWeight <= rightWeight) {
      leftWing.unshift(room); // unshift puts rooms toward back of house
      leftWeight += room.weight;
    } else {
      rightWing.unshift(room);
      rightWeight += room.weight;
    }
  }

  // Kitchen/Dining go at the END (bottom) of right wing — they'll touch the public zone
  for (const kd of kitchenDiningReqs) {
    rightWing.push(kd);
  }

  // ── 6. Pack wings vertically ──
  const leftWingWidth = needsHallway ? hallwayX : Math.round(houseWidth * 0.5);
  const rightWingX = needsHallway ? hallwayX + hallwayWidth : leftWingWidth;
  const rightWingWidth = houseWidth - rightWingX;

  // Pack left wing
  if (leftWing.length > 0) {
    const totalLeftWeight = leftWing.reduce((s, r) => s + r.weight, 0);
    let currentY = 0;
    for (let i = 0; i < leftWing.length; i++) {
      const room = leftWing[i];
      const roomHeight = i === leftWing.length - 1
        ? privateZoneHeight - currentY
        : Math.round((room.weight / totalLeftWeight) * privateZoneHeight);
      const minDims = ROOM_MIN_DIMS[room.type] || { minW: 150, minH: 150 };
      allRooms.push({
        id: generateId(),
        name: room.name,
        type: room.type,
        x: 0,
        y: currentY,
        width: Math.max(leftWingWidth, minDims.minW),
        height: Math.max(roomHeight, minDims.minH),
      });
      currentY += Math.max(roomHeight, minDims.minH);
    }
    // Adjust private zone height if rooms overflowed due to minimums
    // (handled by bounding box recalculation later)
  }

  // Pack right wing
  if (rightWing.length > 0) {
    const totalRightWeight = rightWing.reduce((s, r) => s + r.weight, 0);
    let currentY = 0;
    for (let i = 0; i < rightWing.length; i++) {
      const room = rightWing[i];
      const roomHeight = i === rightWing.length - 1
        ? privateZoneHeight - currentY
        : Math.round((room.weight / totalRightWeight) * privateZoneHeight);
      const minDims = ROOM_MIN_DIMS[room.type] || { minW: 150, minH: 150 };
      allRooms.push({
        id: generateId(),
        name: room.name,
        type: room.type,
        x: rightWingX,
        y: currentY,
        width: Math.max(rightWingWidth, minDims.minW),
        height: Math.max(roomHeight, minDims.minH),
      });
      currentY += Math.max(roomHeight, minDims.minH);
    }
  }

  // If no hallway needed (1 or 0 private rooms), pack all wing rooms across full width
  if (!needsHallway && privateReqs.length === 1) {
    // Single private room gets the full private zone
    const room = privateReqs[0];
    const minDims = ROOM_MIN_DIMS[room.type] || { minW: 150, minH: 150 };
    // Check if already added via left wing
    const alreadyAdded = allRooms.find(r => r.name === room.name && r.type === room.type);
    if (!alreadyAdded) {
      allRooms.push({
        id: generateId(),
        name: room.name,
        type: room.type,
        x: 0,
        y: 0,
        width: Math.max(houseWidth, minDims.minW),
        height: Math.max(privateZoneHeight, minDims.minH),
      });
    }
    // Kitchen/dining beside it if exists
    if (kitchenDiningReqs.length > 0 && !allRooms.find(r => kitchenDiningReqs.some(kd => kd.name === r.name))) {
      const kd = kitchenDiningReqs[0];
      allRooms.push({
        id: generateId(),
        name: kd.name,
        type: kd.type,
        x: 0,
        y: privateZoneHeight - Math.round(privateZoneHeight * 0.4),
        width: houseWidth,
        height: Math.round(privateZoneHeight * 0.4),
      });
    }
  }

  // ── 7. Public Zone (bottom of house) ──
  // Recalculate the actual private zone bottom edge (might differ from planned due to min dims)
  const privateBottom = allRooms.length > 0
    ? Math.max(...allRooms.map(r => r.y + r.height))
    : privateZoneHeight;
  const publicY = privateBottom;

  if (hasGarage) {
    const garageWidthFraction = 0.35;
    const garageWidth = Math.max(
      ROOM_MIN_DIMS["garage"]?.minW || 500,
      Math.round(houseWidth * garageWidthFraction)
    );
    const garageHeight = Math.max(
      ROOM_MIN_DIMS["garage"]?.minH || 500,
      publicZoneHeight
    );

    allRooms.push({
      id: generateId(),
      name: garageReqs[0].name,
      type: "garage",
      x: 0,
      y: publicY,
      width: garageWidth,
      height: garageHeight,
    });

    const livingX = garageWidth;
    const livingWidth = houseWidth - garageWidth;

    // Entry + Living in remaining space
    const entryReq = publicReqs.find(r => r.type === "entry");
    const livingReqs = publicReqs.filter(r => r.type !== "entry");

    if (entryReq && livingReqs.length > 0) {
      // Entry at the front (bottom), living above
      const entryHeight = Math.round(garageHeight * 0.25);
      allRooms.push({
        id: generateId(),
        name: entryReq.name,
        type: "entry",
        x: livingX,
        y: publicY + garageHeight - entryHeight,
        width: livingWidth,
        height: entryHeight,
      });
      allRooms.push({
        id: generateId(),
        name: livingReqs[0].name,
        type: livingReqs[0].type,
        x: livingX,
        y: publicY,
        width: livingWidth,
        height: garageHeight - entryHeight,
      });
      // Additional public rooms (office, etc. that weren't classified as private)
      for (let i = 1; i < livingReqs.length; i++) {
        // These overflow — add as extra rooms beside garage or expand house
        // For simplicity, add below the public zone
      }
    } else if (entryReq) {
      // Only entry, no separate living room
      allRooms.push({
        id: generateId(),
        name: entryReq.name,
        type: "entry",
        x: livingX,
        y: publicY,
        width: livingWidth,
        height: garageHeight,
      });
    } else {
      // No explicit entry — just living room(s)
      const mainPublic = livingReqs.length > 0 ? livingReqs[0] : { name: "Living Room", type: "living-room" };
      allRooms.push({
        id: generateId(),
        name: mainPublic.name,
        type: mainPublic.type,
        x: livingX,
        y: publicY,
        width: livingWidth,
        height: garageHeight,
      });
    }
  } else {
    // No garage — full width for public rooms
    const allPublic = publicReqs.length > 0 ? publicReqs : [{ name: "Living Room", type: "living-room", weight: 1.8 }];
    const totalPubWeight = allPublic.reduce((s, r) => s + (r.weight || 1), 0);
    let currentX = 0;
    for (let i = 0; i < allPublic.length; i++) {
      const room = allPublic[i];
      const roomWidth = i === allPublic.length - 1
        ? houseWidth - currentX
        : Math.round(((room.weight || 1) / totalPubWeight) * houseWidth);
      allRooms.push({
        id: generateId(),
        name: room.name,
        type: room.type,
        x: currentX,
        y: publicY,
        width: Math.max(roomWidth, 200),
        height: publicZoneHeight,
      });
      currentX += Math.max(roomWidth, 200);
    }
  }

  // ── 8. Normalize coordinates ──
  const finalMinX = Math.min(...allRooms.map(r => r.x));
  const finalMinY = Math.min(...allRooms.map(r => r.y));
  if (finalMinX !== 0 || finalMinY !== 0) {
    for (const r of allRooms) {
      r.x = Math.round(r.x - finalMinX);
      r.y = Math.round(r.y - finalMinY);
    }
  }

  console.log(`Template layout: ${allRooms.length} rooms, hallway=${needsHallway}, garage=${hasGarage}`);
  return allRooms;
}

/**
 * Auto-generate doors between all pairs of adjacent rooms that share a wall,
 * plus exterior doors on entry/garage rooms.
 */
function autoGenerateDoors(rooms: FloorPlanRoom[]): FloorPlanDoor[] {
  const doors: FloorPlanDoor[] = [];
  const connected = new Set<string>(); // "id1-id2" pairs

  const OPEN_CONCEPT_TYPES = new Set(["living-room", "kitchen", "dining-room", "entry", "hallway"]);

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const wall = findSharedWall(rooms[i], rooms[j]);
      if (!wall) continue;
      
      const pairKey = [rooms[i].id, rooms[j].id].sort().join("-");
      if (connected.has(pairKey)) continue;
      connected.add(pairKey);

      const isOpenConcept = OPEN_CONCEPT_TYPES.has(rooms[i].type) && OPEN_CONCEPT_TYPES.has(rooms[j].type);
      const doorWidth = isOpenConcept
        ? Math.max(150, wall.length - 60)
        : 90;

      let door: FloorPlanDoor;
      if (wall.orientation === "horizontal") {
        const cx = wall.x + wall.length / 2;
        door = {
          id: generateId(),
          roomId1: rooms[i].id,
          roomId2: rooms[j].id,
          x: Math.round(cx - doorWidth / 2),
          y: Math.round(wall.y),
          width: doorWidth,
          orientation: "horizontal",
          ...(isOpenConcept ? { isOpening: true } : {}),
        };
      } else {
        const cy = wall.y + wall.length / 2;
        door = {
          id: generateId(),
          roomId1: rooms[i].id,
          roomId2: rooms[j].id,
          x: Math.round(wall.x),
          y: Math.round(cy - doorWidth / 2),
          width: doorWidth,
          orientation: "vertical",
          ...(isOpenConcept ? { isOpening: true } : {}),
        };
      }
      doors.push(door);
    }
  }

  // Add exterior doors for entry and garage rooms
  for (const room of rooms) {
    if (room.type === "entry" || room.type === "garage") {
      // Find an exterior wall (one touching the bounding box edge)
      const allRooms = rooms;
      const maxX = Math.max(...allRooms.map(r => r.x + r.width));
      const maxY = Math.max(...allRooms.map(r => r.y + r.height));

      let door: FloorPlanDoor | null = null;
      if (room.y <= 2) {
        // North exterior wall
        door = { id: generateId(), roomId1: room.id, roomId2: "exterior", x: Math.round(room.x + room.width / 2 - 45), y: room.y, width: 90, orientation: "horizontal" };
      } else if (room.y + room.height >= maxY - 2) {
        // South exterior wall
        door = { id: generateId(), roomId1: room.id, roomId2: "exterior", x: Math.round(room.x + room.width / 2 - 45), y: room.y + room.height, width: 90, orientation: "horizontal" };
      } else if (room.x <= 2) {
        // West exterior wall
        door = { id: generateId(), roomId1: room.id, roomId2: "exterior", x: room.x, y: Math.round(room.y + room.height / 2 - 45), width: 90, orientation: "vertical" };
      } else if (room.x + room.width >= maxX - 2) {
        // East exterior wall
        door = { id: generateId(), roomId1: room.id, roomId2: "exterior", x: room.x + room.width, y: Math.round(room.y + room.height / 2 - 45), width: 90, orientation: "vertical" };
      }
      if (door) doors.push(door);
    }
  }

  return doors;
}

/**
 * Auto-generate windows on exterior walls of rooms (except garages, hallways, closets).
 */
function autoGenerateWindows(rooms: FloorPlanRoom[]): FloorPlanWindow[] {
  const windows: FloorPlanWindow[] = [];
  const maxX = Math.max(...rooms.map(r => r.x + r.width));
  const maxY = Math.max(...rooms.map(r => r.y + r.height));
  const skipTypes = new Set(["hallway", "closet", "garage", "entry"]);

  for (const room of rooms) {
    if (skipTypes.has(room.type)) continue;

    // Check each wall for exterior exposure
    if (room.y <= 2 && room.width >= 150) {
      windows.push({ id: generateId(), roomId: room.id, x: Math.round(room.x + room.width / 2 - 50), y: room.y, width: 100, orientation: "horizontal", wall: "north" });
    }
    if (room.y + room.height >= maxY - 2 && room.width >= 150) {
      windows.push({ id: generateId(), roomId: room.id, x: Math.round(room.x + room.width / 2 - 50), y: room.y + room.height, width: 100, orientation: "horizontal", wall: "south" });
    }
    if (room.x <= 2 && room.height >= 150) {
      windows.push({ id: generateId(), roomId: room.id, x: room.x, y: Math.round(room.y + room.height / 2 - 50), width: 100, orientation: "vertical", wall: "west" });
    }
    if (room.x + room.width >= maxX - 2 && room.height >= 150) {
      windows.push({ id: generateId(), roomId: room.id, x: room.x + room.width, y: Math.round(room.y + room.height / 2 - 50), width: 100, orientation: "vertical", wall: "east" });
    }
  }

  return windows;
}

// ─── Auto-Repair Floor Plan ─────────────────────────────────────────────────
/**
 * Deterministic auto-repair: fix connectivity issues by inserting missing doors.
 * This prevents the AI from wasting iterations trying to fix structural issues.
 */
function autoRepairFloorPlan(plan: FloorPlan): { plan: FloorPlan; repairs: string[] } {
  const repairs: string[] = [];
  let { rooms, doors, windows } = plan;

  // 1. Build adjacency from existing doors
  const adjacency: Record<string, Set<string>> = {};
  for (const r of rooms) adjacency[r.id] = new Set();
  adjacency["exterior"] = new Set();
  for (const door of doors) {
    if (adjacency[door.roomId1]) adjacency[door.roomId1].add(door.roomId2);
    if (adjacency[door.roomId2]) adjacency[door.roomId2].add(door.roomId1);
  }

  // 2. Find entry points
  const entryRooms = rooms.filter(r => r.type === "entry");
  const roomsWithExteriorDoor = new Set(
    doors.filter(d => d.roomId1 === "exterior" || d.roomId2 === "exterior")
      .map(d => d.roomId1 === "exterior" ? d.roomId2 : d.roomId1)
  );
  const startNodes = new Set<string>();
  entryRooms.forEach(r => startNodes.add(r.id));
  roomsWithExteriorDoor.forEach(id => startNodes.add(id));

  // 3. If no entry points, create an exterior door on the first room that touches the top edge
  if (startNodes.size === 0) {
    const topRooms = rooms.filter(r => r.y <= 2);
    const entryCandidate = topRooms.find(r => r.type === "entry" || r.type === "living-room" || r.type === "hallway") || topRooms[0] || rooms[0];
    if (entryCandidate) {
      const extDoor: FloorPlanDoor = {
        id: generateId(),
        roomId1: entryCandidate.id,
        roomId2: "exterior",
        x: Math.round(entryCandidate.x + entryCandidate.width / 2 - 45),
        y: entryCandidate.y,
        width: 90,
        orientation: "horizontal",
      };
      doors = [...doors, extDoor];
      startNodes.add(entryCandidate.id);
      if (adjacency[entryCandidate.id]) adjacency[entryCandidate.id].add("exterior");
      repairs.push(`Added exterior door to "${entryCandidate.name}"`);
    }
  }

  // 4. BFS to find reachable rooms
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

  // 5. For each unreachable room, find a reachable neighbor that shares a wall and add a door
  let madeProgress = true;
  let passes = 0;
  while (madeProgress && passes < 10) {
    madeProgress = false;
    passes++;
    for (const room of rooms) {
      if (visited.has(room.id)) continue;
      // Find a reachable room that shares a wall
      for (const other of rooms) {
        if (!visited.has(other.id)) continue;
        const wall = findSharedWall(room, other);
        if (!wall) continue;
        // Add a door on this shared wall
        const doorWidth = 90;
        let newDoor: FloorPlanDoor;
        if (wall.orientation === "horizontal") {
          const cx = wall.x + wall.length / 2;
          newDoor = {
            id: generateId(),
            roomId1: room.id,
            roomId2: other.id,
            x: Math.round(cx - doorWidth / 2),
            y: Math.round(wall.y),
            width: doorWidth,
            orientation: "horizontal",
          };
        } else {
          const cy = wall.y + wall.length / 2;
          newDoor = {
            id: generateId(),
            roomId1: room.id,
            roomId2: other.id,
            x: Math.round(wall.x),
            y: Math.round(cy - doorWidth / 2),
            width: doorWidth,
            orientation: "vertical",
          };
        }
        doors = [...doors, newDoor];
        visited.add(room.id);
        queue.push(room.id);
        repairs.push(`Connected "${room.name}" to "${other.name}" via auto-generated door`);
        madeProgress = true;
        break;
      }
    }
  }

  return {
    plan: { ...plan, doors, windows },
    repairs,
  };
}

// ─── Floor Plan Tools ───────────────────────────────────────────────────────
const floorPlanTools = [
  {
    type: "function",
    function: {
      name: "generate_floor_plan",
      description: `Generate a complete floor plan. You provide the room list and target square footage — the backend physics engine handles all coordinate math, door placement, and window placement automatically. Just decide WHAT rooms are needed.`,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name for the floor plan (e.g. 'Modern Ranch Home')" },
          target_sqft: { type: "number", description: "Total approximate square footage of the house (e.g. 1500, 2200)" },
          requested_rooms: {
            type: "array",
            description: "List of rooms to include. Each entry is an object with 'type' (room identifier like 'living-room', 'bedroom-1', 'master-bedroom', 'kitchen', 'garage', etc.) and optional 'size' ('small', 'normal', or 'large'). Use 'size' when the user explicitly asks for a bigger or smaller room. Default is 'normal'.",
            items: {
              type: "object",
              properties: {
                type: { type: "string", description: "Room identifier, e.g. 'living-room', 'bedroom-1', 'master-bedroom', 'bathroom', 'garage', 'kitchen'" },
                size: { type: "string", enum: ["small", "normal", "large"], description: "Room size modifier. 'small' = 60% of base area, 'normal' = 100%, 'large' = 160%. Default 'normal'." },
              },
              required: ["type"],
            },
          },
        },
        required: ["name", "target_sqft", "requested_rooms"],
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
      description: `Resize a room by specifying a target square footage. The engine will intelligently determine the best direction to expand or shrink:
- If a wall has no adjacent room, it expands outward in that direction.
- If surrounded by other rooms, it shifts neighbors to accommodate the new size.
- Doors and windows are automatically re-snapped after resizing.
Do NOT provide raw coordinates — just the room_id and target_sqft.`,
      parameters: {
        type: "object",
        properties: {
          room_id: { type: "string", description: "ID of the room to resize" },
          target_sqft: { type: "number", description: "Desired square footage for the room (e.g. 200, 350)" },
        },
        required: ["room_id", "target_sqft"],
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
      name: "generate_from_sketch",
      description: `Generate a floor plan from an uploaded reference image/sketch. Instead of the procedural engine, YOU specify exact room positions and dimensions extracted from the image. Analyze the image carefully: estimate proportions, identify room types, measure relative sizes, and output explicit coordinates. The backend will auto-generate doors on shared walls and windows on exterior walls. Use cm units. Set the bounding box so rooms fit tightly. Rooms MUST share edges (no gaps) and MUST NOT overlap.`,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name for the floor plan" },
          total_width: { type: "number", description: "Total bounding box width in cm" },
          total_height: { type: "number", description: "Total bounding box height in cm" },
          rooms: {
            type: "array",
            description: "Array of rooms with explicit positions and dimensions, extracted from the reference image.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Room name (e.g. 'Master Bedroom', 'Kitchen')" },
                type: { type: "string", description: "Room type from the supported list" },
                x: { type: "number", description: "X position in cm from left edge" },
                y: { type: "number", description: "Y position in cm from top edge" },
                width: { type: "number", description: "Room width in cm" },
                height: { type: "number", description: "Room height in cm" },
              },
              required: ["name", "type", "x", "y", "width", "height"],
            },
          },
        },
        required: ["name", "total_width", "total_height", "rooms"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_floor_plan",
      description: `INSPECTOR TOOL — You MUST call this after generate_floor_plan or generate_from_sketch and after making significant changes (adding/moving/removing rooms or doors). This validates:
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
      const targetSqft = (args.target_sqft as number) || 1500;
      const requestedRooms = (args.requested_rooms as (string | RoomRequestInput)[]) || [];
      
      if (requestedRooms.length === 0) {
        return { result: JSON.stringify({ success: false, reason: "No rooms requested" }), floorPlan };
      }

      // Use the procedural layout engine — zero overlaps guaranteed
      const rooms = generateProceduralLayout(requestedRooms, targetSqft);
      
      const totalWidth = Math.max(...rooms.map(r => r.x + r.width));
      const totalHeight = Math.max(...rooms.map(r => r.y + r.height));

      // Auto-generate doors on shared walls
      const doors = autoGenerateDoors(rooms);
      
      // Auto-generate windows on exterior walls
      const windows = autoGenerateWindows(rooms);

      let newPlan: FloorPlan = {
        id: generateId(),
        name: (args.name as string) || "Floor Plan",
        totalWidth,
        totalHeight,
        rooms,
        doors,
        windows,
      };

      // Auto-repair connectivity issues deterministically
      const { plan: repairedPlan, repairs } = autoRepairFloorPlan(newPlan);
      newPlan = repairedPlan;
      if (repairs.length > 0) {
        console.log(`Auto-repair made ${repairs.length} fixes:`, repairs);
      }

      const totalSqft2 = newPlan.rooms.reduce((s, r) => s + Math.round((r.width * r.height) / 929), 0);
      
      // Auto-run inspection after repair
      const inspection = inspectFloorPlan(newPlan);
      
      const resultStr = JSON.stringify({
        success: true,
        rooms: newPlan.rooms.length,
        doors: newPlan.doors.length,
        windows: newPlan.windows.length,
        totalSqft: totalSqft2,
        room_ids: newPlan.rooms.map(r => ({ id: r.id, name: r.name })),
        repairs: repairs.length > 0 ? repairs : undefined,
        inspection: {
          passed: inspection.issues.length === 0,
          issues: inspection.issues,
          suggestions: inspection.suggestions,
          note: inspection.issues.length > 0
            ? "Some issues detected — use add_door, move_room, or resize_room to fix, then validate_floor_plan."
            : "Floor plan passed all checks!",
        },
      });

      return {
        result: resultStr,
        floorPlan: newPlan,
        action: `Generated "${newPlan.name}" — ${newPlan.rooms.length} rooms, ~${totalSqft2} sqft`,
      };
    }

    case "generate_from_sketch": {
      const sketchRooms = (args.rooms as Array<{ name: string; type: string; x: number; y: number; width: number; height: number }>) || [];
      if (sketchRooms.length === 0) {
        return { result: JSON.stringify({ success: false, reason: "No rooms provided" }), floorPlan };
      }

      // Deduplicate rooms by name — keep only the first occurrence
      const seenNames = new Set<string>();
      const uniqueSketchRooms = sketchRooms.filter(r => {
        const key = r.name.toLowerCase().trim();
        if (seenNames.has(key)) {
          console.warn(`Duplicate room name filtered: "${r.name}"`);
          return false;
        }
        seenNames.add(key);
        return true;
      });

      // Validate and normalize room types
      const rooms: FloorPlanRoom[] = uniqueSketchRooms.map(r => {
        let baseType = r.type;
        const nameParts = baseType.split("-");
        if (nameParts.length > 1 && /^\d+$/.test(nameParts[nameParts.length - 1])) {
          baseType = nameParts.slice(0, -1).join("-");
        }
        if (baseType === "master-bedroom") baseType = "bedroom";
        if (baseType === "master-bathroom") baseType = "bathroom";
        if (baseType === "powder-room" || baseType === "powder") baseType = "bathroom";
        if (baseType === "pantry" || baseType === "scullery" || baseType === "wet-bar") baseType = "kitchen";
        if (baseType === "foyer" || baseType === "mudroom") baseType = "entry";
        if (baseType === "great-room" || baseType === "family-room") baseType = "living-room";
        if (baseType === "deck" || baseType === "patio" || baseType === "porch") baseType = "entry";
        const validType = ROOM_TYPES.includes(baseType as any) ? baseType : "bedroom";
        return {
          id: generateId(),
          name: r.name,
          type: validType,
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(Math.max(r.width, 100)),
          height: Math.round(Math.max(r.height, 100)),
        };
      });

      // Normalize so min x/y = 0
      const minX = Math.min(...rooms.map(r => r.x));
      const minY = Math.min(...rooms.map(r => r.y));
      if (minX !== 0 || minY !== 0) {
        for (const r of rooms) {
          r.x -= minX;
          r.y -= minY;
        }
      }

      const totalWidth = Math.max(...rooms.map(r => r.x + r.width), (args.total_width as number) || 0);
      const totalHeight = Math.max(...rooms.map(r => r.y + r.height), (args.total_height as number) || 0);

      const doors = autoGenerateDoors(rooms);
      const windows = autoGenerateWindows(rooms);

      let newPlan: FloorPlan = {
        id: generateId(),
        name: (args.name as string) || "Sketch Floor Plan",
        totalWidth,
        totalHeight,
        rooms,
        doors,
        windows,
      };

      // Auto-repair connectivity
      const { plan: repairedPlan, repairs } = autoRepairFloorPlan(newPlan);
      newPlan = repairedPlan;

      const totalSqft = newPlan.rooms.reduce((s, r) => s + Math.round((r.width * r.height) / 929), 0);
      const inspection = inspectFloorPlan(newPlan);

      return {
        result: JSON.stringify({
          success: true,
          rooms: newPlan.rooms.length,
          doors: newPlan.doors.length,
          windows: newPlan.windows.length,
          totalSqft,
          room_ids: newPlan.rooms.map(r => ({ id: r.id, name: r.name })),
          repairs: repairs.length > 0 ? repairs : undefined,
          inspection: {
            passed: inspection.issues.length === 0,
            issues: inspection.issues,
            suggestions: inspection.suggestions,
            note: inspection.issues.length > 0
              ? "Some issues detected — use add_door, move_room, or resize_room to fix, then validate_floor_plan."
              : "Floor plan passed all checks!",
          },
        }),
        floorPlan: newPlan,
        action: `Generated "${newPlan.name}" from sketch — ${newPlan.rooms.length} rooms, ~${totalSqft} sqft`,
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
      const targetSqft = args.target_sqft as number;
      const room = floorPlan.rooms.find(r => r.id === roomId);
      if (!room) return { result: JSON.stringify({ success: false, reason: "Room not found" }), floorPlan };
      if (!targetSqft || targetSqft < 20) return { result: JSON.stringify({ success: false, reason: "target_sqft must be >= 20" }), floorPlan };

      const currentAreaCm2 = room.width * room.height;
      const targetAreaCm2 = targetSqft * 929;
      const areaRatio = targetAreaCm2 / currentAreaCm2;
      const isExpanding = areaRatio > 1;

      // Determine which walls are "free" (no adjacent room within tolerance)
      const TOLERANCE = 5;
      const otherRooms = floorPlan.rooms.filter(r => r.id !== roomId);

      type Direction = "north" | "south" | "east" | "west";
      const freeWalls: Direction[] = [];
      const blockedWalls: Record<Direction, FloorPlanRoom[]> = { north: [], south: [], east: [], west: [] };

      for (const other of otherRooms) {
        // North wall (room.y): another room's bottom edge touches it
        if (Math.abs((other.y + other.height) - room.y) < TOLERANCE &&
            Math.max(other.x, room.x) < Math.min(other.x + other.width, room.x + room.width) - TOLERANCE) {
          blockedWalls.north.push(other);
        }
        // South wall (room.y + room.height): another room's top edge touches it
        if (Math.abs(other.y - (room.y + room.height)) < TOLERANCE &&
            Math.max(other.x, room.x) < Math.min(other.x + other.width, room.x + room.width) - TOLERANCE) {
          blockedWalls.south.push(other);
        }
        // West wall (room.x): another room's right edge touches it
        if (Math.abs((other.x + other.width) - room.x) < TOLERANCE &&
            Math.max(other.y, room.y) < Math.min(other.y + other.height, room.y + room.height) - TOLERANCE) {
          blockedWalls.west.push(other);
        }
        // East wall (room.x + room.width): another room's left edge touches it
        if (Math.abs(other.x - (room.x + room.width)) < TOLERANCE &&
            Math.max(other.y, room.y) < Math.min(other.y + other.height, room.y + room.height) - TOLERANCE) {
          blockedWalls.east.push(other);
        }
      }

      for (const dir of ["south", "east", "north", "west"] as Direction[]) {
        if (blockedWalls[dir].length === 0) freeWalls.push(dir);
      }

      // Calculate how much to grow/shrink
      const deltaCm2 = targetAreaCm2 - currentAreaCm2;
      const actions: string[] = [];
      let updatedRooms = [...floorPlan.rooms];
      const roomIdx = updatedRooms.findIndex(r => r.id === roomId);
      let r = { ...updatedRooms[roomIdx] };

      if (freeWalls.length > 0 || !isExpanding) {
        // Strategy: expand/shrink toward free walls, maintaining aspect ratio if possible
        // Prefer south/east for expansion (grow "outward"), north/west for shrinkage
        const preferredExpand: Direction[] = freeWalls.filter(d => d === "south" || d === "east");
        const expandDirs = preferredExpand.length > 0 ? preferredExpand : freeWalls;

        if (expandDirs.includes("south") || expandDirs.includes("north")) {
          // Adjust height
          const newHeight = Math.round(targetAreaCm2 / r.width);
          const deltaH = newHeight - r.height;
          if (expandDirs.includes("south")) {
            r.height = newHeight;
            actions.push(`Expanded ${r.name} southward by ${Math.abs(deltaH)}cm`);
          } else if (expandDirs.includes("north")) {
            r.y = r.y - deltaH;
            r.height = newHeight;
            actions.push(`Expanded ${r.name} northward by ${Math.abs(deltaH)}cm`);
          }
        } else if (expandDirs.includes("east") || expandDirs.includes("west")) {
          // Adjust width
          const newWidth = Math.round(targetAreaCm2 / r.height);
          const deltaW = newWidth - r.width;
          if (expandDirs.includes("east")) {
            r.width = newWidth;
            actions.push(`Expanded ${r.name} eastward by ${Math.abs(deltaW)}cm`);
          } else if (expandDirs.includes("west")) {
            r.x = r.x - deltaW;
            r.width = newWidth;
            actions.push(`Expanded ${r.name} westward by ${Math.abs(deltaW)}cm`);
          }
        }
      } else {
        // All walls blocked — need to push neighbors
        // Pick the direction with the fewest/smallest neighbors to push
        const dirCosts: { dir: Direction; cost: number }[] = [];
        for (const dir of ["south", "east", "north", "west"] as Direction[]) {
          const totalBlockerArea = blockedWalls[dir].reduce((s, br) => s + br.width * br.height, 0);
          dirCosts.push({ dir, cost: blockedWalls[dir].length * 1000 + totalBlockerArea });
        }
        dirCosts.sort((a, b) => a.cost - b.cost);
        const pushDir = dirCosts[0].dir;

        // Calculate expansion amount
        let deltaSize: number;
        if (pushDir === "south" || pushDir === "north") {
          const newHeight = Math.round(targetAreaCm2 / r.width);
          deltaSize = newHeight - r.height;
        } else {
          const newWidth = Math.round(targetAreaCm2 / r.height);
          deltaSize = newWidth - r.width;
        }

        // Recursively collect all rooms that need to shift in the push direction
        const roomsToShift = new Set<string>();
        const collectShifts = (sourceRoom: FloorPlanRoom, dir: Direction) => {
          for (const other of updatedRooms) {
            if (other.id === sourceRoom.id || roomsToShift.has(other.id)) continue;
            if (other.id === roomId) continue; // Don't shift the target room
            let adjacent = false;
            if (dir === "south" && Math.abs(other.y - (sourceRoom.y + sourceRoom.height)) < TOLERANCE &&
                Math.max(other.x, sourceRoom.x) < Math.min(other.x + other.width, sourceRoom.x + sourceRoom.width) - TOLERANCE) {
              adjacent = true;
            }
            if (dir === "north" && Math.abs((other.y + other.height) - sourceRoom.y) < TOLERANCE &&
                Math.max(other.x, sourceRoom.x) < Math.min(other.x + other.width, sourceRoom.x + sourceRoom.width) - TOLERANCE) {
              adjacent = true;
            }
            if (dir === "east" && Math.abs(other.x - (sourceRoom.x + sourceRoom.width)) < TOLERANCE &&
                Math.max(other.y, sourceRoom.y) < Math.min(other.y + other.height, sourceRoom.y + sourceRoom.height) - TOLERANCE) {
              adjacent = true;
            }
            if (dir === "west" && Math.abs((other.x + other.width) - sourceRoom.x) < TOLERANCE &&
                Math.max(other.y, sourceRoom.y) < Math.min(other.y + other.height, sourceRoom.y + sourceRoom.height) - TOLERANCE) {
              adjacent = true;
            }
            if (adjacent) {
              roomsToShift.add(other.id);
              collectShifts(other, dir); // Cascade: rooms behind this one also need to shift
            }
          }
        };

        // Collect direct blockers and their cascading neighbors
        for (const blocker of blockedWalls[pushDir]) {
          roomsToShift.add(blocker.id);
          collectShifts(blocker, pushDir);
        }

        // Apply the expansion to target room
        if (pushDir === "south") {
          r.height = Math.round(targetAreaCm2 / r.width);
        } else if (pushDir === "north") {
          const newHeight = Math.round(targetAreaCm2 / r.width);
          r.y = r.y - (newHeight - r.height);
          r.height = newHeight;
        } else if (pushDir === "east") {
          r.width = Math.round(targetAreaCm2 / r.height);
        } else {
          const newWidth = Math.round(targetAreaCm2 / r.height);
          r.x = r.x - (newWidth - r.width);
          r.width = newWidth;
        }

        // Shift all affected rooms
        const absDelta = Math.abs(deltaSize);
        updatedRooms = updatedRooms.map(rm => {
          if (!roomsToShift.has(rm.id)) return rm;
          const shifted = { ...rm };
          if (pushDir === "south") shifted.y += absDelta;
          else if (pushDir === "north") shifted.y -= absDelta;
          else if (pushDir === "east") shifted.x += absDelta;
          else shifted.x -= absDelta;
          return shifted;
        });

        actions.push(`Expanded ${r.name} ${pushDir}ward, shifted ${roomsToShift.size} neighbor(s)`);
      }

      // Ensure no negative coordinates
      updatedRooms[roomIdx] = r;
      const minRoomX = Math.min(...updatedRooms.map(rm => rm.x));
      const minRoomY = Math.min(...updatedRooms.map(rm => rm.y));
      if (minRoomX < 0 || minRoomY < 0) {
        const shiftX = minRoomX < 0 ? -minRoomX : 0;
        const shiftY = minRoomY < 0 ? -minRoomY : 0;
        updatedRooms = updatedRooms.map(rm => ({ ...rm, x: rm.x + shiftX, y: rm.y + shiftY }));
      }

      const newTotalWidth = Math.max(...updatedRooms.map(rm => rm.x + rm.width));
      const newTotalHeight = Math.max(...updatedRooms.map(rm => rm.y + rm.height));

      // Re-generate doors and windows for the updated layout
      const newDoors = autoGenerateDoors(updatedRooms);
      const newWindows = autoGenerateWindows(updatedRooms);

      const newPlan: FloorPlan = {
        ...floorPlan,
        rooms: updatedRooms,
        doors: newDoors,
        windows: newWindows,
        totalWidth: newTotalWidth,
        totalHeight: newTotalHeight,
      };

      // Auto-repair connectivity
      const { plan: repairedPlan, repairs } = autoRepairFloorPlan(newPlan);

      const newSqft = Math.round((r.width * r.height) / 929);
      const totalActions = [...actions, ...repairs];

      return {
        result: JSON.stringify({
          success: true,
          new_sqft: newSqft,
          room_dimensions: { width: r.width, height: r.height },
          actions: totalActions,
        }),
        floorPlan: repairedPlan,
        action: `Resized ${room.name} → ~${newSqft} sqft`,
      };
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
      // Auto-repair before inspecting
      const { plan: repairedPlan, repairs } = autoRepairFloorPlan(floorPlan);
      const inspection = inspectFloorPlan(repairedPlan);
      const passed = inspection.issues.length === 0;
      return {
        result: JSON.stringify({
          passed,
          issues: inspection.issues,
          suggestions: inspection.suggestions,
          repairs: repairs.length > 0 ? repairs : undefined,
          summary: passed
            ? "✅ Floor plan passed all validation checks!" + (repairs.length > 0 ? ` (auto-fixed ${repairs.length} issue(s))` : "")
            : `❌ Found ${inspection.issues.length} remaining issue(s) after auto-repair. Read each issue and fix them.`,
        }),
        floorPlan: repairedPlan,
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

  return `You are an expert residential floor plan architect AI. You help users design house floor plans.

YOU DO NOT NEED TO CALCULATE COORDINATES. The backend physics engine handles all room coordinate placement, door generation, and window generation automatically. Your job is to:
1. Listen to the user's request.
2. Decide what rooms are needed and the approximate total square footage.
3. Call generate_floor_plan with the room list and target sqft.
4. The engine will return a mathematically perfect layout with zero overlaps.

YOU HAVE TWO INFORMATION SOURCES:
1. A SCREENSHOT IMAGE of the current canvas (visual — examine it carefully!)
2. PRECISE COORDINATE DATA below (numerical — use for exact positions when modifying)

═══ FLOOR PLAN: "${floorPlan.name}" ═══
Bounding box: ${floorPlan.totalWidth}cm × ${floorPlan.totalHeight}cm
${roomsSummary}
Doors: ${floorPlan.doors.length}
Windows: ${floorPlan.windows.length}

═══ COORDINATE SYSTEM ═══
Origin (0,0) = top-left corner. X → right, Y → down. All values in cm.
100cm = 1 meter ≈ 3.28 feet. 1 sqft ≈ 929 cm².

═══ ROOM TYPES ═══
${ROOM_TYPES.join(", ")}

═══ SIZING GUIDE ═══
Use these rough sqft targets when deciding total_sqft:
  - Studio/1-bed apartment: 500-800 sqft
  - 2-bedroom home: 1000-1400 sqft
  - 3-bedroom home: 1400-2000 sqft
  - 4-bedroom home: 2000-2800 sqft
  - 5+ bedroom home: 2800-4000+ sqft
Include garage in sqft estimate if requested (~300-500 sqft for a 2-car garage).

═══ ROOM NAMING CONVENTIONS ═══
When calling generate_floor_plan, use these room objects in requested_rooms:
  - { "type": "living-room" }, { "type": "kitchen" }, { "type": "dining-room" }
  - { "type": "bedroom-1" }, { "type": "bedroom-2" }, { "type": "master-bedroom" }
  - { "type": "bathroom" }, { "type": "master-bathroom" }, { "type": "bathroom-2" }
  - { "type": "hallway" }, { "type": "entry" }, { "type": "garage" }
  - { "type": "office" }, { "type": "laundry" }, { "type": "closet-1" }

═══ ROOM SIZING ═══
Each room object accepts an optional "size" field: "small", "normal", or "large".
  - "small" = 60% of the default area for that room type
  - "normal" = default (you can omit the size field)
  - "large" = 160% of the default area for that room type
Use the "size" parameter when the user explicitly asks for a bigger or smaller specific room.
Example: User says "I want a large master bedroom and a small office" →
  { "type": "master-bedroom", "size": "large" }, { "type": "office", "size": "small" }
Prefer using size parameters in generate_floor_plan for initial generation. Use resize_room with target_sqft for post-generation adjustments (e.g. "make the master bedroom 100 sqft bigger" → calculate current sqft + 100 and pass as target_sqft).

═══ TOOLS ═══
1. **generate_floor_plan** — Provide room list (with optional sizes) + target sqft. The engine handles coordinates, doors, and windows.
2. **add_room** / **remove_room** / **move_room** — Fine-tune individual rooms after generation.
3. **resize_room** — Smart resize: provide room_id + target_sqft. The engine will expand toward free walls or shift neighbors. Doors/windows are auto-regenerated. Do NOT calculate coordinates yourself.
4. **add_door** / **add_window** — Add additional doors/windows if needed.
5. **list_rooms** — Inspect current layout with IDs and positions.
6. **validate_floor_plan** — 🔍 INSPECTOR. Run after generating or modifying to check connectivity.

═══ SKETCH / IMAGE UPLOAD ═══
When the user uploads a floor plan image, sketch, or blueprint:
1. Use **generate_from_sketch** — NOT generate_floor_plan.
2. STEP 1 — INVENTORY: Before generating coordinates, list EVERY room you see in the image. Count them carefully.
   - Each room must have a UNIQUE name. Never create two rooms with the same name.
   - If the image shows "Bed 2", "Bed 3", "Bed 4" — those are THREE separate bedrooms, not duplicates.
   - If there are multiple bathrooms, give each a unique name: "Master Bath", "Bathroom 2", "Bath 3", etc.
3. STEP 2 — OVERALL SHAPE: Determine the house footprint shape.
   - Is it wide/horizontal or tall/vertical?
   - Is it rectangular, L-shaped, T-shaped, U-shaped?
   - The generated layout MUST match this overall shape.
4. STEP 3 — SPATIAL GRID: Mentally divide the image into a grid.
   - If the house is ~90ft wide × ~65ft deep, that's ~2740cm × ~1980cm.
   - Estimate each room's position as a fraction of total width/height.
   - A room at the far right occupies x ≈ 70-100% of total width.
   - A room at the top occupies y ≈ 0-30% of total height.
5. STEP 4 — COORDINATES: Convert to cm. Rooms that are side-by-side MUST share exact edges.
   - If Room A ends at x=1200 and Room B is to its right, Room B starts at x=1200.
   - NO GAPS between adjacent rooms. NO OVERLAPS.
6. After calling generate_from_sketch, ALWAYS call validate_floor_plan.

CRITICAL RULES FOR SKETCHES:
- NEVER duplicate room names. Every room name must be unique.
- Match the OVERALL SHAPE of the reference image (wide house = wide layout, NOT a tall column of rooms).
- Bedrooms on the right side of the image → place at high x values.
- Rooms on the left side → low x values.
- The spatial arrangement is MORE important than exact sizes.

ESTIMATION TIPS:
- Standard room dimensions: bedrooms 12-16ft, bathrooms 7-10ft, kitchens 12-20ft, hallways 4-6ft wide, closets 5-9ft.
- Garages: 15-26ft × 20-26ft. Porches: 6-13ft deep.
- Living/Great rooms: 15-22ft × 18-24ft.
- Convert: 1ft = 30.48cm. Round to nearest 10cm for cleanliness.

═══ WORKFLOW ═══
1. For text-only requests: Call **generate_floor_plan** with room list and sqft.
2. For image uploads: Call **generate_from_sketch** with explicit room coordinates extracted from the image.
3. Review the auto-inspection results included in the response.
4. If issues exist, fix them with add_door, move_room, resize_room, etc.
5. Call **validate_floor_plan** to confirm all issues are resolved.

═══ RESPONSE RULES ═══
1. ALWAYS call generate_floor_plan (text) or generate_from_sketch (image) when the user asks to create or redesign a floor plan.
2. Be conversational and brief (1-3 sentences after executing actions).
3. When recreating a sketch, first describe what you see (room count, shape, layout), then generate using generate_from_sketch.
4. If the user asks to add/remove specific rooms from an existing plan, use add_room/remove_room.
5. ALWAYS call validate_floor_plan after generate_floor_plan or generate_from_sketch — no exceptions.
6. When a user mentions wanting a "large" or "small" room, use the size parameter in generate_floor_plan rather than calling resize_room after.`;
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

    const userApiKey = req.headers.get("x-user-api-key");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const useDirectGemini = !!userApiKey;
    if (!useDirectGemini && !LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

            // Circuit breaker: stop after 3 consecutive failed validations — deliver what we have
            if (isFloorPlanMode && consecutiveFailures >= 3) {
              console.log("Circuit breaker tripped — 3 consecutive validation failures, delivering current layout");
              // Auto-repair one more time before delivering
              const { plan: lastRepair, repairs: lastRepairs } = autoRepairFloorPlan(currentFloorPlan);
              currentFloorPlan = lastRepair;
              if (lastRepairs.length > 0) {
                for (const r of lastRepairs) actionLog.push(r);
              }
              finalContent = `Here's your floor plan! I made some automatic adjustments to ensure all rooms are connected. The layout has ${currentFloorPlan.rooms.length} rooms — feel free to ask me to adjust sizes, move rooms, or make any changes.`;
              break;
            }

            // Force tool use on first call when no actions taken yet
            const currentToolChoice = (i === 0 && actionLog.length === 0) ? "required" : "auto";

            const apiUrl = useDirectGemini
              ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
              : "https://ai.gateway.lovable.dev/v1/chat/completions";
            const apiKey = useDirectGemini ? userApiKey : LOVABLE_API_KEY;
            const apiModel = useDirectGemini
              ? (hasUserImages ? "gemini-2.5-pro" : "gemini-2.5-flash")
              : model;

            const response = await fetch(apiUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: apiModel,
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
