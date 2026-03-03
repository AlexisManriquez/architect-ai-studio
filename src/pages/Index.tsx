import { useState, useCallback } from "react";
import ChatPanel from "@/components/ChatPanel";
import RoomCanvas from "@/components/RoomCanvas";
import { createDefaultRoom } from "@/data/assetCatalog";
import type { RoomState, ChatMessage } from "@/types/room";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Index = () => {
  const [roomState, setRoomState] = useState<RoomState>(createDefaultRoom());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = useCallback(async (text: string) => {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("room-architect", {
        body: {
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          roomState,
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
    } catch (e: any) {
      console.error("Error:", e);
      toast.error(e.message || "Failed to get AI response");
    } finally {
      setIsLoading(false);
    }
  }, [messages, roomState]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <ChatPanel messages={messages} isLoading={isLoading} onSend={handleSend} />
      <RoomCanvas roomState={roomState} />
    </div>
  );
};

export default Index;
