# Ravenspire 3D icon set: generation prompt

Paste the block below into ChatGPT (image generation). Generate in batches of 8
to 12 so each icon keeps its detail. Keep the STYLE SPEC identical in every
batch, and only swap the icon list, otherwise the set will drift and stop
looking like one family.

Ask for a transparent background every time. Save as PNG at 512x512.

---

## The prompt

```
Create a set of premium 3D isometric icons for a medieval fantasy social
platform called Ravenspire. These are UI icons for a dark-themed web app, so
they must read clearly at small sizes.

STYLE SPEC (keep identical across every icon):
- 3D isometric, rendered at a consistent 35 degree camera angle, every icon
  viewed from the same height and the same side. No perspective drift.
- Each object sits on a small rounded rectangular plinth, like a carved stone
  base or a forged metal tile. The plinth is the same size and shape in every
  icon so the set lines up on a grid.
- Soft studio lighting from the upper left, with a gentle warm rim light on the
  upper edges and a soft contact shadow under the plinth. One consistent light
  direction across the whole set.
- Matte and semi matte surfaces with subtle material contrast: brushed metal,
  carved stone, aged parchment. Slight surface texture, no high gloss, no
  chrome, no glass.
- Rounded, friendly geometry with softened edges. Chunky and tactile, not thin
  or wiry. Clean silhouettes that stay legible at 32px.
- No text, no letters, no numbers, no labels anywhere in the image.
- Transparent background. Nothing behind the plinth.
- Square 1:1 composition, object centered, with a small even margin.

COLOR PALETTE (use only these, no other hues):
- Forged gold, primary accent: #C8A24C
- Bright gold, highlights and edge light: #F0D68C
- Deep bronze gold, shadow side of gold surfaces: #8A6A2C
- Bone white, the main body and stone surfaces: #ECE4D2
- Warm grey stone, plinth and secondary surfaces: #B4AC9A
- Obsidian near black, deep shadow and recesses: #14120C
- Ember orange, used sparingly for fire, heat and alerts only: #E5702A

Rule: gold is the accent and the metal. Bone white and warm grey are the body.
Obsidian is only for depth and recesses. Never use blue, green, purple, red or
teal anywhere. The set must feel like carved bone and forged gold lit by
candlelight.

ICONS TO GENERATE IN THIS BATCH:
[paste one group from the list below]
```

---

## The icon list, grouped into batches

Run one group per generation. Names are what the icon should depict.

### Batch 1: Houses (the six banners)
Raven perched on a shield, Flame rising from a shield, Frost crystal on a
shield, Lightning bolt on a shield, Crescent moon over a shield, Lion head on a
shield

### Batch 2: Core surfaces
Aviary tower with ravens (the feed), Crossroads signpost (explore), Open air
pavilion with a speaking podium (live rooms), Sealed letter with wax (messages),
Castle keep tower (profile), Open book on a stand (docs), Magnifying glass over
a map (search)

### Batch 3: Calls, the flagship
Scroll with a wax seal (a sealed prediction), Scroll with a gold check mark (a
correct call), Scroll with a broken seal (a wrong call), Hourglass (timeframe),
Archery target with an arrow in the centre (accuracy), Balance scales
(confidence), Rising line chart carved in stone (a price call), Crystal orb on a
stand (forecast)

### Batch 4: Reputation and progression
Simple cloth cap (lowest rank), Squire helmet, Knight helm with a visor, Lord
coronet, Warden circlet with a raven, Steward chain of office, Full monarch
crown, Laurel wreath, Medal on a ribbon, Flame streak counter

### Batch 5: Houses V2 and leadership
Great hall interior, Oath scroll with a quill, Two crossed swords over a shield
(a house clash), Banner on a pole, Round council table, Quill and inkpot (the
chronicler), Horn being blown (the recruiter), Raven with a message tube (master
of ravens)

### Batch 6: The War and games
Longsword, Kite shield, Armoured champion figure, Weapon rack (the arsenal),
Battlefield terrain tile, Treasure chest, Rolled quest scroll, Two duelling
figures, Tournament bracket carved in stone, Victory trophy cup

### Batch 7: Wallet, treasury and tools
Iron bound vault door (the wallet), Ledger book with a bookmark (portfolio),
Scrying glass on a stand (coin discovery), Watchtower with a lantern (safety
scanning), Two arrows curving in a circle (swap), Blacksmith anvil with a hammer
(staking), Stack of gold coins, Coin purse, Strand of DNA carved in bone
(wallet analysis), Eye inside a triangle (account scanner)

### Batch 8: The Herald AI
Raven with a glowing gold eye, Raven silhouette inside a circular frame, Quill
writing by itself, Glowing orb held in a claw, Speech scroll with a raven feather

### Batch 9: Actions and system
Heart, Speech bubble, Two arrows forming a loop (repost), Arrow leaving a box
(share), Ribbon bookmark, Coin being handed over (tip), Bell, Cog wheel, Plus
sign on a tile (compose), Shield with a keyhole (security), Bar chart (analytics),
Warning triangle

### Batch 10: Seasons, events and rewards
Sun and moon on a turning wheel (a season), Calendar stone tablet, Fireworks
over a tower (an event), Gift box tied with cord, Sealed reward chest with gold
spilling out, Countdown sundial, Ranking podium with three steps

---

## After generating

1. Name files by their slug: `house-corvane.png`, `call-sealed.png`,
   `rank-knight.png`, and so on.
2. Drop them into `public/icons/3d/`.
3. Send me the folder and I will wire them into the landing page, the Crest and
   Renown surfaces, the House halls, the Calls surfaces, the empty states and
   the onboarding flow.

## Where these get used

These are the large, expressive icons. They are not a replacement for the inline
UI glyphs in `components/ui/icon.tsx`, which stay as flat strokes for buttons,
nav and dense rows. Use the 3D set where an icon carries weight:

- Landing page feature sections and the chapters grid
- Onboarding, especially House selection
- Empty states across every surface
- Crest and Renown tier displays
- House hall headers and the leadership roster
- Quest and achievement cards
- Reward, chest and season reveal moments
- Coming soon chapter pages
