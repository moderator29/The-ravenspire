"use client";

import { useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { Icon } from "@/components/ui/icon";

interface SeasonRow {
  id: number;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  vault_raven: number;
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export default function AdminSeasonsPage() {
  const [rows, setRows] = useState<SeasonRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "sealed" | "error">(
    "loading"
  );
  const [busyId, setBusyId] = useState<number | "new" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newVault, setNewVault] = useState("");

  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editVault, setEditVault] = useState("");

  function load() {
    void realmFetch<{ seasons: SeasonRow[] }>("/api/admin/seasons").then(
      (res) => {
        if (res.status === 401 || res.status === 403) {
          setStatus("sealed");
        } else if (res.ok && res.data?.seasons) {
          setRows(res.data.seasons);
          setStatus("ok");
        } else {
          setStatus("error");
        }
      }
    );
  }

  useEffect(() => {
    load();
  }, []);

  function applyUpdated(updated: SeasonRow) {
    setRows((prev) => {
      const exists = prev.some((s) => s.id === updated.id);
      const next = exists
        ? prev.map((s) => (s.id === updated.id ? updated : s))
        : [...prev, updated];
      return next.sort((a, b) => a.id - b.id);
    });
  }

  async function create() {
    if (!newName.trim()) {
      setNote("A season needs a name.");
      return;
    }
    setBusyId("new");
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; season?: SeasonRow }>(
      "/api/admin/seasons",
      {
        method: "POST",
        json: {
          action: "create",
          name: newName,
          starts_at: newStart,
          ends_at: newEnd,
          vault_raven: newVault,
        },
      }
    );
    if (res.ok && res.data?.ok && res.data.season) {
      applyUpdated(res.data.season);
      setNewName("");
      setNewStart("");
      setNewEnd("");
      setNewVault("");
    } else {
      setNote("The season could not be written. Try again.");
    }
    setBusyId(null);
  }

  function openEditor(s: SeasonRow) {
    if (openId === s.id) {
      setOpenId(null);
      return;
    }
    setOpenId(s.id);
    setEditName(s.name);
    setEditStart(toDateInput(s.starts_at));
    setEditEnd(toDateInput(s.ends_at));
    setEditVault(String(s.vault_raven));
    setNote(null);
  }

  async function saveEdit(s: SeasonRow) {
    setBusyId(s.id);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; season?: SeasonRow }>(
      "/api/admin/seasons",
      {
        method: "POST",
        json: {
          action: "edit",
          id: s.id,
          name: editName,
          starts_at: editStart,
          ends_at: editEnd,
          vault_raven: editVault,
        },
      }
    );
    if (res.ok && res.data?.ok && res.data.season) applyUpdated(res.data.season);
    else setNote("The edit did not take. Try again.");
    setBusyId(null);
  }

  async function setSeasonStatus(id: number, action: "activate" | "close") {
    setBusyId(id);
    setNote(null);
    const res = await realmFetch<{ ok?: boolean; season?: SeasonRow }>(
      "/api/admin/seasons",
      { method: "POST", json: { action, id } }
    );
    if (res.ok && res.data?.ok && res.data.season) applyUpdated(res.data.season);
    else setNote("The decree did not take. Try again.");
    setBusyId(null);
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
        Seasons
      </h1>
      <p className="mt-1 text-xs uppercase tracking-[0.26em] text-bone-faint">
        The realm calendar
      </p>

      {note && <p className="mt-3 text-xs text-ember">{note}</p>}

      <div className="glass glass-sm mt-4 p-4 sm:p-5">
        <p className="font-display text-sm font-semibold text-bone">
          Open a new season
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Season name"
            className={inputCls}
          />
          <input
            value={newVault}
            onChange={(e) => setNewVault(e.target.value)}
            inputMode="numeric"
            placeholder="Vault (RAVEN)"
            className={inputCls}
          />
          <label className="text-xs text-bone-faint">
            Opens
            <input
              type="date"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="text-xs text-bone-faint">
            Closes
            <input
              type="date"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className={`${inputCls} mt-1`}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-gold mt-3 px-4 py-2 text-sm"
          disabled={busyId === "new"}
          onClick={() => void create()}
        >
          {busyId === "new" ? "Writing" : "Create season"}
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {status === "loading" &&
          [0, 1].map((i) => (
            <div key={i} className="glass glass-sm h-28 animate-pulse" />
          ))}
        {status === "error" && (
          <div className="glass glass-sm p-5">
            <p className="text-sm text-bone-mut">
              The calendar could not be read. Try again shortly.
            </p>
          </div>
        )}
        {status === "ok" && rows.length === 0 && (
          <div className="glass glass-sm flex items-center gap-3 p-5">
            <Icon name="crown" className="h-5 w-5 text-bone-faint" />
            <p className="text-sm text-bone-mut">
              No seasons are written in the calendar yet.
            </p>
          </div>
        )}
        {rows.map((s) => {
          const isActive = s.status === "active";
          const open = openId === s.id;
          return (
            <div key={s.id} className="glass glass-sm p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-base font-semibold text-bone">
                  {s.name}
                </p>
                <span
                  className={`rounded-full border border-steel-line bg-panel px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] ${
                    isActive ? "text-gold" : "text-bone-faint"
                  }`}
                >
                  {s.status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <p className="tnum text-sm text-bone">
                    {s.starts_at ? new Date(s.starts_at).toLocaleDateString() : "unset"}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                    Opens
                  </p>
                </div>
                <div>
                  <p className="tnum text-sm text-bone">
                    {s.ends_at ? new Date(s.ends_at).toLocaleDateString() : "unset"}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                    Closes
                  </p>
                </div>
                <div>
                  <p className="tnum text-sm text-gold">
                    {s.vault_raven.toLocaleString()}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-bone-faint">
                    Vault (RAVEN)
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === s.id || isActive}
                  onClick={() => void setSeasonStatus(s.id, "activate")}
                  className="btn-gold px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Activate
                </button>
                <button
                  type="button"
                  disabled={busyId === s.id || s.status === "closed"}
                  onClick={() => void setSeasonStatus(s.id, "close")}
                  className="btn-glass px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn-glass px-3 py-1.5 text-xs"
                  onClick={() => openEditor(s)}
                >
                  {open ? "Close editor" : "Edit"}
                </button>
              </div>

              {open && (
                <div className="mt-4 grid grid-cols-1 gap-3 border-t border-steel-line pt-4 sm:grid-cols-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Season name"
                    className={inputCls}
                  />
                  <input
                    value={editVault}
                    onChange={(e) => setEditVault(e.target.value)}
                    inputMode="numeric"
                    placeholder="Vault (RAVEN)"
                    className={inputCls}
                  />
                  <label className="text-xs text-bone-faint">
                    Opens
                    <input
                      type="date"
                      value={editStart}
                      onChange={(e) => setEditStart(e.target.value)}
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                  <label className="text-xs text-bone-faint">
                    Closes
                    <input
                      type="date"
                      value={editEnd}
                      onChange={(e) => setEditEnd(e.target.value)}
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      className="btn-gold px-3 py-1.5 text-xs"
                      disabled={busyId === s.id}
                      onClick={() => void saveEdit(s)}
                    >
                      Save changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
