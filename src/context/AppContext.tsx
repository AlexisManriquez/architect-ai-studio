import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { getStoredApiKey } from "@/components/ApiKeySettings";
import type { RoomState, ChatMessage } from "@/types/room";
import type { FloorPlan, FloorPlanRoom, AppMode } from "@/types/floorplan";
import type { ActionEntry } from "@/components/ActionLog";
import { captureSvgAsBase64 } from "@/lib/canvasCapture";
import { toast } from "sonner";

function createEmptyFloorPlan(): FloorPlan {
  return {
    id: crypto.randomUUID().slice(0, 8),
    name: "My Home",
    totalWidth: 0,
    totalHeight: 0,
    rooms: [],
    doors: [],
    windows: [],
  };
}

interface FloorPlanCanvasRef {
  getSvgElement: () => SVGSVGElement | null;
  hasAnnotations: () => boolean;
  clearAnnotations: () => void;
  getAnnotationCount: () => number;
}

interface AppContextValue {
  mode: AppMode;
  floorPlan: FloorPlan;
  activeRoom: FloorPlanRoom | null;
  roomStates: Record<string, RoomState>;
  messages: ChatMessage[];
  isLoading: boolean;
  highlightIds: string[];
  actions: ActionEntry[];
  referenceImages: string[];
  annotationCount: number;
  setFloorPlan: React.Dispatch<React.SetStateAction<FloorPlan>>;
  setRoomStates: React.Dispatch<React.SetStateAction<Record<string, RoomState>>>;
  setAnnotationCount: React.Dispatch<React.SetStateAction<number>>;
  handleReset: () => void;
  handleEnterRoom: (room: FloorPlanRoom) => void;
  handleBackToFloorPlan: () => void;
  handleSend: (text: string, userImages?: string[]) => Promise<void>;
  updateItemPosition: (roomId: string, itemId: string, x: number, y: number) => void;
  updateRoomPosition: (roomId: string, newX: number, newY: number) => void;
  roomCanvasRef: React.RefObject<{ getSvgElement: () => SVGSVGElement | null } | null>;
  floorPlanCanvasRef: React.RefObject<FloorPlanCanvasRef | null>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppMode>("floorplan");
  const [floorPlan, setFloorPlan] = useState<FloorPlan>(createEmptyFloorPlan());
  const [activeRoom, setActiveRoom] = useState<FloorPlanRoom | null>(null);
  const [roomStates, setRoomStates] = useState<Record<string, RoomState>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [actions, setActions] = useState<ActionEntry[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [annotationCount, setAnnotationCount] = useState(0);
  const roomCanvasRef = useRef<{ getSvgElement: () => SVGSVGElement | null }>(null);
  const floorPlanCanvasRef = useRef<FloorPlanCanvasRef>(null);

  const handleReset = useCallback(() => {
    if (mode === "room" && activeRoom) {
      setRoomStates(prev => ({ ...prev, [activeRoom.id]: { roomWidth: activeRoom.width, roomDepth: activeRoom.height, walls: [], items: [] } }));
      setMessages([]);
      setHighlightIds([]);
      setActions([]);
      toast.success("Room furniture cleared!");
    } else {
      setFloorPlan(createEmptyFloorPlan());
      setRoomStates({});
      setMessages([]);
      setHighlightIds([]);
      setActions([]);
      setReferenceImages([]);
      setActiveRoom(null);
      setMode("floorplan");
      toast.success("Floor plan reset — fresh start!");
    }
  }, [mode, activeRoom]);

  const handleEnterRoom = useCallback((room: FloorPlanRoom) => {
    if (!roomStates[room.id]) {
      setRoomStates(prev => ({
        ...prev,
        [room.id]: {
          roomWidth: room.width,
          roomDepth: room.height,
          walls: [
            { id: "back", label: "Back Wall", x1: 0, y1: 0, x2: room.width, y2: 0 },
            { id: "left", label: "Left Wall", x1: 0, y1: 0, x2: 0, y2: room.height },
            { id: "right", label: "Right Wall", x1: room.width, y1: 0, x2: room.width, y2: room.height },
          ],
          items: [],
        },
      }));
    }
    setActiveRoom(room);
    setMode("room");
    setMessages([]);
    setActions([]);
    setHighlightIds([]);
  }, [roomStates]);

  const handleBackToFloorPlan = useCallback(() => {
    setMode("floorplan");
    setActiveRoom(null);
    setMessages([]);
    setActions([]);
    setHighlightIds([]);
  }, []);

  const handleSend = useCallback(async (text: string, userImages?: string[]) => {
    if (userImages && userImages.length > 0 && mode === "floorplan") {
      setReferenceImages(userImages);
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      images: userImages,
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);
    setHighlightIds([]);

    try {
      let canvasScreenshot: string | undefined;
      const isEmptyFloorPlan = mode === "floorplan" && floorPlan.rooms.length === 0;
      if (!isEmptyFloorPlan) {
        try {
          const svg = mode === "floorplan"
            ? floorPlanCanvasRef.current?.getSvgElement()
            : roomCanvasRef.current?.getSvgElement();
          if (svg) canvasScreenshot = await captureSvgAsBase64(svg);
        } catch (err) {
          console.warn("Could not capture screenshot:", err);
        }
      }

      // Check for annotations BEFORE clearing them
      const annotationsPresent = mode === "floorplan"
        && floorPlanCanvasRef.current?.hasAnnotations?.() || false;

      // Clear annotations after screenshot capture (they're baked into the screenshot)
      if (mode === "floorplan" && floorPlanCanvasRef.current?.hasAnnotations?.()) {
        floorPlanCanvasRef.current.clearAnnotations();
      }

      // When annotations are present, inject a signal into the last user message
      // so the AI is guaranteed to know about them even if visual detection fails
      const messagesForAI = annotationsPresent
        ? updatedMessages.map((m, i) => {
            if (i === updatedMessages.length - 1 && m.role === "user") {
              return {
                role: m.role,
                content: `[ANNOTATION: The user has drawn a RED annotation on the floor plan canvas. Look carefully at the red marking(s) in the screenshot image. If you see a red ARROW pointing FROM one room TOWARD another room, call snap_rooms_together(source_room_id, target_room_id) — do NOT call connect_rooms or move_room.]\n\n${m.content}`,
              };
            }
            return { role: m.role, content: m.content };
          })
        : updatedMessages.map(m => ({ role: m.role, content: m.content }));

      const requestBody: Record<string, unknown> = {
        messages: messagesForAI,
        mode,
        canvasScreenshot,
        images: userImages,
        hasReferenceSketch: false,
        hasAnnotations: annotationsPresent,
      };

      if (mode === "floorplan") {
        requestBody.floorPlan = floorPlan;
      } else if (activeRoom) {
        requestBody.roomState = roomStates[activeRoom.id];
        requestBody.roomName = activeRoom.name;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      };
      const storedKey = getStoredApiKey();
      if (storedKey) headers["x-user-api-key"] = storedKey;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/room-architect`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 2);

          let eventType = "message";
          let eventData = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6);
          }

          if (!eventData) continue;

          try {
            const parsed = JSON.parse(eventData);

            if (eventType === "action") {
              const newAction: ActionEntry = {
                id: crypto.randomUUID(),
                text: parsed.text,
                timestamp: Date.now(),
              };
              setActions(prev => [...prev, newAction]);
            } else if (eventType === "error") {
              toast.error(parsed.error);
            } else if (eventType === "result") {
              const assistantMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: parsed.message,
              };
              setMessages(prev => [...prev, assistantMsg]);

              if (mode === "floorplan" && parsed.floorPlan) {
                setFloorPlan(parsed.floorPlan);
              } else if (mode === "room" && parsed.roomState && activeRoom) {
                setRoomStates(prev => ({ ...prev, [activeRoom.id]: parsed.roomState }));
              }

              if (parsed.newItemIds && parsed.newItemIds.length > 0) {
                setHighlightIds(parsed.newItemIds);
                setTimeout(() => setHighlightIds([]), 4500);
              }
            }
          } catch {
            // ignore parse errors on partial chunks
          }
        }
      }
    } catch (e: any) {
      console.error("Error:", e);
      toast.error(e.message || "Failed to get AI response");
    } finally {
      setIsLoading(false);
    }
  }, [messages, mode, floorPlan, roomStates, activeRoom]);

  const updateItemPosition = useCallback((roomId: string, itemId: string, x: number, y: number) => {
    setRoomStates(prev => {
      const room = prev[roomId];
      if (!room) return prev;
      return {
        ...prev,
        [roomId]: {
          ...room,
          items: room.items.map(item =>
            item.id === itemId ? { ...item, x: Math.round(x), y: Math.round(y) } : item
          ),
        },
      };
    });
  }, []);

  const updateRoomPosition = useCallback((roomId: string, newX: number, newY: number) => {
    setFloorPlan(prev => {
      const updatedRooms = prev.rooms.map(r =>
        r.id === roomId ? { ...r, x: newX, y: newY } : r
      );
      // Recompute bounding box
      let maxX = 0, maxY = 0;
      for (const r of updatedRooms) {
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
      }
      return { ...prev, rooms: updatedRooms, totalWidth: maxX, totalHeight: maxY };
    });
  }, []);

  return (
    <AppContext.Provider
      value={{
        mode,
        floorPlan,
        activeRoom,
        roomStates,
        messages,
        isLoading,
        highlightIds,
        actions,
        referenceImages,
        annotationCount,
        setFloorPlan,
        setRoomStates,
        setAnnotationCount,
        handleReset,
        handleEnterRoom,
        handleBackToFloorPlan,
        handleSend,
        updateItemPosition,
        updateRoomPosition,
        roomCanvasRef,
        floorPlanCanvasRef,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
