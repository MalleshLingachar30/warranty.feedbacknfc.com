"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { parseStickerNumber } from "@/lib/sticker-number";

export function RegisterProductCard() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const stickerNumber = parseStickerNumber(value);
    if (!stickerNumber) {
      setError(
        "Enter a valid sticker number or sticker URL (e.g. 12345 or warranty.feedbacknfc.com/nfc/12345).",
      );
      return;
    }

    startTransition(() => {
      router.push(`/nfc/${stickerNumber}`);
    });
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="h-4 w-4 text-indigo-600" />
          Register another product
        </CardTitle>
        <p className="text-sm text-slate-600">
          Enter a sticker number or paste an NFC/QR URL to open the activation
          or service page.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            inputMode="text"
            placeholder="Sticker number or URL"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-11"
          />
          <Button type="submit" className="h-11" disabled={isPending}>
            Open Sticker
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
        {error ? (
          <p className="mt-2 text-xs text-rose-600">{error}</p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Tip: You can also scan the QR code or tap the NFC sticker.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
