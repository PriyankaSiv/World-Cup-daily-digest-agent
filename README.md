# World Cup Daily Digest Agent

Posts a daily message to a Microsoft Teams channel with yesterday's FIFA World Cup
2026 results and today's fixtures. Built the same way as the tech news agent:
GitHub Actions (free scheduler) + Groq (free LLM) + a Teams incoming webhook.

The 2026 World Cup runs June 11 – July 19, 2026 across the US, Canada and Mexico.
This agent will simply post nothing on days with no matches (e.g. before/after the
tournament, or rest days between rounds).

## 1. Get a free API-Football key

1. Go to https://dashboard.api-football.com/register and sign up (no credit card
   needed for the free plan).
2. In the dashboard, copy your API key.
3. Free plan = 100 requests/day, 10/minute — this agent uses 1 request per run,
   so you're nowhere close to the limit.

## 2. Get a Groq key (skip if reusing the one from the tech news agent)

1. console.groq.com → API Keys → Create API Key.
2. Set expiry to "No expiration" if offered, so you don't have to rotate it.

## 3. Get a Teams webhook URL

Reuse the same Incoming Webhook from the tech news agent if you want both digests
in one channel, or create a new one (Teams channel → ⋯ → Connectors/Workflows →
Incoming Webhook) if you'd rather keep World Cup updates separate.

## 4. Push this repo to GitHub

```bash
git init
git add .
git commit -m "World Cup daily digest agent"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

## 5. Add your secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**.
Add all three:

| Secret name | Value |
|---|---|
| `FOOTBALL_API_KEY` | from API-Football dashboard |
| `GROQ_API_KEY` | from console.groq.com |
| `TEAMS_WEBHOOK_URL` | your Teams incoming webhook URL |

## 6. Test it

Go to the **Actions** tab → **World Cup Daily Digest** → **Run workflow** to fire
it manually. Check your Teams channel for the message.

Once that works, it'll run automatically every morning at 07:30 SAST (no laptop,
no login required — same as the news agent).

## 7. After the tournament

The final is July 19, 2026. After that you can either delete the repo, or just
leave it — it'll keep running for free but post nothing once there's no World Cup
data left for `season=2026`. To stop it without deleting anything: **Settings →
Actions → General → Disable Actions** for this repo.

## Notes / things you may want to tweak

- `agent.js` only reports **finished** matches as "yesterday's results" (status
  `FT`/`AET`/`PEN`). Matches still in progress at run time won't show a score.
- Times are converted to SAST (Africa/Johannesburg) throughout.
- Want a specific team highlighted (e.g. a "How are the Boks... er, Bafana Bafana
  doing" line)? That's an easy add — just filter fixtures by team name/ID and
  mention it in the Groq prompt.
