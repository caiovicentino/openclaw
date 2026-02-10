import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { useState } from "react";
import type { Channel } from "@/api/types";
import {
  getChannels,
  connectChannel,
  disconnectChannel,
  disconnectWhatsAppWeb,
} from "@/api/channels";
import ChannelCard from "@/components/ChannelCard";
import ChannelConfigDialog from "@/components/ChannelConfigDialog";
import WhatsAppQrDialog from "@/components/WhatsAppQrDialog";

function ChannelsPage() {
  const queryClient = useQueryClient();
  const [configChannel, setConfigChannel] = useState<Channel | null>(null);
  const [qrChannel, setQrChannel] = useState<Channel | null>(null);

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const res = await getChannels();
      return res.channels as Channel[];
    },
  });

  const connectMutation = useMutation({
    mutationFn: (channelId: string) => connectChannel(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (channelId: string) => disconnectChannel(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });

  const disconnectWaMutation = useMutation({
    mutationFn: (channelId: string) => disconnectWhatsAppWeb(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });

  const handleConnect = (channel: Channel) => {
    if (channel.type === "whatsapp-web") {
      setQrChannel(channel);
    } else {
      connectMutation.mutate(channel.id);
    }
  };

  const handleDisconnect = (channel: Channel) => {
    if (channel.type === "whatsapp-web") {
      disconnectWaMutation.mutate(channel.id);
    } else {
      disconnectMutation.mutate(channel.id);
    }
  };

  const connected = channels.filter((c) => c.status === "active");
  const disconnected = channels.filter((c) => c.status === "inactive");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Channels</h1>
        <p className="text-muted-foreground">Manage messaging platform connections</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg border bg-muted" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border py-12">
          <Radio className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No channels available</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Channels will appear here once configured by your administrator.
          </p>
        </div>
      ) : (
        <>
          {connected.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Connected ({connected.length})</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {connected.map((channel) => (
                  <ChannelCard
                    key={channel.id}
                    channel={channel}
                    onConnect={() => handleConnect(channel)}
                    onDisconnect={() => handleDisconnect(channel)}
                    onConfigure={() => setConfigChannel(channel)}
                    isLoading={
                      connectMutation.isPending ||
                      disconnectMutation.isPending ||
                      disconnectWaMutation.isPending
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {disconnected.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Available ({disconnected.length})</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {disconnected.map((channel) => (
                  <ChannelCard
                    key={channel.id}
                    channel={channel}
                    onConnect={() => handleConnect(channel)}
                    onDisconnect={() => handleDisconnect(channel)}
                    onConfigure={() => setConfigChannel(channel)}
                    isLoading={
                      connectMutation.isPending ||
                      disconnectMutation.isPending ||
                      disconnectWaMutation.isPending
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <ChannelConfigDialog
        channel={configChannel}
        open={!!configChannel}
        onClose={() => setConfigChannel(null)}
      />

      <WhatsAppQrDialog
        channelId={qrChannel?.id ?? null}
        open={!!qrChannel}
        onClose={() => setQrChannel(null)}
      />
    </div>
  );
}

export default ChannelsPage;
