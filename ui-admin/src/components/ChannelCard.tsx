import { formatDistanceToNow } from "date-fns";
import {
  MessageCircle,
  Send,
  Hash,
  Gamepad2,
  Globe,
  Mail,
  Smartphone,
  Settings,
  Plug,
  Unplug,
  Loader2,
} from "lucide-react";
import type { Channel } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type ChannelType =
  | "whatsapp"
  | "whatsapp-web"
  | "telegram"
  | "slack"
  | "discord"
  | "web"
  | "email"
  | "sms";

interface ChannelCardProps {
  channel: Channel;
  onConnect: () => void;
  onDisconnect: () => void;
  onConfigure: () => void;
  isLoading?: boolean;
}

const CHANNEL_META: Record<
  ChannelType,
  {
    icon: typeof MessageCircle;
    color: string;
    bg: string;
    detailKey?: string;
    detailLabel?: string;
  }
> = {
  whatsapp: {
    icon: MessageCircle,
    color: "text-green-600",
    bg: "bg-green-100",
    detailKey: "phone",
    detailLabel: "Phone",
  },
  "whatsapp-web": {
    icon: MessageCircle,
    color: "text-green-600",
    bg: "bg-green-100",
    detailKey: "phone",
    detailLabel: "Phone",
  },
  telegram: {
    icon: Send,
    color: "text-blue-500",
    bg: "bg-blue-100",
    detailKey: "botUsername",
    detailLabel: "Bot",
  },
  slack: {
    icon: Hash,
    color: "text-purple-600",
    bg: "bg-purple-100",
    detailKey: "workspace",
    detailLabel: "Workspace",
  },
  discord: {
    icon: Gamepad2,
    color: "text-indigo-600",
    bg: "bg-indigo-100",
    detailKey: "guildId",
    detailLabel: "Guild",
  },
  web: {
    icon: Globe,
    color: "text-gray-600",
    bg: "bg-gray-100",
  },
  email: {
    icon: Mail,
    color: "text-orange-500",
    bg: "bg-orange-100",
    detailKey: "address",
    detailLabel: "Address",
  },
  sms: {
    icon: Smartphone,
    color: "text-cyan-600",
    bg: "bg-cyan-100",
    detailKey: "phone",
    detailLabel: "Phone",
  },
};

function ChannelCard({
  channel,
  onConnect,
  onDisconnect,
  onConfigure,
  isLoading = false,
}: ChannelCardProps) {
  const meta = CHANNEL_META[channel.type as ChannelType] ?? CHANNEL_META.web;
  const Icon = meta.icon;
  const isConnected = channel.status === "active";

  const detail =
    meta.detailKey && channel.config[meta.detailKey]
      ? String(channel.config[meta.detailKey])
      : null;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${meta.bg}`}
        >
          <Icon className={`h-5 w-5 ${meta.color}`} />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-semibold leading-none">{channel.name}</p>
            <Badge variant={isConnected ? "default" : "secondary"} className="ml-2">
              <span
                className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                  isConnected ? "bg-green-400" : "bg-gray-400"
                }`}
              />
              {isConnected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
          {detail && (
            <p className="text-xs text-muted-foreground">
              {meta.detailLabel}: {detail}
            </p>
          )}
          {channel.lastActiveAt && (
            <p className="text-xs text-muted-foreground">
              Last active{" "}
              {formatDistanceToNow(new Date(channel.lastActiveAt), {
                addSuffix: true,
              })}
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent className="mt-auto pt-2">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={onDisconnect}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unplug className="mr-2 h-4 w-4" />
              )}
              Disconnect
            </Button>
          ) : (
            <Button size="sm" className="flex-1" onClick={onConnect} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="mr-2 h-4 w-4" />
              )}
              Connect
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onConfigure}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ChannelCard;
