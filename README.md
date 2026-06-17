# World Cup Daily Digest Agent

Posts a daily message to a Microsoft Teams channel with yesterday's FIFA World Cup
2026 results and today's fixtures. Built the same way as the tech news agent:
GitHub Actions (free scheduler) + Groq (free LLM) + a Teams incoming webhook.

The 2026 World Cup runs June 11 – July 19, 2026 across the US, Canada and Mexico.
This agent will simply post nothing on days with no matches (e.g. before/after the
tournament, or rest days between rounds).

Match data comes from [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) —
a free, public, no-key-required JSON file (an earlier version of this agent used
API-Football, but its free tier turned out not to cover the current season at all).
There's no signup step for this one — `agent.js` just fetches it directly.

## 1. Get a Groq key (skip if reusing the one from the tech news agent)

1. console.groq.com → API Keys → Create API Key.
2. Set expiry to "No expiration" if offered, so you don't have to rotate it.

## 2. Get a Teams webhook URL

Microsoft retired the old "Connectors → Incoming Webhook" path in May 2026, so
use the **Workflows** app instead:

1. Go to the channel → three dots (⋯) → **Workflows**.
2. Search for the template **"Post to a channel when a webhook request is
   received"**.
3. Pick the Team and Channel → **Create flow**.
4. Copy the URL it generates.

This still accepts the same MessageCard JSON format `agent.js` already sends,
so no code changes needed — just the URL. Reuse the tech news agent's webhook
if you want both digests in one channel, or create a separate one to keep
World Cup updates in their own channel. (If the news agent's webhook was set
up via the old Connectors menu, double check it's still posting — it may need
this same migration.)

## 3. Push this repo to GitHub

```bash
git init
git add .
git commit -m "World Cup daily digest agent"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

## 4. Add your secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**.
Add both:

| Secret name | Value |
|---|---|
| `GROQ_API_KEY` | from console.groq.com |
| `TEAMS_WEBHOOK_URL` | your Teams incoming webhook URL |

## 5. Test it

Go to the **Actions** tab → **World Cup Daily Digest** → **Run workflow** to fire
it manually. Check your Teams channel for the message.

Once that works, it'll run automatically every morning at 07:30 SAST (no laptop,
no login required — same as the news agent).

## 6. After the tournament

The final is July 19, 2026. After that you can either delete the repo, or just
leave it — it'll keep running for free but post nothing once there's no World Cup
data left. To stop it without deleting anything: **Settings → Actions → General →
Disable Actions** for this repo.

## Notes / things you may want to tweak

- The data source is updated by a volunteer roughly once a day rather than truly
  live. In practice it's been fully current for every match so far this
  tournament, but if a result is genuinely missing when the agent runs, it'll
  add a one-line note to the digest rather than silently dropping it.
- Times are converted to SAST (Africa/Johannesburg) throughout.
- South Africa is actually in this World Cup (Group A, with Mexico, South Korea
  and Czech Republic) — want a "how are Bafana Bafana doing" line front and
  center? Easy add: filter for matches involving "South Africa" and mention it
  explicitly in the Groq prompt.
