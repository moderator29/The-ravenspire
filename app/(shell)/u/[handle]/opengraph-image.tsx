import { ImageResponse } from "next/og";
import { adminClient } from "@/lib/supabase/admin";

/* A dynamic share card for a member's Keep (profile): their name, standing and
   house in the realm's livery. Real data only; falls back to the house card
   when the Keep cannot be read. */

export const alt = "A Keep on The Ravenspire";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface ProfileRow {
  display_name: string | null;
  handle: string | null;
  tier: string | null;
  renown: number | null;
  glory: number | null;
  house_slug: string | null;
}

export default async function Image({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  let profile: ProfileRow | null = null;
  try {
    const db = adminClient();
    if (db) {
      const { data } = await db
        .from("profiles")
        .select("display_name, handle, tier, renown, glory, house_slug")
        .eq("handle", handle.toLowerCase())
        .maybeSingle();
      profile = (data as ProfileRow) ?? null;
    }
  } catch {
    profile = null;
  }

  const name = profile?.display_name ?? (profile?.handle ? `@${profile.handle}` : "A member");
  const at = profile?.handle ? `@${profile.handle}` : "";
  const tier = profile?.tier ?? null;
  const house = profile?.house_slug ?? null;
  const renown = profile?.renown ?? 0;
  const glory = profile?.glory ?? 0;
  const serif = "ui-serif, Georgia, 'Times New Roman', Times, serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#07070A",
          backgroundImage:
            "radial-gradient(circle at 80% 10%, rgba(200,162,76,0.18), rgba(7,7,10,0) 55%)",
          padding: 72,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            color: "#C8A24C",
            fontSize: 26,
            letterSpacing: 8,
            fontFamily: serif,
            fontWeight: 700,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 14,
              border: "4px solid #C8A24C",
              marginRight: 20,
              fontSize: 36,
            }}
          >
            R
          </div>
          THE RAVENSPIRE
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#F5F2E9", fontSize: 78, fontWeight: 700, fontFamily: serif }}>
            {name}
          </div>
          {at && (
            <div style={{ display: "flex", marginTop: 12, color: "#8C877B", fontSize: 34 }}>
              {at}
              {tier ? `  ·  ${tier}` : ""}
              {house ? `  ·  House ${house}` : ""}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 60 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#C8A24C", fontSize: 56, fontWeight: 700 }}>
              {renown.toLocaleString("en-US")}
            </span>
            <span style={{ color: "#8C877B", fontSize: 26, letterSpacing: 4 }}>RENOWN</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#C8A24C", fontSize: 56, fontWeight: 700 }}>
              {glory.toLocaleString("en-US")}
            </span>
            <span style={{ color: "#8C877B", fontSize: 26, letterSpacing: 4 }}>GLORY</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
