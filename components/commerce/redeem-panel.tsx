"use client";

import { useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Ceremony } from "@/components/realm/ceremony";

/* Redemption-code UI (V2 Part Two, section 38, slice 1).
 *
 * A King's Reliquary ships with one printed, single-use code. Redeeming it
 * grants the digital twins of the printed cards into the member's own binder,
 * non-custodially, through POST /api/reliquary/redeem. The route hashes the
 * code, claims it atomically, and answers "not valid or already used" for both
 * an unknown and a spent code so it never confirms a code to a guesser.
 *
 * A successful redemption is a genuine reward, so it earns the Forge register:
 * the twins arriving is a Ceremony, not a toast.
 */

/* The printed-code shape, mirrored from lib/commerce/redemption.ts (which is
   server-only, node:crypto). Five groups of four from a 30-symbol alphabet.
   Kept in step with that module. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 20;

function normalize(raw: string): string {
  const upper = raw.toUpperCase();
  let out = "";
  for (const ch of upper) if (ALPHABET.includes(ch)) out += ch;
  return out;
}

/* Group the normalised symbols back into RSPX-4K7Q-9WTM as the member types,
   so the field reads like the code printed in the box. */
function grouped(raw: string): string {
  const n = normalize(raw).slice(0, CODE_LENGTH);
  return n.replace(/(.{4})(?=.)/g, "$1-");
}

interface RedeemResponse {
  redeemed?: boolean;
  granted?: number;
  error?: string;
}

export function RedeemPanel() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [granted, setGranted] = useState<number | null>(null);

  const wellFormed = normalize(code).length === CODE_LENGTH;

  async function redeem() {
    if (busy || !wellFormed) return;
    setBusy(true);
    setError(null);
    const res = await realmFetch<RedeemResponse>("/api/reliquary/redeem", {
      method: "POST",
      json: { code: normalize(code) },
    });
    setBusy(false);
    if (res.ok && res.data?.redeemed) {
      setGranted(res.data.granted ?? 0);
      setCode("");
      return;
    }
    const map: Record<number, string> = {
      400: "That does not look like a Reliquary code.",
      401: "Enter the realm to redeem a code.",
      409: "This code is not valid or has already been used.",
      423: "The Reliquary is sealed until launch.",
      429: "Too many tries. Give it a moment.",
    };
    setError(map[res.status] ?? res.data?.error ?? "That code could not be redeemed.");
  }

  return (
    <>
      <Card variant="raised" radius="xl" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="scroll" className="h-4 w-4 text-gold" />
          <h2 className="font-display text-base font-semibold text-bone">
            Redeem a code
          </h2>
        </div>
        <p className="text-sm text-bone-mut">
          Printed inside a King&rsquo;s Reliquary. Redeeming it mints the digital
          twins of your printed cards into your own binder.
        </p>
        <Field error={error ?? undefined}>
          <Input
            value={grouped(code)}
            onChange={(e) => {
              setError(null);
              setCode(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void redeem();
            }}
            placeholder="RSPX-4K7Q-9WTM-..."
            aria-label="Reliquary code"
            autoCapitalize="characters"
            spellCheck={false}
            className="h-9 font-mono tracking-[0.14em]"
          />
        </Field>
        <Button
          variant="gold"
          size="lg"
          block
          loading={busy}
          disabled={!wellFormed}
          onClick={redeem}
        >
          Redeem
        </Button>
      </Card>

      <Ceremony
        open={granted !== null}
        onClose={() => setGranted(null)}
        icon="satchel"
        eyebrow="The Reliquary opens"
        title="Twins claimed"
        figure={granted !== null ? String(granted) : undefined}
        figureLabel={granted === 1 ? "card into your binder" : "cards into your binder"}
        body="These are yours, held non-custodially in your own binder. When the on-chain claim opens, you sign to pull them to your wallet."
        action={{ label: "To the Reliquary", href: "/reliquary" }}
        secondary={{ label: "Close", onClick: () => setGranted(null) }}
      />
    </>
  );
}
