"use client";

import { useState } from "react";
import { Composer } from "@/components/social/composer";
import { Avatar } from "@/components/social/avatar";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import type { Post } from "@/lib/social/types";

/* The inline composer.
 *
 * Posting used to require finding the floating button and then a navigation to
 * /compose. Every peer product puts the box in the feed, because the cost of a
 * post should be one tap from the thing that made you want to write.
 *
 * Collapsed it is a single quiet row, so it never competes with the ravens
 * beneath it. Focus expands it into the full composer in place, with no
 * navigation and no modal, so a member never loses their place in the feed. */

export function InlineComposer({
  onPosted,
}: {
  onPosted?: (post?: Post) => void;
}) {
  const { ready, authenticated, avatarUrl, displayName, xHandle } =
    useRealmAuth();
  const [open, setOpen] = useState(false);

  if (!ready || !authenticated) return null;

  const author = {
    handle: xHandle ?? null,
    display_name: displayName ?? null,
    avatar_url: avatarUrl ?? null,
    house_slug: null,
  };

  if (open) {
    return (
      <Card pad="none">
        <Composer
          onPosted={(post) => {
            setOpen(false);
            onPosted?.(post);
          }}
          onDone={() => setOpen(false)}
        />
      </Card>
    );
  }

  return (
    <Card
      pad="sm"
      interactive
      render={<button
          className="touch:min-h-11 touch:min-w-11" type="button" onClick={() => setOpen(true)} />}
      className="flex w-full items-center gap-3 text-left"
    >
      <Avatar author={author} size={34} />
      <span className="min-w-0 flex-1 truncate text-sm text-bone-faint">
        Send a raven, or seal a Call
      </span>
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gold/30 bg-gold/10 text-gold"
      >
        <Icon name="plus" className="h-4 w-4" />
      </span>
    </Card>
  );
}
