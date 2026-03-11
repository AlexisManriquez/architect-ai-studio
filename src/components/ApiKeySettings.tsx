import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Check, X, Key, Trash2 } from "lucide-react";
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

  const handleRemoveKey = () => {
    localStorage.removeItem(STORAGE_KEY);
    // Clear from sessionStorage too just in case
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    setKey("");
    toast.success("API key securely removed from browser");
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
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore="true"
      />
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSave} title="Save key">
        <Check className="w-3.5 h-3.5" />
      </Button>
      {hasKey && (
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={handleRemoveKey} title="Remove key">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsOpen(false)} title="Cancel">
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
