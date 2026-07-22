"use client";

import { useMemo, useState } from "react";
import {
  usePrivy,
  useSetWalletRecovery,
  useMfaEnrollment,
} from "@privy-io/react-auth";
import { Card, Row, StatusPill } from "@/components/settings/ui";
import { Icon } from "@/components/ui/icon";

/* Real account security for a non-custodial Privy app. There is no traditional
   password here; instead we surface Privy's genuine security primitives:
     - a recovery password on the embedded wallet (useSetWalletRecovery)
     - multi-factor auth enrollment (useMfaEnrollment)
     - linking / unlinking the login methods (email, X, external wallet)
   MUST render only when Privy is mounted, so these hooks have their provider. */

function short(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const MFA_LABELS: Record<string, string> = {
  totp: "Authenticator app",
  sms: "Text message",
  passkey: "Passkey",
};

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
            <button
              type="button"
              disabled={busy === "recovery"}
              onClick={() =>
                void run("recovery", () => setWalletRecovery())
              }
              className="btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              <Icon name="lock" className="h-3.5 w-3.5" />
              {recoverySet ? "Change" : "Set password"}
            </button>
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
            <button
              type="button"
              disabled={busy === "mfa"}
              onClick={() =>
                void run("mfa", () => {
                  showMfaEnrollmentModal();
                })
              }
              className="btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              <Icon name="shield" className="h-3.5 w-3.5" />
              Manage
            </button>
          </div>
        </Row>

        <p className="mt-3 text-xs text-bone-faint">
          These protections live with Privy, your non-custodial keeper. The Ravenspire
          never sees your password, recovery phrase, or second factor, and cannot
          move your funds.
        </p>
      </Card>

      {/* Linked login methods */}
      <Card icon="user" title="Linked accounts" plain="How you enter">
        {/* Email */}
        <Row
          title="Email"
          desc={email ?? "No email linked to this account"}
        >
          {email ? (
            <button
              type="button"
              disabled={!canUnlink || busy === "email"}
              onClick={() => void run("email", () => unlinkEmail(email))}
              title={canUnlink ? undefined : "Keep at least one way to sign in"}
              className="btn-glass px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Unlink
            </button>
          ) : (
            <button
              type="button"
              disabled={busy === "email"}
              onClick={() => void run("email", () => linkEmail())}
              className="btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              <Icon name="mail" className="h-3.5 w-3.5" />
              Link
            </button>
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
            <button
              type="button"
              disabled={!canUnlink || busy === "twitter"}
              onClick={() =>
                void run("twitter", () => unlinkTwitter(twitter.subject))
              }
              title={canUnlink ? undefined : "Keep at least one way to sign in"}
              className="btn-glass px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Unlink
            </button>
          ) : (
            <button
              type="button"
              disabled={busy === "twitter"}
              onClick={() => void run("twitter", () => linkTwitter())}
              className="btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              <Icon name="xlogo" className="h-3.5 w-3.5" />
              Link
            </button>
          )}
        </Row>

        {/* External wallets (login), one row each, plus a link action */}
        {externalWallets.map((w) => (
          <Row
            key={w.address}
            title="Wallet"
            desc={short(w.address)}
          >
            <button
              type="button"
              disabled={!canUnlink || busy === `wallet-${w.address}`}
              onClick={() =>
                void run(`wallet-${w.address}`, () => unlinkWallet(w.address))
              }
              title={canUnlink ? undefined : "Keep at least one way to sign in"}
              className="btn-glass px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Unlink
            </button>
          </Row>
        ))}
        <Row
          title="Add a wallet"
          desc="Sign in with an external wallet as well"
        >
          <button
            type="button"
            disabled={busy === "link-wallet"}
            onClick={() => void run("link-wallet", () => linkWallet())}
            className="btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <Icon name="wallet" className="h-3.5 w-3.5" />
            Link wallet
          </button>
        </Row>

        {!ready ? (
          <p className="mt-3 text-xs text-bone-faint">
            Reading your linked accounts from the Gatehouse...
          </p>
        ) : note ? (
          <p
            className={`mt-3 text-xs ${
              note.tone === "warn" ? "text-ember" : "text-bone-faint"
            }`}
          >
            {note.text}
          </p>
        ) : (
          <p className="mt-3 text-xs text-bone-faint">
            Link more than one method so you can always get back in. You must keep
            at least one.
          </p>
        )}
      </Card>
    </div>
  );
}
