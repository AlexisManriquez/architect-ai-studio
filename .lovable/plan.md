

## Problem

The drag-and-drop has two issues causing "snapping" jitter:

1. **During drag**: The room position updates use `setFloorPlan` which also triggers bounding box recalculation via `updateRoomPosition` on mouse-up. But during the drag itself (line 79), `setFloorPlan` is called directly, and the `offset` state used in the transform calculation (`offset.x`, `offset.y`) depends on `floorPlan.totalWidth`/`totalHeight` — which get recalculated on mouse-up. This causes the canvas view to shift when snapping occurs.

2. **Snap jump on release**: The room moves freely during drag, then jumps to a 50cm grid on release. This creates a visible "teleport" effect. The `SNAP_GRID = 50` (50cm) is quite coarse.

3. **Bounding box recalc shifts view**: `updateRoomPosition` recalculates `totalWidth`/`totalHeight`, which triggers the `useEffect` that recomputes `scale` and `offset` — causing the entire canvas to re-center mid-interaction.

## Plan

### 1. Snap during drag, not just on release
- Apply `snapTo()` during `handleMouseMove` so the room snaps live as you drag, eliminating the jarring jump on release.
- Reduce `SNAP_GRID` from 50 to 10 (10cm) for finer control.

### 2. Prevent auto-recenter during drag
- Guard the `useEffect` that recalculates scale/offset so it does NOT fire while `draggingRoomId` is set. This prevents the canvas from shifting while a room is being moved.

### 3. Simplify mouse-up
- Since snapping now happens during drag, `handleMouseUp` just needs to call `updateRoomPosition` with the already-snapped coordinates and clear the drag state.

### Files to change
- **`src/components/FloorPlanCanvas.tsx`**: Apply snap in `handleMouseMove`, guard the auto-center `useEffect`, reduce `SNAP_GRID` to 10.

