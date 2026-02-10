import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

// --- Context-based Select (Radix-like API) ---

interface SelectContextValue {
  value?: string;
  onValueChange?: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  displayLabel: string;
  setDisplayLabel: (label: string) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error("Select compound components must be used within Select");
  return ctx;
}

interface SelectRootProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

function Select({ value, onValueChange, children }: SelectRootProps) {
  const [open, setOpen] = React.useState(false);
  const [displayLabel, setDisplayLabel] = React.useState("");

  return (
    <SelectContext.Provider
      value={{ value, onValueChange, open, setOpen, displayLabel, setDisplayLabel }}
    >
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

interface SelectTriggerProps {
  className?: string;
  children?: React.ReactNode;
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children }, ref) => {
    const { setOpen, open } = useSelectContext();
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {children}
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
    );
  },
);
SelectTrigger.displayName = "SelectTrigger";

interface SelectValueProps {
  placeholder?: string;
}

function SelectValue({ placeholder }: SelectValueProps) {
  const { displayLabel } = useSelectContext();
  return (
    <span className={cn(!displayLabel && "text-muted-foreground")}>
      {displayLabel || placeholder || ""}
    </span>
  );
}

interface SelectContentProps {
  className?: string;
  children?: React.ReactNode;
}

function SelectContent({ className, children }: SelectContentProps) {
  const { open, setOpen } = useSelectContext();

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      <div
        className={cn(
          "absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
          className,
        )}
      >
        <div className="max-h-60 overflow-auto p-1">{children}</div>
      </div>
    </>
  );
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

function SelectItem({ value, children, className }: SelectItemProps) {
  const ctx = useSelectContext();

  // Sync display label when this item is the selected value
  React.useEffect(() => {
    if (ctx.value === value && typeof children === "string") {
      ctx.setDisplayLabel(children);
    }
  }, [ctx.value, value, children]);

  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        ctx.value === value && "bg-accent text-accent-foreground",
        className,
      )}
      onClick={() => {
        ctx.onValueChange?.(value);
        if (typeof children === "string") {
          ctx.setDisplayLabel(children);
        }
        ctx.setOpen(false);
      }}
    >
      {children}
    </div>
  );
}

// --- Legacy native select (kept for backwards compat) ---

export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "flex h-9 w-full appearance-none rounded-md border border-input bg-transparent px-3 py-1 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
      </div>
    );
  },
);
NativeSelect.displayName = "NativeSelect";

const SelectOption = React.forwardRef<
  HTMLOptionElement,
  React.OptionHTMLAttributes<HTMLOptionElement>
>(({ ...props }, ref) => <option ref={ref} {...props} />);
SelectOption.displayName = "SelectOption";

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  NativeSelect,
  SelectOption,
};
