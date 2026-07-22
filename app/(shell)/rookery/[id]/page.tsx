"use client";

import { use } from "react";
import { RoomLive } from "@/components/rooms/room-live";

export default function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <RoomLive roomId={id} />;
}
