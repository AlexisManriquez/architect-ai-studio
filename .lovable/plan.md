
# UI Navigator: Vision-Driven Room Architect

## Concept
Transform the current text-coordinate room designer into a **visual UI Navigator** where the AI agent **sees** the room canvas via screenshots, interprets spatial layouts visually, and executes actions based on visual understanding -- not just coordinate math. Users can also upload reference images (room photos, sketches, Pinterest inspiration) and the AI visually interprets them to recreate layouts.

This positions the project squarely in the **UI Navigator** category: the agent observes the screen, understands visual elements, and performs executable actions.

---

## Core Features

### 1. Canvas Screenshot Pipeline (AI "Sees" the Room)
- Capture the SVG canvas as a PNG image before each AI call
- Send the screenshot alongside the chat message to Gemini's multimodal API
- The AI uses **both** the image and the coordinate data to reason about placements
- After executing actions, take a **verification screenshot** and send it back to the AI for self-correction ("Does this look right?")

### 2. Image Upload Support (Multimodal Input)
- Add an image upload button to the chat panel (camera/paperclip icon)
- Users can upload room photos, sketches, magazine clippings, or screenshots
- Images are sent as base64 to the edge function alongside the text message
- The AI interprets the uploaded image visually: "Make my room look like this" or "Add furniture similar to what's in this photo"

### 3. Visual Action Feedback
- When the AI places/moves items, show a brief highlight animation on the affected item (pulse/glow effect)
- Add a small action log overlay on the canvas showing what the AI just did ("Placed 3-Seater Sofa at back wall")
- Color-code newly placed items vs existing ones during the current turn

### 4. Step-by-Step Action Replay
- Instead of all items appearing at once, animate them in sequence (staggered appearance)
- Each tool call result triggers a visual update with a short delay, so users can follow the AI's reasoning
- This demonstrates the "executable actions" requirement visually

### 5. Visual Self-Verification Loop
- After the AI finishes placing items, automatically capture a post-action screenshot
- Send it back to the AI with "Verify this layout looks correct -- check for overlaps or poor spacing"
- If issues found, the AI self-corrects by moving/adjusting items
- This is a powerful differentiator: the agent validates its own work visually

### 6. Enhanced UI/UX Polish
- Add a toolbar showing the current room stats (item count, room dimensions)
- Show item tooltips on hover with position/size info
- Add a minimap or overview indicator
- Improve the empty state with a compelling visual + clear call-to-action
- Add a "What can I do?" help panel showing multimodal capabilities

---

## Technical Plan

### Edge Function Changes (`supabase/functions/room-architect/index.ts`)
- Accept `images` array in the request body (base64 encoded PNGs)
- Accept `canvasScreenshot` (base64) -- the current state of the room
- Build multimodal messages with `image_url` content parts for Gemini
- Add a `verify_layout` tool that triggers the visual verification loop
- Update system prompt to emphasize visual reasoning: "You can SEE the room in the attached screenshot"

### New: Canvas Screenshot Utility (`src/lib/canvasCapture.ts`)
- Function to convert the SVG element to a PNG using `canvas.toDataURL()`
- Handles the SVG-to-canvas conversion pipeline
- Returns base64 string ready for API transmission

### ChatPanel Updates (`src/components/ChatPanel.tsx`)
- Add image upload button (file input accepting image/*)
- Show image previews in the message thread (thumbnail before sending)
- Display uploaded images in the conversation history
- Update ChatMessage type to support `images` array

### RoomCanvas Updates (`src/components/RoomCanvas.tsx`)
- Add `ref` forwarding so parent can capture screenshots via the SVG element
- Add item highlight/pulse animations for newly placed items
- Add floating action log showing recent AI actions
- Add hover tooltips for items

### Index Page Updates (`src/pages/Index.tsx`)
- Orchestrate the screenshot capture before sending messages
- Pass canvas ref to RoomCanvas, capture screenshot, include in API call
- Handle the verification loop (post-action screenshot + verify call)
- Manage image uploads from ChatPanel
- Stagger item appearance for action replay effect

### Type Updates (`src/types/room.ts`)
- Add `images?: string[]` to `ChatMessage`
- Add `imageUrl?: string` content support

### New Files
- `src/lib/canvasCapture.ts` -- SVG-to-PNG screenshot utility
- `src/components/ActionLog.tsx` -- floating overlay showing AI actions
- `src/components/ImageUpload.tsx` -- image upload component with preview

---

## Implementation Order
1. Canvas screenshot capture utility
2. Edge function multimodal support (accept + send images to Gemini)
3. Image upload in ChatPanel
4. Send canvas screenshot with every message
5. Visual feedback (item highlights, action log)
6. Self-verification loop (post-action screenshot + verify)
7. UI polish (tooltips, empty state, help panel)

---

## Why This Wins
- **Multimodal input**: Text + uploaded images + canvas screenshots
- **Multimodal output**: Text responses + visual room changes + action animations
- **Visual UI understanding**: AI literally sees and interprets the floor plan
- **Self-correction**: AI verifies its own work by looking at the result
- **Beyond text-in/text-out**: The core interaction loop is visual, not textual
- **Practical value**: Interior design assistance using vision AI
