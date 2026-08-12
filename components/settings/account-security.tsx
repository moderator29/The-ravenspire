"use client";

import { useMemo, useState } from "react";
import {
  usePrivy,
  useSetWalletRecovery,
  useMfaEnrollment,
} from "@privy-io/react-auth";
import { Card, Row, StatusPill } from "@/components/settings/ui";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ConfirmDialog } from "@/components/ui/modal";

/* Real account security for a non-custodial Privy app. There is no traditional
   password here; instead we surface Privy's genuine security primitives:
     - a recovery password on the embedded wallet (useSetWalletRecovery)
     - multi-factor auth enrollment (useMfaEnrollment)
     - linking / unlinking the login methods (email, X, external wallet)
   MUST render only when Privy is mounted, so these hooks have their provider.

   Archetype: Console. This is dense data plus controls, read and operated at
   the same time, so every control is compact above `md` and never smaller than
   a 44px touch target below it. */

/* Section 11 of the design system: touch targets stay at 44px below `md`
   whatever density the archetype declares. Applied as a minimum so it never
   fights the height the Button size already sets above `md`. */
const TOUCH = "min-h-11 md:min-h-0";

function short(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const MFA_LABELS: Record<string, string> = {
  totp: "Authenticator app",
  sms: "Text message",
  passkey: "Passkey",
};

/* Unlinking removes a way into the account, and no click can put it back
   without going through the provider again, so each one asks first. */
interface PendingUnlink {
  id: string;
  what: string;
  detail: string;
  run: () => Promise<unknown> | void;
}

export function AccountSecurity() {
  const {
    user,
    ready,
    linkEmail,
    linkWallet,
    linkTwitter,
    unlinkEmail,
    unlinkTwitter,
    unlinkWallet,
  } = usePrivy();
  const { setWalletRecovery } = useSetWalletRecovery();
  const { showMfaEnrollmentModal } = useMfaEnrollment();

  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{
    tone: "ok" | "warn";
    text: string;
  } | null>(null);
  const [pending, setPending] = useState<PendingUnlink | null>(null);

  const email = user?.email?.address ?? null;
  const twitter = user?.twitter ?? null;

  /* Only genuinely external wallets are unlinkable login methods; the Privy
     embedded wallet is your account's own wallet, not a login to detach. */
  const externalWallets = useMemo(() => {
    const accounts = user?.linkedAccounts ?? [];
    return accounts.filter(
      (a) =>
        a.type === "wallet" &&
        a.walletClientType !== "privy" &&
        a.walletClientType !== "privy-v2"
    ) as Array<{ type: "wallet"; address: string }>;
  }, [user?.linkedAccounts]);

  const mfaMethods = user?.mfaMethods ?? [];
  const mfaOn = mfaMethods.length > 0;

  const recoverySet = user?.wallet?.recoveryMethod === "user-passcode";

  /* Number of distinct login methods; Privy blocks removing the last one, so we
     disable unlink at the floor and explain why instead of throwing. */
  const loginMethodCount =
    (email ? 1 : 0) + (twitter ? 1 : 0) + externalWallets.length;
  const canUnlink = loginMethodCount > 1;

  const run = async (id: string, fn: () => Promise<unknown> | void) => {
    setBusy(id);
    setNote(null);
    try {
      await fn();
    } catch {
      setNote({
        tone: "warn",
        text: "That could not be completed just now. Please try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  const keepOne = canUnlink ? undefined : "Keep at least one way to sign in";

  return (
    <div className="flex flex-col gap-3">
      {/* Recovery password + MFA */}
      <Card icon="shield" title="Account & Security" plain="Guard your keep">
        <Row
          title="Recovery password"
          desc={
            recoverySet
              ? "A password protects your embedded wallet. Change it any time."
              : "Set a password so you can recover your embedded wallet on a new device."
          }
        >
          <div className="flex items-center gap-2">
            <StatusPill tone={recoverySet ? "on" : "off"}>
              {recoverySet ? "Set" : "Not set"}
            </StatusPill>
            <Button
              variant="glass"
              size="sm"
              className={TOUCH}
              loading={busy === "recovery"}
              onClick={() => void run("recovery", () => setWalletRecovery())}
            >
              <Icon name="lock" className="h-3.5 w-3.5" />
              {recoverySet ? "Change" : "Set password"}
            </Button>
          </div>
        </Row>

        <Row
          title="Two-factor authentication"
          desc={
            mfaOn
              ? `Active: ${mfaMethods.map((m) => MFA_LABELS[m] ?? m).join(", ")}`
              : "Add a second step (authenticator, passkey, or text) to sensitive actions."
          }
        >
          <div className="flex items-center gap-2">
            <StatusPill tone={mfaOn ? "on" : "off"}>
              {mfaOn ? "On" : "Off"}
            </StatusPill>
            <Button
              variant="glass"
              size="sm"
              className={TOUCH}
              loading={busy === "mfa"}
              onClick={() =>
                void run("mfa", () => {
                  showMfaEnrollmentModal();
                })
              }
            >
              <Icon name="shield" className="h-3.5 w-3.5" />
              Manage
            </Button>
          </div>
        </Row>

        <p className="mt-3 text-xs text-bone-faint">
          These protections live with Privy, your non-custodial keeper. The
          Ravenspire never sees your password, recovery phrase, or second factor,
          and cannot move your funds.
        </p>
      </Card>

      {/* Linked login methods */}
      <Card icon="user" title="Linked accounts" plain="How you enter">
        {/* Email */}
        <Row title="Email" desc={email ?? "No email linked to this account"}>
          {email ? (
            <Button
              variant="glass"
              size="sm"
              className={TOUCH}
              disabled={!canUnlink || busy === "email"}
              title={keepOne}
              onClick={() =>
                setPending({
                  id: "email",
                  what: "email",
                  detail: email,
                  run: () => unlinkEmail(email),
                })
              }
            >
              Unlink
            </Button>
          ) : (
            <Button
              variant="glass"
              size="sm"
              className={TOUCH}
              loading={busy === "email"}
              onClick={() => void run("email", () => linkEmail())}
            >
              <Icon name="mail" className="h-3.5 w-3.5" />
              Link
            </Button>
          )}
        </Row>

        {/* X / Twitter */}
        <Row
          title="X / Twitter"
          desc={
            twitter
              ? twitter.username
                ? `@${twitter.username}`
                : "Connected"
              : "No X account linked"
          }
        >
          {twitter ? (
            <Button
              variant="glass"
              size="sm"
              className={TOUCH}
              disabled={!canUnlink || busy === "twitter"}
              title={keepOne}
              onClick={() =>
                setPending({
                  id: "twitter",
                  what: "X account",
                  detail: twitter.username ? `@${twitter.username}` : "Connected",
                  run: () => unlinkTwitter(twitter.subject),
                })
              }
            >
              Unlink
            </Button>
          ) : (
            <Button
              variant="glass"
              size="sm"
              className={TOUCH}
              loading={busy === "twitter"}
              onClick={() => void run("twitter", () => linkTwitter())}
            >
              <Icon name="xlogo" className="h-3.5 w-3.5" />
              Link
            </Button>
          )}
        </Row>

        {/* External wallets (login), one row each, plus a link action */}
        {externalWallets.map((w) => (
          <Row key={w.address} title="Wallet" desc={short(w.address)}>
            <Button
              variant="glass"
              size="sm"
              className={TOUCH}
              disabled={!canUnlink || busy === `wallet-${w.address}`}
              title={keepOne}
              onClick={() =>
                setPending({
                  id: `wallet-${w.address}`,
                  what: "wallet",
                  detail: short(w.address),
                  run: () => unlinkWallet(w.address),
                })
              }
            >
              Unlink
            </Button>
          </Row>
        ))}
        <Row title="Add a wallet" desc="Sign in with an external wallet as well">
          <Button
            variant="glass"
            size="sm"
            className={TOUCH}
            loading={busy === "link-wallet"}
            onClick={() => void run("link-wallet", () => linkWallet())}
          >
            <Icon name="wallet" className="h-3.5 w-3.5" />
            Link wallet
          </Button>
        </Row>

        {!ready ? (
          <p className="mt-3 text-xs text-bone-faint">
            Reading your linked accounts from the Gatehouse...
          </p>
        ) : note ? (
          <p
            role="status"
            className={`mt-3 text-xs ${
              note.tone === "warn" ? "text-state-danger" : "text-bone-faint"
            }`}
          >
            {note.text}
          </p>
        ) : (
          <p className="mt-3 text-xs text-bone-faint">
            Link more than one method so you can always get back in. You must
            keep at least one.
          </p>
        )}
      </Card>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title={pending ? `Unlink this ${pending.what}?` : ""}
        description={
          pending
            ? `${pending.detail} stops being a way into your account. You can link it again later, but you will need the provider to let you back in first.`
            : undefined
        }
        confirmLabel="Unlink it"
        cancelLabel="Keep it linked"
        tone="danger"
        pending={pending !== null && busy === pending.id}
        onConfirm={() => {
          const p = pending;
          if (!p) return;
          setPending(null);
          void run(p.id, p.run);
        }}
      />
    </div>
  );
}
