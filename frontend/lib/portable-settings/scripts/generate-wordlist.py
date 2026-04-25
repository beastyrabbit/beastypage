#!/usr/bin/env python3
"""
Generate the current curated 65,536-word list for portable settings encoding.

Run with:  uv run --with wordfreq python3 lib/portable-settings/scripts/generate-wordlist.py

Source: wordfreq (https://github.com/rspeer/wordfreq)
Strategy:
  1. Pull a deep pool of English words ranked by frequency
  2. Filter: alphabetic only, lowercase, 4–10 chars
  3. Remove sentence-glue, sensitive, offensive, or inappropriate words
  4. Keep homophones and plurals (user decision)
  5. Take exactly 65,536 (2^16) → 16 bits per word
  6. Output as TypeScript array

Target: 65,536 words × 6 words = 96 bits per code.
"""

import json
import re
import sys
from pathlib import Path

from wordfreq import top_n_list

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TARGET_COUNT = 65_536  # 2^16 = 16 bits per word
MIN_LEN = 4
MAX_LEN = 10
ALPHA_RE = re.compile(r"^[a-z]+$")

# ---------------------------------------------------------------------------
# Current word blocklist
# ---------------------------------------------------------------------------
# Conservative blocklist — words that are too sentence-like, sensitive,
# or inappropriate for a family-friendly cat game settings code. This is
# intentionally broad. Blocked words are skipped, then the generator keeps
# pulling deeper safe wordfreq candidates until the list is full.

BLOCKLIST: set[str] = {
    # Sentence glue / high-frequency function words that make codes read like
    # fragments of prose instead of deterministic identifiers.
    "about", "above", "after", "again", "against", "also", "although",
    "always", "among", "another", "around", "because", "been", "before",
    "being", "below", "between", "both", "could", "does", "doing", "done",
    "down", "during", "each", "enough", "even", "ever", "every", "first",
    "from", "getting", "going", "have", "having", "here", "however",
    "including", "into", "just", "like", "many", "might", "more", "most",
    "much", "never", "only", "other", "please", "really", "same", "since",
    "some", "something", "still", "such", "than", "that", "their", "them",
    "then", "there", "these", "they", "thing", "things", "this", "those",
    "through", "under", "until", "very", "want", "well", "were", "what",
    "when", "where", "which", "while", "will", "with", "without", "would",
    "your",
    # Migration / current-event terms.
    "alien", "aliens", "asylum", "border", "borders", "deport",
    "deported", "deports", "illegal", "immigrant", "migrant", "migrants",
    "migration", "refugee", "refugees",
    # Political / current conflict terms.
    "ballot", "ballots", "biden", "brexit", "campaign", "capitol",
    "clausewitz",
    "communism", "communist", "congress", "democrat", "election",
    "fascism", "fascist", "gaza", "geopolitic", "hamas", "israel",
    "israeli", "kremlin", "lobbyist", "marxism", "marxist", "military",
    "militia", "nuclear", "obama", "political", "politics", "putin",
    "russia", "russian", "senate", "soldier", "soldiers", "taliban",
    "terror", "troops", "trump", "ukraine", "ukrainian", "warfare",
    "wars", "zelensky",
    # Identity / religion terms that can make random codes feel targeted.
    "atheism", "atheist", "buddhist", "catholic", "christian", "disabled",
    "gender", "hindu", "islam", "islamic", "jewish", "judaism", "lesbian",
    "muslim", "queer", "racial", "racism", "racist", "religion",
    "religious", "sexuality", "sikh", "trans",
    # Violence, weapons, and conflict.
    "abduct", "abducted", "abuse", "abused", "ammo", "army", "arson",
    "assassin", "assault", "attack", "attacks", "battle", "beaten",
    "beating", "blood", "bloody", "bomb", "bombed", "bomber", "bombing",
    "bombs", "bullet", "bullets", "corpse", "cruel", "cruelty", "death",
    "deaths", "died", "dies", "drown", "drowned", "dying", "fatal",
    "fight", "fighting", "fights", "genocide", "gunman", "guns", "harm",
    "harmed", "harming", "homicide", "hostage", "hostages", "injure",
    "injured", "knife", "knives", "massacre", "missile", "missiles",
    "mutilate", "mutilated", "mutilating", "pistol", "rifle", "shoot",
    "shooter", "shooting", "shoots", "stab", "stabbed", "stabbing",
    "strangle", "terrorism", "violent", "weapon", "weapons", "wound",
    "wounded",
    # Crime / law enforcement.
    "arrest", "arrested", "cartel", "cartels", "convict", "crime",
    "crimes", "criminal", "felon", "fraud", "gang", "gangs", "guilty",
    "jail", "kidnap", "kidnaps", "mafia", "mugging", "prison", "robber",
    "robbery", "smuggle", "smuggler", "theft", "thief", "thieves",
    "traffick", "vandal", "verdict",
    # Insults / hostile descriptors.
    "bigot", "bigots", "clown", "coward", "creep", "creeps", "dumb",
    "dumber", "dumbest", "freak", "freaks", "idiot", "idiots", "jerk",
    "loser", "losers", "moron", "morons", "stupid", "trash", "ugly",
    # Slurs and hate speech (abbreviated to avoid reproducing)
    "anal", "anus", "arse", "arses", "asshole", "assholes",
    "bastard", "bastards", "bitch", "bitches", "bitchy",
    "blowjob", "boner", "boob", "boobs", "booby",
    "brothel", "butt", "butts",
    "chink", "clit", "cock", "cocks", "coon", "crap", "crappy",
    "cum", "cums", "cunt", "cunts",
    "damn", "damned", "dammit", "dick", "dicks", "dildo",
    "douche", "dyke",
    "adult", "adults", "copulate", "copulation", "copulating", "ejaculate",
    "erection", "erotic", "escort",
    "fag", "fags", "faggot", "fart", "farts", "felch",
    "fellatio", "fetish", "fuck", "fucked", "fucker", "fuckers",
    "fucking", "fucks",
    "gangbang", "gash", "genital", "genitals", "ghetto",
    "goddamn", "gringo", "grope",
    "handjob", "hentai", "homo", "hooker", "hookers", "horny",
    "humping",
    "incest",
    "jerk", "jizz",
    "kike", "kinky", "knob",
    "labia", "lesbo", "lezzy", "lust",
    "meth", "milf", "molest",
    "nazi", "nazis", "negro", "nigga", "nigger", "nipple", "nipples",
    "naked", "naturism", "naturist", "naturists", "nude", "nudes", "nudist",
    "nudists", "nudity",
    "orgasm", "orgy",
    "pedo", "penis", "pervert", "perverts", "piss", "pissed",
    "pimp", "pimps", "porn", "porno", "prostitute", "pubic",
    "pussy", "pussies",
    "rape", "raped", "rapist", "rectum", "retard", "retarded",
    "rimjob",
    "scrotum", "semen", "sexist", "sexy", "shit", "shits",
    "shitty", "skank", "slut", "sluts", "smut", "snatch",
    "sodomize", "sodomy", "sperm", "spic",
    "testes", "testicle", "tits", "titty", "tranny",
    "turd", "twat",
    "vagina", "vibrator", "vulva",
    "wank", "wanker", "whore", "whores",
    # Drug references that feel inappropriate.
    "addict", "addicts", "alcohol", "alkaloid", "alkaloids", "beers",
    "booze", "cannabis", "cigar", "cocaine", "crack", "drug", "drugs",
    "drunk", "drunkard",
    "drunkards", "drunken", "drunkenly", "drunker", "drunks", "heroin",
    "ketamine", "liquor", "marijuana", "narcotic", "opioid", "opioids",
    "overdose", "reefer", "stoned", "tobacco", "vape", "vaping", "vodka",
    "weed", "whiskey", "wine", "wines",
    # Death / self-harm that feel wrong for a cat game.
    "execute", "kill", "kills", "killer", "murder", "murdered", "murders",
    "suicide", "torture", "tortured",
    # Misc inappropriate
    "slave", "slaves", "slavery",
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def generate() -> list[str]:
    """Generate the curated wordlist."""
    # Pull a large pool from wordfreq (already frequency-ranked). The pool is
    # intentionally much larger than the target so blocked candidates are
    # replaced by later safe backfill words instead of shrinking the list.
    raw = top_n_list("en", 250_000)
    print(f"Raw wordfreq pool: {len(raw)} words")

    # Filter
    filtered: list[str] = []
    for word in raw:
        w = word.lower().strip()
        if len(w) < MIN_LEN or len(w) > MAX_LEN:
            continue
        if not ALPHA_RE.match(w):
            continue
        if w in BLOCKLIST:
            continue
        filtered.append(w)

    print(f"After filtering (alpha, {MIN_LEN}-{MAX_LEN} chars, blocklist): {len(filtered)} words")

    if len(filtered) < TARGET_COUNT:
        print(f"ERROR: Only {len(filtered)} words, need {TARGET_COUNT}", file=sys.stderr)
        sys.exit(1)

    # Take exactly TARGET_COUNT (already sorted by frequency from wordfreq)
    result = filtered[:TARGET_COUNT]
    print(f"Final wordlist: {len(result)} words")
    print(f"First 10: {result[:10]}")
    print(f"Last 10: {result[-10:]}")

    # Verify uniqueness
    if len(set(result)) != len(result):
        dupes = [w for w in result if result.count(w) > 1]
        print(f"ERROR: {len(dupes)} duplicate words!", file=sys.stderr)
        sys.exit(1)

    return result


def write_typescript(words: list[str], outpath: Path) -> None:
    """Write the wordlist as a TypeScript file."""
    blocklist_array = json.dumps(sorted(BLOCKLIST), ensure_ascii=True, indent=2)
    words_array = json.dumps(words, ensure_ascii=True, indent=2)

    content = f'''/**
 * Curated wordlist for portable settings encoding.
 *
 * 65,536 words (2^16) → 16 bits per word.
 * Source: wordfreq top English words, filtered for:
 *   - Alphabetic only, lowercase, 4–10 characters
 *   - Sentence-glue, sensitive, offensive, or inappropriate words removed
 *   - Sorted by word frequency (most common first)
 *
 * DO NOT EDIT MANUALLY — generated by scripts/generate-wordlist.py
 * Regenerate: uv run --with wordfreq python3 lib/portable-settings/scripts/generate-wordlist.py
 */

export const WORDLIST_V3_BLOCKLIST: readonly string[] = {blocklist_array} as const;

export const WORDLIST_V3: readonly string[] = {words_array} as const;
'''

    outpath.write_text(content)
    size_kb = outpath.stat().st_size / 1024
    print(f"Wrote {outpath} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    words = generate()
    script_dir = Path(__file__).parent
    out = script_dir.parent / "wordlist-v3.ts"
    write_typescript(words, out)
    print("Done!")
