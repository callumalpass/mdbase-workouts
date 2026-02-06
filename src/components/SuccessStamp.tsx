import { useEffect, useState } from "react";
import { haptics } from "../lib/haptics";

interface Props {
  text: string;
  onDone: () => void;
}

export default function SuccessStamp({ text, onDone }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    haptics.success();
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 200);
    }, 900);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center pointer-events-none
        transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <span
        className="text-4xl font-mono font-bold uppercase tracking-[0.2em] text-sage
          border-[3px] border-sage px-6 py-3 animate-stamp"
        style={{ rotate: "-8deg" }}
      >
        {text}
      </span>
    </div>
  );
}
