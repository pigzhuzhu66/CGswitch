import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface AppDisclosureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  showIcon?: boolean;
}

export function AppDisclosure({ open, onOpenChange, summary, children, className = "", showIcon = true }: AppDisclosureProps) {
  return (
    <div className={`apple-disclosure ${open ? "apple-disclosure--open" : ""} ${className}`.trim()}>
      <button type="button" className="apple-disclosure__summary" aria-expanded={open} onClick={() => onOpenChange(!open)}>
        {summary}
        {showIcon ? <ChevronRight className="apple-disclosure__icon ml-auto" size={18} strokeWidth={2} aria-hidden="true" /> : null}
      </button>
      <div className="apple-disclosure__content" aria-hidden={!open} inert={!open}>
        <div className="apple-disclosure__body">{children}</div>
      </div>
    </div>
  );
}
