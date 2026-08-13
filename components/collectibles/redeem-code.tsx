"use client";

import { useState } from "react";
import Link from "next/link";
import { realmFetch } from "@/lib/auth/api";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";

/* THE PRINTED CODE: the bridge from a box on a table to a card in the realm.
 *
 * A King's Reliquary ships with a single-use code. Typing it here grants the
 * digital twins of the printed cards into the member's own holdings, which they
 * can then carry to their own wallet through the ownership loop. No second
 * redemption, no second payment.
 *
 * THE FAILURE MESSAGES ARE DELIBERATELY IDENTICAL. A code that does not exist
 * and a code already used answer with the same sentence, because the route
 * answers them the same way on purpose: distinguishing them would confirm to a
 * guesser that a code exists, which is the whole game when the secret is eight
 * or so characters printed on card stock. This surface must not helpfully undo
 * that by rendering two different messages.
 *
 * The input is deliberately forgiving about shape, because a person is reading
 * off a printed card: case and separators are normalised server side, so
 * nobody is told their code is wrong for having typed it in lower case.
 */

type Phase = "idle" | "sending" | "done" | "error";

export function RedeemCode() {
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [granted, setGranted] = useState(0);

  const redeem = async () => {
    setPhase("sending");
    setMessage(null);
    const res = await realmFetch<{
      redeemed?: boolean;
      granted?: number;
      error?: string;
    }>("/api/reliquary/redeem", { method: "POST", json: { code } });

    if (res.status === 401) {
      window.location.assign("/signin");
      return;
    }
    if (res.ok && res.data?.redeemed) {
      setGranted(res.data.granted ?? 0);
      setPhase("done");
      setCode("");
      return;
    }
    setPhase("error");
    setMessage(res.data?.error ?? "That code could not be redeemed");
  };

  if (phase === "done") {
    return (
      <Card>
        <SectionHeader title="Redeemed" />
        <p className="mt-1 text-sm leading-relaxed text-bone-mut">
          {granted === 1
            ? "One card has joined your Hoard."
            : `${granted} cards have joined your Hoard.`}{" "}
          They are yours, and you can carry them to your own wallet whenever the
          mint is open.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="gold" size="md" render={<Link href="/vault" />}>
            See your Hoard
          </Button>
          <Button size="md" onClick={() => setPhase("idle")}>
            Redeem another
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader title="Redeem a printed code" hint="From a physical box" />
      <p className="mt-1 text-sm leading-relaxed text-bone-mut">
        Every King&rsquo;s Reliquary carries a single-use code. Enter it and the
        digital twins of your printed cards land in your Hoard.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <Field label="Your code">
          <Input
            value={code}
            maxLength={40}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="Printed inside the box"
            disabled={phase === "sending"}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <Button
          variant="gold"
          size="md"
          className="self-start"
          disabled={phase === "sending" || code.trim().length === 0}
          onClick={() => void redeem()}
        >
          {phase === "sending" ? "Checking the code" : "Redeem"}
        </Button>
        {message ? (
          <p className="flex items-start gap-1.5 text-xs leading-snug text-state-danger">
            <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {message}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
