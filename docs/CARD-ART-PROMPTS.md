# Set One card art: generation spec and prompt pack

How to produce the 40 portraits for Champions of the Six Houses using an image
model (ChatGPT image generation or similar). The platform composites all card
chrome (frame, rarity gems, house sigil, name, stats, lore) over these
portraits, so the art must arrive clean.

## Hard requirements, every image

- Portrait, aspect ratio 2:3, at least 1024 x 1536 px, PNG.
- One character per image, centered, chest-up three-quarter view, gaze past
  the camera, headroom above the crown.
- Background: obsidian black, atmospheric, never a flat studio backdrop.
- Lighting: warm candlelight rim light with faint forged-gold glints. Never
  cool blue studio light, except where a house palette calls for ice or storm
  tones inside the scene itself.
- Absolutely no text, letters, numbers, borders, frames, logos or watermarks
  baked into the image. The platform renders every word.
- Filename: the champion slug, for example `aeron-the-black.png`.
- Generate the whole set in one session with the same style block pasted
  verbatim, so the set reads as one painter's work.

Print note: physical cards are 63 x 88 mm at 300 dpi with 3 mm bleed, which
needs 815 x 1110 px. The 1024 x 1536 digital masters already exceed it.

## The master style block

Paste this once per image, filling the bracketed fields:

> Painterly dark-fantasy character portrait for a premium medieval trading
> card. [NAME], called [TITLE], a champion of [HOUSE]. Their weapon, a
> [WEAPON], is visible in frame. Composition: three-quarter view, chest-up,
> centered, subject filling most of the frame, gaze past the camera, headroom
> above the crown. Lighting: obsidian-black atmospheric background, warm
> candlelight rim light, faint forged-gold glints. Style: oil painting,
> dramatic chiaroscuro, rich fabric and metal texture, highly detailed.
> [HOUSE PALETTE]. [RARITY AURA]. Strictly no text, no letters, no numbers,
> no watermark, no border, no frame, no logo. Portrait, aspect ratio 2:3.

## House palettes

| House | Palette line |
| --- | --- |
| Corvane | Raven black and steel blue-gray accents, feather motifs, ink and parchment undertones |
| Emberfall | Ember orange and deep red fire accents, drifting sparks and smoke |
| Frosthold | Glacial blue-white accents, frost on metal, visible cold breath |
| Stormcrest | Storm gray-violet accents, distant lightning, wind-torn cloth |
| Nightvale | Deep violet-black shadow, faint silver moonlight, soft haze |
| Goldmane | Burnished gold and ivory accents, lion motifs, a warm sunlit gleam |

## Rarity auras

| Rarity | Aura line |
| --- | --- |
| Rare | A quiet, grounded atmosphere with a restrained steel shimmer |
| Epic | A charged atmosphere, wisps of the house's own colored energy curling around the figure |
| Legendary | A radiant golden aura, floating motes of light, a grander, more heroic scale |
| Mythic | An overwhelming presence, the air itself bending at the edges of the frame |

## Two worked examples

Mythic, Emberfall:

> Painterly dark-fantasy character portrait for a premium medieval trading
> card. Kaelen Dragonborn, called The Last Ember of the Old Fire, a champion
> of House Emberfall. Their weapon, a jagged dragonspine greatsword, is
> visible in frame. Composition: three-quarter view, chest-up, centered,
> subject filling most of the frame, gaze past the camera, headroom above the
> crown. Lighting: obsidian-black atmospheric background, warm candlelight
> rim light, faint forged-gold glints. Style: oil painting, dramatic
> chiaroscuro, rich fabric and metal texture, highly detailed. Ember orange
> and deep red fire accents, drifting sparks and smoke. An overwhelming
> presence, blood-red draconic energy and black smoke bending the air at the
> edges of the frame. Strictly no text, no letters, no numbers, no watermark,
> no border, no frame, no logo. Portrait, aspect ratio 2:3.

Rare, Frosthold:

> Painterly dark-fantasy character portrait for a premium medieval trading
> card. Ser Willas, called The Unmoved, a champion of House Frosthold. Their
> weapon, a heavy warhammer, is visible in frame. Composition: three-quarter
> view, chest-up, centered, subject filling most of the frame, gaze past the
> camera, headroom above the crown. Lighting: obsidian-black atmospheric
> background, warm candlelight rim light, faint forged-gold glints. Style:
> oil painting, dramatic chiaroscuro, rich fabric and metal texture, highly
> detailed. Glacial blue-white accents, frost on metal, visible cold breath.
> A quiet, grounded atmosphere with a restrained steel shimmer. Strictly no
> text, no letters, no numbers, no watermark, no border, no frame, no logo.
> Portrait, aspect ratio 2:3.

## The 40-card manifest

Fill the four bracketed fields from this table. Special notes for the two
mythics: The Faceless should read as a hooded figure whose face is a smooth
void, needle-thin blade, silver moonlight; Kaelen as above.

| Slug | Name | Title | House | Rarity | Weapon |
| --- | --- | --- | --- | --- | --- |
| the-faceless | The Faceless | A Stranger to All | Nightvale | Mythic | Needle |
| kaelen-dragonborn | Kaelen Dragonborn | The Last Ember of the Old Fire | Emberfall | Mythic | Dragonspine greatsword |
| aeron-the-black | Aeron the Black | Warden of the Obsidian Coast | Corvane | Legendary | Longsword |
| corvus-ashwing | Corvus Ashwing | The Raven Lord | Corvane | Legendary | Obsidian saber |
| pyrra-flameheart | Pyrra Flameheart | The First Spark | Emberfall | Legendary | Flame whip |
| varek-hollowflame | Varek Hollowflame | The Ash King's Heir | Emberfall | Legendary | Ember greatsword |
| grommash | Grommash | The Walking Rampart | Frosthold | Legendary | Maul |
| helga-winterborn | Helga Winterborn | The Glacier's Daughter | Frosthold | Legendary | Ice greataxe |
| tempest-kael | Tempest Kael | The Rider of Gales | Stormcrest | Legendary | Storm glaive |
| lyra-windmere | Lyra Windmere | The Falcon of the Crest | Stormcrest | Legendary | Twin storm sabers |
| vorian-nightblade | Vorian Nightblade | Herald of the Long Dusk | Nightvale | Legendary | Voidscythe |
| umbra-veilwalker | Umbra Veilwalker | The Space Between Shadows | Nightvale | Legendary | Shadow blades |
| leonar-goldmane | Leonar Goldmane | The Lion Ascendant | Goldmane | Legendary | Lion's claw greatsword |
| isolde-the-pure | Isolde the Pure | Light of the Seven Roads | Goldmane | Legendary | Dawnbringer sword |
| thessaly-quill | Thessaly Quill | Mistress of Whispers | Corvane | Epic | Poison stiletto |
| ravenna-holt | Ravenna Holt | Keeper of the Black Archive | Corvane | Epic | Runed staff |
| karn-the-reaver | Karn the Reaver | Terror of the Ember Coast | Emberfall | Epic | Cleaver |
| ashka-emberveil | Ashka Emberveil | The Smoke Dancer | Emberfall | Epic | Chakrams |
| torvald-ironhand | Torvald Ironhand | The Anvil of the North | Frosthold | Epic | Greataxe |
| gwendal-frost | Gwendal Frost | The Winter's Lance | Frosthold | Epic | Spear |
| mira-stormborn | Mira Stormborn | Daughter of Thunder | Stormcrest | Epic | Twin blades |
| wren-galecaller | Wren Galecaller | The Sky's Herald | Stormcrest | Epic | Wind staff |
| cormac-thunderhide | Cormac Thunderhide | The Rolling Boom | Stormcrest | Epic | Stormdrum gauntlets |
| morrigan-shadowmist | Morrigan Shadowmist | The Whisper Between Walls | Nightvale | Epic | Throwing knives |
| sable-nightwood | Sable Nightwood | The Quiet Harvest | Nightvale | Epic | War scythe |
| octavia-gilt | Octavia Gilt | The Coin Countess | Goldmane | Epic | Coin-edged fans |
| elowen-brightshield | Elowen Brightshield | The Dawn Sentinel | Goldmane | Epic | Sunforged spear |
| nymeria-vale | Nymeria Vale | The Far-Reaching | Corvane | Rare | Longbow |
| maren-darkfeather | Maren Darkfeather | The Owl at Midnight | Corvane | Rare | Recurve bow |
| brom-coalbeard | Brom Coalbeard | The Forge Father | Emberfall | Rare | Smithing hammer |
| seraphine-dawnash | Seraphine Dawnash | The Morning Flame | Emberfall | Rare | Torch staff |
| ser-willas | Ser Willas | The Unmoved | Frosthold | Rare | Warhammer |
| bjorn-frostfell | Bjorn Frostfell | The Bear of the Tundra | Frosthold | Rare | Twin axes |
| ser-brannoch | Ser Brannoch | The Loud Knight | Stormcrest | Rare | Mace |
| petra-boneweather | Petra Boneweather | The Storm Reader | Stormcrest | Rare | Bone darts |
| bael-the-bard | Bael the Bard | Voice of Velvet | Nightvale | Rare | Dagger |
| nyx-emberdim | Nyx Emberdim | The Last Candle | Nightvale | Rare | Hooked chain |
| lady-ysolde | Lady Ysolde | The Gilded Thorn | Goldmane | Rare | Rapier |
| ser-elyra | Ser Elyra | The Line That Holds | Goldmane | Rare | Halberd |
| cressida-lorne | Cressida Lorne | The Velvet Verdict | Goldmane | Rare | Scepter |

## Delivery

Forty PNGs named by slug, zipped. They land in
`public/reliquary/set-one/`. The Reliquary reads everything else it needs
(name, title, house, rarity, abilities, stats, lore) from
`lib/game/champions.ts`, so art is the only asset required from outside.
