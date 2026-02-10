import { Check } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, onChange, checked, defaultChecked, ...props }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked ?? false);
    const isControlled = checked !== undefined;
    const isChecked = isControlled ? checked : internalChecked;

    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={isChecked}
        className={cn(
          "peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          isChecked && "bg-primary text-primary-foreground",
          className,
        )}
        disabled={props.disabled}
        onClick={() => {
          const next = !isChecked;
          if (!isControlled) setInternalChecked(next);
          onCheckedChange?.(next);
        }}
      >
        {isChecked && <Check className="h-3.5 w-3.5" />}
        <input
          type="checkbox"
          ref={ref}
          className="sr-only"
          checked={isChecked}
          onChange={(e) => {
            onChange?.(e);
          }}
          {...props}
        />
      </button>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
