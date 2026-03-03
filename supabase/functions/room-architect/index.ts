import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

const tools = [
  {
    type: "function",
    function: {
      name: "place_item",
      description:
        "Place a furniture item in the room. Use validate_placement first. x is distance from left wall in cm, y is distance from back wall in cm. rotation is 0, 90, 180, or 270.",
      parameters: {
        type: "object",
        properties: {
          item_type: {
            type: "string",
            enum: Object.keys(ASSET_CATALOG),
            description: "The type of item to place",
          },
          x: { type: "number", description: "X position in cm from left wall interior" },
          y: { type: "number", description: "Y position in cm from back wall interior" },
          rotation: { type: "number", description: "Rotation in degrees (0, 90, 180, 270)" },
        },
        required: ["item_type", "x", "y", "rotation"],
        additionalProperties: false,
      },
    },
  },
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
  {
    type: "function",
    function: {
      name: "move_item",
      description: "Move an existing item to a new position.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string", description: "The ID of the item to move" },
          x: { type: "number", description: "New X position in cm" },
          y: { type: "number", description: "New Y position in cm" },
          rotation: { type: "number", description: "New rotation in degrees" },
        },
        required: ["item_id", "x", "y", "rotation"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_placement",
      description:
        "Check if placing an item at a position is valid. Returns whether the placement would clip walls or overlap other items. Always call this before place_item or move_item.",
      parameters: {
        type: "object",
        properties: {
          item_type: { type: "string", enum: Object.keys(ASSET_CATALOG) },
          x: { type: "number" },
          y: { type: "number" },
          rotation: { type: "number" },
          exclude_item_id: { type: "string", description: "Item ID to exclude from overlap check (for moves)" },
        },
        required: ["item_type", "x", "y", "rotation"],
        additionalProperties: false,
      },
    },
  },
];

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
  if (!bounds) return { valid: false, reason: "Unknown item type" };

  // Check room bounds
  if (bounds.x < 0 || bounds.y < 0 || bounds.x2 > roomState.roomWidth || bounds.y2 > roomState.roomDepth) {
    return { valid: false, reason: `Item extends outside room bounds. Room is ${roomState.roomWidth}cm × ${roomState.roomDepth}cm. Item would span from (${bounds.x},${bounds.y}) to (${bounds.x2},${bounds.y2}).` };
  }

  // Check overlaps
  for (const item of roomState.items) {
    if (excludeId && item.id === excludeId) continue;
    const other = getItemBounds(item.type, item.x, item.y, item.rotation);
    if (!other) continue;
    if (bounds.x < other.x2 && bounds.x2 > other.x && bounds.y < other.y2 && bounds.y2 > other.y) {
      return { valid: false, reason: `Overlaps with ${ASSET_CATALOG[item.type]?.label || item.type} (id: ${item.id}) at (${item.x}, ${item.y}).` };
    }
  }

  return { valid: true };
}

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

function processToolCall(
  name: string,
  args: Record<string, unknown>,
  roomState: RoomState
): { result: string; roomState: RoomState } {
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
      const id = generateId();
      const newItem: PlacedItem = {
        id,
        type: args.item_type as string,
        x: args.x as number,
        y: args.y as number,
        rotation: args.rotation as number,
      };
      const updated = { ...roomState, items: [...roomState.items, newItem] };
      return {
        result: JSON.stringify({ success: true, item_id: id, label: ASSET_CATALOG[newItem.type]?.label }),
        roomState: updated,
      };
    }

    case "remove_item": {
      const itemId = args.item_id as string;
      const exists = roomState.items.find((i) => i.id === itemId);
      if (!exists) return { result: JSON.stringify({ success: false, reason: "Item not found" }), roomState };
      const updated = { ...roomState, items: roomState.items.filter((i) => i.id !== itemId) };
      return { result: JSON.stringify({ success: true }), roomState: updated };
    }

    case "move_item": {
      const moveId = args.item_id as string;
      const item = roomState.items.find((i) => i.id === moveId);
      if (!item) return { result: JSON.stringify({ success: false, reason: "Item not found" }), roomState };
      const movedItem = { ...item, x: args.x as number, y: args.y as number, rotation: args.rotation as number };
      const updated = { ...roomState, items: roomState.items.map((i) => (i.id === moveId ? movedItem : i)) };
      return { result: JSON.stringify({ success: true }), roomState: updated };
    }

    default:
      return { result: JSON.stringify({ error: "Unknown tool" }), roomState };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages: userMessages, roomState } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let currentRoomState: RoomState = roomState;

    // Build current items summary
    const itemsSummary =
      currentRoomState.items.length === 0
        ? "The room is currently empty."
        : "Current items:\n" +
          currentRoomState.items
            .map(
              (i: PlacedItem) =>
                `- ${ASSET_CATALOG[i.type]?.label || i.type} (id: ${i.id}) at (${i.x}, ${i.y}), rotation: ${i.rotation}°`
            )
            .join("\n");

    const systemPrompt = `You are an AI room architect. You design room layouts by placing furniture and wall elements in a 2D floor plan.

ROOM DIMENSIONS: ${currentRoomState.roomWidth}cm wide × ${currentRoomState.roomDepth}cm deep.
WALLS: 3 walls — back (top, y=0), left (x=0), right (x=${currentRoomState.roomWidth}). The bottom side (y=${currentRoomState.roomDepth}) is open.
COORDINATE SYSTEM: (0,0) is top-left (back-left corner). X increases rightward, Y increases downward.

${itemsSummary}

AVAILABLE ITEMS: ${Object.entries(ASSET_CATALOG).map(([k, v]) => `${k} (${v.width}×${v.height}cm)`).join(", ")}

RULES:
1. ALWAYS call validate_placement BEFORE place_item or move_item to check for collisions.
2. If validation fails, find an alternative position and try again.
3. For compound requests like "L-shaped sofa area", use multiple items (e.g., two sofas at right angles).
4. Place items against walls by setting the appropriate coordinate to 0 (back wall: y=0, left wall: x=0, right wall: x=roomWidth-itemWidth).
5. For rotated items: rotation 0 = default orientation, 90 = rotated clockwise.
6. When listing items, use their IDs for reference.
7. Keep reasonable spacing between furniture (at least 5-10cm gaps).
8. Be conversational and explain what you're doing.`;

    let aiMessages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
      ...userMessages,
    ];

    // Tool-call loop (max 10 iterations)
    let finalContent = "";
    for (let i = 0; i < 10; i++) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errText = await response.text();
        console.error("AI error:", status, errText);
        throw new Error(`AI gateway error: ${status}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error("No response from AI");

      const msg = choice.message;
      aiMessages.push(msg);

      // If the AI wants to call tools
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          const args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
          const { result, roomState: newState } = processToolCall(tc.function.name, args, currentRoomState);
          currentRoomState = newState;
          aiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
        continue; // Let AI process tool results
      }

      // No more tool calls — we have the final response
      finalContent = msg.content || "";
      break;
    }

    return new Response(
      JSON.stringify({
        message: finalContent,
        roomState: currentRoomState,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("room-architect error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
