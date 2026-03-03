import { useState, useCallback, useRef } from "react";
import ChatPanel from "@/components/ChatPanel";
import RoomCanvas, { type RoomCanvasHandle } from "@/components/RoomCanvas";
import { createDefaultRoom } from "@/data/assetCatalog";
import type { RoomState, ChatMessage } from "@/types/room";
import type { ActionEntry } from "@/components/ActionLog";
import { supabase } from "@/integrations/supabase/client";
import { captureSvgAsBase64 } from "@/lib/canvasCapture";
import { toast } from "sonner";

const Index = () => {
  const [roomState, setRoomState] = useState<RoomState>(createDefaultRoom());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [actions, setActions] = useState<ActionEntry[]>([]);
  const canvasRef = useRef<RoomCanvasHandle>(null);

  const handleReset = useCallback(() => {
    setRoomState(createDefaultRoom());
    setMessages([]);
    setHighlightIds([]);
    setActions([]);
    toast.success("Room reset — fresh start!");
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
      // Capture canvas screenshot for AI vision
      let canvasScreenshot: string | undefined;
      try {
        const svg = canvasRef.current?.getSvgElement();
        if (svg) {
          canvasScreenshot = await captureSvgAsBase64(svg);
        }
      } catch (err) {
        console.warn("Could not capture canvas screenshot:", err);
      }

      const { data, error } = await supabase.functions.invoke("room-architect", {
        body: {
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          roomState,
          canvasScreenshot,
          images: userImages,
        },
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
      setMessages((prev) => [...prev, assistantMsg]);

      if (data.roomState) setRoomState(data.roomState);

      // Highlight newly placed items
      if (data.newItemIds && data.newItemIds.length > 0) {
        setHighlightIds(data.newItemIds);
        setTimeout(() => setHighlightIds([]), 4500);
      }

      // Show action log entries
      if (data.actionLog && data.actionLog.length > 0) {
        const newActions: ActionEntry[] = data.actionLog.map((text: string) => ({
          id: crypto.randomUUID(),
          text,
          timestamp: Date.now(),
        }));
        setActions((prev) => [...prev, ...newActions]);
      }
    } catch (e: any) {
      console.error("Error:", e);
      toast.error(e.message || "Failed to get AI response");
    } finally {
      setIsLoading(false);
    }
  }, [messages, roomState]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <ChatPanel messages={messages} isLoading={isLoading} onSend={handleSend} onReset={handleReset} />
      <RoomCanvas ref={canvasRef} roomState={roomState} highlightIds={highlightIds} actions={actions} />
    </div>
  );
};

export default Index;
