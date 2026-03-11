import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Check, X, Key } from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "gemini-api-key";

export function getStoredApiKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export default function ApiKeySettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [key, setKey] = useState(() => getStoredApiKey() || "");
  const hasKey = !!getStoredApiKey();

  const handleSave = () => {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
      toast.success("API key saved (stored locally only)");
    } else {
      localStorage.removeItem(STORAGE_KEY);
      toast.success("API key removed");
    }
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        title="API Key Settings"
        className="shrink-0"
      >
        {hasKey ? <Key className="w-4 h-4 text-green-500" /> : <Settings className="w-4 h-4" />}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Gemini API key"
        className="h-8 text-xs w-40"
      />
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSave}>
        <Check className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsOpen(false)}>
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
