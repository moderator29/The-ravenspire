"use client";

import { useCallback, useEffect, useState } from "react";
import { crests, CrestRoundel } from "@/components/brand/crests";
import { realmFetch } from "@/lib/auth/api";
import { Badge, RarityChip, type Rarity } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/modal";
import {
  AdminHeader,
  AdminNote,
  AdminStack,
  TOUCH,
} from "@/app/admin/ui";

export default function AdminCrestsPage() {
  const liveCount = crests.filter((c) => c.status === "live").length;
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  const [crestSlug, setCrestSlug] = useState(crests[0]?.slug ?? "");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "gold" | "danger"; text: string } | null>(
    null
  );
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const load = useCallback(() => {
    setStatus("loading");
    void realmFetch<{ counts: Record<string, number> }>("/api/admin/crests").then(
      (res) => {
        if (res.ok && res.data?.counts) {
          setCounts(res.data.counts);
          setStatus("ok");
        } else {
          setStatus("error");
        }
      }
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: "grant" | "revoke") {
    if (!handle.trim()) {
      setNote({ tone: "danger", text: "Enter a member handle first." });
      return;
    }
    setBusy(true);
    setNote(null);
    const res = await realmFetch<{
      ok?: boolean;
      counts?: Record<string, number>;
      member?: { handle: string | null };
      error?: string;
    }>("/api/admin/crests", {
      method: "POST",
      json: { action, crest_slug: crestSlug, handle: handle.trim() },
    });
    if (res.ok && res.data?.ok) {
      if (res.data.counts) setCounts(res.data.counts);
      setNote({
        tone: "gold",
        text: `${action === "grant" ? "Granted" : "Revoked"} for @${
          res.data.member?.handle ?? handle.trim().replace(/^@/, "")
        }.`,
      });
    } else if (res.data?.error === "member_not_found") {
      setNote({ tone: "danger", text: "No member with that handle." });
    } else {
      setNote({ tone: "danger", text: "The change did not take. Try again." });
    }
    setBusy(false);
  }

  const totalEarned =
    counts === null
      ? null
      : Object.values(counts).reduce((sum, n) => sum + n, 0);

  const selectedCrest = crests.find((c) => c.slug === crestSlug) ?? null;

  return (
    <AdminStack>
      <AdminHeader title="Crests" kicker="The honor roll" />

      <p className="text-xs text-bone-faint">
        <span className="tnum">{liveCount}</span> of{" "}
        <span className="tnum">{crests.length}</span> crests are live.
        {totalEarned !== null ? (
          <>
            {" "}
            <span className="tnum text-gold">{totalEarned}</span> earned across
            the realm.
          </>
        ) : null}
      </p>

      {status === "error" ? (
        <AdminNote>
          Earned counts could not be read, so the roll is shown without them.
        </AdminNote>
      ) : null}

      <Card pad="sm">
        <SectionHeader title="Grant or revoke a crest" className="px-0 pt-0" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Crest" required>
            <Select
              value={crestSlug}
              onValueChange={(next) => setCrestSlug(next ?? "")}
              placeholder="Choose a crest"
              items={crests.map((c) => ({ value: c.slug, label: c.name }))}
              className="min-h-11 md:min-h-0"
            />
          </Field>
          <Field label="Member handle" required>
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@raven"
              className="min-h-11 md:min-h-0"
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="gold"
            size="md"
            className={TOUCH}
            loading={busy}
            onClick={() => void act("grant")}
          >
            Grant
          </Button>
          <Button
            variant="danger"
            size="md"
            className={TOUCH}
            disabled={busy}
            onClick={() => setConfirmRevoke(true)}
          >
            Revoke
          </Button>
        </div>
        {note ? (
          <div className="mt-2">
            <AdminNote tone={note.tone}>{note.text}</AdminNote>
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-3 md:gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {crests.map((c) => {
          const earned = counts?.[c.slug] ?? 0;
          return (
            <Card key={c.slug} pad="sm">
              <div className="flex items-start gap-4">
                <CrestRoundel
                  icon={c.icon}
                  className="h-14 w-14 shrink-0"
                  dim={c.status === "locked"}
                />
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-bone">
                    {c.name}
                  </p>
                  <p className="text-xs text-bone-faint">{c.plain}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <RarityChip rarity={c.rarity as Rarity} />
                    <Badge variant={c.status === "live" ? "gold" : "default"}>
                      {c.status}
                    </Badge>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-bone-mut">{c.earn}</p>
              <div className="mt-3 flex items-baseline gap-2 border-t border-steel-line pt-3">
                <span className="tnum font-display text-lg font-semibold text-gold">
                  {status === "loading" ? "-" : earned}
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                  {earned === 1 ? "citizen earned" : "citizens earned"}
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Revoke this crest?"
        description={`${selectedCrest?.name ?? "This crest"} is taken off ${
          handle.trim() ? `@${handle.trim().replace(/^@/, "")}` : "the member"
        }. It disappears from their Keep and from the honor roll, and only granting it again puts it back.`}
        confirmLabel="Revoke it"
        cancelLabel="Leave it earned"
        tone="danger"
        pending={busy}
        onConfirm={() => {
          setConfirmRevoke(false);
          void act("revoke");
        }}
      />
    </AdminStack>
  );
}
