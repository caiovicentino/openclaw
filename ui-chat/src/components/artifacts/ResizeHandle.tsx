import { useCallback, useEffect, useRef } from "react";

interface ResizeHandleProps {
  onResize: (rightPanelPercent: number) => void;
}

export function ResizeHandle({ onResize }: ResizeHandleProps) {
  const draggingRef = useRef(false);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const percent = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
      const clamped = Math.min(65, Math.max(25, percent));
      onResize(clamped);
    },
    [onResize],
  );

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
    document.body.classList.remove("cursor-col-resize", "select-none");
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = useCallback(() => {
    draggingRef.current = true;
    document.body.classList.add("cursor-col-resize", "select-none");
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    return () => {
      document.body.classList.remove("cursor-col-resize", "select-none");
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div
      className="relative flex h-full w-1 cursor-col-resize items-center justify-center"
      onMouseDown={handleMouseDown}
    >
      {/* Expanded hit area */}
      <div className="absolute inset-y-0 -left-2 -right-2" />
      {/* Visual bar */}
      <div className="h-full w-1 rounded-full bg-border transition-colors hover:bg-primary" />
    </div>
  );
}
