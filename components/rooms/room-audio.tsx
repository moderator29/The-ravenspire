"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export function RoomAudio({ roomId }: { roomId: string }) {
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
    <Card variant="warm" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name="signal" className="h-4 w-4 shrink-0 text-gold" />
        <p className="text-sm font-semibold text-bone">Audio stage</p>
        {live ? (
          <Badge variant="gold" icon="signal">
            Live
          </Badge>
        ) : null}
        {live ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={teardown}
            className="ml-auto"
          >
            Leave
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
            <div className="flex flex-wrap gap-2">
              {people.map((p) => {
                const isSpeaking = speaking.has(p.identity);
                const muted = p.isLocal && p.canPublish && !micOn;
                return (
                  <span
                    key={p.identity}
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs",
                      "transition-colors duration-fast ease-out-quint",
                      isSpeaking
                        ? "border-gold/60 bg-panel-warm text-gold-bright"
                        : "border-steel-line bg-panel/50 text-bone-mut"
                    )}
                  >
                    <Icon
                      name={p.canPublish ? "signal" : "user"}
                      className={cx(
                        "h-3 w-3",
                        isSpeaking ? "text-gold" : "text-bone-faint"
                      )}
                    />
                    {p.isLocal ? "You" : p.name}
                    {muted ? (
                      <span className="text-[10px] uppercase tracking-[0.14em] text-bone-faint">
                        Muted
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>

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
              <p className="text-[11px] text-bone-faint">
                You are listening. If the host invites you up to speak, leave
                the stage and enter it again to take the floor.
              </p>
            )}

            {micError ? (
              <p className="text-xs text-state-danger">{micError}</p>
            ) : null}
          </>
        ) : null}
      </div>

      <div ref={audioBinRef} aria-hidden className="hidden" />
    </Card>
  );
}
