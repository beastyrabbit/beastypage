#!/usr/bin/env python3
"""
Generate a curated 32,768-word list for portable settings encoding.

Run with:  uv run --with wordfreq python3 generate-wordlist.py

Source: wordfreq (https://github.com/rspeer/wordfreq)
Strategy:
  1. Pull top ~100K English words ranked by frequency
  2. Filter: alphabetic only, lowercase, 4–10 chars
  3. Remove offensive / inappropriate words
  4. Keep homophones and plurals (user decision)
  5. Take exactly 32,768 (2^15) → 15 bits per word
  6. Output as TypeScript array

Target: 32,768 words × 5 words = 75 bits per code.
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
# Offensive / inappropriate word blocklist
# ---------------------------------------------------------------------------
# Conservative blocklist — words that would be inappropriate in a
# family-friendly cat game settings code.  This is intentionally broad.

BLOCKLIST: set[str] = {
    # Slurs and hate speech (abbreviated to avoid reproducing)
    "anal", "anus", "arse", "arses", "asshole", "assholes",
    "bastard", "bastards", "bitch", "bitches", "bitchy",
    "blowjob", "boner", "boob", "boobs", "booby",
    "brothel", "butt", "butts",
    "chink", "clit", "cock", "cocks", "coon", "crap", "crappy",
    "cum", "cums", "cunt", "cunts",
    "damn", "damned", "dammit", "dick", "dicks", "dildo",
    "douche", "dyke",
    "ejaculate", "erection",
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
    "labia", "lesbo", "lezzy", "loser", "losers", "lust",
    "meth", "milf", "molest", "moron", "morons",
    "nazi", "nazis", "negro", "nigga", "nigger", "nipple", "nipples",
    "nude", "nudes", "nudity",
    "orgasm", "orgy",
    "pedo", "penis", "pervert", "perverts", "piss", "pissed",
    "pimp", "pimps", "porn", "porno", "prostitute", "pubic",
    "pussy", "pussies",
    "queer",
    "rape", "raped", "rapist", "rectum", "retard", "retarded",
    "rimjob",
    "scrotum", "semen", "sexist", "sexy", "shit", "shits",
    "shitty", "skank", "slut", "sluts", "smut", "snatch",
    "sodomize", "sodomy", "sperm", "spic",
    "testes", "testicle", "tits", "titty", "tranny", "trash",
    "turd", "twat",
    "vagina", "vibrator", "vulva",
    "wank", "wanker", "whore", "whores",
    # Drug references that feel inappropriate
    "cocaine", "heroin",
    # Death/violence that feel wrong for a cat game
    "kill", "kills", "killer", "murder", "murdered", "murders",
    "suicide", "torture", "tortured",
    # Misc inappropriate
    "slave", "slaves", "slavery",
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def generate() -> list[str]:
    """Generate the curated wordlist."""
    # Pull a large pool from wordfreq (already frequency-ranked)
    raw = top_n_list("en", 120_000)
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
    # JSON-encode the array for safe embedding
    json_array = json.dumps(words, ensure_ascii=True)

    content = f'''/**
 * Curated wordlist for portable settings encoding.
 *
 * 65,536 words (2^16) → 16 bits per word.
 * Source: wordfreq top English words, filtered for:
 *   - Alphabetic only, lowercase, 4–10 characters
 *   - Offensive/inappropriate words removed
 *   - Sorted by word frequency (most common first)
 *
 * DO NOT EDIT MANUALLY — generated by scripts/generate-wordlist.py
 * Regenerate: uv run --with wordfreq python3 lib/portable-settings/scripts/generate-wordlist.py
 */

export const WORDLIST_V2: readonly string[] = {json_array} as const;
'''

    outpath.write_text(content)
    size_kb = outpath.stat().st_size / 1024
    print(f"Wrote {outpath} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    words = generate()
    script_dir = Path(__file__).parent
    out = script_dir.parent / "wordlist-v2.ts"
    write_typescript(words, out)
    print("Done!")
