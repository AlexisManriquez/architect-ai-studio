import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, RotateCcw, ImagePlus, X } from "lucide-react";
import type { ChatMessage } from "@/types/room";
import ReactMarkdown from "react-markdown";
import { fileToBase64 } from "@/lib/canvasCapture";

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (message: string, images?: string[]) => void;
  onReset: () => void;
  placeholders?: string[];
}

export default function ChatPanel({ messages, isLoading, onSend, onReset, placeholders }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<{ base64: string; preview: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && pendingImages.length === 0) || isLoading) return;
    const images = pendingImages.map((p) => p.base64);
    onSend(input.trim() || "Here's an image — what do you see?", images.length > 0 ? images : undefined);
    setInput("");
    setPendingImages([]);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files.slice(0, 3)) {
      const base64 = await fileToBase64(file);
      const preview = URL.createObjectURL(file);
      setPendingImages((prev) => [...prev, { base64, preview }]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    setPendingImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const defaultPlaceholders = [
    '"Add a 3-seater sofa against the back wall"',
    '"Make an L-shaped seating area in the corner"',
    '"Put a kitchen island in the center"',
    '📷 "Make my room look like this" + image',
  ];

  const hints = placeholders || defaultPlaceholders;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground space-y-2 mt-4">
            <p className="font-medium text-foreground">🎯 Try saying:</p>
            {hints.map((h, i) => (
              <p key={i} className="bg-muted rounded px-3 py-2 text-xs">{h}</p>
            ))}
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.images && msg.images.length > 0 && (
                <div className="flex gap-1 mb-2 flex-wrap">
                  {msg.images.map((img, i) => (
                    <img
                      key={i}
                      src={`data:image/png;base64,${img}`}
                      alt="Uploaded"
                      className="w-16 h-16 object-cover rounded border border-border/50"
                    />
                  ))}
                </div>
              )}
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:m-0">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              🤖 Designing...
            </div>
          </div>
        )}
      </div>

      {/* Pending image previews */}
      {pendingImages.length > 0 && (
        <div className="px-3 pb-1 flex gap-2 flex-wrap">
          {pendingImages.map((img, i) => (
            <div key={i} className="relative group">
              <img src={img.preview} alt="Upload" className="w-14 h-14 object-cover rounded border border-border" />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-border flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageSelect}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          title="Upload reference image"
        >
          <ImagePlus className="w-4 h-4" />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe what you want..."
          disabled={isLoading}
          className="flex-1"
        />
        <Button type="button" variant="ghost" size="icon" onClick={onReset} title="Reset">
          <RotateCcw className="w-4 h-4" />
        </Button>
        <Button type="submit" size="icon" disabled={isLoading || (!input.trim() && pendingImages.length === 0)}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
