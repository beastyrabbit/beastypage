# Games migration area

The games slice is served by the PostgreSQL game service and routes.

| Feature or operation | Current implementation |
| --- | --- |
| Register Perfect Cats | `POST /api/perfect-cats/register` calls `registerPerfectCats` |
| Request a Perfect Cats matchup | `POST /api/perfect-cats/matchup` calls `requestPerfectMatchup` |
| Submit a Perfect Cats vote | `POST /api/perfect-cats/vote` calls `submitPerfectVote` |
| Perfect Cats leaderboard | `GET /api/perfect-cats/leaderboard` calls `perfectLeaderboard` |
| Expired Perfect Cats matchups | `perfect-matchup.retention` calls `cleanupPerfectMatchups` hourly |
| Coinflip leaderboard and scores | `GET /api/coinflip/leaderboard` and `GET /api/coinflip/scores`; `coinflipLeaderboard` and `coinflipScores` |
| Submit a Coinflip score | `POST /api/coinflip/score` calls `submitCoinflipScore` |
| Log a wheel spin and read statistics | `POST /api/wheel/spin` and `GET /api/wheel/stats`; `logWheelSpin` and `wheelStats` |

Matchup voting and wheel rate limits run in serializable PostgreSQL
transactions. Matchup rows and both cat rows are locked before a vote is
consumed, so concurrent submissions count once. The retention job removes at
most 100 expired capabilities per invocation.

Perfect-cat sampling keeps creation order for the bounded base sample, and
wheel prize records expose `forcedCount` in each prize summary. The stream
wheel endpoint is documented in the stream area.
