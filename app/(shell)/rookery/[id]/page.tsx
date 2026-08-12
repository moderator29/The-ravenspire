"use client";

import { use } from "react";
import { RoomLive } from "@/components/rooms/room-live";

/* A court. The Dossier order (hero band, then tabs, then panels) lives inside
   RoomLive, which is also where the audio stage is mounted, so the stage can
   never appear above the hero of a court that has not loaded yet. */
export default function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <RoomLive roomId={id} />;
}
