/*
  The Ravenspire crest: the raven-head sigil set in a forged-gold shield, the
  brand mark the founder chose. Rendered from the crest art at
  public/brand/raven-crest.png, a fixed full-colour mark (dark raven on gold)
  built to sit on obsidian surfaces, which is every surface in the realm.

  Kept as a component with the same name and the same `className` sizing API as
  the sigil it replaces, so every call site that placed the old mark now shows
  the crest at the same size with no other change. The art is square and
  transparent, so `h-x w-x` classes frame it correctly.
*/
export function RavenMark({ className = "h-12 w-12" }: { className?: string }) {
  return (
    /* A fixed raster brand mark, not an icon to be tinted, so a plain image is
       correct here and next/image would only add layout constraints the callers
       do not want. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/raven-crest.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
