# Games migration area

The games slice is served by Convex until `DATA_BACKEND=postgres`. PostgreSQL
routes preserve the existing payloads and validation limits.

| Convex function | PostgreSQL route/service |
| --- | --- |
| `perfectCats.registerCats` | `POST /api/perfect-cats/register` → `registerPerfectCats` |
| `perfectCats.requestMatchup` | `POST /api/perfect-cats/matchup` → `requestPerfectMatchup` |
| `perfectCats.submitVote` | `POST /api/perfect-cats/vote` → `submitPerfectVote` |
| `perfectCats.leaderboard` | `GET /api/perfect-cats/leaderboard` → `perfectLeaderboard` |
| `perfectCats.cleanupExpiredMatchups` | `perfect-matchup.retention` job → `cleanupPerfectMatchups` |
| `coinflipper.leaderboard` | `GET /api/coinflip/leaderboard` → `coinflipLeaderboard` |
| `coinflipper.listScores` | `GET /api/coinflip/scores` → `coinflipScores` |
| `coinflipper.submitScore` | `POST /api/coinflip/score` → `submitCoinflipScore` |
| `wheel.logSpin` | `POST /api/wheel/spin` → `logWheelSpin` |
| `wheel.stats` | `GET /api/wheel/stats` → `wheelStats` |

Matchup voting and wheel rate limits run in serializable PostgreSQL
transactions. Matchup rows and both cat rows are locked before consuming a
vote, so concurrent submissions count once. Retention runs hourly and removes
at most 100 expired capabilities per invocation.

The stream wheel functions remain in the later stream slice.
