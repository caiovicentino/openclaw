import { formatDistanceToNow } from "date-fns";
import {
  LogIn,
  UserPlus,
  Settings,
  Shield,
  AlertTriangle,
  MessageSquare,
  Key,
  Trash2,
  Edit,
  type LucideIcon,
} from "lucide-react";

interface ActivityItem {
  id: string;
  action: string;
  description: string;
  user: string;
  timestamp: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
}

const actionIconMap: Record<string, LucideIcon> = {
  login: LogIn,
  "user.created": UserPlus,
  "user.updated": Edit,
  "user.deleted": Trash2,
  "settings.updated": Settings,
  "compliance.violation": AlertTriangle,
  "compliance.review": Shield,
  "session.created": MessageSquare,
  "api_key.created": Key,
  "api_key.revoked": Key,
};

function getActionIcon(action: string): LucideIcon {
  return actionIconMap[action] ?? Settings;
}

export default function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <div className="max-h-[480px] overflow-y-auto">
      <ul className="space-y-4">
        {items.map((item) => {
          const Icon = getActionIcon(item.action);
          return (
            <li key={item.id} className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-gray-100 p-2">
                <Icon className="h-4 w-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">{item.description}</p>
                <p className="text-xs text-gray-500">
                  {item.user} &middot;{" "}
                  {formatDistanceToNow(new Date(item.timestamp), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
