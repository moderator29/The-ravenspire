"use client";

import { use } from "react";
import { RoomLive } from "@/components/rooms/room-live";
import { RoomAudio } from "@/components/rooms/room-audio";

export default function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div>
      <div className="mx-auto w-full max-w-3xl px-3 pt-6 sm:px-4">
        <RoomAudio roomId={id} />
      </div>
      <RoomLive roomId={id} />
    </div>
  );
}
