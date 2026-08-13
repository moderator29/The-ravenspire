/* The privacy gates, in one place.
 *
 * There were two copies of this function before mission 10, one in
 * lib/collectibles/hoard.ts for `hoardVisible` and one inside
 * /api/profile/earnings for `pnlVisible` and `publicPositions`. They agreed,
 * which is the dangerous kind of duplication: nothing would have told anybody
 * if a later edit made them disagree, and the two gates would then have
 * answered differently for the same member on two surfaces.
 *
 * Mission 10 made that a real risk rather than a tidiness complaint. An Open
 * Graph card is fetched by a crawler holding nothing but a URL, so it is the
 * one reader in the product that can never be the owner, and it reads the same
 * settings blob both of those gates read. A third copy of the rule, written by
 * whoever wrote the image route, is exactly how a hidden Hoard ends up in a
 * PNG anybody can fetch by guessing a handle.
 *
 * DEFAULT ON, deliberately, and every gate here shares it. A member is hidden
 * only when they have explicitly said so. The alternative, default off, would
 * make the Keep of every member who has never opened settings look abandoned,
 * and a product that hides a member's standing until they ask for it to be
 * shown is a product where nobody's standing is ever shown.
 *
 * A non-boolean value reads as the default, not as false. `settings` is a JSON
 * column, so it can hold anything at all: a string "false" written by a client
 * that stringified a checkbox must not silently become a privacy setting
 * nobody chose, in either direction. Only a real boolean decides.
 */

export type PrivacyKey = "hoardVisible" | "pnlVisible" | "publicPositions";

export function privacyFlag(settings: unknown, key: PrivacyKey): boolean {
  if (settings && typeof settings === "object") {
    const privacy = (settings as Record<string, unknown>).privacy;
    if (privacy && typeof privacy === "object") {
      const val = (privacy as Record<string, unknown>)[key];
      if (typeof val === "boolean") return val;
    }
  }
  return true;
}

/* Whether a member has chosen to show their collection on their Keep. */
export const hoardVisible = (settings: unknown): boolean =>
  privacyFlag(settings, "hoardVisible");

/* Whether a member's earnings totals may be read by anybody but themselves. */
export const pnlVisible = (settings: unknown): boolean =>
  privacyFlag(settings, "pnlVisible");

/* Whether the mix behind those totals may be read. Strictly narrower than
   pnlVisible: a member may show what they have earned while keeping where it
   came from to themselves. */
export const publicPositions = (settings: unknown): boolean =>
  privacyFlag(settings, "publicPositions");

/* The gates as one object, which is the shape a share card wants: an image has
   no viewer, so it can never take the "owner sees their own" branch and has to
   read all three at once. */
export type PrivacyGates = {
  hoard: boolean;
  pnl: boolean;
  positions: boolean;
};

export function privacyGates(settings: unknown): PrivacyGates {
  return {
    hoard: hoardVisible(settings),
    pnl: pnlVisible(settings),
    positions: publicPositions(settings),
  };
}
