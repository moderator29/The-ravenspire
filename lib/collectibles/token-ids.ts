/* The frozen on-chain identity of every claimable thing in the realm.
 *
 * A token id is the one number about a collectible that can never be changed.
 * Everything else on a card, the art, the stats, the lore, the ability text,
 * is metadata and can be corrected after the fact. The id is what a wallet,
 * a marketplace and a buyer three years from now use to say "this exact
 * thing", so it is decided once, in one file, and never derived from anything
 * that a refactor could reorder.
 *
 * Two spaces, because there are two contracts. Cards are transferable, crests
 * are soulbound, and an item cannot be half of each, so they cannot share an
 * id space either.
 *
 * Nothing here touches the network or the database. It is pure arithmetic over
 * two frozen tables, which is what makes it testable, and it is tested:
 * token-ids.test.ts asserts the tables cover the live catalogs exactly, that
 * no id repeats, and that the ids the realm has already promised have not
 * moved.
 */

/* Ten thousand ids per set. Set One uses forty of them, so the room is
   absurd, and that is the point: the cost of a gap is nothing and the cost of
   two sets colliding is a permanent, unfixable duplicate on a public chain.
   The set index is the first number, the collector number is the second, so a
   token id reads back as its own address in the catalog: 10007 is Set One,
   card seven. */
const IDS_PER_SET = 10_000;

/* Set slug to set index. A set joins this table when it is announced and never
   leaves it, even if the set is closed or withdrawn, because its ids are
   spent. Adding a set here is the only correct way to add one. */
const SET_INDEX: Record<string, number> = {
  "set-one": 1,
};

/* The collector number printed on a Set One card, one through forty, is
   already frozen by the physical print run (docs/RAVENSPIRE-V2.md section 31
   is the published manifest). So a card's id is derived from a fact that was
   fixed before this file existed rather than from array order, which is the
   kind of thing a tidy-up moves. lib/collectibles/set-one.ts assigns those
   numbers from the manifest order and throws at module load if a champion in
   it has gone missing. */
export function cardTokenId(setSlug: string, cardNumber: number): string {
  const index = SET_INDEX[setSlug];
  if (index === undefined) {
    throw new Error(`No frozen id space for set: ${setSlug}`);
  }
  if (!Number.isInteger(cardNumber) || cardNumber < 1 || cardNumber > IDS_PER_SET) {
    throw new Error(`Collector number out of range: ${cardNumber}`);
  }
  return String(index * IDS_PER_SET + cardNumber);
}

/* Crests carry no printed number, so their ids are written out by hand and
   are law from the moment the first one is minted. The order is the order the
   crest catalog shipped in, but it is recorded here rather than read from
   there: reordering a display list must never renumber a token somebody owns.
   A new crest takes the next free number and never reuses a retired one. */
const CREST_TOKEN_IDS: Record<string, number> = {
  "took-the-black": 1,
  "knight-of-the-realm": 2,
  "warden-of-the-realm": 3,
  "blood-of-the-dragon": 4,
  "hand-of-the-king": 5,
  "master-of-whispers": 6,
  "lord-of-light": 7,
  "bannerlord": 8,
  "keeper-of-the-vault": 9,
  "champion-of-the-season": 10,
};

/* Null rather than a throw for an unknown crest: crests are granted by slug
   from several places in the product, and one that has no frozen id yet is a
   crest that cannot be claimed, not a crash. The claim route answers honestly
   and the member keeps the crest either way. */
export function crestTokenId(slug: string): string | null {
  const id = CREST_TOKEN_IDS[slug];
  return id === undefined ? null : String(id);
}

/* The slug set, for the completeness test and for admin surfaces that want to
   show which crests are mintable. */
export function crestSlugsWithIds(): string[] {
  return Object.keys(CREST_TOKEN_IDS);
}

/* Which contract a claim is against, and therefore whether it can ever be
   transferred. This is the single answer to "is this thing soulbound", and the
   secondary market reads it too: a market that has to ask a second module
   whether a listing is legal will one day forget to. */
export type ClaimSubjectKind = "card" | "crest";

export function isSoulbound(kind: ClaimSubjectKind): boolean {
  /* A crest is a record of something a member did. Selling it would make it a
     record of something somebody paid for, which is a different object with
     the same picture. Cards are the opposite: they are meant to move. */
  return kind === "crest";
}
