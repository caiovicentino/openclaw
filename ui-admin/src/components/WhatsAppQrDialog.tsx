import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, QrCode, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { startWhatsAppQr, getWhatsAppQrStatus } from "@/api/channels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type DialogState = "loading" | "scanning" | "connected" | "error" | "expired";

interface WhatsAppQrDialogProps {
  channelId: string | null;
  open: boolean;
  onClose: () => void;
}

function WhatsAppQrDialog({ channelId, open, onClose }: WhatsAppQrDialogProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<DialogState>("loading");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startLogin = useCallback(async () => {
    if (!channelId) return;

    setState("loading");
    setQrDataUrl(null);
    setMessage("");
    setPhoneNumber(null);
    stopPolling();

    try {
      const res = await startWhatsAppQr(channelId);
      if (res.qrDataUrl) {
        setQrDataUrl(res.qrDataUrl);
        setState("scanning");

        // Start polling
        pollRef.current = setInterval(async () => {
          try {
            const status = await getWhatsAppQrStatus(channelId, res.loginId);

            if (status.status === "connected") {
              stopPolling();
              setState("connected");
              setPhoneNumber(status.phoneNumber ?? null);
              queryClient.invalidateQueries({ queryKey: ["channels"] });
            } else if (status.status === "error") {
              stopPolling();
              setState("error");
              setMessage(status.message);
            } else if (status.status === "expired") {
              stopPolling();
              setState("expired");
            }
          } catch {
            stopPolling();
            setState("error");
            setMessage("Failed to check status");
          }
        }, 2000);
      } else if (res.message === "Already connected") {
        setState("connected");
      } else {
        setState("error");
        setMessage(res.message || "Failed to generate QR code");
      }
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Failed to start QR login");
    }
  }, [channelId, stopPolling, queryClient]);

  // Start login when dialog opens
  useEffect(() => {
    if (open && channelId) {
      startLogin();
    }
    return () => stopPolling();
  }, [open, channelId, startLogin, stopPolling]);

  const handleClose = () => {
    stopPolling();
    onClose();
  };

  if (!channelId) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect WhatsApp</DialogTitle>
          <DialogDescription>Scan the QR code with your WhatsApp to connect</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6 space-y-4">
          {state === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Generating QR code...</p>
            </>
          )}

          {state === "scanning" && qrDataUrl && (
            <>
              <div className="rounded-lg border-2 border-green-200 p-2 bg-white">
                <img
                  src={qrDataUrl}
                  alt="WhatsApp QR Code"
                  width={256}
                  height={256}
                  className="rounded"
                />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm font-medium">Open WhatsApp on your phone</p>
                <p className="text-xs text-muted-foreground">
                  Go to Settings &gt; Linked Devices &gt; Link a Device
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for scan...
                </div>
              </div>
            </>
          )}

          {state === "connected" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
              <p className="text-lg font-semibold text-green-600">WhatsApp Connected!</p>
              {phoneNumber && <p className="text-sm text-muted-foreground">Phone: {phoneNumber}</p>}
              <Button onClick={handleClose} className="mt-2">
                Done
              </Button>
            </>
          )}

          {state === "error" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <XCircle className="h-10 w-10 text-red-600" />
              </div>
              <p className="text-sm font-medium text-red-600">{message || "Connection failed"}</p>
              <Button variant="outline" onClick={startLogin}>
                Try Again
              </Button>
            </>
          )}

          {state === "expired" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <QrCode className="h-10 w-10 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">QR code expired</p>
              <Button variant="outline" onClick={startLogin}>
                Generate New QR
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default WhatsAppQrDialog;
