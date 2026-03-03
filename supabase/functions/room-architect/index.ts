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
};

// ─── Tool Definitions (Sub-Agent Pattern) ───────────────────────────────────
// Each tool is a focused sub-agent with a single responsibility.
// The orchestrator (main AI) calls them in sequence as needed.

const tools = [
  // Sub-agent 1: Spatial Validator — checks placement feasibility
  {
    type: "function",
    function: {
      name: "validate_placement",
      description:
        "ALWAYS call this before place_item or move_item. Checks if a position is valid (no wall clipping, no overlaps). Returns { valid: true } or { valid: false, reason: '...' }.",
      parameters: {
        type: "object",
        properties: {
          item_type: { type: "string", enum: Object.keys(ASSET_CATALOG) },
          x: { type: "number", description: "X position in cm from left wall" },
          y: { type: "number", description: "Y position in cm from back wall" },
          rotation: { type: "number", enum: [0, 90, 180, 270] },
          exclude_item_id: { type: "string", description: "Item ID to exclude from overlap check (use when validating a move)" },
        },
        required: ["item_type", "x", "y", "rotation"],
        additionalProperties: false,
      },
    },
  },
  // Sub-agent 2: Placer — places new items
  {
    type: "function",
    function: {
      name: "place_item",
      description: "Place a NEW furniture item. x,y = top-left corner in cm. Validates automatically — returns error if placement is invalid.",
      parameters: {
        type: "object",
        properties: {
          item_type: { type: "string", enum: Object.keys(ASSET_CATALOG) },
          x: { type: "number", description: "X position in cm from left wall" },
          y: { type: "number", description: "Y position in cm from back wall" },
          rotation: { type: "number", enum: [0, 90, 180, 270] },
        },
        required: ["item_type", "x", "y", "rotation"],
        additionalProperties: false,
      },
    },
  },
  // Sub-agent 3: Mover — absolute repositioning
  {
    type: "function",
    function: {
      name: "move_item",
      description: "Move an existing item to an ABSOLUTE position (x, y in cm). Use for precise repositioning.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string", description: "The ID of the item to move" },
          x: { type: "number", description: "New X position in cm" },
          y: { type: "number", description: "New Y position in cm" },
          rotation: { type: "number", enum: [0, 90, 180, 270] },
        },
        required: ["item_id", "x", "y", "rotation"],
        additionalProperties: false,
      },
    },
  },
  // Sub-agent 4: Nudger — relative movement for fine adjustments
  {
    type: "function",
    function: {
      name: "nudge_item",
      description:
        "Move an item by a RELATIVE offset. Use for small adjustments like 'move it 30cm to the left' or 'nudge it north a bit'. dx negative = left, dx positive = right, dy negative = up/north, dy positive = down/south. Optionally change rotation.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string", description: "The ID of the item to nudge" },
          dx: { type: "number", description: "Horizontal offset in cm (negative = left, positive = right)" },
          dy: { type: "number", description: "Vertical offset in cm (negative = north/up, positive = south/down)" },
          rotation: { type: "number", enum: [0, 90, 180, 270], description: "New rotation (optional, keeps current if omitted)" },
        },
        required: ["item_id", "dx", "dy"],
        additionalProperties: false,
      },
    },
  },
  // Sub-agent 5: Remover — removes items
  {
    type: "function",
    function: {
      name: "remove_item",
      description: "Remove an item from the room by its ID.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string", description: "The ID of the item to remove" },
        },
        required: ["item_id"],
        additionalProperties: false,
      },
    },
  },
  // Sub-agent 6: Inspector — lists current items for reference
  {
    type: "function",
    function: {
      name: "list_items",
      description: "Returns a list of all currently placed items with their IDs, types, positions, and dimensions. Use this to find item IDs before moving/nudging/removing them.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
];

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

// ─── Collision Detection Sub-Agent ──────────────────────────────────────────
function getItemBounds(type: string, x: number, y: number, rotation: number) {
  const def = ASSET_CATALOG[type];
  if (!def) return null;
  const isRotated = rotation === 90 || rotation === 270;
  const w = isRotated ? def.height : def.width;
  const h = isRotated ? def.width : def.height;
  return { x, y, w, h, x2: x + w, y2: y + h };
}

function validatePlacement(
  roomState: RoomState,
  itemType: string,
  x: number,
  y: number,
  rotation: number,
  excludeId?: string
): { valid: boolean; reason?: string } {
  const bounds = getItemBounds(itemType, x, y, rotation);
  if (!bounds) return { valid: false, reason: `Unknown item type: ${itemType}` };

  // Wall clipping check
  if (bounds.x < 0 || bounds.y < 0 || bounds.x2 > roomState.roomWidth || bounds.y2 > roomState.roomDepth) {
    return {
      valid: false,
      reason: `Item clips room bounds. Room: ${roomState.roomWidth}×${roomState.roomDepth}cm. Item would span (${bounds.x},${bounds.y}) to (${bounds.x2},${bounds.y2}). Adjust position so item stays within 0-${roomState.roomWidth} on X and 0-${roomState.roomDepth} on Y.`,
    };
  }

  // Overlap check
  for (const item of roomState.items) {
    if (excludeId && item.id === excludeId) continue;
    const other = getItemBounds(item.type, item.x, item.y, item.rotation);
    if (!other) continue;
    if (bounds.x < other.x2 && bounds.x2 > other.x && bounds.y < other.y2 && bounds.y2 > other.y) {
      return {
        valid: false,
        reason: `Overlaps with ${ASSET_CATALOG[item.type]?.label || item.type} (id: ${item.id}) at (${item.x},${item.y}). Try offset of at least ${Math.max(other.x2 - bounds.x, other.y2 - bounds.y)}cm.`,
      };
    }
  }

  return { valid: true };
}

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

// ─── Tool Call Processor ────────────────────────────────────────────────────
function processToolCall(
  name: string,
  args: Record<string, unknown>,
  roomState: RoomState
): { result: string; roomState: RoomState; action?: string } {
  switch (name) {
    case "validate_placement": {
      const r = validatePlacement(
        roomState,
        args.item_type as string,
        args.x as number,
        args.y as number,
        args.rotation as number,
        args.exclude_item_id as string | undefined
      );
      return { result: JSON.stringify(r), roomState };
    }

    case "place_item": {
      const itemType = args.item_type as string;
      const x = Math.round(args.x as number);
      const y = Math.round(args.y as number);
      const rotation = args.rotation as number;

      const validation = validatePlacement(roomState, itemType, x, y, rotation);
      if (!validation.valid) {
        return { result: JSON.stringify({ success: false, reason: validation.reason }), roomState };
      }
      const id = generateId();
      const newItem: PlacedItem = { id, type: itemType, x, y, rotation };
      const updated = { ...roomState, items: [...roomState.items, newItem] };
      const label = ASSET_CATALOG[newItem.type]?.label || newItem.type;
      return {
        result: JSON.stringify({ success: true, item_id: id, label, position: { x, y }, rotation }),
        roomState: updated,
        action: `Placed ${label} at (${x}, ${y})`,
      };
    }

    case "remove_item": {
      const itemId = args.item_id as string;
      const exists = roomState.items.find((i) => i.id === itemId);
      if (!exists) {
        return { result: JSON.stringify({ success: false, reason: `Item '${itemId}' not found. Use list_items to see current items.` }), roomState };
      }
      const label = ASSET_CATALOG[exists.type]?.label || exists.type;
      const updated = { ...roomState, items: roomState.items.filter((i) => i.id !== itemId) };
      return { result: JSON.stringify({ success: true, removed: label }), roomState: updated, action: `Removed ${label}` };
    }

    case "move_item": {
      const moveId = args.item_id as string;
      const item = roomState.items.find((i) => i.id === moveId);
      if (!item) {
        return { result: JSON.stringify({ success: false, reason: `Item '${moveId}' not found. Use list_items to see current items.` }), roomState };
      }
      const newX = Math.round(args.x as number);
      const newY = Math.round(args.y as number);
      const newRot = args.rotation as number;
      const moveValidation = validatePlacement(roomState, item.type, newX, newY, newRot, moveId);
      if (!moveValidation.valid) {
        return { result: JSON.stringify({ success: false, reason: moveValidation.reason }), roomState };
      }
      const movedItem = { ...item, x: newX, y: newY, rotation: newRot };
      const updated = { ...roomState, items: roomState.items.map((i) => (i.id === moveId ? movedItem : i)) };
      const label = ASSET_CATALOG[item.type]?.label || item.type;
      return {
        result: JSON.stringify({ success: true, label, from: { x: item.x, y: item.y }, to: { x: newX, y: newY } }),
        roomState: updated,
        action: `Moved ${label} to (${newX}, ${newY})`,
      };
    }

    case "nudge_item": {
      const nudgeId = args.item_id as string;
      const item = roomState.items.find((i) => i.id === nudgeId);
      if (!item) {
        return { result: JSON.stringify({ success: false, reason: `Item '${nudgeId}' not found. Use list_items to see current items.` }), roomState };
      }
      const dx = Math.round(args.dx as number);
      const dy = Math.round(args.dy as number);
      const newX = item.x + dx;
      const newY = item.y + dy;
      const newRot = (args.rotation as number) ?? item.rotation;
      const label = ASSET_CATALOG[item.type]?.label || item.type;

      const nudgeValidation = validatePlacement(roomState, item.type, newX, newY, newRot, nudgeId);
      if (!nudgeValidation.valid) {
        return {
          result: JSON.stringify({
            success: false,
            reason: nudgeValidation.reason,
            attempted: { from: { x: item.x, y: item.y }, to: { x: newX, y: newY }, dx, dy },
          }),
          roomState,
        };
      }
      const nudgedItem = { ...item, x: newX, y: newY, rotation: newRot };
      const updated = { ...roomState, items: roomState.items.map((i) => (i.id === nudgeId ? nudgedItem : i)) };
      return {
        result: JSON.stringify({ success: true, label, from: { x: item.x, y: item.y }, to: { x: newX, y: newY }, delta: { dx, dy } }),
        roomState: updated,
        action: `Nudged ${label} by (${dx > 0 ? "+" : ""}${dx}, ${dy > 0 ? "+" : ""}${dy})cm`,
      };
    }

    case "list_items": {
      if (roomState.items.length === 0) {
        return { result: JSON.stringify({ items: [], message: "Room is empty." }), roomState };
      }
      const itemList = roomState.items.map((i) => {
        const def = ASSET_CATALOG[i.type];
        const isRotated = i.rotation === 90 || i.rotation === 270;
        const w = def ? (isRotated ? def.height : def.width) : 0;
        const h = def ? (isRotated ? def.width : def.height) : 0;
        return {
          id: i.id,
          type: i.type,
          label: def?.label || i.type,
          position: { x: i.x, y: i.y },
          size: { width: w, height: h },
          rotation: i.rotation,
        };
      });
      return { result: JSON.stringify({ items: itemList }), roomState };
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

// ─── System Prompt Builder ──────────────────────────────────────────────────
function buildSystemPrompt(roomState: RoomState): string {
  const { roomWidth, roomDepth, items } = roomState;
  const halfW = Math.round(roomWidth / 2);
  const halfD = Math.round(roomDepth / 2);

  const itemsSummary =
    items.length === 0
      ? "The room is currently EMPTY — no items placed."
      : "CURRENT ITEMS:\n" +
        items
          .map((i) => {
            const def = ASSET_CATALOG[i.type];
            const isRotated = i.rotation === 90 || i.rotation === 270;
            const w = def ? (isRotated ? def.height : def.width) : 0;
            const h = def ? (isRotated ? def.width : def.height) : 0;
            return `  • ${def?.label || i.type} [id: ${i.id}] at (${i.x}, ${i.y}), ${w}×${h}cm, rotation: ${i.rotation}°`;
          })
          .join("\n");

  return `You are a professional interior design AI with VISION capabilities. You design room layouts by placing furniture in a 2D floor plan.

YOU HAVE TWO INFORMATION SOURCES:
1. A SCREENSHOT IMAGE of the current room canvas (visual — look at it!)
2. PRECISE COORDINATE DATA below (numerical — use for exact positions)

Always cross-reference both. Look at the image to understand spatial relationships, use coordinates for precision.

═══ ROOM SPECS ═══
Dimensions: ${roomWidth}cm wide × ${roomDepth}cm deep (${roomWidth / 100}m × ${roomDepth / 100}m)
Walls: 3 walls — back (top, y=0), left (x=0), right (x=${roomWidth}). Bottom (y=${roomDepth}) is OPEN.
Origin: (0,0) = back-left corner. X → right, Y → down.
Item anchor: (x,y) = TOP-LEFT corner of bounding box. When rotated 90°/270°, width/height swap.

═══ DIRECTION MAP ═══
• WEST / LEFT  = x in [0, ${halfW}]
• EAST / RIGHT = x in [${halfW}, ${roomWidth}]
• NORTH / BACK = y in [0, ${halfD}]
• SOUTH / FRONT = y in [${halfD}, ${roomDepth}]
• CENTER ≈ (${halfW}, ${halfD})

═══ ${itemsSummary} ═══

═══ AVAILABLE FURNITURE ═══
${Object.entries(ASSET_CATALOG)
  .map(([k, v]) => `• ${k}: "${v.label}" ${v.width}×${v.height}cm`)
  .join("\n")}

═══ TOOL USAGE RULES ═══
You have 6 tools. Use them as specialized sub-agents:

1. **list_items** — Call FIRST when you need to find an item's ID (before move/nudge/remove).
2. **validate_placement** — Call BEFORE place_item to check if a position works. Prevents wasted calls.
3. **place_item** — Place new items. Has built-in validation but calling validate first avoids errors.
4. **move_item** — Move to ABSOLUTE coordinates. Use for repositioning.
5. **nudge_item** — Move by RELATIVE offset. Perfect for "move it a bit left" or "shift north 20cm".
   • dx: negative=left, positive=right
   • dy: negative=north/up, positive=south/down
   • "a bit" / "slightly" = ~20-30cm. "a lot" = ~50-100cm.
6. **remove_item** — Delete an item by ID.

═══ NUDGE / SMALL MOVEMENT GUIDE ═══
When users say:
• "nudge/move [item] left/right/up/down" → use nudge_item with appropriate dx/dy
• "a little/bit/slightly" → 15-30cm offset
• "more" → 40-60cm offset  
• "a lot/significantly" → 80-120cm offset
• "center it" → calculate absolute center position, use move_item
• "align with [other item]" → use list_items to get positions, then move_item to matching coordinate

═══ PLACEMENT MATH ═══
• Against back wall: y = 0
• Against left wall: x = 0
• Against right wall: x = ${roomWidth} - itemWidth
• Adjacent items: gap of 5-10cm minimum. Item B right of A: x_B = x_A + width_A + 5
• For zone splits: leave ~40cm gap at midline (x=${halfW})

═══ BEHAVIORAL RULES ═══
1. NEVER place items without checking coordinates will fit. Calculate before calling tools.
2. If place_item or move_item fails, read the error, calculate a corrected position, and retry ONCE.
3. Be conversational and brief. Explain what you did in 1-2 sentences after completing actions.
4. If the user uploads a reference image, visually interpret it and recreate a similar layout.
5. When moving existing items, ALWAYS call list_items first to get the correct item ID.
6. Round all coordinates to whole numbers.
7. For complex layouts (5+ items), place them one-by-one, validating each.
8. If a user request is ambiguous, make a reasonable choice and explain it — don't ask for clarification on obvious things.
9. NEVER respond with just text when the user asked you to DO something. Always execute the tools.
10. Keep your text responses under 3 sentences unless the user asks for details.`;
}

// ─── Main Handler ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages: userMessages, roomState, canvasScreenshot, images: userImages } = body;

    if (!userMessages || !Array.isArray(userMessages) || userMessages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages provided." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let currentRoomState: RoomState = roomState;
    const actionLog: string[] = [];
    const newItemIds: string[] = [];

    const systemPrompt = buildSystemPrompt(currentRoomState);

    // Build messages array
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

    // Tool-call loop (max 20 iterations for complex layouts)
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
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit reached. Please wait a moment and try again." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errText = await response.text();
        console.error("AI gateway error:", status, errText);
        throw new Error(`AI gateway returned ${status}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error("Empty response from AI");

      const msg = choice.message;
      aiMessages.push(msg);

      // Process tool calls
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown>;
          try {
            args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
          } catch (parseErr) {
            console.error("Failed to parse tool args:", tc.function.arguments);
            aiMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: "Invalid arguments JSON" }) });
            continue;
          }

          const { result, roomState: newState, action } = processToolCall(tc.function.name, args, currentRoomState);
          currentRoomState = newState;
          if (action) actionLog.push(action);

          // Track new item IDs
          try {
            const parsed = JSON.parse(result);
            if (parsed.item_id) newItemIds.push(parsed.item_id);
          } catch { /* ok */ }

          aiMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
        continue;
      }

      // No tool calls — final text response
      finalContent = msg.content || "";
      break;
    }

    // If we exhausted iterations without a final response, note it
    if (!finalContent && actionLog.length > 0) {
      finalContent = `Done! I made ${actionLog.length} changes to the room layout.`;
    } else if (!finalContent) {
      finalContent = "I processed your request. Take a look at the updated room!";
    }

    return new Response(
      JSON.stringify({
        message: finalContent,
        roomState: currentRoomState,
        actionLog,
        newItemIds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("room-architect error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
