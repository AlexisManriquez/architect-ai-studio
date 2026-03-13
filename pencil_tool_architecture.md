# Feature Specification: AI Architectural Pencil Tool

## 1. Goal & Vision
The goal is to evolve the Floor Plan Architect from a simple text-to-layout generator into a **true AI-assisted CAD UI**. Users should be able to use a "Pencil Tool" to draw directly on the canvas (e.g., drawing a red arrow to expand a wall, or scribbling out a room to delete it) and tell the AI to "do this". The AI will intuitively fuse the user's natural language command with their spatial, hand-drawn markings to execute precise architectural edits. 
This feature must be robust, bug-free, and feel like a professional enterprise-level tool, avoiding rigid behaviors or "gimmicky" guesswork.

## 2. The Core Problem & Current Limitations
Currently, modifying a floor plan is tedious for users because language is entirely unsuited for precise spatial descriptions.
- **The Problem:** A user saying *"make the bathroom bigger"* leaves the AI guessing which direction to expand. A user saying *"expand the bathroom north until it hits the hallway"* relies on the AI understanding exact relational geometry, which LLMs struggle to calculate mathematically. 
- **The Current Toolset Limitation:** The existing `resize_room` tool only accepts a rough `target_sqft` parameter. It does not allow directional expansion (e.g., "pull the North wall up by 2 meters"). Therefore, even if the AI visually sees a drawn arrow, it lacks the backend tool to execute that precise directional pull.

## 3. Overall Architecture & Data Flow

To achieve this, we need a 3-tier architecture update: **Frontend Capture -> AI Perception -> Backend Execution.**

### Tier 1: Frontend Capture (The User Interface)
- **Drawing Mode Toggle:** Add a "Draw / Pencil" toggle to the UI toolbar alongside the "Select" mode.
- **Canvas Overlay:** Introduce a transparent HTML `<canvas>` perfectly aligned over the `FloorPlanCanvas`. 
- **Stroke Capture:** When in Draw mode, track `onPointerDown`, `onPointerMove`, and `onPointerUp` events to render freehand strokes (ideally in a highly visible color like red).
- **Composite Snapshot:** When the user hits "Send" on the chat input, the frontend must composite the base floor plan and the red drawing overlay into a single base64 image payload. The drawing overlay is then cleared.

### Tier 2: AI Perception & Orchestration (The Brain)
- **Multimodal Payload:** The chat request to the Gemini API must include both the text prompt and the composite image snapshot.
- **System Prompt Engineering:** The AI's instructions must be explicitly updated to heavily weight visual markings:
  - *"If the user provides an image with red hand-drawn markings (arrows, lines, boxes, scribbles), you MUST analyze them to determine exact spatial intent."*
  - *"An arrow pointing outward from a wall means 'expand this wall in this direction'."*
  - *"A box drawn in an empty space means 'add a room here'."*
  - *"A scribble over a room means 'delete this room'."*

### Tier 3: Backend Execution (The Tools)
The AI needs exact, deterministic tools to manipulate the geometry based on its visual understanding. The current `resize_room(target_sqft)` is insufficient.
- **New Tool (`reshape_room_boundary`):** We must create a new tool in the Supabase Edge Function ([room-architect/index.ts](file:///c:/Users/Alexis%20Manriquez/Documents/LumiSpace_2.0/supabase/functions/room-architect/index.ts)) that accepts explicit wall movements. 
  - Parameters: `room_id`, `direction` (north/south/east/west), `distance_cm` (or `target_coordinate`).
  - Logic: This function will pull a specific wall edge, automatically push colliding neighbor rooms via a cascade shift, and re-calculate doors/windows.
- **Updated Tool (`add_room_at_coords`):** Enhance the room addition logic to accept explicit drawn bounding boxes instead of auto-placing.

## 4. Potential User Scenarios

### Scenario A: Directional Expansion (The "Red Arrow")
1. **Action:** The user draws a red arrow starting from the top wall of the Master Bathroom, pointing upward to perfectly touch the bottom line of the Hallway. They type: *"Expand the bathroom to meet the hallway."*
2. **AI Interpretation:** The AI sees the arrow, calculates the visual distance in the grid (e.g., approximately 150cm North), and identifies the intent.
3. **Execution:** The AI calls `reshape_room_boundary(roomId="master-bath", direction="north", distance_cm=150)`.
4. **Result:** The bathroom wall extends exactly to the hallway line without changing the other three walls.

### Scenario B: Deletion via Scribble
1. **Action:** The user scribbles red ink all over "Bedroom 3" and types: *"Get rid of this, I want a bigger backyard."*
2. **AI Interpretation:** The AI associates the scribble with the deletion pattern and identifies the room underneath as Bedroom 3.
3. **Execution:** The AI calls `remove_room(roomId="bedroom-3")`.

### Scenario C: Spatially-Aware Room Addition
1. **Action:** The user draws a rough rectangle on the right side of the exterior house wall and types: *"Add a sunroom right here."*
2. **AI Interpretation:** The AI looks at the rectangle, estimates its bounding box relative to the house (e.g., width 400cm, height 300cm, positioned on the East exterior wall).
3. **Execution:** The AI calls `add_room(type="sunroom", x=..., y=..., width=400, height=300)`.
4. **Result:** The sunroom is generated exactly where the user sketched the box, rather than randomly appended to the house.

## 5. Potential Pitfalls To Avoid
- **Coordinate Hallucination:** Visual LLMs can sometimes hallucinate exact math. The new backend tools (`reshape_room_boundary`) should be robust enough to handle slight coordinate inaccuracies (e.g., if the AI says expand by 148cm when the hallway is 150cm away, the backend physics should "snap" it flush to the hallway).
- **Z-Index/Canvas Alignment:** The drawing overlay must perfectly match the pan/zoom state of the standard floor plan canvas so the drawing aligns accurately.
- **Mobile Support:** Need to ensure `onPointer` events capture touch correctly without triggering scroll.
