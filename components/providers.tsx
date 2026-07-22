"use client";

import { PrivyProvider, usePrivy, useLogin } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  RealmAuthContext,
  stubAuth,
  type RealmAuth,
} from "@/lib/auth/realm-auth-context";
import { PostAuthGate } from "@/components/auth/post-auth-gate";
import { IdentitySync } from "@/components/auth/identity-sync";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

function AuthBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, logout } = usePrivy();
  const { login } = useLogin();

  const value = useMemo<RealmAuth>(() => {
    return {
      ready,
      enabled: true,
      authenticated,
      address: user?.wallet?.address,
      displayName:
        user?.twitter?.name ??
        user?.twitter?.username ??
        user?.email?.address?.split("@")[0],
      avatarUrl: user?.twitter?.profilePictureUrl
        ? user.twitter.profilePictureUrl.replace("_normal", "_400x400")
        : undefined,
      xHandle: user?.twitter?.username ?? undefined,
      email: user?.email?.address,
      signInX: () => login({ loginMethods: ["twitter"] }),
      signInEmail: () => login({ loginMethods: ["email"] }),
      connectWallet: () => login({ loginMethods: ["wallet"] }),
      signOut: () => void logout(),
    };
  }, [ready, authenticated, user, login, logout]);

  return (
    <RealmAuthContext.Provider value={value}>
      <PostAuthGate />
      <IdentitySync />
      {children}
    </RealmAuthContext.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    return (
      <RealmAuthContext.Provider value={stubAuth}>
        {children}
      </RealmAuthContext.Provider>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "#0C0C11",
          accentColor: "#C8A24C",
          landingHeader: "Enter the Realm",
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        loginMethods: ["twitter", "email", "wallet"],
      }}
    >
      <AuthBridge>{children}</AuthBridge>
    </PrivyProvider>
  );
}
