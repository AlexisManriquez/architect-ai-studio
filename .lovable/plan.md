
# AI-Powered Room Designer (2D CAD)

## Overview
A 2D top-down room designer where users interact with an AI architect through a chat interface. The AI uses tool-calling to place, arrange, and manage furniture and wall elements in a 3-walled room. All placement is AI-driven — no manual drag and drop.

## Layout
- **Left panel**: AI chat interface where users describe what they want
- **Right panel**: 2D top-down canvas showing the room (3 walls forming a U-shape) with placed items rendered as colored rectangles/shapes with labels

## Room & Canvas
- A 3-walled room rendered as a simple 2D floor plan (open on one side)
- Grid overlay for spatial reference
- Zoom and pan controls for navigating the canvas
- Items rendered as top-down rectangles/shapes with icons and labels (e.g., a sofa shown as a colored rectangle labeled "Sofa")

## Furniture & Asset Library
All items available to the AI for placement:
- **Seating**: Sofa (2-seater, 3-seater), Armchair, Dining Chair
- **Tables & Storage**: Coffee Table, Dining Table, Bookshelf, TV Stand, Side Table
- **Kitchen**: Kitchen Island, Counter, Cabinet
- **Wall elements**: Windows, Doorways (placed along wall edges)

Each asset has predefined dimensions, a color, and a label for the 2D view.

## AI Architect (Chat Interface)
- Chat panel on the left where users type natural language requests
- The AI acts as a supervisor/architect that interprets requests and calls tools
- Simple (non-streaming) responses — the AI processes the request and returns the result
- The AI can chain multiple tool calls for complex requests (e.g., "make an L-shaped sofa area" → place two sofas at right angles)

## AI Tool System (Function Calling)
The AI has access to these tools:

1. **place_item** — Add a furniture item at a specific position and rotation
2. **remove_item** — Remove an item from the room
3. **move_item** — Reposition an existing item
4. **rotate_item** — Change an item's orientation
5. **add_wall_element** — Place a window or door on a specific wall
6. **list_items** — Get all currently placed items (so the AI knows the room state)
7. **validate_placement** — Check if a placement would cause clipping with walls or other items

The validation tool acts as the "collision detection sub-agent" — the AI calls it before confirming placements to prevent items from overlapping or going through walls.

## Collision & Validation Logic
- Before placing or moving items, the AI uses the validate_placement tool
- Checks for: wall clipping, item-to-item overlap, items outside room bounds
- Wall elements (windows) are constrained to wall surfaces only
- If placement is invalid, the AI explains why and suggests an alternative

## Backend
- Lovable Cloud with a Supabase edge function that connects to Lovable AI (Gemini)
- The edge function receives the user message + current room state, sends it to the AI with tool definitions, processes tool calls, and returns the updated room state
- Room state is managed in the frontend (no database needed initially)

## Example Interactions
- "Add a 3-seater sofa against the back wall" → AI places sofa centered on the back wall
- "Make an L-shaped seating area in the corner" → AI places two sofas at right angles forming an L
- "Add a window to the left wall" → AI places a window element on the left wall
- "Put a kitchen island in the center" → AI places island, validates no collisions
- "What's in the room right now?" → AI lists all placed items with positions
