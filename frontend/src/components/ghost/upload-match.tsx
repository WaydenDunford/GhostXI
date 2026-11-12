import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useBackend } from "@/lib/backend-context";
import { apiBase } from "@/lib/match-catalog";

// The three files SkillCorner delivers per match to licensed clubs.
const PARTS = [
  { key: "match", label: "Match file", hint: "…_match.json", accept: ".json,application/json" },
  { key: "events", label: "Dynamic events", hint: "…_dynamic_events.csv", accept: ".csv,text/csv" },
  { key: "tracking", label: "Tracking", hint: "…_tracking_extrapolated.jsonl", accept: ".jsonl,.json" },
] as const;
type Part = (typeof PARTS)[number]["key"];

const uploadBase = () =>
  `${(apiBase() ?? "").replace(/\/+$/, "").replace(/\/api(?:\/v1)?$/, "")}/api/v1/uploads`;

async function send<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok) {
    throw Object.assign(new Error(body?.error?.message ?? `Upload failed (${response.status}).`), {
      code: body?.error?.code,
    });
  }
  return body!.data as T;
}

export function UploadMatch() {
  const b = useBackend();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<Partial<Record<Part, File>>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Only shown once the server answers that it requires a key (non-local deployments).
  const [needsKey, setNeedsKey] = useState(false);
  const [key, setKey] = useState("");
  const ready = PARTS.every((p) => files[p.key]) && (!needsKey || key.length > 0);
  const auth: Record<string, string> = key ? { Authorization: `Bearer ${key}` } : {};

  const importMatch = async () => {
    setBusy(true);
    setError("");
    try {
      const id = crypto.randomUUID();
      for (const part of PARTS) {
        setStatus(`Uploading ${part.label.toLowerCase()}…`);
        await send(`${uploadBase()}/${id}/${part.key}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream", ...auth },
          body: files[part.key]!,
        });
      }
      setStatus("Validating every frame and building replay windows…");
      const match = await send<{ id: string; name: string; date: string; windows: number }>(
        `${uploadBase()}/${id}/import`,
        { method: "POST", headers: auth },
      );
      await queryClient.invalidateQueries({ queryKey: ["ghostxi"] });
      if (b.sourceMode !== "tracking") b.setSourceMode("tracking");
      b.setMatchId(match.id);
      setFiles({});
      const done = `Imported ${match.name} · ${match.date} · ${match.windows} replay windows.`;
      setStatus(done);
      // The lab remounts on the new match and closes this dialog, so also confirm globally.
      toast.success(done);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if ((e as { code?: string }).code === "UPLOAD_KEY_REQUIRED") setNeedsKey(true);
      setStatus("");
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="self-end">
          <Upload />
          Upload club data
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a licensed match</DialogTitle>
          <DialogDescription>
            For clubs with a SkillCorner data licence: add the three files SkillCorner delivers for
            a match. Every frame is validated, detected and extrapolated positions stay labelled,
            and the data is stored only on this server.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {PARTS.map((part) => (
            <div key={part.key}>
              <label className="text-eyebrow" htmlFor={`upload-${part.key}`}>
                {part.label} · {part.hint}
              </label>
              <Input
                id={`upload-${part.key}`}
                type="file"
                accept={part.accept}
                disabled={busy}
                className="mt-1 text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setFiles((f) => ({ ...f, [part.key]: file }));
                }}
              />
            </div>
          ))}
          {needsKey && (
            <div>
              <label className="text-eyebrow" htmlFor="upload-key">
                Upload key · from your GhostXI administrator
              </label>
              <Input
                id="upload-key"
                type="password"
                autoComplete="off"
                value={key}
                disabled={busy}
                className="mt-1 text-xs"
                onChange={(e) => setKey(e.target.value)}
              />
            </div>
          )}
        </div>
        {(status || error) && (
          <p role="status" className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {error || status}
          </p>
        )}
        <DialogFooter>
          <Button size="sm" disabled={!ready || busy} onClick={() => void importMatch()}>
            <Upload />
            {busy ? "Importing…" : "Import match"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
