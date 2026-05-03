import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: Props) {
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center animate-fade-in">
      <div
        className="absolute inset-0 bg-[rgb(19_19_19_/_0.55)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`modal-panel relative ${SIZE_CLASSES[size]} mx-4 max-h-[90vh] w-full overflow-y-auto animate-scale-in`}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <h2 className="text-[26px] font-bold tracking-[-0.04em] text-[var(--color-dark)]">
                {title}
              </h2>
            </div>
            <button onClick={onClose} className="icon-chip h-8 w-8">
              ×
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
