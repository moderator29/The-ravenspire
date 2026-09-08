"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
  type TrackPublication,
} from "livekit-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { cx } from "@/components/ui/cx";
import { realmFetch } from "@/lib/auth/api";
import { createClient } from "@/lib/supabase/client";

/* The court's real audio stage (Twitter Spaces style), powered by LiveKit. The
   host and promoted speakers publish their voice; everyone else listens live.
   Non-forgeable join: the token is minted and signed server-side. Honest
   degradation: if LiveKit is not configured the panel says so plainly rather
   than pretending to connect.

   Three things the first version got wrong, all of which cost real money or
   real trust:

   1. The mic was switched on inside the connect path, so a member who refused
      the browser permission prompt was thrown out of a room they could have
      listened to perfectly well, under an error that blamed the connection.
      Connecting and speaking are now separate acts. You join as a listener,
      and taking the floor is a deliberate second press, which is also the
      moment the permission prompt makes sense to a human.
   2. A permission refusal on the mic toggle was swallowed by an empty catch,
      so the control simply did nothing forever. Every failure now names itself
      and says what to do about it.
   3. Unmounting during the connect handshake left the room connected, because
      the room was only stored in the ref after the await resolved. LiveKit
      bills by the participant minute, so a member who navigated away mid-join
      kept burning minutes with no way to stop. The ref is now claimed before
      the handshake and a generation guard tears down anything that lands after
      the view is gone. */

type Status = "idle" | "connecting" | "live" | "error" | "unavailable";

interface Speaker {
  identity: string;
  name: string;
  isLocal: boolean;
  canPublish: boolean;
}

/* The real profile face for a seat on the stage. LiveKit's own `identity` is
   the member's profile id (see /api/rooms/token), so it lines up exactly with
   the roster's own `profile_id`: no invented avatar, the same photo the
   roster panel already shows. */
export interface StageFace {
  profile_id: string;
  avatar_url: string | null;
  display_name: string | null;
  handle: string | null;
}

/* The pulse is the one piece of ambient motion this surface earns (house rule
   21): it only ever runs while LiveKit says that identity is actually
   producing sound, so it is a live signal, not decoration. Opacity and
   transform only, per rule 14. */
const SPEAK_PULSE_KEYFRAMES = `
@keyframes rvsp-speak-pulse{
  0%{opacity:.5;transform:scale(.9)}
  70%{opacity:0;transform:scale(1.35)}
  100%{opacity:0;transform:scale(1.35)}
}
@media (prefers-reduced-motion: reduce){
  @keyframes rvsp-speak-pulse{
    0%{opacity:.35}
    100%{opacity:.35}
  }
}`;

/* getUserMedia failures are the one error class a member can actually fix, so
   each one gets the sentence that fixes it. */
function micMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Your browser is blocking the microphone. Allow it for this site in the address bar, then unmute again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Connect one, then unmute again.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Another app is holding the microphone. Close it, then unmute again.";
  }
  return "The microphone would not open. Check your device, then try again.";
}

export function RoomAudio({
  roomId,
  roster,
}: {
  roomId: string;
  /* The room's roster, already fetched by the caller: real faces for the
     avatar tiles below, never invented ones. Optional so the stage still
     renders (with plain initials) before the first roster load resolves. */
  roster?: StageFace[];
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [people, setPeople] = useState<Speaker[]>([]);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());

  const roomRef = useRef<Room | null>(null);
  const audioBinRef = useRef<HTMLDivElement | null>(null);
  /* Bumped by every teardown, so a connect that resolves after the member has
     left cannot adopt a room nobody is watching. */
  const generationRef = useRef(0);

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
    generationRef.current += 1;
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      void room.disconnect();
    }
    if (audioBinRef.current) audioBinRef.current.innerHTML = "";
    setStatus("idle");
    setCanPublish(false);
    setMicOn(false);
    setMicBusy(false);
    setMicError(null);
    setSoundBlocked(false);
    setPeople([]);
    setSpeaking(new Set());
  }, []);

  /* Leave the stage cleanly when the view unmounts, so nobody keeps a seat,
     and a bill, on a page they have navigated away from. */
  useEffect(() => teardown, [teardown]);

  const connect = useCallback(async () => {
    if (roomRef.current) return;
    const generation = generationRef.current;
    const stale = () => generationRef.current !== generation;

    setStatus("connecting");
    setError(null);
    setMicError(null);

    const res = await realmFetch<{
      configured?: boolean;
      token?: string;
      url?: string;
      canPublish?: boolean;
      error?: string;
    }>("/api/rooms/token", { method: "POST", json: { room_id: roomId } });

    if (stale()) return;

    if (!res.ok || !res.data?.token || !res.data.url) {
      if (res.data?.configured === false) {
        setStatus("unavailable");
        setError(res.data.error ?? null);
      } else if (res.status === 401) {
        /* The route answers "unauthenticated", which is a word for a log, not
           for a member standing outside a court. */
        setStatus("error");
        setError("Enter the realm to take a seat on the audio stage.");
      } else {
        setStatus("error");
        setError(res.data?.error ?? "Could not join the audio stage.");
      }
      return;
    }

    const publish = res.data.canPublish === true;
    setCanPublish(publish);

    const room = new Room({ adaptiveStream: true, dynacast: true });
    /* Claimed before the handshake, so an unmount mid-connect has something to
       disconnect. */
    roomRef.current = room;

    const syncMic = () => {
      setMicOn(room.localParticipant.isMicrophoneEnabled);
    };

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
      .on(RoomEvent.LocalTrackPublished, () => {
        setPeople(snapshot(room));
        syncMic();
      })
      .on(RoomEvent.LocalTrackUnpublished, () => {
        setPeople(snapshot(room));
        syncMic();
      })
      /* The device can be taken by the OS or another tab, so the button must
         read the track rather than remember what it last asked for. */
      .on(RoomEvent.TrackMuted, (_pub: TrackPublication, p: Participant) => {
        if (p.isLocal) syncMic();
      })
      .on(RoomEvent.TrackUnmuted, (_pub: TrackPublication, p: Participant) => {
        if (p.isLocal) syncMic();
      })
      /* Promotion to speaker, if the realm ever grants it while connected. */
      .on(RoomEvent.ParticipantPermissionsChanged, () => {
        setCanPublish(room.localParticipant.permissions?.canPublish ?? false);
        setPeople(snapshot(room));
      })
      /* Browsers block autoplay in more cases than a click can cover, and a
         silent stage that says it is live is the worst outcome here. */
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setSoundBlocked(!room.canPlaybackAudio);
      })
      .on(RoomEvent.Disconnected, () => teardown());

    try {
      await room.connect(res.data.url, res.data.token);
      if (stale()) {
        room.removeAllListeners();
        void room.disconnect();
        return;
      }
      setPeople(snapshot(room));
      setSoundBlocked(!room.canPlaybackAudio);
      syncMic();
      setStatus("live");
    } catch {
      if (stale()) return;
      /* Teardown resets the panel to idle, so it has to run before the error
         state is written or the message is wiped by its own cleanup. That
         ordering bug is why a failed join used to look like nothing happened. */
      teardown();
      setError(
        "The audio stage would not connect. Check your connection, then try again."
      );
      setStatus("error");
    }
  }, [roomId, snapshot, teardown]);

  const supabase = useMemo(() => createClient(), []);

  /* A promotion or demotion changes what /api/rooms/token would mint NEXT,
     never what this member's CURRENT token already grants: the token is a
     hand-signed JWT (see the comment at the top of token/route.ts), fixed the
     moment it was issued, so the only way to pick up new publish rights is a
     fresh one. This listens on the same rooms:court:{roomId} topic room-live
     already uses for chat, reactions and roster presence, for the exact
     "presence" broadcast the promote/demote actions fire, and reconnects only
     when the change is about THIS identity: LiveKit's own identity is the
     member's profile id, minted that way by /api/rooms/token, so it lines up
     with room_participants.profile_id with no lookup needed. */
  useEffect(() => {
    const channel = supabase
      .channel(`rooms:court:${roomId}`)
      .on("broadcast", { event: "presence" }, (payload) => {
        const data = payload.payload as
          | { promoted?: string; demoted?: string }
          | undefined;
        const room = roomRef.current;
        if (!room) return;
        const me = room.localParticipant.identity;
        if (data?.promoted !== me && data?.demoted !== me) return;
        teardown();
        void connect();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, roomId, teardown, connect]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room || micBusy) return;
    const next = !room.localParticipant.isMicrophoneEnabled;
    setMicBusy(true);
    setMicError(null);
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
    } catch (err) {
      setMicError(micMessage(err));
    } finally {
      if (roomRef.current) {
        setMicOn(roomRef.current.localParticipant.isMicrophoneEnabled);
      }
      setMicBusy(false);
    }
  }, [micBusy]);

  const startSound = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
      setSoundBlocked(!room.canPlaybackAudio);
    } catch {
      setSoundBlocked(true);
    }
  }, []);

  const live = status === "live";

  const faceMap = useMemo(() => {
    const map = new Map<string, StageFace>();
    for (const f of roster ?? []) map.set(f.profile_id, f);
    return map;
  }, [roster]);

  /* Spoken state, for the members who cannot see the panel change. Kept out of
     the visual tree so the polite region never wraps the controls themselves,
     which would re-announce the whole stage on every mic press. */
  const spokenStatus =
    status === "connecting"
      ? "Joining the audio stage."
      : status === "live"
        ? canPublish
          ? micOn
            ? "You are live on the audio stage with your microphone open."
            : "You are live on the audio stage with your microphone muted."
          : "You are listening to the audio stage."
        : status === "error" || status === "unavailable"
          ? (error ?? "The audio stage is not open.")
          : "You have not entered the audio stage.";

  return (
    <>
      <style>{SPEAK_PULSE_KEYFRAMES}</style>
      <Card variant="warm" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name="signal" className="h-4 w-4 shrink-0 text-gold" />
        <p className="text-sm font-semibold text-bone">Audio stage</p>
        {live ? (
          <Badge variant="gold" icon="signal">
            Live
          </Badge>
        ) : null}
        {/* Both states need a way out. A join that hangs on a slow handshake
            used to leave the member watching a spinner with nothing to press,
            and abandoning the page was the only escape. */}
        {live || status === "connecting" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={teardown}
            className="ml-auto min-h-11 md:min-h-0"
          >
            {live ? "Leave" : "Cancel"}
          </Button>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {spokenStatus}
      </p>

      <div className="flex flex-col gap-3">
        {status === "idle" ? (
          <Button
            variant="gold"
            size="lg"
            block
            onClick={() => void connect()}
          >
            <Icon name="signal" className="h-4 w-4" />
            Enter the audio stage
          </Button>
        ) : null}

        {status === "connecting" ? (
          <Button variant="gold" size="lg" block loading>
            Joining the stage
          </Button>
        ) : null}

        {status === "unavailable" ? (
          <EmptyState
            size="sm"
            icon="info"
            title="The stage is not open yet"
            body={
              error ??
              "Live voice is not connected for this realm yet. The court still speaks in the chronicle below."
            }
            action={
              <Button size="sm" onClick={() => void connect()}>
                Check again
              </Button>
            }
          />
        ) : null}

        {status === "error" ? (
          <EmptyState
            size="sm"
            icon="alert"
            title="The stage would not open"
            body={error}
            action={
              <Button variant="gold" size="sm" onClick={() => void connect()}>
                Try again
              </Button>
            }
          />
        ) : null}

        {live ? (
          <>
            <ul aria-label="On the stage" className="flex flex-wrap gap-3">
              {people.map((p) => {
                const isSpeaking = speaking.has(p.identity);
                const muted = p.isLocal && p.canPublish && !micOn;
                const face = faceMap.get(p.identity);
                const label = p.isLocal ? "You" : (face?.display_name ?? face?.handle ?? p.name);
                const letter = (face?.display_name ?? face?.handle ?? p.name)
                  .slice(0, 1)
                  .toUpperCase();
                return (
                  <li
                    key={p.identity}
                    className="flex w-14 flex-col items-center gap-1.5"
                  >
                    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                      {/* Ambient only while genuinely live: a real signal from
                          LiveKit's ActiveSpeakersChanged, never a decorative
                          loop. Opacity and transform only, per rule 14. */}
                      {isSpeaking ? (
                        <span
                          aria-hidden
                          className="absolute inset-[-3px] rounded-[var(--radius-full)] bg-gold/30"
                          style={{
                            animation: "rvsp-speak-pulse 1.1s ease-in-out infinite",
                          }}
                        />
                      ) : null}
                      <span
                        className={cx(
                          "relative flex h-11 w-11 items-center justify-center overflow-hidden",
                          "rounded-[var(--radius-full)] border bg-panel font-display text-sm text-gold",
                          "transition-[border-color,transform] duration-fast ease-out-quint",
                          isSpeaking
                            ? "scale-[1.04] border-gold"
                            : "border-steel-line"
                        )}
                      >
                        {face?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={face.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          letter
                        )}
                      </span>
                      {p.canPublish ? (
                        <span
                          aria-hidden
                          className={cx(
                            "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center",
                            "rounded-[var(--radius-full)] border border-void bg-panel-warm"
                          )}
                        >
                          <Icon
                            name={muted ? "close" : "signal"}
                            className={cx(
                              "h-2.5 w-2.5",
                              muted ? "text-bone-faint" : "text-gold"
                            )}
                          />
                        </span>
                      ) : null}
                    </span>
                    <span className="max-w-full truncate text-[10px] text-bone-mut">
                      {label}
                    </span>
                    <span className="sr-only">
                      {isSpeaking ? "Speaking now. " : ""}
                      {muted ? "Microphone muted." : ""}
                    </span>
                  </li>
                );
              })}
            </ul>

            {soundBlocked ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-bone-mut">
                  Your browser is holding the sound back until you ask for it.
                </p>
                <Button
                  variant="gold"
                  size="lg"
                  block
                  onClick={() => void startSound()}
                >
                  <Icon name="signal" className="h-4 w-4" />
                  Turn on the sound
                </Button>
              </div>
            ) : null}

            {canPublish ? (
              <Button
                variant={micOn ? "glass" : "gold"}
                size="lg"
                block
                loading={micBusy}
                onClick={() => void toggleMic()}
              >
                {micBusy ? null : (
                  <Icon
                    name={micOn ? "close" : "signal"}
                    className="h-4 w-4"
                  />
                )}
                {micOn ? "Mute your voice" : "Unmute your voice"}
              </Button>
            ) : (
              /* Honest about what this seat can do. Publish rights are read
                 from the member's seat when the token is minted, so a raised
                 seat needs a fresh token, not a wish: the effect above
                 reconnects the instant the host's own promotion arrives. */
              <p className="text-xs text-bone-mut">
                You are listening. The floor belongs to the host and to seats
                raised to speaker. Ask the host from the roster to be raised.
              </p>
            )}

            {micError ? (
              <p role="alert" className="text-xs text-state-danger">
                {micError}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      <div ref={audioBinRef} aria-hidden className="hidden" />
      </Card>
    </>
  );
}
