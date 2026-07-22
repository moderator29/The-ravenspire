"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";

/* The court's real audio stage (Twitter Spaces style), powered by LiveKit. The
   host and promoted speakers publish their voice; everyone else listens live.
   Non-forgeable join: the token is minted and signed server-side. Honest
   degradation: if LiveKit is not configured the panel says the stage is warming
   up rather than pretending to connect. */

type Status = "idle" | "connecting" | "live" | "error" | "unavailable";

interface Speaker {
  identity: string;
  name: string;
  isLocal: boolean;
  canPublish: boolean;
}

export function RoomAudio({ roomId }: { roomId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [people, setPeople] = useState<Speaker[]>([]);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());

  const roomRef = useRef<Room | null>(null);
  const audioBinRef = useRef<HTMLDivElement | null>(null);

  const snapshot = useCallback((room: Room): Speaker[] => {
    const lp = room.localParticipant;
    const list: Speaker[] = [
      {
        identity: lp.identity,
        name: lp.name || "You",
        isLocal: true,
        canPublish: lp.permissions?.canPublish ?? false,
      },
    ];
    room.remoteParticipants.forEach((p) => {
      list.push({
        identity: p.identity,
        name: p.name || "A member",
        isLocal: false,
        canPublish: p.permissions?.canPublish ?? false,
      });
    });
    return list;
  }, []);

  const teardown = useCallback(() => {
    const room = roomRef.current;
    if (room) {
      room.disconnect();
      roomRef.current = null;
    }
    if (audioBinRef.current) audioBinRef.current.innerHTML = "";
    setStatus("idle");
    setMicOn(false);
    setPeople([]);
    setSpeaking(new Set());
  }, []);

  // Leave the stage cleanly when the view unmounts.
  useEffect(() => teardown, [teardown]);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    const res = await realmFetch<{
      configured?: boolean;
      token?: string;
      url?: string;
      canPublish?: boolean;
      error?: string;
    }>("/api/rooms/token", { method: "POST", json: { room_id: roomId } });

    if (!res.ok || !res.data?.token || !res.data.url) {
      if (res.data?.configured === false) {
        setStatus("unavailable");
        setError(res.data.error ?? null);
      } else {
        setStatus("error");
        setError(res.data?.error ?? "Could not join the audio stage.");
      }
      return;
    }

    const publish = res.data.canPublish === true;
    setCanPublish(publish);

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.style.display = "none";
          audioBinRef.current?.appendChild(el);
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove());
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setSpeaking(new Set(speakers.map((s) => s.identity)));
      })
      .on(RoomEvent.ParticipantConnected, () => setPeople(snapshot(room)))
      .on(RoomEvent.ParticipantDisconnected, () => setPeople(snapshot(room)))
      .on(RoomEvent.LocalTrackPublished, () => setPeople(snapshot(room)))
      .on(RoomEvent.Disconnected, () => teardown());

    try {
      await room.connect(res.data.url, res.data.token);
      if (publish) {
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicOn(true);
      }
      setPeople(snapshot(room));
      setStatus("live");
    } catch {
      setError("The audio stage would not connect. Check your mic permission.");
      setStatus("error");
      teardown();
    }
  }, [roomId, snapshot, teardown]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
    } catch {
      /* permission denied or device busy */
    }
  }, [micOn]);

  return (
    <div className="glass glass-warm p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="signal" className="h-4 w-4 text-gold" />
          <p className="text-sm font-semibold text-bone">Audio stage</p>
          {status === "live" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-panel-warm/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
              Live
            </span>
          )}
        </div>
        {status === "live" && (
          <button
            type="button"
            onClick={teardown}
            className="text-[11px] text-bone-faint hover:text-ember"
          >
            Leave
          </button>
        )}
      </div>

      {status === "idle" && (
        <button
          type="button"
          onClick={() => void connect()}
          className="btn-gold mt-3 w-full py-2.5 text-sm"
        >
          <Icon name="signal" className="h-4 w-4" />
          Enter the audio stage
        </button>
      )}

      {status === "connecting" && (
        <div className="mt-3 flex items-center gap-2 text-sm text-bone-faint">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
          Joining the stage...
        </div>
      )}

      {status === "unavailable" && (
        <p className="mt-3 text-xs text-bone-mut">
          {error ?? "The audio stage is warming up and will open soon."}
        </p>
      )}

      {status === "error" && (
        <div className="mt-3">
          <p className="text-xs text-ember">{error}</p>
          <button
            type="button"
            onClick={() => void connect()}
            className="mt-2 text-xs text-gold underline"
          >
            Try again
          </button>
        </div>
      )}

      {status === "live" && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {people.map((p) => {
              const isSpeaking = speaking.has(p.identity);
              return (
                <div
                  key={p.identity}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                    isSpeaking
                      ? "border-gold/60 bg-panel-warm text-gold-bright"
                      : "border-steel-line bg-panel/50 text-bone-mut"
                  }`}
                >
                  <Icon
                    name={p.canPublish ? "signal" : "user"}
                    className={`h-3 w-3 ${isSpeaking ? "text-gold" : "text-bone-faint"}`}
                  />
                  {p.isLocal ? "You" : p.name}
                </div>
              );
            })}
          </div>

          {canPublish ? (
            <button
              type="button"
              onClick={() => void toggleMic()}
              className={`mt-3 w-full py-2.5 text-sm ${micOn ? "btn-glass" : "btn-gold"}`}
            >
              <Icon name={micOn ? "signal" : "eye"} className="h-4 w-4" />
              {micOn ? "Mute your voice" : "Unmute your voice"}
            </button>
          ) : (
            <p className="mt-3 text-[11px] text-bone-faint">
              You are listening. The host can invite you up to speak.
            </p>
          )}
        </>
      )}

      <div ref={audioBinRef} aria-hidden className="hidden" />
    </div>
  );
}
