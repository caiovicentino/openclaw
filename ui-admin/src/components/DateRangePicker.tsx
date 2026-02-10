import { Calendar, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface DateRange {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0] ?? "";
}

const presets = [
  {
    label: "Today",
    getRange: (): DateRange => {
      const today = toDateStr(new Date());
      return { from: today, to: today };
    },
  },
  {
    label: "Last 7 days",
    getRange: (): DateRange => {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - 7);
      return { from: toDateStr(from), to: toDateStr(to) };
    },
  },
  {
    label: "Last 30 days",
    getRange: (): DateRange => {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - 30);
      return { from: toDateStr(from), to: toDateStr(to) };
    },
  },
  {
    label: "This month",
    getRange: (): DateRange => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toDateStr(from), to: toDateStr(now) };
    },
  },
];

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const hasValue = value.from || value.to;

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setIsOpen(!isOpen)} className="gap-2">
        <Calendar className="h-4 w-4" />
        {hasValue ? `${value.from || "..."} - ${value.to || "..."}` : "Date range"}
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 rounded-lg border border-border bg-background p-4 shadow-lg">
          <div className="flex items-center gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">From</label>
              <input
                type="date"
                value={value.from}
                onChange={(e) => onChange({ ...value, from: e.target.value })}
                className="h-8 w-36 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <span className="mt-5 text-muted-foreground">-</span>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">To</label>
              <input
                type="date"
                value={value.to}
                onChange={(e) => onChange({ ...value, to: e.target.value })}
                className="h-8 w-36 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onChange(preset.getRange())}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={() => onChange({ from: "", to: "" })}
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => setIsOpen(false)}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
