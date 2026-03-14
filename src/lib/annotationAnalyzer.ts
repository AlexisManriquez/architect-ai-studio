import type { FloorPlanRoom } from "@/types/floorplan";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Annotation {
  id: string;
  points: { x: number; y: number }[];
}

type Wall = "north" | "south" | "east" | "west";

export type AnnotationIntent =
  | { action: "reshape"; roomId: string; roomName: string; wall: Wall; distanceCm: number }
  | { action: "snap"; sourceRoomId: string; sourceRoomName: string; targetRoomId: string; targetRoomName: string }
  | { action: "move"; roomId: string; roomName: string; targetX: number; targetY: number }
  | { action: "remove"; roomId: string; roomName: string }
  | { action: "unknown" };

export interface AnnotationAnalysis {
  type: "arrow" | "scribble" | "unknown";
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  intent: AnnotationIntent;
}

// ─── Geometry Helpers ───────────────────────────────────────────────────────

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function totalPathLength(points: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

/** Check if two line segments (p1-p2) and (p3-p4) intersect */
function segmentsIntersect(
  p1: { x: number; y: number }, p2: { x: number; y: number },
  p3: { x: number; y: number }, p4: { x: number; y: number }
): boolean {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / cross;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / cross;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function countSelfIntersections(points: { x: number; y: number }[]): number {
  let count = 0;
  for (let i = 0; i < points.length - 1; i++) {
    // Skip adjacent and near-adjacent segments (they share endpoints)
    for (let j = i + 2; j < points.length - 1; j++) {
      if (i === 0 && j === points.length - 2) continue;
      if (segmentsIntersect(points[i], points[i + 1], points[j], points[j + 1])) {
        count++;
        if (count >= 2) return count; // early exit
      }
    }
  }
  return count;
}

// ─── Stroke Classification ─────────────────────────────────────────────────

function classifyStroke(points: { x: number; y: number }[]): "arrow" | "scribble" | "unknown" {
  if (points.length < 2) return "unknown";

  const pathLen = totalPathLength(points);
  if (pathLen < 5) return "unknown"; // too small to classify

  const directDist = dist(points[0], points[points.length - 1]);
  const linearity = directDist / pathLen;

  if (linearity > 0.6) return "arrow";
  if (countSelfIntersections(points) >= 2) return "scribble";
  return "unknown";
}

// ─── Room Hit Testing ───────────────────────────────────────────────────────

const PROXIMITY_THRESHOLD = 30; // cm — max distance from room edge for proximity fallback

function pointInRoom(px: number, py: number, room: FloorPlanRoom): boolean {
  return px >= room.x && px <= room.x + room.width
    && py >= room.y && py <= room.y + room.height;
}

/** Distance from point to nearest edge of an axis-aligned rectangle */
function pointToRoomDistance(px: number, py: number, room: FloorPlanRoom): number {
  const cx = Math.max(room.x, Math.min(px, room.x + room.width));
  const cy = Math.max(room.y, Math.min(py, room.y + room.height));
  return dist({ x: px, y: py }, { x: cx, y: cy });
}

function findRoomContaining(
  px: number, py: number, rooms: FloorPlanRoom[]
): FloorPlanRoom | null {
  // Direct hit
  for (const room of rooms) {
    if (pointInRoom(px, py, room)) return room;
  }
  // Proximity fallback — find closest room within threshold
  let closest: FloorPlanRoom | null = null;
  let closestDist = Infinity;
  for (const room of rooms) {
    const d = pointToRoomDistance(px, py, room);
    if (d < closestDist && d <= PROXIMITY_THRESHOLD) {
      closestDist = d;
      closest = room;
    }
  }
  return closest;
}

// ─── Nearest Wall Detection ────────────────────────────────────────────────

interface WallInfo {
  wall: Wall;
  distance: number;
}

function nearestWall(px: number, py: number, room: FloorPlanRoom): WallInfo {
  const walls: WallInfo[] = [
    { wall: "north", distance: Math.abs(py - room.y) },
    { wall: "south", distance: Math.abs(py - (room.y + room.height)) },
    { wall: "west", distance: Math.abs(px - room.x) },
    { wall: "east", distance: Math.abs(px - (room.x + room.width)) },
  ];
  return walls.reduce((a, b) => a.distance < b.distance ? a : b);
}

function isNearWall(px: number, py: number, room: FloorPlanRoom): boolean {
  const threshold = Math.min(room.width, room.height) * 0.25;
  return nearestWall(px, py, room).distance <= threshold;
}

// ─── Wall Normals ───────────────────────────────────────────────────────────

const WALL_NORMALS: Record<Wall, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
  east: { dx: 1, dy: 0 },
};

// ─── Intent Resolution ─────────────────────────────────────────────────────

function resolveArrowIntent(
  startPt: { x: number; y: number },
  endPt: { x: number; y: number },
  rooms: FloorPlanRoom[]
): AnnotationIntent {
  const startRoom = findRoomContaining(startPt.x, startPt.y, rooms);
  const endRoom = findRoomContaining(endPt.x, endPt.y, rooms);

  // CASE 1: Arrow from room A to room B → snap A toward B
  if (startRoom && endRoom && startRoom.id !== endRoom.id) {
    return {
      action: "snap",
      sourceRoomId: startRoom.id,
      sourceRoomName: startRoom.name,
      targetRoomId: endRoom.id,
      targetRoomName: endRoom.name,
    };
  }

  // CASE 2: Arrow starts at a room, ends in empty space
  if (startRoom && !endRoom) {
    const arrowLen = dist(startPt, endPt);
    const roomMaxDim = Math.max(startRoom.width, startRoom.height);

    // If the arrow is longer than 1.5x the room's largest dimension, it must be a MOVE.
    // A reshape gesture is always short relative to the room being reshaped.
    if (isNearWall(startPt.x, startPt.y, startRoom) && arrowLen < roomMaxDim * 1.5) {
      // Reshape: expand or contract the wall
      const wallInfo = nearestWall(startPt.x, startPt.y, startRoom);
      const normal = WALL_NORMALS[wallInfo.wall];
      const arrowDx = endPt.x - startPt.x;
      const arrowDy = endPt.y - startPt.y;

      // Dot product of arrow direction and wall normal
      const dot = (arrowDx * normal.dx + arrowDy * normal.dy) / (arrowLen || 1);

      // If arrow is nearly parallel to wall (ambiguous), fall back to unknown
      if (Math.abs(dot) < 0.3) return { action: "unknown" };

      // Positive dot = outward (expand), negative = inward (contract)
      const projectedDistance = Math.round(arrowLen * dot);

      return {
        action: "reshape",
        roomId: startRoom.id,
        roomName: startRoom.name,
        wall: wallInfo.wall,
        distanceCm: projectedDistance,
      };
    } else {
      // Arrow from center of room to empty space → move room
      return {
        action: "move",
        roomId: startRoom.id,
        roomName: startRoom.name,
        targetX: Math.round(endPt.x - startRoom.width / 2),
        targetY: Math.round(endPt.y - startRoom.height / 2),
      };
    }
  }

  // CASE 3: Arrow from empty space into a room → move room to where arrow started
  if (!startRoom && endRoom) {
    return {
      action: "move",
      roomId: endRoom.id,
      roomName: endRoom.name,
      targetX: Math.round(startPt.x - endRoom.width / 2),
      targetY: Math.round(startPt.y - endRoom.height / 2),
    };
  }

  // CASE 4: Arrow within same room, starting at a wall → reshape
  if (startRoom && endRoom && startRoom.id === endRoom.id) {
    const arrowLen = dist(startPt, endPt);
    const roomMaxDim = Math.max(startRoom.width, startRoom.height);
    if (isNearWall(startPt.x, startPt.y, startRoom) && arrowLen < roomMaxDim * 1.5) {
      const wallInfo = nearestWall(startPt.x, startPt.y, startRoom);
      const normal = WALL_NORMALS[wallInfo.wall];
      const arrowDx = endPt.x - startPt.x;
      const arrowDy = endPt.y - startPt.y;
      const dot = (arrowDx * normal.dx + arrowDy * normal.dy) / (arrowLen || 1);
      if (Math.abs(dot) < 0.3) return { action: "unknown" };
      const projectedDistance = Math.round(arrowLen * dot);
      return {
        action: "reshape",
        roomId: startRoom.id,
        roomName: startRoom.name,
        wall: wallInfo.wall,
        distanceCm: projectedDistance,
      };
    }
  }

  return { action: "unknown" };
}

function resolveScribbleIntent(
  points: { x: number; y: number }[],
  rooms: FloorPlanRoom[]
): AnnotationIntent {
  // Find room containing the scribble's bounding box center
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const room = findRoomContaining(cx, cy, rooms);
  if (room) {
    return { action: "remove", roomId: room.id, roomName: room.name };
  }
  return { action: "unknown" };
}

// ─── Main Analysis ──────────────────────────────────────────────────────────

export function analyzeAnnotations(
  annotations: Annotation[],
  rooms: FloorPlanRoom[]
): AnnotationAnalysis[] {
  return annotations
    .filter(a => a.id !== "__drawing__" && a.points.length >= 2)
    .map(annotation => {
      const { points } = annotation;
      const type = classifyStroke(points);
      const startPoint = points[0];
      const endPoint = points[points.length - 1];

      let intent: AnnotationIntent;
      switch (type) {
        case "arrow":
          intent = resolveArrowIntent(startPoint, endPoint, rooms);
          break;
        case "scribble":
          intent = resolveScribbleIntent(points, rooms);
          break;
        default:
          intent = { action: "unknown" };
      }

      return { type, startPoint, endPoint, intent };
    });
}

// ─── Signal Builder ─────────────────────────────────────────────────────────

export function buildAnnotationSignal(analyses: AnnotationAnalysis[]): string {
  if (analyses.length === 0) return "";

  const parts = analyses.map((a, i) => {
    const n = i + 1;
    switch (a.intent.action) {
      case "reshape":
        return `${n}. Arrow on ${a.intent.roomName} [id:${a.intent.roomId}] ${a.intent.wall} wall → reshape_room_boundary(room_id="${a.intent.roomId}", wall="${a.intent.wall}", distance_cm=${a.intent.distanceCm})`;
      case "snap":
        return `${n}. Arrow from ${a.intent.sourceRoomName} [id:${a.intent.sourceRoomId}] toward ${a.intent.targetRoomName} [id:${a.intent.targetRoomId}] → snap_rooms_together(room_id="${a.intent.sourceRoomId}", target_room_id="${a.intent.targetRoomId}")`;
      case "move":
        return `${n}. Arrow indicating move ${a.intent.roomName} [id:${a.intent.roomId}] to position (${a.intent.targetX}, ${a.intent.targetY}) → move_room(room_id="${a.intent.roomId}", x=${a.intent.targetX}, y=${a.intent.targetY})`;
      case "remove":
        return `${n}. Scribble/X over ${a.intent.roomName} [id:${a.intent.roomId}] → remove_room(room_id="${a.intent.roomId}")`;
      case "unknown":
        return `${n}. Unrecognized gesture — stroke shape was ambiguous (not clearly an arrow or scribble). Ask the user to redraw this annotation more clearly, or describe what they want in text.`;
    }
  });

  return `[ANNOTATION ANALYSIS (computed from coordinates — EXACT, not visual guess):\n${parts.join("\n")}\nExecute these actions exactly. The room IDs and measurements are precise.]`;
}

/** Check if all intents are deterministic (none unknown) */
export function allIntentsResolved(analyses: AnnotationAnalysis[]): boolean {
  return analyses.length > 0 && analyses.every(a => a.intent.action !== "unknown");
}

/** Build a synthesized instruction string from fully-resolved annotations for direct use by the Modifier Agent */
export function buildSynthesizedInstruction(analyses: AnnotationAnalysis[], userText: string): string {
  const actions = analyses.map((a, i) => {
    const n = i + 1;
    switch (a.intent.action) {
      case "reshape":
        return `${n}. Call reshape_room_boundary with room_id="${a.intent.roomId}" (${a.intent.roomName}), wall="${a.intent.wall}", distance_cm=${a.intent.distanceCm}`;
      case "snap":
        return `${n}. Call snap_rooms_together with room_id="${a.intent.sourceRoomId}" (${a.intent.sourceRoomName}), target_room_id="${a.intent.targetRoomId}" (${a.intent.targetRoomName})`;
      case "move":
        return `${n}. Call move_room with room_id="${a.intent.roomId}" (${a.intent.roomName}), x=${a.intent.targetX}, y=${a.intent.targetY}`;
      case "remove":
        return `${n}. Call remove_room with room_id="${a.intent.roomId}" (${a.intent.roomName})`;
      default:
        return "";
    }
  }).filter(Boolean);

  const userContext = userText.trim() ? `\nUser's message: "${userText}"` : "";
  return `Execute these annotation-based actions in order:\n${actions.join("\n")}${userContext}\n\nAfter all actions, call validate_floor_plan.`;
}
