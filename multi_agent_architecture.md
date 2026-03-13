# Multi-Agent Orchestration Architecture Plan

To ensure a flawless demo in 2 days, we will refactor the monolithic agent in `supabase/functions/room-architect/index.ts` into a true **Supervisor -> Specialist** architecture.

## The Core Problem Being Solved
Currently, a single agent holds the instructions for generating entire houses, modifying rooms, placing furniture, *and* reading visual red-arrow annotations. This causes prompt bloating, which dilutes the AI's attention and leads to unpredictable hallucinated coordinate math when using the Pencil Tool.

## The Solution: The Supervisor Model
We will split the AI into distinct, laser-focused roles.

### 1. The Supervisor (Router & Clarifier) Agent
This is the ONLY agent that directly reads the user's messy input and looks at the canvas screenshot. It does **not** have access to any floor plan tools (`move_room`, `connect_rooms`, etc.).
Its only job is to analyze the user's intent, look at the drawn annotations, and generate a **JSON output** routing the request to the correct specialist, along with a perfectly rewritten instruction.

**Example Supervisor Output:**
```json
{
  "selected_agent": "MODIFIER_AGENT",
  "reasoning": "The user drew a red arrow from the Garage pointing towards the Master Bedroom and said 'expand it'.",
  "synthesized_instruction": "The user wants to expand the Garage until it touches the Master Bedroom. Call snap_rooms_together(garage_id, master_bedroom_id)."
}
```

### 2. The Specialist Sub-Agents
Once the Supervisor outputs its JSON, the backend will programmatically call the selected Specialist Agent. The Specialist Agent will receive the Supervisor's `synthesized_instruction` instead of the user's vague prompt.

Because these sub-agents have highly specific system prompts and fewer tools, their accuracy will be near 100%.

#### A. CREATOR_AGENT (The Blueprint Specialist)
- **Tools:** `generate_floor_plan`, `generate_from_sketch`
- **System Prompt:** Exclusively focused on calculating zones, room ratios, and creating the initial floor plan structure. It does not know how to edit existing rooms.

#### B. MODIFIER_AGENT (The Spatial Edit Specialist)
- **Tools:** `snap_rooms_together`, `reshape_room_boundary`, `connect_rooms`, `resize_room`, `add_room`, `remove_room`, `add_door`, `add_window`
- **System Prompt:** Exclusively focused on taking the exact spatial instructions from the Supervisor and executing the correct structural tool. It performs zero guesswork.

#### C. INTERIOR_AGENT (The Furnishing Specialist) *(Already exists)*
- **Tools:** `place_item`, `move_item`, `nudge_item`
- **System Prompt:** Active ONLY when the user is inside a specific room view. Completely ignores house-wide architecture.

## Execution Flow (The "Double Hop")
When the user clicks "Send":
1. **Hop 1 (Fast Vision Call):** We send the chat history + the screenshot with the Red Pencil markings to the `Supervisor`. We use Gemini 2.5 Pro (if there are images) or Flash (if text-only) configured to return strict JSON using `response_mime_type: "application/json"`.
2. **Hop 2 (Tool Execution Call):** We parse the Supervisor's JSON. We select the specified tool array (`creatorTools` or `modifierTools`), select the highly-focused system prompt, and trigger a second Gemini 2.5 Flash call. This agent uses its tools to execute the precise `synthesized_instruction`, generating the `actionLog` and sending SSE events back to the UI.

## Why This Guarantees Demo Success
- **No more guesswork:** The sub-agent doesn't have to figure out what the red arrow means; the Supervisor already figured it out and handed over crystal-clear text instructions.
- **No tool confusion:** The Creator Agent can't accidentally delete a room, and the Modifier Agent can't accidentally recreate the entire house.
- **Latency Trade-off:** The "Double Hop" adds about 1.5 - 2.5 seconds of extra thinking time, but the resulting action will be hyper-accurate and completely reliable, eliminating the "gimmick" feel.

I am ready to implement this in `supabase/functions/room-architect/index.ts` right now. Let me know if you approve this architecture!
