"use client";

import { useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";

interface FlagRow {
  key: string;
  enabled: boolean;
  note: string | null;
  consumed?: boolean;
}

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const [newKey, setNewKey] = useState("");
  const [newNote, setNewNote] = useState("");

  function load() {
    void realmFetch<{ flags: FlagRow[] }>("/api/admin/flags").then((res) => {
      if (res.status === 401 || res.status === 403) {
        setStatus("sealed");
      } else if (res.ok && res.data?.flags) {
        setFlags(res.data.flags);
        setStatus("ok");
      } else {
        setStatus("error");
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  function applyUpdated(updated: FlagRow) {
    setFlags((rows) => {
      const exists = rows.some((r) => r.key === updated.key);
      const next = exists
        ? rows.map((r) => (r.key === updated.key ? updated : r))
        : [...rows, updated];
      return next.sort((a, b) => a.key.localeCompare(b.key));
    });
  }

  async function save(key: string, patch: { enabled?: boolean; note?: string }) {
    setBusyKey(key);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; flag?: FlagRow }>(
      "/api/admin/flags",
      { method: "POST", json: { key, ...patch } }
    );
    if (res.ok && res.data?.ok && res.data.flag) applyUpdated(res.data.flag);
    else setNote("The lever would not move. Try again.");
    setBusyKey(null);
  }

  async function addFlag() {
    const key = newKey.trim();
    if (!/^[a-z0-9_]{2,48}$/.test(key)) {
      setNote("Keys are lowercase letters, numbers, and underscores (2-48 chars).");
      return;
    }
    setBusyKey(key);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; flag?: FlagRow; error?: string }>(
      "/api/admin/flags",
      { method: "POST", json: { key, enabled: false, note: newNote } }
    );
    if (res.ok && res.data?.ok && res.data.flag) {
      applyUpdated(res.data.flag);
      setNewKey("");
      setNewNote("");
    } else {
      setNote("The flag could not be registered. Try again.");
    }
    setBusyKey(null);
  }

  if (status === "sealed") {
    return (
      <div className="glass p-8 text-center">
        <Icon name="lock" className="mx-auto h-6 w-6 text-bone-faint" />
        <p className="gold-text font-display mt-3 text-xl font-semibold">
          The council chamber is sealed
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-steel-line bg-panel px-3 py-2 text-sm text-bone outline-none placeholder:text-bone-faint";

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-bone sm:text-2xl">
        Feature Flags
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        Levers of the realm
      </p>

      {note && <p className="mt-3 text-xs text-ember">{note}</p>}

      <div className="glass glass-sm mt-4 p-4 sm:p-5">
        <p className="font-display text-sm font-semibold text-bone">
          Register a new flag
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="flag_key"
            className={inputCls}
          />
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="What does this lever control?"
            className={inputCls}
          />
        </div>
        <button
          type="button"
          className="btn-gold mt-3 px-4 py-2 text-sm"
          onClick={() => void addFlag()}
        >
          Register flag
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {status === "loading" &&
          [0, 1, 2].map((i) => (
            <div key={i} className="glass glass-sm h-16 animate-pulse" />
          ))}
        {status === "error" && (
          <div className="glass glass-sm p-5">
            <p className="text-sm text-bone-mut">
              The lever room could not be reached. Try again shortly.
            </p>
          </div>
        )}
        {status === "ok" && flags.length === 0 && (
          <div className="glass glass-sm flex items-center gap-3 p-5">
            <Icon name="sliders" className="h-5 w-5 text-bone-faint" />
            <p className="text-sm text-bone-mut">
              No flags are registered. The realm runs on its defaults.
            </p>
          </div>
        )}
        {flags.map((f) => {
          const draft = noteDrafts[f.key];
          const editing = draft !== undefined;
          return (
            <div key={f.key} className="glass glass-sm p-4 sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-sm font-semibold text-bone">
                      {f.key}
                    </p>
                    {f.consumed === false && (
                      <span className="rounded-full border border-steel-line bg-panel px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-bone-faint">
                        Not yet wired
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-bone-mut">
                    {f.note?.trim() || "No note recorded for this flag."}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={f.enabled}
                  aria-label={`Toggle ${f.key}`}
                  disabled={busyKey === f.key}
                  onClick={() => void save(f.key, { enabled: !f.enabled })}
                  className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                    f.enabled ? "border-gold bg-gold" : "border-steel-line bg-panel"
                  } ${busyKey === f.key ? "opacity-60" : ""}`}
                >
                  <span
                    className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all ${
                      f.enabled ? "left-[22px] bg-obsidian" : "left-0.5 bg-bone-faint"
                    }`}
                  />
                </button>
              </div>

              {editing ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={draft}
                    onChange={(e) =>
                      setNoteDrafts((d) => ({ ...d, [f.key]: e.target.value }))
                    }
                    placeholder="Note"
                    className={`${inputCls} sm:max-w-md`}
                  />
                  <button
                    type="button"
                    className="btn-gold px-3 py-1.5 text-xs"
                    disabled={busyKey === f.key}
                    onClick={async () => {
                      await save(f.key, { note: draft });
                      setNoteDrafts((d) => {
                        const next = { ...d };
                        delete next[f.key];
                        return next;
                      });
                    }}
                  >
                    Save note
                  </button>
                  <button
                    type="button"
                    className="btn-glass px-3 py-1.5 text-xs"
                    onClick={() =>
                      setNoteDrafts((d) => {
                        const next = { ...d };
                        delete next[f.key];
                        return next;
                      })
                    }
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-glass mt-3 px-3 py-1 text-xs"
                  onClick={() =>
                    setNoteDrafts((d) => ({ ...d, [f.key]: f.note ?? "" }))
                  }
                >
                  Edit note
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
