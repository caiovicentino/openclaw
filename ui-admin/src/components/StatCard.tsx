import { clsx } from "clsx";
import { type LucideIcon } from "lucide-react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Card } from "@/components/ui/card";

interface StatCardProps {
  icon: LucideIcon;
  title: string;
  value: string | number;
  iconColor?: string;
  iconBg?: string;
  trend?: {
    direction: "up" | "down";
    value: number;
  };
  subtitle?: string;
}

export default function StatCard({
  icon: Icon,
  title,
  value,
  iconColor = "text-blue-600",
  iconBg = "bg-blue-100",
  trend,
  subtitle,
}: StatCardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
          {trend && (
            <div className="mt-2 flex items-center gap-1">
              {trend.direction === "up" ? (
                <ArrowUp className="h-4 w-4 text-green-600" />
              ) : (
                <ArrowDown className="h-4 w-4 text-red-600" />
              )}
              <span
                className={clsx(
                  "text-sm font-medium",
                  trend.direction === "up" ? "text-green-600" : "text-red-600",
                )}
              >
                {trend.value}%
              </span>
            </div>
          )}
          {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
        </div>
        <div className={clsx("rounded-full p-3", iconBg)}>
          <Icon className={clsx("h-6 w-6", iconColor)} />
        </div>
      </div>
    </Card>
  );
}
