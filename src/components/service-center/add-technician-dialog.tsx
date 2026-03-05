"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

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

type ServiceCenterOption = {
  id: string;
  name: string;
  city?: string | null;
};

type AddTechnicianDialogProps = {
  serviceCenters: ServiceCenterOption[];
};

function toNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function AddTechnicianDialog({ serviceCenters }: AddTechnicianDialogProps) {
  const router = useRouter();

  const defaultServiceCenterId = serviceCenters[0]?.id ?? "";

  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [clerkId, setClerkId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [skillsText, setSkillsText] = useState("filter_replacement, pump_repair");
  const [maxConcurrentJobs, setMaxConcurrentJobs] = useState("3");
  const [serviceCenterId, setServiceCenterId] = useState(defaultServiceCenterId);

  const canSubmit = useMemo(() => {
    return (
      clerkId.trim().length > 0 &&
      name.trim().length > 0 &&
      phone.trim().length > 0 &&
      Boolean(serviceCenterId)
    );
  }, [clerkId, name, phone, serviceCenterId]);

  const resetForm = () => {
    setClerkId("");
    setName("");
    setPhone("");
    setEmail("");
    setSkillsText("filter_replacement, pump_repair");
    setMaxConcurrentJobs("3");
    setServiceCenterId(defaultServiceCenterId);
    setError(null);
    setMessage(null);
  };

  const close = () => {
    setOpen(false);
    setIsSaving(false);
    setError(null);
    setMessage(null);
  };

  const submit = async () => {
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (!canSubmit) {
        throw new Error("Clerk user id, name, phone, and service center are required.");
      }

      const response = await fetch("/api/service-center/technicians", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clerkId: clerkId.trim(),
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() ? email.trim() : null,
          skills: skillsText
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
          maxConcurrentJobs: toNumber(maxConcurrentJobs),
          serviceCenterId: serviceCenterId || null,
          isAvailable: true,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Unable to add technician.");
      }

      setMessage("Technician added successfully.");
      router.refresh();
      resetForm();
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add technician.");
    } finally {
      setIsSaving(false);
    }
  };

  if (serviceCenters.length === 0) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setMessage(null);
          setServiceCenterId((current) => current || defaultServiceCenterId);
          return;
        }

        resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Technician
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Technician</DialogTitle>
          <DialogDescription>
            Create a technician profile for this service center. The technician must exist in Clerk
            (copy their Clerk User ID, e.g. <code>user_...</code>).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="space-y-1 text-sm">
            <span>Clerk User ID</span>
            <Input
              value={clerkId}
              onChange={(event) => setClerkId(event.target.value)}
              placeholder="user_123..."
              autoComplete="off"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Name</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Technician name"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Phone</span>
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+919999000102"
              />
            </label>
          </div>

          <label className="space-y-1 text-sm">
            <span>Email (optional)</span>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tech@company.com"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span>Skills (comma-separated)</span>
            <Input
              value={skillsText}
              onChange={(event) => setSkillsText(event.target.value)}
              placeholder="filter_replacement, pump_repair"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Max concurrent jobs</span>
              <Input
                inputMode="numeric"
                value={maxConcurrentJobs}
                onChange={(event) => setMaxConcurrentJobs(event.target.value)}
                placeholder="3"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Service Center</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={serviceCenterId}
                onChange={(event) => setServiceCenterId(event.target.value)}
              >
                {serviceCenters.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                    {center.city ? ` • ${center.city}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}

        <DialogFooter showCloseButton>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit || isSaving}
            className="min-w-32 gap-2"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

