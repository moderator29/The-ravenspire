"use client";

import { createContext, useContext } from "react";

export interface RealmAuth {
  ready: boolean;
  enabled: boolean;
  authenticated: boolean;
  address?: string;
  displayName?: string;
  avatarUrl?: string;
  xHandle?: string;
  email?: string;
  signInX: () => void;
  signInEmail: () => void;
  connectWallet: () => void;
  signOut: () => void;
}

const noop = () => {};

export const stubAuth: RealmAuth = {
  ready: true,
  enabled: false,
  authenticated: false,
  signInX: noop,
  signInEmail: noop,
  connectWallet: noop,
  signOut: noop,
};

export const RealmAuthContext = createContext<RealmAuth>(stubAuth);

export function useRealmAuthContext() {
  return useContext(RealmAuthContext);
}
