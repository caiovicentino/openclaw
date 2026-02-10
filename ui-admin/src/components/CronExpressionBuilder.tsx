import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Frequency = "every_minute" | "hourly" | "daily" | "weekly" | "monthly" | "custom";

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "every_minute", label: "Every Minute" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
];

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

function detectFrequency(cron: string): Frequency {
  if (cron === "* * * * *") return "every_minute";
  if (/^\d+ \* \* \* \*$/.test(cron)) return "hourly";
  if (/^\d+ \d+ \* \* \*$/.test(cron)) return "daily";
  if (/^\d+ \d+ \* \* \d+$/.test(cron)) return "weekly";
  if (/^\d+ \d+ \d+ \* \*$/.test(cron)) return "monthly";
  return "custom";
}

function cronToHumanReadable(cron: string): string {
  if (!cron) return "";
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  if (cron === "* * * * *") return "Every minute";
  if (hour === "*" && dayOfMonth === "*" && dayOfWeek === "*") {
    return `Every hour at minute ${minute}`;
  }
  if (dayOfMonth === "*" && dayOfWeek === "*") {
    return `Daily at ${hour!.padStart(2, "0")}:${minute!.padStart(2, "0")}`;
  }
  if (dayOfMonth === "*" && dayOfWeek !== "*") {
    const dayName = DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label ?? `day ${dayOfWeek}`;
    return `Weekly on ${dayName} at ${hour!.padStart(2, "0")}:${minute!.padStart(2, "0")}`;
  }
  if (dayOfWeek === "*" && dayOfMonth !== "*") {
    return `Monthly on day ${dayOfMonth} at ${hour!.padStart(2, "0")}:${minute!.padStart(2, "0")}`;
  }

  return cron;
}

interface CronExpressionBuilderProps {
  value: string;
  onChange: (value: string) => void;
}

export default function CronExpressionBuilder({ value, onChange }: CronExpressionBuilderProps) {
  const [frequency, setFrequency] = useState<Frequency>(() => detectFrequency(value));
  const [minute, setMinute] = useState("0");
  const [hour, setHour] = useState("0");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [customCron, setCustomCron] = useState(value);

  // Parse initial value
  useEffect(() => {
    if (!value) return;
    const freq = detectFrequency(value);
    setFrequency(freq);
    const parts = value.split(" ");
    if (parts.length === 5) {
      setMinute(parts[0] === "*" ? "0" : (parts[0] ?? "0"));
      setHour(parts[1] === "*" ? "0" : (parts[1] ?? "0"));
      setDayOfMonth(parts[2] === "*" ? "1" : (parts[2] ?? "1"));
      setDayOfWeek(parts[4] === "*" ? "1" : (parts[4] ?? "1"));
    }
    if (freq === "custom") {
      setCustomCron(value);
    }
  }, []);

  function buildCron(freq: Frequency, min: string, hr: string, dow: string, dom: string): string {
    switch (freq) {
      case "every_minute":
        return "* * * * *";
      case "hourly":
        return `${min} * * * *`;
      case "daily":
        return `${min} ${hr} * * *`;
      case "weekly":
        return `${min} ${hr} * * ${dow}`;
      case "monthly":
        return `${min} ${hr} ${dom} * *`;
      case "custom":
        return customCron;
    }
  }

  function handleFrequencyChange(newFreq: Frequency) {
    setFrequency(newFreq);
    if (newFreq === "custom") {
      setCustomCron(value);
    } else {
      const cron = buildCron(newFreq, minute, hour, dayOfWeek, dayOfMonth);
      onChange(cron);
    }
  }

  function updateField(field: string, val: string) {
    let min = minute,
      hr = hour,
      dow = dayOfWeek,
      dom = dayOfMonth;
    if (field === "minute") {
      min = val;
      setMinute(val);
    }
    if (field === "hour") {
      hr = val;
      setHour(val);
    }
    if (field === "dayOfWeek") {
      dow = val;
      setDayOfWeek(val);
    }
    if (field === "dayOfMonth") {
      dom = val;
      setDayOfMonth(val);
    }
    const cron = buildCron(frequency, min, hr, dow, dom);
    onChange(cron);
  }

  const humanReadable = cronToHumanReadable(value);

  return (
    <div className="space-y-3">
      <div>
        <Label>Frequency</Label>
        <select
          value={frequency}
          onChange={(e) => handleFrequencyChange(e.target.value as Frequency)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {FREQUENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {frequency !== "every_minute" && frequency !== "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Minute (0-59)</Label>
            <Input
              type="number"
              min={0}
              max={59}
              value={minute}
              onChange={(e) => updateField("minute", e.target.value)}
            />
          </div>
          {frequency !== "hourly" && (
            <div>
              <Label>Hour (0-23)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => updateField("hour", e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {frequency === "weekly" && (
        <div>
          <Label>Day of Week</Label>
          <select
            value={dayOfWeek}
            onChange={(e) => updateField("dayOfWeek", e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {DAYS_OF_WEEK.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {frequency === "monthly" && (
        <div>
          <Label>Day of Month (1-31)</Label>
          <Input
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => updateField("dayOfMonth", e.target.value)}
          />
        </div>
      )}

      {frequency === "custom" && (
        <div>
          <Label>Cron Expression</Label>
          <Input
            value={customCron}
            onChange={(e) => {
              setCustomCron(e.target.value);
              onChange(e.target.value);
            }}
            placeholder="* * * * *"
          />
          <p className="mt-1 text-xs text-gray-400">
            Format: minute hour day-of-month month day-of-week
          </p>
        </div>
      )}

      {value && (
        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Schedule: <span className="font-medium">{humanReadable}</span>
          <span className="ml-2 text-xs text-slate-400">({value})</span>
        </div>
      )}
    </div>
  );
}

export { cronToHumanReadable };
