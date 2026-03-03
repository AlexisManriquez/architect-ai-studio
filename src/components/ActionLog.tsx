import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ActionEntry {
  id: string;
  text: string;
  timestamp: number;
}

interface ActionLogProps {
  actions: ActionEntry[];
}

export default function ActionLog({ actions }: ActionLogProps) {
  const [visible, setVisible] = useState<ActionEntry[]>([]);

  useEffect(() => {
    // Show only the last 4 actions, auto-remove after 5 seconds
    setVisible(actions.slice(-4));
    const timer = setTimeout(() => {
      setVisible((prev) => prev.slice(1));
    }, 5000);
    return () => clearTimeout(timer);
  }, [actions]);

  if (visible.length === 0) return null;

  return (
    <div className="absolute top-4 right-4 flex flex-col gap-1.5 z-10 max-w-[280px]">
      <AnimatePresence>
        {visible.map((action) => (
          <motion.div
            key={action.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="bg-card/90 backdrop-blur-sm border border-border rounded-md px-3 py-1.5 text-xs text-foreground shadow-sm"
          >
            ✨ {action.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
