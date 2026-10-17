export type NineLivesCreditGroup =
  | "Art"
  | "Tiles"
  | "Interface"
  | "Fonts"
  | "Music"
  | "Sound effects";

export type NineLivesCredit = {
  title: string;
  group: NineLivesCreditGroup;
  author: string;
  source: string;
  license: string;
  licenseUrl: string;
  creditRequired: string;
  creditLine: string;
  note?: string;
};

// Source: Nine Lives assets/CREDITS.md (compiled 2026-10-11); pack detail is
// checked against assets/*/provenance.csv in the Nine Lives repository.
export const NINE_LIVES_CREDITS: readonly NineLivesCredit[] = [
  {
    title: "BeastyPage cat sprites (ClanGen and LifeGen)",
    group: "Art",
    author: "The ClanGen team; LifeGen contributors; BeastyPage",
    source: "https://github.com/ClanGenOfficial/clangen",
    license: "CC BY-NC 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
    creditRequired:
      "Yes — name the creators, link the licence, note changes, and keep use non-commercial.",
    creditLine:
      "Cat sprites from ClanGen (https://github.com/ClanGenOfficial/clangen) by the ClanGen team: original creator anju (just-some-cat.tumblr.com), fan edit by SableSteel and many others (full list: https://github.com/ClanGenOfficial/clangen/blob/development/resources/credits_text.json). Accessories in part from LifeGen, a ClanGen mod (https://mods.clangen.io/LifeGen/download). Collected and rendered by BeastyPage (https://github.com/beastyrabbit/beastypage). Licensed under CC BY-NC 4.0 (https://creativecommons.org/licenses/by-nc/4.0/). Composited, recoloured, and resized for Nine Lives by the BeastyPage renderer and the Nine Lives bake script.",
  },
  {
    title: "496 pixel art icons for medieval/fantasy RPG",
    group: "Art",
    author: "Henrique Lazarini (7Soul1); repacked by gnola14",
    source:
      "https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg",
    license: "CC0 1.0 (author pages also list CC BY 3.0)",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No under CC0; courtesy credit retained.",
    creditLine:
      "RPG icons by Henrique Lazarini (7Soul1), https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg, CC0 1.0; the author's DeviantArt pages also list CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Modified for Nine Lives.",
  },
  {
    title: "isaiah658's Pixel Pack #2 (version 2.0)",
    group: "Art",
    author: "isaiah658",
    source: "https://opengameart.org/content/isaiah658s-pixel-pack-2",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No; the author says credit is appreciated.",
    creditLine:
      "isaiah658's Pixel Pack #2 by isaiah658 (opengameart.org/users/isaiah658), CC0.",
  },
  {
    title: "Monster Taming Game Essentials - MyPixelWorld Special Packs #01",
    group: "Art",
    author: "scarloxy (Ismael Garcia)",
    source: "https://scarloxy.itch.io/mpwsp01",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    creditRequired: "Yes — attribution and a modification note.",
    creditLine:
      '"Monster Taming Game Essentials - MyPixelWorld Special Packs #01" by scarloxy (https://scarloxy.itch.io/mpwsp01), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Modified for Nine Lives.',
  },
  {
    title: "Pokemon Style Characters - Forest NPCs",
    group: "Art",
    author: "Screen Smith",
    source: "https://screensmith.itch.io/pokemon-style-characters-forest-npcs",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired:
      "No; disclose the author's AI-assisted (Retro Diffusion) process.",
    creditLine:
      "Trainer and NPC sprites by Screen Smith (https://screensmith.itch.io/), CC0. AI-assisted (Retro Diffusion), as disclosed by the author.",
  },
  {
    title: "Pokemon Style NPCs - Miners and Construction Workers",
    group: "Art",
    author: "Screen Smith",
    source:
      "https://screensmith.itch.io/pokemon-style-npcs-miners-and-construction-workers",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired:
      "No; disclose the author's AI-assisted (Retro Diffusion) process.",
    creditLine:
      "Trainer and NPC sprites by Screen Smith (https://screensmith.itch.io/), CC0. AI-assisted (Retro Diffusion), as disclosed by the author.",
  },
  {
    title: "Openmon NPC Sprites Set-1",
    group: "Art",
    author: "Screen Smith",
    source: "https://screensmith.itch.io/openmon-npc-sprites-set-1",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No attribution required.",
    creditLine:
      "Openmon NPC sprites by Screen Smith (https://screensmith.itch.io/), CC0.",
  },
  {
    title: "Pokemon Style Characters - Townspeople",
    group: "Art",
    author: "Screen Smith",
    source: "https://screensmith.itch.io/pokemon-style-characters-townspeople",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired:
      "No; disclose the author's AI-assisted (Retro Diffusion) process.",
    creditLine:
      "Trainer and NPC sprites by Screen Smith (https://screensmith.itch.io/), CC0. AI-assisted (Retro Diffusion), as disclosed by the author.",
  },
  {
    title: "Pokemon Style Characters - Townspeople 2",
    group: "Art",
    author: "Screen Smith",
    source:
      "https://screensmith.itch.io/pokemon-style-characters-townspeople-2",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired:
      "No; disclose the author's AI-assisted (Retro Diffusion) process.",
    creditLine:
      "Trainer and NPC sprites by Screen Smith (https://screensmith.itch.io/), CC0. AI-assisted (Retro Diffusion), as disclosed by the author.",
  },
  {
    title: "Pokemon Style Characters - Water Trainers",
    group: "Art",
    author: "Screen Smith",
    source:
      "https://screensmith.itch.io/pokemon-style-characters-water-trainers",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired:
      "No; disclose the author's AI-assisted (Retro Diffusion) process.",
    creditLine:
      "Trainer and NPC sprites by Screen Smith (https://screensmith.itch.io/), CC0. AI-assisted (Retro Diffusion), as disclosed by the author.",
  },
  {
    title: "Character/Trainer Sprites (64px)",
    group: "Art",
    author: "Sanglorian",
    source: "https://opengameart.org/content/charactertrainer-sprites-64px",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    creditRequired:
      "Yes — attribution, modification note, and share-alike for adapted sprites.",
    creditLine:
      '"Character/Trainer Sprites (64px)" by Sanglorian (https://opengameart.org/content/charactertrainer-sprites-64px), licensed under CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/). Modified for Nine Lives.',
  },
  {
    title: "Ninja Adventure Asset Pack",
    group: "Art",
    author: "Pixel-Boy and AAA",
    source: "https://pixel-boy.itch.io/ninja-adventure-asset-pack",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired:
      "No; attribution is appreciated and the pack page is linked.",
    creditLine:
      "Ninja Adventure Asset Pack by Pixel-Boy and AAA, https://pixel-boy.itch.io/ninja-adventure-asset-pack, CC0 1.0.",
  },
  {
    title: "AxulArt basic tilesets",
    group: "Tiles",
    author: "AxulArt",
    source: "https://axulart.itch.io/axularts-basicplains-tileset-ver2",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    creditRequired: "Yes — attribution and a modification note.",
    creditLine:
      '"AxulArt\'s BasicPlains Tileset Ver. 2", "AxulArt\'s Beach and caves tileset" and "AxulArt\'s Basic Top-down interior" by AxulArt (https://axulart.itch.io/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Modified for Nine Lives.',
  },
  {
    title: "Worldmap/Overworld tileset",
    group: "Tiles",
    author:
      "MrBeast (OpenGameArt user “Beast”), commissioned by OpenGameArt.org",
    source: "https://opengameart.org/content/worldmapoverworld-tileset",
    license: "CC BY 3.0 Unported",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    creditRequired: "Yes — attribution and a modification note.",
    creditLine:
      '"Worldmap/Overworld tileset" art by MrBeast, commissioned by OpenGameArt.org (https://opengameart.org/content/worldmapoverworld-tileset), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Modified for Nine Lives.',
  },
  {
    title: "16x16 Puny World Tileset",
    group: "Tiles",
    author: "Shade",
    source: "https://opengameart.org/content/16x16-puny-world-tileset",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No attribution required.",
    creditLine:
      "16x16 Puny World Tileset by Shade (https://opengameart.org/content/16x16-puny-world-tileset), CC0 1.0.",
  },
  {
    title: "Roguelike/RPG pack",
    group: "Tiles",
    author: "Kenney Vleugels for Kenney, with help by Lynn Evers",
    source: "https://kenney.nl/assets/roguelike-rpg-pack",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No; test fixture only and does not ship.",
    creditLine: "Roguelike/RPG pack by Kenney (www.kenney.nl), CC0 1.0.",
    note: "Map-build test fixture; its tiles do not ship.",
  },
  {
    title: "UI Pack - Pixel Adventure",
    group: "Interface",
    author: "Kenney",
    source: "https://kenney.nl/assets/ui-pack-pixel-adventure",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No; optional credit to Kenney or kenney.nl.",
    creditLine: "UI Pack - Pixel Adventure by Kenney (www.kenney.nl), CC0.",
  },
  {
    title: "Galmuri",
    group: "Fonts",
    author: "Lee Minseo (quiple)",
    source: "https://github.com/quiple/galmuri",
    license: "SIL Open Font License 1.1",
    licenseUrl: "https://openfontlicense.org",
    creditRequired:
      "No on-screen credit; ship LICENSE.txt with the font files.",
    creditLine:
      "Galmuri11 Bold and Galmuri11 Condensed by Lee Minseo (quiple), https://github.com/quiple/galmuri, SIL Open Font License 1.1.",
  },
  {
    title: "Pixel Operator",
    group: "Fonts",
    author: "Jayvee Enaguas (HarvettFox96)",
    source: "https://fontlibrary.org/en/font/pixel-operator",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No.",
    creditLine:
      "Pixel Operator by Jayvee Enaguas (HarvettFox96), https://fontlibrary.org/en/font/pixel-operator, CC0 1.0.",
  },
  {
    title: "Nameless: The Hackers RPG Soundtrack (selected tracks)",
    group: "Music",
    author: "BoxCat Games",
    source:
      "https://freemusicarchive.org/music/BoxCat_Games/Nameless_the_Hackers_RPG_Soundtrack",
    license: "CC BY 3.0 Unported",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    creditRequired: "Yes — one attribution line per track that ships.",
    creditLine:
      '"<Track title>" by BoxCat Games, from Nameless: The Hackers RPG Soundtrack, Free Music Archive (<track page>), licensed under CC BY 3.0. Used as game music in Nine Lives; transcoded, loudness-adjusted, and looped.',
  },
  {
    title: "8 bit battle theme (famitracker) and Victory",
    group: "Music",
    author: "celestialghost8 (credit as “celestialghost”)",
    source: "https://opengameart.org/content/8-bit-battle-theme-famitracker",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No; optional credit requested.",
    creditLine: "8 bit battle theme and Victory by celestialghost (CC0).",
  },
  {
    title: "Victory sting",
    group: "Music",
    author: "congusbongus",
    source: "https://opengameart.org/content/victory-sting",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No.",
    creditLine: "Victory sting by congusbongus (CC0).",
  },
  {
    title: "5 Chiptunes (Action) / Retro Game Music Pack",
    group: "Music",
    author: "Juhani Junkala (uploaded as SubspaceAudio)",
    source: "https://opengameart.org/content/5-chiptunes-action",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No.",
    creditLine: "Music by Juhani Junkala, Retro Game Music Pack (CC0).",
  },
  {
    title: "Poupi's incredible adventures! (selected tracks)",
    group: "Music",
    author: "Komiku",
    source:
      "https://freemusicarchive.org/music/Komiku/Poupis_incredible_adventures_",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No.",
    creditLine:
      "Music by Komiku, Poupi's incredible adventures! (CC0), Free Music Archive.",
  },
  {
    title: "NES Shooter Music (5 tracks, 3 jingles)",
    group: "Music",
    author: "SketchyLogic",
    source:
      "https://opengameart.org/content/nes-shooter-music-5-tracks-3-jingles",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No.",
    creditLine: "Music by SketchyLogic (CC0).",
  },
  {
    title: "Item Icons Set 1 - Openmon Item Sprites",
    group: "Interface",
    author: "Screen Smith",
    source: "https://screensmith.itch.io/item-icon-sprites-set-1-openmon",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No attribution required.",
    creditLine:
      "Openmon item icons by Screen Smith (https://screensmith.itch.io/), CC0.",
  },
  {
    title: "Boss Battle #3 [8-bit re-upload], version 3",
    group: "Music",
    author: "nene",
    source: "https://opengameart.org/content/boss-battle-3-8-bit-re-upload",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No.",
    creditLine: "Boss Battle #3 by nene (CC0).",
  },
  {
    title: "Songs From An Unmade World 2 (selected loop tracks)",
    group: "Music",
    author: "Visager",
    source:
      "https://freemusicarchive.org/music/Visager/Songs_From_An_Unmade_World_2",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    creditRequired: "Yes — one attribution line per track that ships.",
    creditLine:
      '"<Track title>" by Visager, from Songs From An Unmade World 2, Free Music Archive (<track page>), licensed under CC BY 4.0. Used as game music in Nine Lives; transcoded, loudness-adjusted, and looped.',
  },
  {
    title: "Haunting Chiptune Loop [Void Estate]",
    group: "Music",
    author: "Zane Little Music",
    source:
      "https://opengameart.org/content/haunting-chiptune-loop-void-estate",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No.",
    creditLine: "Void Estate by Zane Little Music (CC0).",
  },
  {
    title:
      "The Essential Retro Video Game Sound Effects Collection [512 sounds]",
    group: "Sound effects",
    author: "Juhani Junkala (uploaded as SubspaceAudio)",
    source: "https://opengameart.org/content/512-sound-effects-8-bit-style",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No.",
    creditLine:
      "Sound effects by Juhani Junkala, The Essential Retro Video Game Sound Effects Collection (CC0).",
  },
  {
    title: "Digital Audio",
    group: "Sound effects",
    author: "Kenney Vleugels (Kenney.nl)",
    source: "https://kenney.nl/assets/digital-audio",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No; optional credit is appreciated.",
    creditLine: "Sound effects by Kenney (www.kenney.nl), CC0.",
  },
  {
    title: "Music Jingles",
    group: "Sound effects",
    author: "Kenney Vleugels (Kenney.nl)",
    source: "https://kenney.nl/assets/music-jingles",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    creditRequired: "No; optional credit is appreciated.",
    creditLine: "Jingles by Kenney (www.kenney.nl), CC0.",
  },
];
