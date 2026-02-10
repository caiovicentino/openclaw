import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wifi } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Channel } from "@/api/types";
import { updateChannel, testChannel } from "@/api/channels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ChannelType =
  | "whatsapp"
  | "whatsapp-web"
  | "telegram"
  | "slack"
  | "discord"
  | "web"
  | "email"
  | "sms";

interface ChannelConfigDialogProps {
  channel: Channel | null;
  open: boolean;
  onClose: () => void;
}

// --- Field definitions per channel type ---

interface FieldDef {
  name: string;
  label: string;
  placeholder: string;
  type?: string;
}

const CHANNEL_FIELDS: Record<ChannelType, FieldDef[]> = {
  whatsapp: [
    { name: "phone", label: "Phone Number", placeholder: "+1234567890" },
    { name: "sessionName", label: "Session Name", placeholder: "default" },
  ],
  "whatsapp-web": [],
  telegram: [
    {
      name: "botToken",
      label: "Bot Token",
      placeholder: "123456:ABC-DEF...",
      type: "password",
    },
  ],
  slack: [
    { name: "workspace", label: "Workspace", placeholder: "my-workspace" },
    {
      name: "botToken",
      label: "Bot Token",
      placeholder: "xoxb-...",
      type: "password",
    },
    {
      name: "signingSecret",
      label: "Signing Secret",
      placeholder: "abc123...",
      type: "password",
    },
  ],
  discord: [
    {
      name: "botToken",
      label: "Bot Token",
      placeholder: "MTIz...",
      type: "password",
    },
    { name: "guildId", label: "Guild ID", placeholder: "123456789012345678" },
  ],
  web: [
    { name: "widgetTitle", label: "Widget Title", placeholder: "Chat with us" },
    {
      name: "primaryColor",
      label: "Primary Color",
      placeholder: "#3B82F6",
    },
    { name: "position", label: "Widget Position", placeholder: "bottom-right" },
  ],
  email: [
    {
      name: "address",
      label: "Email Address",
      placeholder: "support@example.com",
    },
    { name: "smtpHost", label: "SMTP Host", placeholder: "smtp.example.com" },
    { name: "smtpPort", label: "SMTP Port", placeholder: "587" },
    {
      name: "smtpPassword",
      label: "SMTP Password",
      placeholder: "password",
      type: "password",
    },
  ],
  sms: [
    { name: "phone", label: "Phone Number", placeholder: "+1234567890" },
    {
      name: "apiKey",
      label: "API Key",
      placeholder: "key_...",
      type: "password",
    },
  ],
};

// Build a dynamic zod schema from the field definitions for a given channel type.
function buildSchema(type: ChannelType) {
  const fields = CHANNEL_FIELDS[type];
  const shape: Record<string, z.ZodString> = {};
  for (const field of fields) {
    shape[field.name] = z.string().min(1, `${field.label} is required`);
  }
  return z.object(shape);
}

function ChannelConfigDialog({ channel, open, onClose }: ChannelConfigDialogProps) {
  const queryClient = useQueryClient();
  const channelType = (channel?.type ?? "web") as ChannelType;
  const fields = CHANNEL_FIELDS[channelType] ?? CHANNEL_FIELDS.web;
  const schema = buildSchema(channelType);

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: channel?.config as FormValues,
  });

  // Reset form whenever the channel changes
  useEffect(() => {
    if (channel) {
      const defaults: Record<string, string> = {};
      for (const f of CHANNEL_FIELDS[channel.type as ChannelType] ?? CHANNEL_FIELDS.web) {
        defaults[f.name] = String(channel.config[f.name] ?? "");
      }
      form.reset(defaults as FormValues);
    }
  }, [channel, form]);

  const saveMutation = useMutation({
    mutationFn: (data: FormValues) =>
      updateChannel(channel!.id, { config: data as Record<string, unknown> }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      onClose();
    },
  });

  const testMutation = useMutation({
    mutationFn: () => testChannel(channel!.id),
  });

  if (!channel) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {channel.name}</DialogTitle>
        </DialogHeader>

        {channelType === "whatsapp-web" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This channel authenticates via QR code scan. Use the Connect button on the channel
              card to scan a QR code with your WhatsApp.
            </p>
            {channel.config.phone != null && (
              <p className="text-sm">
                Connected phone: <span className="font-medium">{String(channel.config.phone)}</span>
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
            className="space-y-4"
          >
            {fields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={field.name}>{field.label}</Label>
                <Input
                  id={field.name}
                  type={field.type ?? "text"}
                  placeholder={field.placeholder}
                  {...form.register(field.name)}
                />
                {form.formState.errors[field.name] && (
                  <p className="text-sm text-destructive">
                    {(form.formState.errors[field.name] as { message?: string })?.message}
                  </p>
                )}
              </div>
            ))}

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wifi className="mr-2 h-4 w-4" />
                )}
                Test Connection
              </Button>

              {testMutation.isSuccess && testMutation.data?.success && (
                <span className="text-sm text-green-600">
                  {testMutation.data.message ?? "Connection successful"}
                  {testMutation.data.latencyMs != null && ` (${testMutation.data.latencyMs}ms)`}
                </span>
              )}
              {(testMutation.isError ||
                (testMutation.isSuccess && !testMutation.data?.success)) && (
                <span className="text-sm text-destructive">
                  {testMutation.data?.message ?? "Connection failed"}
                </span>
              )}

              <div className="flex-1" />

              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ChannelConfigDialog;
