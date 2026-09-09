import { Avatar } from "@/components/social/avatar";
import { Icon } from "@/components/ui/icon";
import { NOTIF_KIND_ICON, type NotifActor } from "@/lib/notification-view";

/* A raven's face: the actor's real portrait, with the kind's own glyph riding
   its corner. The notifications center and the in-app toast drew this
   identically by hand, avatar disc and badge both, which is the two-copy
   pattern lib/notification-view.ts already warns against for the text half.
   One component now, using the realm's own Avatar (House tint, gradient
   fallback letter) rather than a third hand rolled disc with none of that. */
export function NotifFace({
  kind,
  actor,
}: {
  kind: string;
  actor: NotifActor | null;
}) {
  return (
    <span className="relative shrink-0">
      <Avatar
        author={{
          handle: actor?.handle ?? null,
          display_name: actor?.display_name ?? null,
          avatar_url: actor?.avatar_url ?? null,
          house_slug: null,
        }}
        size={40}
      />
      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-steel-line bg-obsidian text-gold">
        <Icon name={NOTIF_KIND_ICON[kind] ?? "bell"} className="h-3 w-3" />
      </span>
    </span>
  );
}
