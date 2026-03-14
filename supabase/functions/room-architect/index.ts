//@ts-ignore
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

/** Wing placement preferences — arrays of room name/type keywords (lowercase) to force into each wing */
interface WingPreferences {
  leftWing?: string[];  // e.g. ["master-bedroom","master-bathroom"] → west side
  rightWing?: string[]; // e.g. ["bedroom","bathroom"] → east side
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

const HALLWAY_WIDTH = 120; // cm

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
function matchesWingPref(room: RoomReq, keywords: string[]): boolean {
  const nameLower = room.name.toLowerCase().replace(/\s+/g, "-");
  const typeLower = room.type.toLowerCase();
  return keywords.some(kw => {
    const k = kw.toLowerCase();
    return nameLower.includes(k) || typeLower.includes(k) || k.includes(typeLower);
  });
}

function generateProceduralLayout(
  requestedRooms: (string | RoomRequestInput)[],
  totalSqft: number,
  wingPrefs?: WingPreferences
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
  // ARCHITECTURAL RULE: Master bedroom + master bathroom must be in the SAME wing (en-suite).
  // Wing preferences (from user) override automatic balancing.
  const leftWing: RoomReq[] = [];
  const rightWing: RoomReq[] = [];
  let leftWeight = 0;
  // Kitchen/Dining always go to right wing (touching living area below)
  let rightWeight = kitchenDiningReqs.reduce((s, r) => s + r.weight, 0);

  const usedIndices = new Set<number>();

  // ── 5a. Apply explicit wing preferences first ──
  if (wingPrefs?.leftWing?.length || wingPrefs?.rightWing?.length) {
    // Force rooms matching left preference to left wing
    privateReqs.forEach((room, i) => {
      if (wingPrefs.leftWing && matchesWingPref(room, wingPrefs.leftWing)) {
        leftWing.push(room);
        leftWeight += room.weight;
        usedIndices.add(i);
      } else if (wingPrefs.rightWing && matchesWingPref(room, wingPrefs.rightWing)) {
        rightWing.push(room);
        rightWeight += room.weight;
        usedIndices.add(i);
      }
    });
    // If master bedroom was placed, ensure master bathroom follows to same wing
    const masterBedInLeft = leftWing.some(r => r.name.toLowerCase().includes("master") && r.type === "bedroom");
    const masterBedInRight = rightWing.some(r => r.name.toLowerCase().includes("master") && r.type === "bedroom");
    privateReqs.forEach((room, i) => {
      if (usedIndices.has(i)) return;
      const isMasterBath = room.name.toLowerCase().includes("master") && room.type === "bathroom";
      if (isMasterBath && masterBedInLeft) {
        leftWing.push(room); leftWeight += room.weight; usedIndices.add(i);
      } else if (isMasterBath && masterBedInRight) {
        rightWing.push(room); rightWeight += room.weight; usedIndices.add(i);
      }
    });
  } else {
    // No preferences — use default: master suite to left wing
    const masterBedIdx = privateReqs.findIndex(r => r.name.toLowerCase().includes("master") && r.type === "bedroom");
    const masterBathIdx = privateReqs.findIndex(r => r.name.toLowerCase().includes("master") && r.type === "bathroom");
    if (masterBedIdx >= 0 && masterBathIdx >= 0) {
      const group = [privateReqs[masterBedIdx], privateReqs[masterBathIdx]];
      const groupWeight = group.reduce((s, r) => s + r.weight, 0);
      if (leftWeight <= rightWeight) {
        for (const room of group) leftWing.unshift(room);
        leftWeight += groupWeight;
      } else {
        for (const room of group) rightWing.unshift(room);
        rightWeight += groupWeight;
      }
      usedIndices.add(masterBedIdx);
      usedIndices.add(masterBathIdx);
    }
  }

  // Balance remaining private rooms between wings
  const remainingPrivate = privateReqs.filter((_, i) => !usedIndices.has(i));
  for (const room of remainingPrivate) {
    if (leftWeight <= rightWeight) {
      leftWing.push(room);
      leftWeight += room.weight;
    } else {
      rightWing.push(room);
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

  // ── Fix gap: both wings must reach the same bottom edge ──
  // When rooms overflow privateZoneHeight due to minDims, the wings may have unequal heights,
  // leaving an empty region below the shorter wing. Stretch the last room of each wing to match.
  {
    const leftRooms = allRooms.filter(r => r.x === 0 && r.type !== "hallway" && r.type !== "garage");
    const rightRooms = allRooms.filter(r => r.x === rightWingX && r.type !== "garage");
    const leftBottom = leftRooms.length > 0 ? Math.max(...leftRooms.map(r => r.y + r.height)) : 0;
    const rightBottom = rightRooms.length > 0 ? Math.max(...rightRooms.map(r => r.y + r.height)) : 0;
    const hallwayRoom = allRooms.find(r => r.type === "hallway");
    const wingBottom = Math.max(leftBottom, rightBottom);
    if (leftBottom < wingBottom && leftRooms.length > 0) {
      const lastLeft = leftRooms.reduce((a, b) => (a.y + a.height >= b.y + b.height ? a : b));
      lastLeft.height += wingBottom - leftBottom;
    }
    if (rightBottom < wingBottom && rightRooms.length > 0) {
      const lastRight = rightRooms.reduce((a, b) => (a.y + a.height >= b.y + b.height ? a : b));
      lastRight.height += wingBottom - rightBottom;
    }
    if (hallwayRoom && hallwayRoom.height < wingBottom) {
      hallwayRoom.height = wingBottom;
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
      description: `Generate a complete floor plan using the template-based layout engine. Extract bedrooms, bathrooms, and sqft from the user's request. The engine automatically creates a realistic architectural layout with:
- Central hallway spine connecting all private rooms
- Kitchen/dining adjacent to living area (open concept)
- Garage on the perimeter
- Balanced left/right wings

DEFAULTS (use when user doesn't specify):
- Bedrooms: 3
- Bathrooms: 2.5 (2 full + 1 half)
- Square footage: 2000
- Garage: included by default
- "Half bath" = a small bathroom (powder room)

Extract values from user input:
- "2 bed 2 bath 2000 sqft" → bedrooms=2, bathrooms=2, sqft=2000
- "2500 sqft house" → bedrooms=3 (default), bathrooms=2.5 (default), sqft=2500
- "4 bedroom house" → bedrooms=4, bathrooms=2.5 (default), sqft=2000 (default)

The engine builds the room list automatically from these parameters. You can optionally add extra rooms.`,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name for the floor plan (e.g. 'Modern Ranch Home')" },
          target_sqft: { type: "number", description: "Total square footage. Default: 2000" },
          bedrooms: { type: "number", description: "Number of bedrooms. Default: 3. The first bedroom is always a Master Bedroom (larger)." },
          bathrooms: { type: "number", description: "Number of bathrooms. Default: 2.5. Use 0.5 increments for half baths (powder rooms). E.g. 2.5 = 2 full baths + 1 half bath." },
          include_garage: { type: "boolean", description: "Whether to include a garage. Default: true." },
          include_office: { type: "boolean", description: "Whether to include a home office. Default: false." },
          include_laundry: { type: "boolean", description: "Whether to include a laundry room. Default: false." },
          extra_rooms: {
            type: "array",
            description: "Optional additional rooms beyond the standard set. Only use for special requests like 'add a pantry' or 'I want a sunroom'.",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                size: { type: "string", enum: ["small", "normal", "large"] },
              },
              required: ["type"],
            },
          },
          wing_preferences: {
            type: "object",
            description: "Override which wing (west/left vs east/right) specific rooms are placed in. Use when the user specifies directional placement like 'master bedroom on the west side', 'bedrooms and bathrooms on the east wing', etc. Keywords are matched against room names and types (case-insensitive).",
            properties: {
              left_wing: {
                type: "array",
                items: { type: "string" },
                description: "Room name/type keywords to force onto the LEFT (WEST) wing. E.g. ['master-bedroom','master-bathroom'] or ['bedroom','bathroom'].",
              },
              right_wing: {
                type: "array",
                items: { type: "string" },
                description: "Room name/type keywords to force onto the RIGHT (EAST) wing. E.g. ['bedroom','bathroom'].",
              },
            },
            additionalProperties: false,
          },
        },
        required: ["name"],
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
      name: "reshape_room_boundary",
      description: `Move a specific wall of a room outward or inward.

WHEN TO USE:
- User specifies a direction AND distance: "expand the bedroom east by 2m" → provide room_id + wall + distance_cm
- User draws an arrow on a specific wall with a known direction and distance

DO NOT USE for "expand room A to meet room B" or annotation arrows between rooms → use snap_rooms_together instead (it's simpler and more reliable).

- Positive distance_cm = expand outward (wall moves away from room center).
- Negative distance_cm = contract inward (wall moves toward room center).
- If the wall has adjacent rooms, they will be cascade-shifted to make space.
- Nearby edges within 20cm auto-snap flush. Minimum room dimension: 120cm.`,
      parameters: {
        type: "object",
        properties: {
          room_id: { type: "string", description: "ID of the room whose wall to move" },
          wall: { type: "string", enum: ["north", "south", "east", "west"], description: "Which wall to move" },
          distance_cm: { type: "number", description: "Distance in cm. Positive = expand outward, negative = contract inward." },
        },
        required: ["room_id", "wall", "distance_cm"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "snap_rooms_together",
      description: `Expand room_id toward target_room_id to close the gap between them, making them share a wall.

USE THIS when:
- The user draws an arrow from one room toward another room
- The user says "expand X to meet Y", "extend X to Y", "connect X wall to Y", "make X touch Y"
- There is a gap between two rooms that should be closed

The system auto-detects which wall to move and calculates the exact distance. You do NOT need to know directions or distances — just provide both room IDs.

Example: User draws arrow from Garage upward toward Master Bedroom + says "expand garage to master bedroom"
→ snap_rooms_together(room_id=garage_id, target_room_id=master_bedroom_id)`,
      parameters: {
        type: "object",
        properties: {
          room_id: { type: "string", description: "ID of the room to expand (the room whose wall will move)" },
          target_room_id: { type: "string", description: "ID of the room to expand toward (the destination room)" },
        },
        required: ["room_id", "target_room_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_room",
      description: "Move a room to an absolute coordinate position. DO NOT use this tool if the user asks to place a room next to another room (e.g. 'move bathroom next to bedroom' or 'connect garage to house'). Use connect_rooms instead.",
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
      name: "connect_rooms",
      description: `PHYSICALLY MOVES room_2 to be positioned adjacent to room_1, then adds a shared door. This tool changes room_2's POSITION (x, y coordinates) — it relocates the room.

USE ONLY when the user wants to RELOCATE a room next to another room:
- "put the bathroom next to the bedroom"
- "move room A next to room B"
- "place the office beside the master bedroom"

DO NOT USE when:
- The user wants to EXPAND or GROW a room toward another room → use snap_rooms_together
- There is an annotation arrow between two rooms → use snap_rooms_together
- The user says "expand X to Y", "extend X to meet Y", "fill gap between X and Y" → use snap_rooms_together

WARNING: connect_rooms MOVES room_2. If the user wants to KEEP both rooms in place and just close the gap by expanding one wall, use snap_rooms_together instead.`,
      parameters: {
        type: "object",
        properties: {
          room_1: { type: "string", description: "Room 1 reference: ID or name (e.g. 'Master Bedroom')" },
          room_2: { type: "string", description: "Room 2 reference: ID or name (e.g. 'Master Bathroom')" },
          preferred_side: { type: "string", enum: ["north", "south", "east", "west"], description: "Optional side of room_1 where room_2 should be placed." },
        },
        required: ["room_1", "room_2"],
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
  {
    type: "function",
    function: {
      name: "merge_rooms",
      description: `Combines two adjacent rooms into a single larger room by removing the shared wall. Use whenever the user asks to 'merge', 'combine', 'join', or 'connect' two specific rooms into one unified space.

Do NOT use for closing gaps — use snap_rooms_together for that.
Do NOT use if the user just wants them side-by-side — use connect_rooms for that.`,
      parameters: {
        type: "object",
        properties: {
          room_1: { type: "string", description: "ID of the first room to merge" },
          room_2: { type: "string", description: "ID of the second room to merge" },
        },
        required: ["room_1", "room_2"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_gap",
      description: `Removes empty space inside a circled region by shifting all rooms on one side of the gap toward the other side until walls meet. Use ONLY when annotation data specifies a close_gap action with a bounding box. Do NOT use for named room operations — use snap_rooms_together or merge_rooms for those.`,
      parameters: {
        type: "object",
        properties: {
          minX: { type: "number", description: "Left edge of the gap region (cm)" },
          minY: { type: "number", description: "Top edge of the gap region (cm)" },
          maxX: { type: "number", description: "Right edge of the gap region (cm)" },
          maxY: { type: "number", description: "Bottom edge of the gap region (cm)" },
          axis: { type: "string", enum: ["x", "y"], description: "Compression axis: 'x' shifts rooms horizontally, 'y' shifts rooms vertically" },
        },
        required: ["minX", "minY", "maxX", "maxY", "axis"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bridge_gap",
      description: "Extends multiple rooms across a gap to meet a target boundary. This tool stretches the rooms and moves any doors or windows located on the affected walls. Use this for 'extend these walls to here', 'close this gap', 'fill the space', or 'connect these walls'. This stretches the source rooms; it does NOT move them.",
      parameters: {
        type: "object",
        properties: {
          source_room_ids: { 
            type: "array", 
            items: { type: "string" }, 
            description: "Names or IDs of rooms to stretch (e.g., ['Master Bedroom', 'Hallway'])." 
          },
          target_room_ids: { 
            type: "array", 
            items: { type: "string" }, 
            description: "Names or IDs of rooms that define the destination boundary." 
          },
          direction: { 
            type: "string", 
            enum: ["north", "south", "east", "west"],
            description: "The direction to stretch the source rooms."
          }
        },
        required: ["source_room_ids", "target_room_ids", "direction"],
        additionalProperties: false,
      },
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

// ─── Room Pairing / Connection Helpers ──────────────────────────────────────
type CardinalDirection = "north" | "south" | "east" | "west";

function roomsOverlap(a: FloorPlanRoom, b: FloorPlanRoom): boolean {
  const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return overlapX > 1 && overlapY > 1;
}

function normalizeRoomCoordinates(rooms: FloorPlanRoom[]): FloorPlanRoom[] {
  const minX = Math.min(...rooms.map(r => r.x));
  const minY = Math.min(...rooms.map(r => r.y));
  if (minX >= 0 && minY >= 0) return rooms;
  const shiftX = minX < 0 ? -minX : 0;
  const shiftY = minY < 0 ? -minY : 0;
  return rooms.map(r => ({ ...r, x: r.x + shiftX, y: r.y + shiftY }));
}

// ─── Step 3: Auto-Snapping & Collision Resolution ───────────────────────────

/** Snap a coordinate to the nearest grid increment (default 10cm) */
function snapToGrid(value: number, grid = 10): number {
  return Math.round(value / grid) * grid;
}

/**
 * After moving a room, push any room it now overlaps out of the way.
 * Uses the minimum-overlap axis to decide push direction so rooms end up flush.
 * Runs up to 10 passes to handle cascading collisions.
 */
function resolveRoomOverlaps(
  rooms: FloorPlanRoom[],
  anchorId: string
): { rooms: FloorPlanRoom[]; resolved: string[] } {
  const resolved: string[] = [];
  let updatedRooms = rooms.map(r => ({ ...r }));
  let changed = true;
  let passes = 0;

  while (changed && passes < 10) {
    changed = false;
    passes++;
    const anchor = updatedRooms.find(r => r.id === anchorId)!;

    for (let i = 0; i < updatedRooms.length; i++) {
      const other = updatedRooms[i];
      if (other.id === anchorId) continue;

      const overlapX = Math.max(0, Math.min(anchor.x + anchor.width, other.x + other.width) - Math.max(anchor.x, other.x));
      const overlapY = Math.max(0, Math.min(anchor.y + anchor.height, other.y + other.height) - Math.max(anchor.y, other.y));

      if (overlapX > 1 && overlapY > 1) {
        // Push in the direction of smallest overlap (least disruption)
        if (overlapX <= overlapY) {
          const pushRight = (other.x + other.width / 2) > (anchor.x + anchor.width / 2);
          updatedRooms[i] = {
            ...other,
            x: snapToGrid(pushRight ? anchor.x + anchor.width : anchor.x - other.width),
          };
        } else {
          const pushDown = (other.y + other.height / 2) > (anchor.y + anchor.height / 2);
          updatedRooms[i] = {
            ...other,
            y: snapToGrid(pushDown ? anchor.y + anchor.height : anchor.y - other.height),
          };
        }
        if (!resolved.includes(other.name)) resolved.push(other.name);
        changed = true;
      }
    }
  }

  return { rooms: updatedRooms, resolved };
}

// ─── Shared Wall Detection & Cascade Helpers ────────────────────────────────
const WALL_DETECT_TOLERANCE = 5;

function detectBlockedWalls(
  room: FloorPlanRoom,
  allRooms: FloorPlanRoom[]
): { blocked: Record<CardinalDirection, FloorPlanRoom[]>; free: CardinalDirection[] } {
  const otherRooms = allRooms.filter(r => r.id !== room.id);
  const blocked: Record<CardinalDirection, FloorPlanRoom[]> = { north: [], south: [], east: [], west: [] };

  for (const other of otherRooms) {
    if (Math.abs((other.y + other.height) - room.y) < WALL_DETECT_TOLERANCE &&
        Math.max(other.x, room.x) < Math.min(other.x + other.width, room.x + room.width) - WALL_DETECT_TOLERANCE) {
      blocked.north.push(other);
    }
    if (Math.abs(other.y - (room.y + room.height)) < WALL_DETECT_TOLERANCE &&
        Math.max(other.x, room.x) < Math.min(other.x + other.width, room.x + room.width) - WALL_DETECT_TOLERANCE) {
      blocked.south.push(other);
    }
    if (Math.abs((other.x + other.width) - room.x) < WALL_DETECT_TOLERANCE &&
        Math.max(other.y, room.y) < Math.min(other.y + other.height, room.y + room.height) - WALL_DETECT_TOLERANCE) {
      blocked.west.push(other);
    }
    if (Math.abs(other.x - (room.x + room.width)) < WALL_DETECT_TOLERANCE &&
        Math.max(other.y, room.y) < Math.min(other.y + other.height, room.y + room.height) - WALL_DETECT_TOLERANCE) {
      blocked.east.push(other);
    }
  }

  const free: CardinalDirection[] = [];
  for (const dir of ["south", "east", "north", "west"] as CardinalDirection[]) {
    if (blocked[dir].length === 0) free.push(dir);
  }

  return { blocked, free };
}

function collectCascadeShifts(
  initialBlockers: FloorPlanRoom[],
  direction: CardinalDirection,
  allRooms: FloorPlanRoom[],
  excludeId: string
): Set<string> {
  const roomsToShift = new Set<string>();

  const collect = (sourceRoom: FloorPlanRoom, dir: CardinalDirection) => {
    for (const other of allRooms) {
      if (other.id === sourceRoom.id || roomsToShift.has(other.id)) continue;
      if (other.id === excludeId) continue;
      let adjacent = false;
      if (dir === "south" && Math.abs(other.y - (sourceRoom.y + sourceRoom.height)) < WALL_DETECT_TOLERANCE &&
          Math.max(other.x, sourceRoom.x) < Math.min(other.x + other.width, sourceRoom.x + sourceRoom.width) - WALL_DETECT_TOLERANCE) {
        adjacent = true;
      }
      if (dir === "north" && Math.abs((other.y + other.height) - sourceRoom.y) < WALL_DETECT_TOLERANCE &&
          Math.max(other.x, sourceRoom.x) < Math.min(other.x + other.width, sourceRoom.x + sourceRoom.width) - WALL_DETECT_TOLERANCE) {
        adjacent = true;
      }
      if (dir === "east" && Math.abs(other.x - (sourceRoom.x + sourceRoom.width)) < WALL_DETECT_TOLERANCE &&
          Math.max(other.y, sourceRoom.y) < Math.min(other.y + other.height, sourceRoom.y + sourceRoom.height) - WALL_DETECT_TOLERANCE) {
        adjacent = true;
      }
      if (dir === "west" && Math.abs((other.x + other.width) - sourceRoom.x) < WALL_DETECT_TOLERANCE &&
          Math.max(other.y, sourceRoom.y) < Math.min(other.y + other.height, sourceRoom.y + sourceRoom.height) - WALL_DETECT_TOLERANCE) {
        adjacent = true;
      }
      if (adjacent) {
        roomsToShift.add(other.id);
        collect(other, dir);
      }
    }
  };

  for (const blocker of initialBlockers) {
    roomsToShift.add(blocker.id);
    collect(blocker, direction);
  }

  return roomsToShift;
}

function resolveRoomByRef(rooms: FloorPlanRoom[], roomRef: string): FloorPlanRoom | null {
  if (!roomRef) return null;
  const ref = roomRef.toLowerCase().trim();
  const byId = rooms.find(r => r.id === roomRef);
  if (byId) return byId;
  const byExactName = rooms.find(r => r.name.toLowerCase() === ref);
  if (byExactName) return byExactName;
  const byContains = rooms.find(r => r.name.toLowerCase().includes(ref) || ref.includes(r.name.toLowerCase()));
  return byContains || null;
}

function getRoomsTouchingSide(source: FloorPlanRoom, rooms: FloorPlanRoom[], side: CardinalDirection): FloorPlanRoom[] {
  const TOLERANCE = 5;
  const touching: FloorPlanRoom[] = [];
  for (const other of rooms) {
    if (other.id === source.id) continue;
    if (side === "north" && Math.abs((other.y + other.height) - source.y) < TOLERANCE && Math.max(other.x, source.x) < Math.min(other.x + other.width, source.x + source.width) - TOLERANCE) {
      touching.push(other);
    }
    if (side === "south" && Math.abs(other.y - (source.y + source.height)) < TOLERANCE && Math.max(other.x, source.x) < Math.min(other.x + other.width, source.x + source.width) - TOLERANCE) {
      touching.push(other);
    }
    if (side === "west" && Math.abs((other.x + other.width) - source.x) < TOLERANCE && Math.max(other.y, source.y) < Math.min(other.y + other.height, source.y + source.height) - TOLERANCE) {
      touching.push(other);
    }
    if (side === "east" && Math.abs(other.x - (source.x + source.width)) < TOLERANCE && Math.max(other.y, source.y) < Math.min(other.y + other.height, source.y + source.height) - TOLERANCE) {
      touching.push(other);
    }
  }
  return touching;
}

function cascadeShiftRooms(
  rooms: FloorPlanRoom[],
  seedRoomIds: string[],
  side: CardinalDirection,
  delta: number,
  ignoreIds: Set<string> = new Set()
): FloorPlanRoom[] {
  const TOLERANCE = 5;
  const toShift = new Set(seedRoomIds.filter(id => !ignoreIds.has(id)));

  let changed = true;
  while (changed) {
    changed = false;
    const currentShifting = rooms.filter(r => toShift.has(r.id));
    for (const source of currentShifting) {
      for (const other of rooms) {
        if (other.id === source.id || toShift.has(other.id) || ignoreIds.has(other.id)) continue;
        let adjacent = false;
        if (side === "south" && Math.abs(other.y - (source.y + source.height)) < TOLERANCE && Math.max(other.x, source.x) < Math.min(other.x + other.width, source.x + source.width) - TOLERANCE) adjacent = true;
        if (side === "north" && Math.abs((other.y + other.height) - source.y) < TOLERANCE && Math.max(other.x, source.x) < Math.min(other.x + other.width, source.x + source.width) - TOLERANCE) adjacent = true;
        if (side === "east" && Math.abs(other.x - (source.x + source.width)) < TOLERANCE && Math.max(other.y, source.y) < Math.min(other.y + other.height, source.y + source.height) - TOLERANCE) adjacent = true;
        if (side === "west" && Math.abs((other.x + other.width) - source.x) < TOLERANCE && Math.max(other.y, source.y) < Math.min(other.y + other.height, source.y + source.height) - TOLERANCE) adjacent = true;
        if (adjacent) {
          toShift.add(other.id);
          changed = true;
        }
      }
    }
  }

  return rooms.map(r => {
    if (!toShift.has(r.id)) return r;
    if (side === "south") return { ...r, y: r.y + delta };
    if (side === "north") return { ...r, y: r.y - delta };
    if (side === "east") return { ...r, x: r.x + delta };
    return { ...r, x: r.x - delta };
  });
}

function connectOrPairRooms(
  floorPlan: FloorPlan,
  roomRef1: string,
  roomRef2: string,
  preferredSide?: CardinalDirection
): { floorPlan: FloorPlan; actions: string[]; error?: string } {
  let updatedRooms = floorPlan.rooms.map(r => ({ ...r }));
  let room1 = resolveRoomByRef(updatedRooms, roomRef1);
  let room2 = resolveRoomByRef(updatedRooms, roomRef2);

  if (!room1 || !room2) {
    return { floorPlan, actions: [], error: `Could not find both rooms (got: "${roomRef1}" and "${roomRef2}")` };
  }
  if (room1.id === room2.id) {
    return { floorPlan, actions: [], error: "Cannot connect a room to itself" };
  }

  const actions: string[] = [];

  // If already adjacent, just ensure there is a direct door
  let sharedWall = findSharedWall(room1, room2);

  if (!sharedWall) {
    const room2Area = room2.width * room2.height;

    // Helper: compute best dimensions for room2 on a given side of room1
    function bestFitForSide(side: CardinalDirection, r1: FloorPlanRoom, r2Type: string, origW: number, origH: number, area: number): { w: number; h: number; rotated: boolean; reshaped: boolean } {
      const isHorizontal = side === "east" || side === "west";
      const wallLen = isHorizontal ? r1.height : r1.width;
      const minD = Math.min(ROOM_MIN_DIMS[r2Type]?.minW || 150, ROOM_MIN_DIMS[r2Type]?.minH || 150);

      const opt1_along = isHorizontal ? origH : origW;
      const opt1_perp = isHorizontal ? origW : origH;

      const opt2_along = isHorizontal ? origW : origH;
      const opt2_perp = isHorizontal ? origH : origW;

      const opt3_along = wallLen;
      const opt3_perp = Math.round(area / wallLen);

      const opt4_along = wallLen;
      const opt4_perp = Math.max(opt3_perp, minD);

      function score(along: number, perp: number, isExpanded: boolean = false): number {
        const wallFit = Math.abs(along - wallLen);
        const aspectRatio = Math.max(along, perp) / Math.max(1, Math.min(along, perp));
        const aspectPenalty = aspectRatio > 3 ? (aspectRatio - 3) * 500 : 0;
        const overhangPenalty = along > wallLen ? (along - wallLen) * 2 : 0;
        const thinPenalty = perp < minD ? (minD - perp) * 100 : 0;
        const expandPenalty = isExpanded ? (perp - opt3_perp) * 2 : 0;
        return wallFit + overhangPenalty + aspectPenalty + thinPenalty + expandPenalty;
      }

      const s1 = score(opt1_along, opt1_perp);
      const s2 = score(opt2_along, opt2_perp);
      const s3 = score(opt3_along, opt3_perp);
      const s4 = score(opt4_along, opt4_perp, opt4_perp > opt3_perp);

      const bonus3 = s3 < s1 && s3 < s2 ? -50 : 0;
      const bonus4 = s4 < s1 && s4 < s2 ? -100 : 0;
      
      const minScore = Math.min(s1, s2, s3 + bonus3, s4 + bonus4);

      if (minScore === s4 + bonus4) {
        return isHorizontal
          ? { w: opt4_perp, h: opt4_along, rotated: false, reshaped: true }
          : { w: opt4_along, h: opt4_perp, rotated: false, reshaped: true };
      }
      if (minScore === s3 + bonus3) {
        return isHorizontal
          ? { w: opt3_perp, h: opt3_along, rotated: false, reshaped: true }
          : { w: opt3_along, h: opt3_perp, rotated: false, reshaped: true };
      }
      if (minScore === s2) {
        return isHorizontal
          ? { w: opt2_perp, h: opt2_along, rotated: true, reshaped: false }
          : { w: opt2_along, h: opt2_perp, rotated: true, reshaped: false };
      }
      return { w: origW, h: origH, rotated: false, reshaped: false };
    }

    const sideOrder: CardinalDirection[] = preferredSide
      ? [preferredSide, "west", "east", "south", "north"].filter((v, i, arr) => arr.indexOf(v as CardinalDirection) === i) as CardinalDirection[]
      : ["west", "east", "south", "north"];

    // Score each side considering blockers AND fit quality
    const candidates = sideOrder.map(side => {
      const blockers = getRoomsTouchingSide(room1!, updatedRooms.filter(r => r.id !== room1!.id && r.id !== room2!.id), side);
      const blockerCost = blockers.reduce((s, r) => s + r.width * r.height, 0) + blockers.length * 1000;
      const fit = bestFitForSide(side, room1!, room2!.type, room2!.width, room2!.height, room2Area);
      const isHorizontal = side === "east" || side === "west";
      const wallLen = isHorizontal ? room1!.height : room1!.width;
      const fitAlong = isHorizontal ? fit.h : fit.w;
      const overhang = Math.max(0, fitAlong - wallLen);
      const fitCost = overhang * 2 + (fit.reshaped ? 50 : 0); // slight penalty for reshaping
      return { side, blockers, fit, cost: blockerCost + fitCost };
    }).sort((a, b) => a.cost - b.cost);

    const chosen = candidates[0];
    const moveSide = chosen.side;
    const fitResult = chosen.fit;

    // Apply rotation/reshape to room2
    if (fitResult.reshaped) {
      updatedRooms = updatedRooms.map(r => r.id === room2!.id ? { ...r, width: fitResult.w, height: fitResult.h } : r);
      actions.push(`Reshaped "${room2.name}" to ${fitResult.w / 100}m × ${fitResult.h / 100}m to fit alongside "${room1.name}"`);
    } else if (fitResult.rotated) {
      updatedRooms = updatedRooms.map(r => r.id === room2!.id ? { ...r, width: fitResult.w, height: fitResult.h } : r);
      actions.push(`Rotated "${room2.name}" to ${fitResult.w / 100}m × ${fitResult.h / 100}m for better fit`);
    }

    // Shift blockers in cascade to make space for pairing
    const r2now = updatedRooms.find(r => r.id === room2!.id)!;
    const shiftDelta = (moveSide === "east" || moveSide === "west") ? r2now.width : r2now.height;
    if (chosen.blockers.length > 0) {
      updatedRooms = cascadeShiftRooms(
        updatedRooms,
        chosen.blockers.map(r => r.id),
        moveSide,
        shiftDelta,
        new Set([room1.id, room2.id])
      );
      actions.push(`Shifted ${chosen.blockers.length} room(s) ${moveSide} to make space`);
    }

    room1 = updatedRooms.find(r => r.id === room1!.id)!;
    const movedRoom2 = updatedRooms.find(r => r.id === room2!.id)!;

    // Place room2 directly adjacent to room1, aligned to room1's edge
    let nx = movedRoom2.x;
    let ny = movedRoom2.y;
    if (moveSide === "west") {
      nx = room1.x - movedRoom2.width;
      ny = room1.y;
    } else if (moveSide === "east") {
      nx = room1.x + room1.width;
      ny = room1.y;
    } else if (moveSide === "north") {
      nx = room1.x;
      ny = room1.y - movedRoom2.height;
    } else {
      nx = room1.x;
      ny = room1.y + room1.height;
    }

    updatedRooms = updatedRooms.map(r => r.id === movedRoom2.id ? { ...r, x: Math.round(nx), y: Math.round(ny) } : r);
    actions.push(`Moved "${movedRoom2.name}" to ${moveSide} side of "${room1.name}"`);

    // If any residual overlaps with moved room, push those rooms once in the same direction
    const movedNow = updatedRooms.find(r => r.id === movedRoom2.id)!;
    const overlapIds = updatedRooms
      .filter(r => r.id !== movedNow.id && roomsOverlap(movedNow, r))
      .map(r => r.id);
    if (overlapIds.length > 0) {
      updatedRooms = cascadeShiftRooms(
        updatedRooms,
        overlapIds,
        moveSide,
        shiftDelta,
        new Set([room1.id, movedNow.id])
      );
      actions.push(`Resolved ${overlapIds.length} overlap(s) by shifting rooms ${moveSide}`);
    }

    updatedRooms = normalizeRoomCoordinates(updatedRooms);
    room1 = updatedRooms.find(r => r.id === room1!.id)!;
    room2 = updatedRooms.find(r => r.id === movedRoom2.id)!;
    sharedWall = findSharedWall(room1, room2);
  }

  const totalWidth = Math.max(...updatedRooms.map(r => r.x + r.width));
  const totalHeight = Math.max(...updatedRooms.map(r => r.y + r.height));

  let newPlan: FloorPlan = {
    ...floorPlan,
    rooms: updatedRooms,
    doors: autoGenerateDoors(updatedRooms),
    windows: autoGenerateWindows(updatedRooms),
    totalWidth,
    totalHeight,
  };

  // Ensure a direct door exists between paired rooms
  if (sharedWall) {
    const hasDirectDoor = newPlan.doors.some(d =>
      (d.roomId1 === room1.id && d.roomId2 === room2.id) ||
      (d.roomId1 === room2.id && d.roomId2 === room1.id)
    );
    if (!hasDirectDoor) {
      const doorWidth = 90;
      const directDoor: FloorPlanDoor = sharedWall.orientation === "horizontal"
        ? {
            id: generateId(),
            roomId1: room1.id,
            roomId2: room2.id,
            x: Math.round(sharedWall.x + sharedWall.length / 2 - doorWidth / 2),
            y: Math.round(sharedWall.y),
            width: doorWidth,
            orientation: "horizontal",
          }
        : {
            id: generateId(),
            roomId1: room1.id,
            roomId2: room2.id,
            x: Math.round(sharedWall.x),
            y: Math.round(sharedWall.y + sharedWall.length / 2 - doorWidth / 2),
            width: doorWidth,
            orientation: "vertical",
          };
      newPlan = { ...newPlan, doors: [...newPlan.doors, directDoor] };
      actions.push(`Added direct door between "${room1.name}" and "${room2.name}"`);
    }
  }

  const { plan: repairedPlan, repairs } = autoRepairFloorPlan(newPlan);
  if (repairs.length > 0) actions.push(...repairs);

  if (!sharedWall) {
    return {
      floorPlan: repairedPlan,
      actions,
      error: `Could not place "${room2.name}" adjacent to "${room1.name}" with current constraints.`,
    };
  }

  // Final check: Did the cascade shift disconnect any rooms?
  // Let's run a check to ensure all bedrooms still connect to the hallway.
  const allRoomsAfter = repairedPlan.rooms;
  const hallway = allRoomsAfter.find(r => r.type === 'hallway');
  if (hallway) {
    // Check if any bedroom/bathroom is no longer touching the hallway or another connected room
    const touchedRooms = new Set<string>();
    touchedRooms.add(hallway.id);
    let added = true;
    while(added) {
      added = false;
      for (const r of allRoomsAfter) {
        if (!touchedRooms.has(r.id)) {
           for (const tr of Array.from(touchedRooms)) {
             const tRoom = allRoomsAfter.find(x => x.id === tr);
             if (tRoom && findSharedWall(r, tRoom)) {
               touchedRooms.add(r.id);
               added = true;
               break;
             }
           }
        }
      }
    }

    const isolatedPrivateRooms = allRoomsAfter.filter(r => !touchedRooms.has(r.id) && ['bedroom', 'bathroom', 'office'].includes(r.type));
    
    if (isolatedPrivateRooms.length > 0) {
       // Expand hallway to reach the isolated rooms
       const maxY = Math.max(...isolatedPrivateRooms.map(r => r.y + r.height));
       const minY = Math.min(...isolatedPrivateRooms.map(r => r.y));
       
       let updatedHallwayHeight = hallway.height;
       let updatedHallwayY = hallway.y;

       if (minY < hallway.y) {
         updatedHallwayHeight += (hallway.y - minY);
         updatedHallwayY = minY;
       }
       if (maxY > updatedHallwayY + updatedHallwayHeight) {
         updatedHallwayHeight = maxY - updatedHallwayY;
       }

       const newHallway = { ...hallway, y: updatedHallwayY, height: updatedHallwayHeight };
       repairedPlan.rooms = repairedPlan.rooms.map(r => r.id === hallway.id ? newHallway : r);
       repairedPlan.doors = autoGenerateDoors(repairedPlan.rooms);
       actions.push(`Expanded Hallway to maintain connectivity to isolated rooms.`);
    }
  }

  return { floorPlan: repairedPlan, actions };
}

// ─── Floor Plan Tool Processor ──────────────────────────────────────────────
function processFloorPlanTool(
  name: string, args: Record<string, unknown>, floorPlan: FloorPlan
): { result: string; floorPlan: FloorPlan; action?: string } {
  switch (name) {
    case "generate_floor_plan": {
      const targetSqft = (args.target_sqft as number) || 2000;
      const bedrooms = (args.bedrooms as number) || 3;
      const bathroomsRaw = (args.bathrooms as number) ?? 2.5;
      const includeGarage = (args.include_garage as boolean) ?? true;
      const includeOffice = (args.include_office as boolean) ?? false;
      const includeLaundry = (args.include_laundry as boolean) ?? false;
      const extraRooms = (args.extra_rooms as RoomRequestInput[]) || [];
      const wingPrefsRaw = args.wing_preferences as { left_wing?: string[]; right_wing?: string[] } | undefined;
      const wingPrefs: WingPreferences | undefined = wingPrefsRaw
        ? { leftWing: wingPrefsRaw.left_wing, rightWing: wingPrefsRaw.right_wing }
        : undefined;

      // Build room list from parameters
      const requestedRooms: RoomRequestInput[] = [];

      // Living room + kitchen + dining (always included)
      requestedRooms.push({ type: "living-room" });
      requestedRooms.push({ type: "kitchen" });
      requestedRooms.push({ type: "dining-room" });

      // Entry
      requestedRooms.push({ type: "entry" });

      // Bedrooms: first is master (large)
      for (let i = 1; i <= bedrooms; i++) {
        if (i === 1) {
          requestedRooms.push({ type: "master-bedroom", size: "large" });
        } else {
          requestedRooms.push({ type: `bedroom-${i}` });
        }
      }

      // Bathrooms: full baths + optional half bath
      const fullBaths = Math.floor(bathroomsRaw);
      const hasHalfBath = bathroomsRaw % 1 >= 0.5;
      for (let i = 1; i <= fullBaths; i++) {
        if (i === 1 && bedrooms >= 1) {
          requestedRooms.push({ type: "master-bathroom" });
        } else {
          requestedRooms.push({ type: `bathroom-${i}` });
        }
      }
      if (hasHalfBath) {
        requestedRooms.push({ type: "bathroom", size: "small" }); // half bath / powder room
      }

      // Garage
      if (includeGarage) {
        requestedRooms.push({ type: "garage" });
      }

      // Optional rooms
      if (includeOffice) requestedRooms.push({ type: "office" });
      if (includeLaundry) requestedRooms.push({ type: "laundry" });

      // Extra rooms
      requestedRooms.push(...extraRooms);

      console.log(`generate_floor_plan: ${bedrooms} bed, ${bathroomsRaw} bath, ${targetSqft} sqft, garage=${includeGarage}, rooms=${requestedRooms.length}`);

      // Use the template-based layout engine
      const rooms = generateProceduralLayout(requestedRooms, targetSqft, wingPrefs);
      
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
      const room = resolveRoomByRef(floorPlan.rooms, roomId);
      if (!room) return { result: JSON.stringify({ success: false, reason: `Room not found: ${roomId}` }), floorPlan };
      if (!targetSqft || targetSqft < 20) return { result: JSON.stringify({ success: false, reason: "target_sqft must be >= 20" }), floorPlan };

      const currentAreaCm2 = room.width * room.height;
      const targetAreaCm2 = targetSqft * 929;
      const areaRatio = targetAreaCm2 / currentAreaCm2;
      const isExpanding = areaRatio > 1;

      const { blocked: blockedWalls, free: freeWalls } = detectBlockedWalls(room, floorPlan.rooms);

      const actions: string[] = [];
      let updatedRooms = [...floorPlan.rooms];
      const roomIdx = updatedRooms.findIndex(r => r.id === room.id);
      let r = { ...updatedRooms[roomIdx] };

      if (freeWalls.length > 0 || !isExpanding) {
        const preferredExpand = freeWalls.filter(d => d === "south" || d === "east");
        const expandDirs = preferredExpand.length > 0 ? preferredExpand : freeWalls;

        if (expandDirs.includes("south") || expandDirs.includes("north")) {
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
        // All walls blocked — pick direction with fewest/smallest neighbors to push
        const dirCosts: { dir: CardinalDirection; cost: number }[] = [];
        for (const dir of ["south", "east", "north", "west"] as CardinalDirection[]) {
          const totalBlockerArea = blockedWalls[dir].reduce((s, br) => s + br.width * br.height, 0);
          dirCosts.push({ dir, cost: blockedWalls[dir].length * 1000 + totalBlockerArea });
        }
        dirCosts.sort((a, b) => a.cost - b.cost);
        const pushDir = dirCosts[0].dir;

        let deltaSize: number;
        if (pushDir === "south" || pushDir === "north") {
          const newHeight = Math.round(targetAreaCm2 / r.width);
          deltaSize = newHeight - r.height;
        } else {
          const newWidth = Math.round(targetAreaCm2 / r.height);
          deltaSize = newWidth - r.width;
        }

        const roomsToShift = collectCascadeShifts(blockedWalls[pushDir], pushDir, updatedRooms, room.id);

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

      updatedRooms[roomIdx] = r;
      updatedRooms = normalizeRoomCoordinates(updatedRooms);

      const newTotalWidth = Math.max(...updatedRooms.map(rm => rm.x + rm.width));
      const newTotalHeight = Math.max(...updatedRooms.map(rm => rm.y + rm.height));

      const newPlan: FloorPlan = {
        ...floorPlan,
        rooms: updatedRooms,
        doors: autoGenerateDoors(updatedRooms),
        windows: autoGenerateWindows(updatedRooms),
        totalWidth: newTotalWidth,
        totalHeight: newTotalHeight,
      };

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

    case "reshape_room_boundary": {
      const roomId = args.room_id as string;
      const wall = args.wall as CardinalDirection;
      const distanceCm = Math.round(args.distance_cm as number);
      const room = resolveRoomByRef(floorPlan.rooms, roomId);
      if (!room) return { result: JSON.stringify({ success: false, reason: `Room not found: ${roomId}` }), floorPlan };
      if (!wall || !["north", "south", "east", "west"].includes(wall)) {
        return { result: JSON.stringify({ success: false, reason: "wall must be north, south, east, or west" }), floorPlan };
      }
      if (!distanceCm || distanceCm === 0) {
        return { result: JSON.stringify({ success: false, reason: "distance_cm must be non-zero." }), floorPlan };
      }

      // 1. Detect neighbors touching this wall
      const { blocked: blockedWalls } = detectBlockedWalls(room, floorPlan.rooms);
      const blockingNeighbors = blockedWalls[wall];

      const MIN_DIM = 120;
      let clampedDistance = distanceCm;
      const isVertical = wall === "north" || wall === "south";
      const currentDim = isVertical ? room.height : room.width;
      
      // 2. Clamp for target room's minimum dimension
      const newDimTarget = currentDim + Math.abs(clampedDistance) * (clampedDistance > 0 ? 1 : -1);
      if (newDimTarget < MIN_DIM) {
        clampedDistance = -(currentDim - MIN_DIM);
      }

      // 3. Clamp for neighbors' minimum dimensions (if expanding room outward, neighbors shrink)
      if (clampedDistance > 0 && blockingNeighbors.length > 0) {
        let maxAllowedExpand = Infinity;
        for (const neighbor of blockingNeighbors) {
           const nDim = isVertical ? neighbor.height : neighbor.width;
           const availableToShrink = nDim - MIN_DIM;
           if (availableToShrink < maxAllowedExpand) {
             maxAllowedExpand = availableToShrink;
           }
        }
        if (clampedDistance > maxAllowedExpand) {
           clampedDistance = Math.max(0, maxAllowedExpand);
        }
      }

      if (Math.abs(clampedDistance) < 1) {
        return { result: JSON.stringify({ success: false, reason: `Cannot move wall. Would violate minimum room dimension limit (${MIN_DIM}cm).` }), floorPlan };
      }

      const absDist = Math.abs(clampedDistance);
      const actualIsExpanding = clampedDistance > 0;
      
      // 4. Calculate raw delta vector for the specific wall's edge
      let deltaX = 0, deltaY = 0;
      if (wall === "north") deltaY = actualIsExpanding ? -absDist : absDist;
      if (wall === "south") deltaY = actualIsExpanding ? absDist : -absDist;
      if (wall === "west") deltaX = actualIsExpanding ? -absDist : absDist;
      if (wall === "east") deltaX = actualIsExpanding ? absDist : -absDist;

      const actions: string[] = [];
      let updatedRooms = [...floorPlan.rooms];
      const roomIdx = updatedRooms.findIndex(r => r.id === room.id);
      let r = { ...updatedRooms[roomIdx] };

      // 5. Apply movement to Target Room
      if (wall === "north") { r.y += deltaY; r.height -= deltaY; }
      else if (wall === "south") { r.height += deltaY; }
      else if (wall === "west") { r.x += deltaX; r.width -= deltaX; }
      else if (wall === "east") { r.width += deltaX; }

      const verb = actualIsExpanding ? "Expanded" : "Contracted";
      actions.push(`${verb} ${r.name} ${wall} wall by ${absDist}cm`);

      // 6. Apply symmetrical resizing to touching neighbors (Simulates dragging a shared partition)
      const modifiedNeighborIds = new Set<string>();
      if (blockingNeighbors.length > 0) {
        updatedRooms = updatedRooms.map(rm => {
          if (!blockingNeighbors.some(b => b.id === rm.id)) return rm;
          modifiedNeighborIds.add(rm.id);
          const shifted = { ...rm };
          if (wall === "north") {
            // Neighbor is on the North. Its South wall moves by deltaY
            shifted.height += deltaY; 
          } else if (wall === "south") {
            // Neighbor is on the South. Its North wall moves by deltaY
            shifted.y += deltaY;
            shifted.height -= deltaY;
          } else if (wall === "west") {
            // Neighbor is on the West. Its East wall moves by deltaX
            shifted.width += deltaX;
          } else if (wall === "east") {
            // Neighbor is on the East. Its West wall moves by deltaX
            shifted.x += deltaX;
            shifted.width -= deltaX;
          }
          return shifted;
        });
        actions.push(`Synchronized shared wall for ${modifiedNeighborIds.size} adjacent room(s)`);
      } else {
        // 7. Snap logic: Only applies if moving into empty space
        const SNAP_THRESHOLD = 20;
        for (const other of updatedRooms) {
          if (other.id === room.id || modifiedNeighborIds.has(other.id)) continue;
          if (wall === "north") {
            const otherBottom = other.y + other.height;
            const gap = Math.abs(r.y - otherBottom);
            if (gap > 0 && gap < SNAP_THRESHOLD && Math.max(other.x, r.x) < Math.min(other.x + other.width, r.x + r.width)) {
              const snapDelta = r.y - otherBottom; r.y = otherBottom; r.height += snapDelta; actions.push(`Snapped flush to ${other.name}`);
            }
          } else if (wall === "south") {
            const roomBottom = r.y + r.height;
            const gap = Math.abs(roomBottom - other.y);
            if (gap > 0 && gap < SNAP_THRESHOLD && Math.max(other.x, r.x) < Math.min(other.x + other.width, r.x + r.width)) {
              r.height += (other.y - roomBottom); actions.push(`Snapped flush to ${other.name}`);
            }
          } else if (wall === "west") {
            const otherRight = other.x + other.width;
            const gap = Math.abs(r.x - otherRight);
            if (gap > 0 && gap < SNAP_THRESHOLD && Math.max(other.y, r.y) < Math.min(other.y + other.height, r.y + r.height)) {
              const snapDelta = r.x - otherRight; r.x = otherRight; r.width += snapDelta; actions.push(`Snapped flush to ${other.name}`);
            }
          } else if (wall === "east") {
            const roomRight = r.x + r.width;
            const gap = Math.abs(roomRight - other.x);
            if (gap > 0 && gap < SNAP_THRESHOLD && Math.max(other.y, r.y) < Math.min(other.y + other.height, r.y + r.height)) {
              r.width += (other.x - roomRight); actions.push(`Snapped flush to ${other.name}`);
            }
          }
        }
      }

      updatedRooms[roomIdx] = r;
      updatedRooms = normalizeRoomCoordinates(updatedRooms);

      const newTotalWidth = Math.max(...updatedRooms.map(rm => rm.x + rm.width));
      const newTotalHeight = Math.max(...updatedRooms.map(rm => rm.y + rm.height));

      const newPlan: FloorPlan = {
        ...floorPlan,
        rooms: updatedRooms,
        doors: autoGenerateDoors(updatedRooms),
        windows: autoGenerateWindows(updatedRooms),
        totalWidth: newTotalWidth,
        totalHeight: newTotalHeight,
      };

      const { plan: repairedPlan, repairs } = autoRepairFloorPlan(newPlan);
      const newSqft = Math.round((r.width * r.height) / 929);

      return {
        result: JSON.stringify({
          success: true,
          new_sqft: newSqft,
          room_dimensions: { width: r.width, height: r.height },
          actions: [...actions, ...repairs],
        }),
        floorPlan: repairedPlan,
        action: `${verb} ${room.name} ${wall} wall by ${absDist}cm → ~${newSqft} sqft`,
      };
    }

    case "snap_rooms_together": {
      const roomId = args.room_id as string;
      const targetRoomId = args.target_room_id as string;
      // Use resolveRoomByRef to allow the agent to pass names if it failed to use the ID correctly
      const room = resolveRoomByRef(floorPlan.rooms, roomId);
      const targetRoom = resolveRoomByRef(floorPlan.rooms, targetRoomId);
      if (!room) return { result: JSON.stringify({ success: false, reason: `Room not found for reference: ${roomId}` }), floorPlan };
      if (!targetRoom) return { result: JSON.stringify({ success: false, reason: `Target room not found for reference: ${targetRoomId}` }), floorPlan };


      // Auto-detect the closest wall direction using Bounding Box edge gaps
      const gaps = {
        north: room.y - (targetRoom.y + targetRoom.height), // Target is above room
        south: targetRoom.y - (room.y + room.height),       // Target is below room
        west: room.x - (targetRoom.x + targetRoom.width),   // Target is left of room
        east: targetRoom.x - (room.x + room.width)          // Target is right of room
      };

      let wall: CardinalDirection = "north";
      let distanceCm = Infinity;

      // Find the direction with the smallest positive gap (the closest facing walls)
      for (const [dir, gap] of Object.entries(gaps)) {
        const isVerticalGap = dir === "north" || dir === "south";
        const alignsHorizontally = Math.max(room.x, targetRoom.x) < Math.min(room.x + room.width, targetRoom.x + targetRoom.width);
        const alignsVertically = Math.max(room.y, targetRoom.y) < Math.min(room.y + room.height, targetRoom.y + targetRoom.height);

        if ((isVerticalGap ? alignsHorizontally : alignsVertically) && gap >= -5 && gap < distanceCm) {
          distanceCm = gap;
          wall = dir as CardinalDirection;
        }
      }

      // Fallback if they don't cleanly align on an axis: take the absolute closest edge
      if (distanceCm === Infinity) {
        for (const [dir, gap] of Object.entries(gaps)) {
          if (gap >= -5 && gap < distanceCm) {
            distanceCm = gap;
            wall = dir as CardinalDirection;
          }
        }
      }

      if (distanceCm <= 0 || distanceCm === Infinity) {
        return { result: JSON.stringify({ success: false, reason: `${room.name} already meets or overlaps ${targetRoom.name}. No gap to close.` }), floorPlan };
      }

      distanceCm = Math.round(distanceCm);

      const absDist = distanceCm;
      const snapActions: string[] = [`Expanded ${room.name} ${wall} wall by ${absDist}cm to meet ${targetRoom.name}`];
      let updatedRooms = floorPlan.rooms.map(rm => ({ ...rm }));
      const roomIdx = updatedRooms.findIndex(r => r.id === room.id);
      let r = { ...updatedRooms[roomIdx] };

      // Expand the room wall
      if (wall === "north") {
        r.y = r.y - absDist;
        r.height = r.height + absDist;
      } else if (wall === "south") {
        r.height = r.height + absDist;
      } else if (wall === "west") {
        r.x = r.x - absDist;
        r.width = r.width + absDist;
      } else {
        r.width = r.width + absDist;
      }
      updatedRooms[roomIdx] = r;

      // Overlap-based collision resolution: only shift rooms that ACTUALLY collide
      // with the newly expanded room, not all rooms sharing an edge.
      const resolveOverlaps = (rooms: typeof updatedRooms, expandedRoom: typeof r, direction: CardinalDirection, excludeId: string): number => {
        let shifted = 0;
        let changed = true;
        const maxPasses = 10;
        let pass = 0;
        while (changed && pass < maxPasses) {
          changed = false;
          pass++;
          for (let i = 0; i < rooms.length; i++) {
            if (rooms[i].id === expandedRoom.id || rooms[i].id === excludeId) continue;
            const other = rooms[i];
            // Check for actual rectangle overlap (not just edge touching)
            const overlapX = Math.max(0, Math.min(expandedRoom.x + expandedRoom.width, other.x + other.width) - Math.max(expandedRoom.x, other.x));
            const overlapY = Math.max(0, Math.min(expandedRoom.y + expandedRoom.height, other.y + other.height) - Math.max(expandedRoom.y, other.y));
            if (overlapX > 2 && overlapY > 2) {
              // This room overlaps with the expanded room — push it in the expansion direction
              if (direction === "south") rooms[i] = { ...other, y: expandedRoom.y + expandedRoom.height };
              else if (direction === "north") rooms[i] = { ...other, y: expandedRoom.y - other.height };
              else if (direction === "east") rooms[i] = { ...other, x: expandedRoom.x + expandedRoom.width };
              else rooms[i] = { ...other, x: expandedRoom.x - other.width };
              shifted++;
              changed = true;
            }
          }
        }
        return shifted;
      };

      const shiftedCount = resolveOverlaps(updatedRooms, r, wall, targetRoom.id);
      if (shiftedCount > 0) {
        snapActions.push(`Shifted ${shiftedCount} overlapping room(s) to prevent collisions`);
      }
      updatedRooms = normalizeRoomCoordinates(updatedRooms);

      const newTotalWidth = Math.max(...updatedRooms.map(rm => rm.x + rm.width));
      const newTotalHeight = Math.max(...updatedRooms.map(rm => rm.y + rm.height));

      const snapPlan: FloorPlan = {
        ...floorPlan,
        rooms: updatedRooms,
        doors: autoGenerateDoors(updatedRooms),
        windows: autoGenerateWindows(updatedRooms),
        totalWidth: newTotalWidth,
        totalHeight: newTotalHeight,
      };

      const { plan: snapRepairedPlan, repairs: snapRepairs } = autoRepairFloorPlan(snapPlan);
      const snapSqft = Math.round((r.width * r.height) / 929);

      return {
        result: JSON.stringify({
          success: true,
          new_sqft: snapSqft,
          room_dimensions: { width: r.width, height: r.height },
          wall_moved: wall,
          distance_cm: absDist,
          actions: [...snapActions, ...snapRepairs],
        }),
        floorPlan: snapRepairedPlan,
        action: `Snapped ${room.name} ${wall} wall to ${targetRoom.name} (+${absDist}cm)`,
      };
    }

    case "move_room": {
      const roomId = args.room_id as string;
      const room = resolveRoomByRef(floorPlan.rooms, roomId);
      if (!room) return { result: JSON.stringify({ success: false, reason: `Room not found: ${roomId}` }), floorPlan };

      // Snap target coords to 10cm grid for clean layouts
      const targetX = snapToGrid(args.x as number);
      const targetY = snapToGrid(args.y as number);

      let updatedRooms = floorPlan.rooms.map(r =>
        r.id === room.id ? { ...r, x: targetX, y: targetY } : { ...r }
      );

      // Auto-resolve any collisions caused by the move
      const { rooms: resolvedRooms, resolved } = resolveRoomOverlaps(updatedRooms, room.id);
      updatedRooms = normalizeRoomCoordinates(resolvedRooms);

      const warnings = validateFloorPlanRooms(updatedRooms);
      const totalWidth = Math.max(...updatedRooms.map(r => r.x + r.width));
      const totalHeight = Math.max(...updatedRooms.map(r => r.y + r.height));

      const movedPlan: FloorPlan = {
        ...floorPlan,
        rooms: updatedRooms,
        doors: autoGenerateDoors(updatedRooms),
        windows: autoGenerateWindows(updatedRooms),
        totalWidth,
        totalHeight,
      };

      const { plan: repairedPlan, repairs } = autoRepairFloorPlan(movedPlan);

      return {
        result: JSON.stringify({
          success: true,
          collisions_resolved: resolved.length > 0 ? resolved : undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
          repairs: repairs.length > 0 ? repairs : undefined,
        }),
        floorPlan: repairedPlan,
        action: `Moved ${room.name}${resolved.length > 0 ? ` (pushed ${resolved.join(", ")} to prevent overlap)` : ""}`,
      };
    }

    case "close_gap": {
      const minX = args.minX as number;
      const minY = args.minY as number;
      const maxX = args.maxX as number;
      const maxY = args.maxY as number;
      const axis = args.axis as "x" | "y";

      let updatedRooms = floorPlan.rooms.map(r => ({ ...r }));

      if (axis === "x") {
        const gapWidth = maxX - minX;
        // Shift all rooms whose left edge is at or past the gap's right edge
        updatedRooms = updatedRooms.map(r =>
          r.x >= maxX - 5 ? { ...r, x: r.x - gapWidth } : r
        );
      } else {
        const gapHeight = maxY - minY;
        // Shift all rooms whose top edge is at or past the gap's bottom edge
        updatedRooms = updatedRooms.map(r =>
          r.y >= maxY - 5 ? { ...r, y: r.y - gapHeight } : r
        );
      }

      const newPlan: FloorPlan = { ...floorPlan, rooms: updatedRooms };
      const { plan: repairedPlan, repairs } = autoRepairFloorPlan(newPlan);

      return {
        result: JSON.stringify({ success: true, actions: ["Closed gap by shifting rooms", ...repairs] }),
        floorPlan: repairedPlan,
        action: `Closed ${axis === "x" ? "horizontal" : "vertical"} gap at region (${minX},${minY})-(${maxX},${maxY})`,
      };
    }

    case "merge_rooms": {
      const r1Ref = args.room_1 as string;
      const r2Ref = args.room_2 as string;
      const room1 = resolveRoomByRef(floorPlan.rooms, r1Ref);
      const room2 = resolveRoomByRef(floorPlan.rooms, r2Ref);

      if (!room1) return { result: JSON.stringify({ success: false, reason: `Room not found: ${r1Ref}` }), floorPlan };
      if (!room2) return { result: JSON.stringify({ success: false, reason: `Room not found: ${r2Ref}` }), floorPlan };

      // Expand room1's bounding box to encompass both rooms
      const minX = Math.min(room1.x, room2.x);
      const minY = Math.min(room1.y, room2.y);
      const maxX = Math.max(room1.x + room1.width, room2.x + room2.width);
      const maxY = Math.max(room1.y + room1.height, room2.y + room2.height);

      const mergedRoom: FloorPlanRoom = {
        ...room1,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        name: `${room1.name} / ${room2.name}`,
      };

      // Remove room2, update room1 to the merged bounding box
      const updatedRooms = floorPlan.rooms
        .filter(r => r.id !== room2.id)
        .map(r => r.id === room1.id ? mergedRoom : r);

      // Drop the shared wall door; re-home room2's external doors to room1
      const updatedDoors = floorPlan.doors
        .filter(d =>
          !((d.roomId1 === room1.id && d.roomId2 === room2.id) ||
            (d.roomId1 === room2.id && d.roomId2 === room1.id))
        )
        .map(d => {
          if (d.roomId1 === room2.id) return { ...d, roomId1: room1.id };
          if (d.roomId2 === room2.id) return { ...d, roomId2: room1.id };
          return d;
        });

      // Re-home room2's windows to room1
      const updatedWindows = floorPlan.windows.map(w =>
        w.roomId === room2.id ? { ...w, roomId: room1.id } : w
      );

      const mergedPlan: FloorPlan = { ...floorPlan, rooms: updatedRooms, doors: updatedDoors, windows: updatedWindows };
      const { plan: repairedPlan, repairs } = autoRepairFloorPlan(mergedPlan);

      return {
        result: JSON.stringify({ success: true, actions: [`Merged "${room1.name}" and "${room2.name}" into one room`, ...repairs] }),
        floorPlan: repairedPlan,
        action: `Merged "${room1.name}" and "${room2.name}" into a single room`,
      };
    }

    case "connect_rooms": {
      const roomRef1 = args.room_1 as string;
      const roomRef2 = args.room_2 as string;
      const preferredSide = args.preferred_side as CardinalDirection | undefined;

      const roomA = resolveRoomByRef(floorPlan.rooms, roomRef1);
      const roomB = resolveRoomByRef(floorPlan.rooms, roomRef2);
      if (!roomA || !roomB) {
        return {
          result: JSON.stringify({ success: false, reason: `Could not find rooms "${roomRef1}" and/or "${roomRef2}"` }),
          floorPlan,
        };
      }

      // Safeguard: refuse to relocate structural rooms that anchor the layout.
      // connect_rooms moves room_2. If room_2 is a structural anchor, suggest snap_rooms_together instead.
      const STRUCTURAL_TYPES = new Set(["living-room", "garage", "entry", "hallway", "kitchen", "dining-room"]);
      if (STRUCTURAL_TYPES.has(roomB.type)) {
        return {
          result: JSON.stringify({
            success: false,
            reason: `Cannot relocate "${roomB.name}" (${roomB.type}) — it is a structural room. Use snap_rooms_together to expand ${roomA.name} toward ${roomB.name} instead, or use snap_rooms_together to expand ${roomB.name} toward ${roomA.name}.`,
          }),
          floorPlan,
        };
      }

      const { floorPlan: updatedPlan, actions, error } = connectOrPairRooms(floorPlan, roomRef1, roomRef2, preferredSide);
      const sharedWall = findSharedWall(
        updatedPlan.rooms.find(r => r.id === roomA.id)!,
        updatedPlan.rooms.find(r => r.id === roomB.id)!
      );

      return {
        result: JSON.stringify({
          success: !error,
          connected: !!sharedWall,
          actions,
          error,
        }),
        floorPlan: updatedPlan,
        action: error
          ? `Attempted to connect ${roomA.name} and ${roomB.name}`
          : `Connected ${roomA.name} ↔ ${roomB.name}`,
      };
    }

    case "bridge_gap": {
      const sourceRefs = (args.source_room_ids as string[]) || [];
      const targetRefs = (args.target_room_ids as string[]) || [];
      const direction = args.direction as CardinalDirection;
      const TOLERANCE = 5; // 5cm tolerance for wall snapping

      const sourceRooms = sourceRefs.map(ref => resolveRoomByRef(floorPlan.rooms, ref)).filter(Boolean) as FloorPlanRoom[];
      const targetRooms = targetRefs.map(ref => resolveRoomByRef(floorPlan.rooms, ref)).filter(Boolean) as FloorPlanRoom[];

      if (sourceRooms.length === 0 || targetRooms.length === 0) {
        return { result: JSON.stringify({ success: false, reason: "Could not find rooms." }), floorPlan };
      }

      // 1. Calculate the target boundary coordinate
      let targetBoundary = (direction === "north" || direction === "west") ? -Infinity : Infinity;
      for (const tRoom of targetRooms) {
        if (direction === "south") targetBoundary = Math.min(targetBoundary, tRoom.y);
        else if (direction === "north") targetBoundary = Math.max(targetBoundary, tRoom.y + tRoom.height);
        else if (direction === "east") targetBoundary = Math.min(targetBoundary, tRoom.x);
        else if (direction === "west") targetBoundary = Math.max(targetBoundary, tRoom.x + tRoom.width);
      }

      let updatedRooms = [...floorPlan.rooms];
      let updatedDoors = [...floorPlan.doors];
      let updatedWindows = [...floorPlan.windows];
      const sourceIds = new Set(sourceRooms.map(r => r.id));

      // 2. Process each source room and its attachments
      for (const sRoom of sourceRooms) {
        const oldY = sRoom.y;
        const oldX = sRoom.x;
        const oldBottom = sRoom.y + sRoom.height;
        const oldRight = sRoom.x + sRoom.width;
        let delta = 0;

        // Update Room Geometry
        updatedRooms = updatedRooms.map(r => {
          if (r.id !== sRoom.id) return r;
          const nr = { ...r };
          if (direction === "south") {
            delta = targetBoundary - oldBottom;
            nr.height += delta;
          } else if (direction === "north") {
            delta = oldY - targetBoundary;
            nr.y = targetBoundary;
            nr.height += delta;
          } else if (direction === "east") {
            delta = targetBoundary - oldRight;
            nr.width += delta;
          } else if (direction === "west") {
            delta = oldX - targetBoundary;
            nr.x = targetBoundary;
            nr.width += delta;
          }
          return nr;
        });

        // 3. Move Windows on the affected wall
        updatedWindows = updatedWindows.map(w => {
          if (w.roomId !== sRoom.id || w.wall !== direction) return w;
          const nw = { ...w };
          if (direction === "south") nw.y = targetBoundary;
          else if (direction === "north") nw.y = targetBoundary;
          else if (direction === "east") nw.x = targetBoundary;
          else if (direction === "west") nw.x = targetBoundary;
          return nw;
        });

        // 4. Move Doors on the affected wall
        updatedDoors = updatedDoors.map(d => {
          const isAttached = d.roomId1 === sRoom.id || d.roomId2 === sRoom.id;
          if (!isAttached) return d;

          const nd = { ...d };
          if (direction === "south" && Math.abs(d.y - oldBottom) < TOLERANCE) nd.y = targetBoundary;
          else if (direction === "north" && Math.abs(d.y - oldY) < TOLERANCE) nd.y = targetBoundary;
          else if (direction === "east" && Math.abs(d.x - oldRight) < TOLERANCE) nd.x = targetBoundary;
          else if (direction === "west" && Math.abs(d.x - oldX) < TOLERANCE) nd.x = targetBoundary;
          
          return nd;
        });
      }

      const bridgedPlan: FloorPlan = {
        ...floorPlan,
        rooms: updatedRooms,
        doors: updatedDoors,
        windows: updatedWindows,
        totalWidth: Math.max(...updatedRooms.map(r => r.x + r.width)),
        totalHeight: Math.max(...updatedRooms.map(r => r.y + r.height)),
      };

      // Final auto-repair to ensure new shared walls get required doors
      const { plan: finalPlan, repairs } = autoRepairFloorPlan(bridgedPlan);

      return {
        result: JSON.stringify({ success: true, repairs }),
        floorPlan: finalPlan,
        action: `Bridged gap by stretching ${sourceRooms.map(r => r.name).join(", ")} ${direction} to meet ${targetRooms.map(r => r.name).join(", ")}.`
      };
    }

    case "remove_room": {
      const roomId = args.room_id as string;
      const room = resolveRoomByRef(floorPlan.rooms, roomId);
      if (!room) return { result: JSON.stringify({ success: false, reason: `Room not found: ${roomId}` }), floorPlan };

      const updated = {
        ...floorPlan,
        rooms: floorPlan.rooms.filter(r => r.id !== room.id),
        doors: floorPlan.doors.filter(d => d.roomId1 !== room.id && d.roomId2 !== room.id),
        windows: floorPlan.windows.filter(w => w.roomId !== room.id),
      };
      if (updated.rooms.length > 0) {
        updated.totalWidth = Math.max(...updated.rooms.map(r => r.x + r.width));
        updated.totalHeight = Math.max(...updated.rooms.map(r => r.y + r.height));
      }
      return { result: JSON.stringify({ success: true }), floorPlan: updated, action: `Removed ${room.name}` };
    }

    case "add_door": {
      const r1Ref = args.room_id_1 as string;
      const r2Ref = args.room_id_2 as string;
      const room1 = resolveRoomByRef(floorPlan.rooms, r1Ref);
      const room2Str = r2Ref === "exterior" ? "exterior" : resolveRoomByRef(floorPlan.rooms, r2Ref)?.id;
      
      if (!room1) return { result: JSON.stringify({ success: false, reason: `Room 1 not found: ${r1Ref}` }), floorPlan };
      if (!room2Str) return { result: JSON.stringify({ success: false, reason: `Room 2 not found: ${r2Ref}` }), floorPlan };

      let door: FloorPlanDoor = {
        id: generateId(),
        roomId1: room1.id,
        roomId2: room2Str,
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
      const roomRef = args.room_id as string;
      const resolvedRoom = resolveRoomByRef(floorPlan.rooms, roomRef);
      if (!resolvedRoom) return { result: JSON.stringify({ success: false, reason: `Room not found: ${roomRef}` }), floorPlan };

      let win: FloorPlanWindow = {
        id: generateId(),
        roomId: resolvedRoom.id,
        x: Math.round(args.x as number),
        y: Math.round(args.y as number),
        width: Math.round(args.width as number),
        orientation: args.orientation as "horizontal" | "vertical",
        wall: args.wall as "north" | "south" | "east" | "west",
      };
      
      win = snapWindowToWall(win, resolvedRoom);
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

function buildFloorPlanSystemPrompt(floorPlan: FloorPlan, selectedAgent: string): string {
  const roomsSummary = floorPlan.rooms.length === 0
    ? "No rooms yet — floor plan is empty."
    : "CURRENT ROOMS:\n" + floorPlan.rooms.map(r =>
        `  • ${r.name} [id: ${r.id}] type=${r.type} at (${r.x},${r.y}) ${r.width}×${r.height}cm (~${Math.round((r.width * r.height) / 929)} sqft)`
      ).join("\n");

  const commonContext = `
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
`;

  if (selectedAgent === "CREATOR_AGENT") {
    return `You are an expert residential floor plan creator AI. Your ONLY job is to create new floor plans (from text or sketch images).

YOU DO NOT NEED TO CALCULATE COORDINATES OR BUILD ROOM LISTS. The template-based layout engine handles everything. Your job is to:
1. Extract bedrooms, bathrooms, and target sqft from the user's instructions.
2. Extract any SPATIAL/DIRECTIONAL preferences for room placement.
3. Call generate_floor_plan with those values.

═══ DEFAULT VALUES ═══
- Bedrooms: 3
- Bathrooms: 2.5 (2 full bathrooms + 1 half bath/powder room)
- Square footage: 2000
- Garage: included
- Office/Laundry: not included (unless asked)

═══ WING PLACEMENT (WEST/EAST) ═══
The floor plan has a LEFT (WEST) wing and a RIGHT (EAST) wing separated by a central hallway.
When the user specifies where rooms should go, pass wing_preferences to generate_floor_plan:
- "master bedroom and bathroom on the west wing" → wing_preferences: { left_wing: ["master-bedroom","master-bathroom"] }
- "all bedrooms and bathrooms on the east wing" → wing_preferences: { right_wing: ["bedroom","bathroom"] }
- "master suite on the west, other bedrooms on the east" → wing_preferences: { left_wing: ["master-bedroom","master-bathroom"], right_wing: ["bedroom","bathroom"] }
- "west wing" = left_wing, "east wing" = right_wing, "left side" = left_wing, "right side" = right_wing

If the user gives no directional preference, omit wing_preferences entirely (auto-balanced).

If generating from a sketch, use generate_from_sketch and estimate fractions carefully.
ALWAYS call validate_floor_plan after generating.
${commonContext}`;
  }

  // MODIFIER_AGENT
  return `You are an expert residential floor plan modifier AI. Your ONLY job is to edit and modify an existing layout precisely based on explicit instructions.

IMPORTANT: You are receiving SYNTHESIZED INSTRUCTIONS from a Supervisor (or from computed annotation analysis). Execute exactly what you are told.

═══ TOOL SELECTION — CRITICAL ═══

**snap_rooms_together(room_id, target_room_id)** — EXPAND a room's wall to close the gap and meet another room. THE DEFAULT CHOICE for:
  - "extend X to meet Y", "expand X toward Y", "grow X to Y"
  - Any annotation arrow from one room toward another
  - Closing gaps between rooms
  This tool KEEPS all rooms in place and just grows one room. It is SAFE.

**close_gap(minX, minY, maxX, maxY, axis)** — Shift all rooms on one side of a region to close empty space. Use ONLY when annotation data specifies this tool with exact coordinates. Never call this without annotation-provided coordinates.

**merge_rooms(room_1, room_2)** — COMBINE two rooms into one unified open space by removing the shared wall. Use for:
  - "merge", "combine", "join", "connect" two rooms into one
  - If snap_rooms_together fails because rooms already touch, and the user's intent is to unify the space, call merge_rooms immediately.

**reshape_room_boundary(room_id, wall, distance_cm)** — Move a SPECIFIC wall by an exact distance. Use for:
  - "push/pull/drag the north wall", "expand bedroom east by 2m"
  - Annotation arrows on a specific wall
  Call MULTIPLE TIMES sequentially if multiple rooms need walls moved.

**connect_rooms(room_1_id, room_2_id)** — PHYSICALLY RELOCATES room_2 next to room_1. DANGEROUS — only use when:
  - The user explicitly says "move room X next to room Y" or "place X beside Y"
  - NEVER use for "extend", "expand", "grow", or "meet" — use snap_rooms_together instead
  - NEVER use on structural rooms (living room, garage, entry, hallway, kitchen, dining room)

**bridge_gap(source_room_ids, target_room_ids, direction)** — STRETCHES rooms across empty space to meet another set of rooms. Use this instead of move_room when closing large white spaces between two groups of rooms.
**resize_room(room_id, target_sqft)** — Resize by square footage. NEVER use for wall pushing.
**move_room(room_id, x, y)** — Move room to absolute coordinates. Do NOT use to expand.

═══ RULES ═══
1. If the instruction contains exact tool calls (from annotation analysis), execute them EXACTLY as specified.
2. THE MERGE OVERRIDE: If an annotation directs you to call snap_rooms_together, but the user's text says "merge", "combine", "join", or "connect" — execute the snap first. If snap fails because rooms already touch (distanceCm = 0), IMMEDIATELY call merge_rooms to unify them. Do not stop at the failure.
3. ALWAYS call validate_floor_plan after modifications.
4. Be conversational and brief in your text response.
5. If the instruction mentions an "Unrecognized gesture", do NOT guess what it meant. Instead, tell the user warmly that you couldn't identify that particular drawing and ask them to try again — either redraw it more clearly (e.g., a straight arrow for expand, an X for delete, a circle around two rooms to connect) or just describe what they want in text.
${commonContext}`;
}

function buildSupervisorSystemPrompt(floorPlan: FloorPlan): string {
  const roomsSummary = floorPlan.rooms.length === 0
    ? "No rooms yet — floor plan is empty."
    : "CURRENT ROOMS:\n" + floorPlan.rooms.map(r =>
        `  • ${r.name} [id: ${r.id}] type=${r.type} at (${r.x},${r.y})`
      ).join("\n");

  return `You are the Supervisor Router for an AI Architectural Floor Plan App.
Your ONLY job is to analyze the user's intent and determine if this is a CREATOR task (generating a new floor plan) or a MODIFIER task (editing an existing layout).

═══ ROOM ID BADGES ═══
Every room in the screenshot has a small dark badge in its top-left corner showing: id:XXXXXXXX
That 8-char suffix matches the END of the full room ID listed in "Current Floor Plan Context" below.
Use these badges to identify WHICH room the user is referring to, then use the FULL ID from context in your "actions" array.

═══ STRUCTURED ANNOTATION DATA ═══
If the user message contains [ANNOTATION ANALYSIS ...], those are PRECISE, PROGRAMMATICALLY COMPUTED instructions.
TRUST THEM COMPLETELY. Copy the exact room IDs into your "actions" array.
Only fall back to visual interpretation for annotations marked as "Unrecognized gesture".

═══ VISUAL ANNOTATIONS (RED PENCIL) — FALLBACK ONLY ═══
Use these rules ONLY if no structured annotation data is present:
- Red arrow from room A to room B → snap_rooms_together(A, B)
- Red circle or loop drawn overlapping two rooms → snap_rooms_together(A, B)
- Red arrow on a specific wall → reshape_room_boundary for that room/wall
- Scribble/X over a room → remove_room
- Unclear or ambiguous mark → set "actions": [] and in synthesized_instruction tell the user you couldn't identify the gesture and ask them to redraw it more clearly (straight arrow to expand, X to delete, circle around two rooms to connect) or describe in text

═══ OUTPUT FORMAT ═══
You must output ONLY raw JSON. No markdown, no code blocks.
{
  "selected_agent": "CREATOR_AGENT" | "MODIFIER_AGENT",
  "reasoning": "Brief explanation of what the user wants.",
  "synthesized_instruction": "Natural language fallback description of what to do.",
  "actions": [
    {
      "tool": "snap_rooms_together",
      "args": { "room_id": "FULL_ID_FROM_CONTEXT", "target_room_id": "FULL_ID_FROM_CONTEXT" }
    }
  ]
}

ACTIONS RULES:
- "actions" must be an array of tool calls with exact full room IDs from context (not the 8-char badge suffix).
- Available tools and required args:
    snap_rooms_together   → { room_id, target_room_id }
    close_gap             → { minX, minY, maxX, maxY, axis }  ← ONLY from annotation close_gap intents; never call from text alone
    merge_rooms           → { room_1, room_2 }  ← only for explicit "merge/combine/join into one room"
    reshape_room_boundary → { room_id, wall: "north"|"south"|"east"|"west", distance_cm: number }
    move_room             → { room_id, x: number, y: number }
    remove_room           → { room_id }
    resize_room           → { room_id, target_sqft: number }
    bridge_gap            → { source_room_ids: string[], target_room_ids: string[], direction: "north"|"south"|"east"|"west" }
    generate_floor_plan   → (only for CREATOR tasks — no room IDs needed)
- For "close the gap", "fill the space", or "connect these walls" across a large white gap → ALWAYS use bridge_gap to extend the rooms. Do NOT use move_room.
- For "extend/expand/grow X to meet Y" → ALWAYS use snap_rooms_together, NEVER connect_rooms.
- For "merge/combine/join/connect two rooms into one" → ALWAYS use merge_rooms, NOT snap_rooms_together.
- If the task is ambiguous or you can't determine exact IDs, set "actions": [] and rely on synthesized_instruction.
- For CREATOR tasks, set "actions": [].

Current Floor Plan Context:
${roomsSummary}

Look carefully at the image for red pencil markings and room ID badges!`;
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
// @ts-ignore
serve(async (req: any) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages: userMessages, mode, roomState, floorPlan, roomName, canvasScreenshot, images: userImages, hasReferenceSketch, hasAnnotations, annotationAnalysis } = body;

    if (!userMessages || !Array.isArray(userMessages) || userMessages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages provided." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userApiKey = req.headers.get("x-user-api-key");
    //@ts-ignore
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const useDirectGemini = !!userApiKey;
    if (!useDirectGemini && !LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isFloorPlanMode = mode === "floorplan";
    let currentRoomState: RoomState = roomState || { roomWidth: 600, roomDepth: 500, items: [] };
    let currentFloorPlan: FloorPlan = floorPlan || { id: generateId(), name: "My Home", totalWidth: 0, totalHeight: 0, rooms: [], doors: [], windows: [] };
    const actionLog: string[] = [];
    const newItemIds: string[] = [];

    // Hop 1: Supervisor (Only for Floor Plan Mode, Furniture Mode stays single agent)
    let selectedAgent = "MODIFIER_AGENT";
    let synthesizedInstruction = "";

    const hasUserImages = userImages && userImages.length > 0;
    const hasVisualContent = hasUserImages || hasAnnotations;

    if (isFloorPlanMode) {
      // ── Supervisor bypass: if client sent fully-resolved annotation intents, skip the Supervisor ──
      const hasResolvedAnnotations = annotationAnalysis
        && Array.isArray(annotationAnalysis)
        && annotationAnalysis.length > 0
        && annotationAnalysis.every((a: any) => a.intent?.action && a.intent.action !== "unknown");

      if (hasResolvedAnnotations) {
        selectedAgent = "MODIFIER_AGENT";
        const lastUserMsg = userMessages[userMessages.length - 1];
        const userText = typeof lastUserMsg.content === "string" ? lastUserMsg.content : "";
        // Strip the [ANNOTATION ANALYSIS ...] block from user text since we build our own instruction
        const cleanUserText = userText.replace(/\[ANNOTATION ANALYSIS[^\]]*\]\s*/s, "").trim();
        const actionSteps = annotationAnalysis.map((a: any, i: number) => {
          const n = i + 1;
          const intent = a.intent;
          switch (intent.action) {
            case "reshape":
              return `${n}. Call reshape_room_boundary with room_id="${intent.roomId}" (${intent.roomName}), wall="${intent.wall}", distance_cm=${intent.distanceCm}`;
            case "snap":
              return `${n}. Call snap_rooms_together with room_id="${intent.sourceRoomId}" (${intent.sourceRoomName}), target_room_id="${intent.targetRoomId}" (${intent.targetRoomName})`;
            case "move":
              return `${n}. Call move_room with room_id="${intent.roomId}" (${intent.roomName}), x=${intent.targetX}, y=${intent.targetY}`;
            case "remove":
              return `${n}. Call remove_room with room_id="${intent.roomId}" (${intent.roomName})`;
            default: return "";
          }
        }).filter(Boolean);
        const userContext = cleanUserText ? `\nUser's message: "${cleanUserText}"` : "";
        synthesizedInstruction = `Execute these annotation-based actions in order:\n${actionSteps.join("\n")}${userContext}\n\nAfter all actions, call validate_floor_plan.`;
        console.log("Supervisor BYPASSED — using resolved annotation intents:", synthesizedInstruction);
      }

      if (!hasResolvedAnnotations) {
      const lastUserMsg = userMessages[userMessages.length - 1];
      const allImages: string[] = [];
      if (canvasScreenshot && currentFloorPlan.rooms.length > 0) {
        allImages.push(canvasScreenshot);
      }
      if (userImages && userImages.length > 0) allImages.push(...userImages);

      let messageText = lastUserMsg.content;
      if (hasReferenceSketch && allImages.length > 1) {
        messageText = `[REFERENCE: The second image is the ORIGINAL SKETCH that this floor plan is based on.]\n\n${messageText}`;
      }

      const supervisorUrl = useDirectGemini
        ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        : "https://ai.gateway.lovable.dev/v1/chat/completions";
      const supervisorKey = useDirectGemini ? userApiKey : LOVABLE_API_KEY;
      const supervisorModel = useDirectGemini 
        ? (hasVisualContent ? "gemini-2.5-pro" : "gemini-2.5-flash") 
        : (hasVisualContent ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash");

      const supervisorMessages = [
        { role: "system", content: buildSupervisorSystemPrompt(currentFloorPlan) },
        ...userMessages.slice(0, -1).map((m: any) => ({ role: m.role, content: m.content })),
        { role: "user", content: buildUserContent(messageText, allImages) }
      ];

      const supervisorRes = await fetch(supervisorUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${supervisorKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: supervisorModel,
          messages: supervisorMessages,
          response_format: { type: "json_object" }
        })
      });

      if (!supervisorRes.ok) {
        throw new Error(`Supervisor gateway returned ${supervisorRes.status}`);
      }
      const supervisorData = await supervisorRes.json();
      try {
        const parsed = JSON.parse(supervisorData.choices[0].message.content);
        selectedAgent = parsed.selected_agent || "MODIFIER_AGENT";
        console.log("Supervisor output:", parsed);

        // ── Step 2: Validate structured actions from Supervisor ──
        const supervisorActions: any[] = Array.isArray(parsed.actions) ? parsed.actions : [];
        const roomIdSet = new Set(currentFloorPlan.rooms.map((r: any) => r.id));
        const roomNameMap = new Map(currentFloorPlan.rooms.map((r: any) => [r.id, r.name]));

        const actionsAreValid = supervisorActions.length > 0 && supervisorActions.every((action: any) => {
          const args = action.args || {};
          if (args.room_id && !roomIdSet.has(args.room_id)) return false;
          if (args.target_room_id && !roomIdSet.has(args.target_room_id)) return false;
          return true;
        });

        if (actionsAreValid) {
          // Build deterministic instruction from validated structured actions — no ID guessing
          const steps = supervisorActions.map((action: any, i: number) => {
            const n = i + 1;
            const args = action.args || {};
            const rName = (id: string) => roomNameMap.get(id) || id;
            switch (action.tool) {
              case "snap_rooms_together":
                return `${n}. Call snap_rooms_together with room_id="${args.room_id}" (${rName(args.room_id)}), target_room_id="${args.target_room_id}" (${rName(args.target_room_id)})`;
              case "reshape_room_boundary":
                return `${n}. Call reshape_room_boundary with room_id="${args.room_id}" (${rName(args.room_id)}), wall="${args.wall}", distance_cm=${args.distance_cm}`;
              case "move_room":
                return `${n}. Call move_room with room_id="${args.room_id}" (${rName(args.room_id)}), x=${args.x}, y=${args.y}`;
              case "remove_room":
                return `${n}. Call remove_room with room_id="${args.room_id}" (${rName(args.room_id)})`;
              case "resize_room":
                return `${n}. Call resize_room with room_id="${args.room_id}" (${rName(args.room_id)}), target_sqft=${args.target_sqft}`;
              default: return "";
            }
          }).filter(Boolean);
          synthesizedInstruction = `Execute these actions in order:\n${steps.join("\n")}\n\nAfter all actions, call validate_floor_plan.`;
          console.log("Supervisor provided validated structured actions — deterministic path:", synthesizedInstruction);
        } else {
          // Fall back to natural language instruction
          if (supervisorActions.length > 0) {
            console.warn("Supervisor actions contained invalid room IDs — falling back to prose instruction");
          }
          synthesizedInstruction = parsed.synthesized_instruction || messageText;
        }
      } catch (e) {
        console.warn("Supervisor parsing failed:", e);
        selectedAgent = "MODIFIER_AGENT";
        synthesizedInstruction = messageText;
      }
      } // end if (!hasResolvedAnnotations)
    }

    const systemPrompt = isFloorPlanMode
      ? buildFloorPlanSystemPrompt(currentFloorPlan, selectedAgent)
      : buildRoomSystemPrompt(currentRoomState, roomName || "Room");

    let tools: any[] = furnitureTools;
    if (isFloorPlanMode) {
      if (selectedAgent === "CREATOR_AGENT") {
        tools = floorPlanTools.filter(t => ["generate_floor_plan", "generate_from_sketch", "validate_floor_plan", "list_rooms"].includes(t.function.name));
      } else {
        tools = floorPlanTools.filter(t => !["generate_floor_plan", "generate_from_sketch"].includes(t.function.name));
      }
    }

    // Hop 2: Fast Tool Execution (Text Only)
    const modelHop2 = useDirectGemini ? "gemini-2.5-flash" : "google/gemini-2.5-flash";

    // Build messages
    const aiMessages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
    ];

    for (let i = 0; i < userMessages.length; i++) {
      if (i === userMessages.length - 1 && isFloorPlanMode) {
        // Substitute the last message with the synthesized instruction (no image needed!)
        aiMessages.push({ role: "user", content: synthesizedInstruction });
      } else {
        // Keep prior chat history text
        aiMessages.push({ role: userMessages[i].role, content: userMessages[i].content });
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
            const apiModel = isFloorPlanMode ? modelHop2 : (useDirectGemini ? (hasVisualContent ? "gemini-2.5-pro" : "gemini-2.5-flash") : (hasVisualContent ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash"));

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
