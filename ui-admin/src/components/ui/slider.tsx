import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue"
> {
  onValueChange?: (value: number[]) => void;
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  (
    { className, onValueChange, value, defaultValue, min = 0, max = 100, step = 1, ...props },
    ref,
  ) => {
    const currentValue = value?.[0] ?? defaultValue?.[0] ?? min;

    return (
      <input
        type="range"
        ref={ref}
        min={min}
        max={max}
        step={step}
        value={currentValue}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          onValueChange?.([val]);
        }}
        className={cn(
          "w-full h-2 rounded-lg appearance-none cursor-pointer bg-secondary",
          "accent-primary",
          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
          className,
        )}
        {...props}
      />
    );
  },
);

Slider.displayName = "Slider";

export { Slider };
