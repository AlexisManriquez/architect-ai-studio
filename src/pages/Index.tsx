import { useState, useCallback, useRef } from "react";
import ChatPanel from "@/components/ChatPanel";
import RoomCanvas, { type RoomCanvasHandle } from "@/components/RoomCanvas";
import FloorPlanCanvas, { type FloorPlanCanvasHandle } from "@/components/FloorPlanCanvas";
import { createDefaultRoom } from "@/data/assetCatalog";
import type { RoomState, ChatMessage } from "@/types/room";
import type { FloorPlan, FloorPlanRoom, AppMode } from "@/types/floorplan";
import type { ActionEntry } from "@/components/ActionLog";
import { supabase } from "@/integrations/supabase/client";
import { captureSvgAsBase64 } from "@/lib/canvasCapture";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const Index = () => {
  const [mode, setMode] = useState<AppMode>("floorplan");
  const [floorPlan, setFloorPlan] = useState<FloorPlan>(createEmptyFloorPlan());
  const [activeRoom, setActiveRoom] = useState<FloorPlanRoom | null>(null);
  const [roomStates, setRoomStates] = useState<Record<string, RoomState>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [actions, setActions] = useState<ActionEntry[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const roomCanvasRef = useRef<RoomCanvasHandle>(null);
  const floorPlanCanvasRef = useRef<FloorPlanCanvasHandle>(null);

  const handleReset = useCallback(() => {
    if (mode === "room" && activeRoom) {
      // Reset just this room's furniture
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
      setActiveRoom(null);
      setMode("floorplan");
      toast.success("Floor plan reset — fresh start!");
    }
  }, [mode, activeRoom]);

  const handleEnterRoom = useCallback((room: FloorPlanRoom) => {
    // Create room state if it doesn't exist
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
      try {
        const svg = mode === "floorplan"
          ? floorPlanCanvasRef.current?.getSvgElement()
          : roomCanvasRef.current?.getSvgElement();
        if (svg) canvasScreenshot = await captureSvgAsBase64(svg);
      } catch (err) {
        console.warn("Could not capture screenshot:", err);
      }

      const requestBody: Record<string, unknown> = {
        messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
        mode,
        canvasScreenshot,
        images: userImages,
      };

      if (mode === "floorplan") {
        requestBody.floorPlan = floorPlan;
      } else if (activeRoom) {
        requestBody.roomState = roomStates[activeRoom.id];
        requestBody.roomName = activeRoom.name;
      }

      const { data, error } = await supabase.functions.invoke("room-architect", {
        body: requestBody,
      });

      if (error) throw error;
      if (data.error) {
        toast.error(data.error);
        return;
      }

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.message,
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (mode === "floorplan" && data.floorPlan) {
        setFloorPlan(data.floorPlan);
      } else if (mode === "room" && data.roomState && activeRoom) {
        setRoomStates(prev => ({ ...prev, [activeRoom.id]: data.roomState }));
      }

      if (data.newItemIds && data.newItemIds.length > 0) {
        setHighlightIds(data.newItemIds);
        setTimeout(() => setHighlightIds([]), 4500);
      }

      if (data.actionLog && data.actionLog.length > 0) {
        const newActions: ActionEntry[] = data.actionLog.map((text: string) => ({
          id: crypto.randomUUID(),
          text,
          timestamp: Date.now(),
        }));
        setActions(prev => [...prev, ...newActions]);
      }
    } catch (e: any) {
      console.error("Error:", e);
      toast.error(e.message || "Failed to get AI response");
    } finally {
      setIsLoading(false);
    }
  }, [messages, mode, floorPlan, roomStates, activeRoom]);

  const chatTitle = mode === "floorplan" ? "🏠 Floor Plan Architect" : `🪑 Furnishing: ${activeRoom?.name || "Room"}`;
  const chatSubtitle = mode === "floorplan"
    ? "Describe your home or upload a sketch"
    : "Place furniture in this room";

  const chatPlaceholders = mode === "floorplan"
    ? [
        '"Design a 3 bedroom 2 bath house"',
        '"Add an open concept kitchen and living room"',
        '"Make the master bedroom bigger"',
        '📷 Upload a sketch of your floor plan',
      ]
    : [
        '"Add a king bed against the back wall"',
        '"Set up a cozy living room layout"',
        '"Nudge the sofa a bit to the left"',
        '"Place a dining table in the center"',
      ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <div className="w-[380px] border-r border-border flex flex-col bg-card h-full">
        {/* Mode header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {mode === "room" && (
                <Button variant="ghost" size="icon" onClick={handleBackToFloorPlan} title="Back to floor plan" className="shrink-0">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              <div>
                <h2 className="text-lg font-bold text-foreground">{chatTitle}</h2>
                <p className="text-xs text-muted-foreground">{chatSubtitle}</p>
              </div>
            </div>
          </div>
        </div>
        <ChatPanel
          messages={messages}
          isLoading={isLoading}
          onSend={handleSend}
          onReset={handleReset}
          placeholders={chatPlaceholders}
        />
      </div>

      {mode === "floorplan" ? (
        <FloorPlanCanvas
          ref={floorPlanCanvasRef}
          floorPlan={floorPlan}
          actions={actions}
          onEnterRoom={handleEnterRoom}
        />
      ) : activeRoom && roomStates[activeRoom.id] ? (
        <RoomCanvas
          ref={roomCanvasRef}
          roomState={roomStates[activeRoom.id]}
          highlightIds={highlightIds}
          actions={actions}
        />
      ) : null}
    </div>
  );
};

export default Index;
