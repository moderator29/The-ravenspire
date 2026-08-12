# Icon sheets

Drop the generated 3D icon sheets here as:

- `sheet-1.png` (5 columns x 5 rows, 25 icons)
- `sheet-2.png` (8 columns x 8 rows, 64 icons)
- `sheet-3.png` (5 columns x 5 rows, 25 icons)

Then run:

```bash
npm run icons
```

That slices each sheet on its grid, knocks out the red matte fringe the
generator leaves behind, trims each icon to its artwork, and writes a normalised
512x512 transparent PNG per icon into `public/icons/3d/`.

Slugs are assigned in `scripts/slice-icons.mjs`, read left to right and top to
bottom. If a slug does not match the artwork, rename it there and run again.

Sheet 3 was generated on a brown backdrop rather than a transparent one. Remove
its background before slicing, or prefer sheets 1 and 2, which between them
already cover every slug the platform references.
