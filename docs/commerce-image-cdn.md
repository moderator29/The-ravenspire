# Card art image delivery policy

A short standing note (V2 Part Three, section 38, infra), so nobody reaches for
a paid CDN. Rule 19 is the reason: assume the budget is zero, prefer free tiers
and browser-native capability.

## The policy

Card art, chest art and merch photos are served from **Supabase Storage** and
rendered through **`next/image`**. Both are already paid for by dependencies we
run, so they add no new service and no new bill.

1. **Origin: Supabase Storage.** A public bucket (for example `card-art`) holds
   the real image files. Supabase Storage sits behind a CDN on the Pro plan we
   already have, so origin reads are cached at the edge without a second vendor.
   Real files only: until a card's real art exists, the surface renders the
   honest silhouette placeholder the Reliquary already uses, never an invented
   image (rule 4).

2. **Delivery: `next/image`.** Every render goes through the framework's image
   component, which does the work a paid image CDN would otherwise sell:
   responsive `srcset`, lazy loading, and modern formats. The Supabase Storage
   host is added to `images.remotePatterns` in `next.config.ts` so the optimizer
   accepts it. On Vercel the optimizer is the platform's own; self-hosted it runs
   in the Next server. Either way it is part of the framework, not a new
   dependency.

3. **Transforms stay at the edges we already own.** Supabase Storage can render
   a resized/transformed image on the fly, and `next/image` resizes on request.
   Between the two there is no case that needs a Cloudinary or an imgix. If one
   ever appears, it is a founder decision under rule 19, justified in writing
   first, not reached for by default.

## What not to do

- Do not add a paid image CDN or transformation service.
- Do not hotlink card art from a third party; the files live in our bucket.
- Do not ship placeholder or stock imagery as if it were real card art.
