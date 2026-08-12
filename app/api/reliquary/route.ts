import { json } from "@/lib/auth/server";
import { getFlag } from "@/lib/flags";
import { SET_ONE } from "@/lib/collectibles/set-one";

/* GET /api/reliquary (V2 Part Two, section 28.2).
 *
 * The Set One catalog for the landing page, the mobile clients and launch
 * day. The catalog is code, not database: lib/collectibles/set-one.ts derives
 * the forty cards from lib/game/champions.ts at build time and is the single
 * source of truth until the set is final, so this route reads the module and
 * never invents a row. The database carries only the launch flag.
 *
 * `live` is the reliquary_live realm flag. While it is false the payload is
 * the same catalog, honestly flagged sealed: previewing the real set is the
 * marketing (section 27.4), so sealing does not mean hiding. What never
 * appears while sealed or live: owners, prices, supplies, sale counts,
 * because none of those exist yet.
 *
 * No inventory block until inventory exists. The `inventory` table is
 * deliberately unbuilt (see the collectibles_foundation migration header);
 * when the chest opening flow creates it, the member's own holdings join this
 * payload for authenticated callers. Shipping an empty inventory shape now
 * would be a number pretending to be live.
 */

/* Flag-dependent: never baked at build time, or a flag flip would not open
   the gate until the next deploy. */
export const dynamic = "force-dynamic";

export async function GET() {
  const live = await getFlag("reliquary_live");
  return json({
    live,
    set: {
      slug: SET_ONE.slug,
      name: SET_ONE.name,
      status: SET_ONE.status,
      counts: SET_ONE.counts,
      cards: SET_ONE.cards.map(({ number, champion }) => ({
        number,
        slug: champion.slug,
        name: champion.name,
        title: champion.title,
        house: champion.house,
        rarity: champion.rarity,
        /* Presence only, not the path. Twenty portraits exist today; a card
           without one renders the sealed card back and says so plainly. */
        art: Boolean(champion.art),
      })),
    },
  });
}
