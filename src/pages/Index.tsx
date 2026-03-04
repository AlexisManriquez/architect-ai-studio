import ChatPanel from "@/components/ChatPanel";
import RoomCanvas from "@/components/RoomCanvas";
import FloorPlanCanvas from "@/components/FloorPlanCanvas";
import { useAppContext } from "@/context/AppContext";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const {
    mode,
    floorPlan,
    activeRoom,
    roomStates,
    messages,
    isLoading,
    highlightIds,
    actions,
    handleReset,
    handleEnterRoom,
    handleBackToFloorPlan,
    handleSend,
    roomCanvasRef,
    floorPlanCanvasRef,
  } = useAppContext();

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
