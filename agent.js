const Groq = require("groq-sdk");

// ─── Config ─────────────────────────────────────────────────────────────────
const LEAGUE_ID = 1;        // FIFA World Cup, per API-Football
const SEASON = 2026;        // 2026 edition (USA / Canada / Mexico)
const TIMEZONE = "Africa/Johannesburg";
const API_BASE = "https://v3.football.api-sports.io";

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

// ─── Helpers ────────────────────────────────────────────────────────────────

// Returns YYYY-MM-DD for a given Date, in the target timezone (en-CA locale
// formats as YYYY-MM-DD natively, which saves a manual string-build step).
function localDateString(date, timeZone = TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

function localTimeString(date, timeZone = TIMEZONE) {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// ─── Fetch fixtures from API-Football ──────────────────────────────────────
async function fetchFixtures(fromDate, toDate) {
  const url = `${API_BASE}/fixtures?league=${LEAGUE_ID}&season=${SEASON}&from=${fromDate}&to=${toDate}`;
  const res = await fetch(url, {
    headers: { "x-apisports-key": FOOTBALL_API_KEY },
  });

  if (!res.ok) {
    throw new Error(`API-Football request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API-Football returned errors: ${JSON.stringify(data.errors)}`);
  }

  return data.response || [];
}

// ─── Build digest ───────────────────────────────────────────────────────────
async function buildDigest() {
  const now = new Date();
  const todayStr = localDateString(now);
  const yesterdayStr = localDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  // API-Football's from/to filter is date-based; fetching a 2-day window and
  // then re-bucketing by local (SAST) calendar date keeps results accurate
  // even for matches close to the UTC day boundary.
  const fixtures = await fetchFixtures(yesterdayStr, todayStr);

  const resultsYesterday = [];
  const fixturesToday = [];

  for (const f of fixtures) {
    const kickoff = new Date(f.fixture.date);
    const localDay = localDateString(kickoff);
    const home = f.teams.home.name;
    const away = f.teams.away.name;
    const round = f.league.round || "";

    if (localDay === yesterdayStr && FINISHED_STATUSES.has(f.fixture.status.short)) {
      resultsYesterday.push(
        `${home} ${f.goals.home} - ${f.goals.away} ${away} (${round})`
      );
    } else if (localDay === todayStr) {
      const time = localTimeString(kickoff);
      const venue = f.fixture.venue?.city ? `, ${f.fixture.venue.city}` : "";
      const status = FINISHED_STATUSES.has(f.fixture.status.short)
        ? `FT ${f.goals.home}-${f.goals.away}`
        : `${time} SAST`;
      fixturesToday.push(`${status} - ${home} vs ${away} (${round}${venue})`);
    }
  }

  if (resultsYesterday.length === 0 && fixturesToday.length === 0) {
    console.log("No World Cup matches yesterday or today — skipping Teams post.");
    return null;
  }

  const groq = new Groq({ apiKey: GROQ_API_KEY });

  const dayLabel = new Intl.DateTimeFormat("en-ZA", {
    timeZone: TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);

  const rawData = `
Date: ${dayLabel}

YESTERDAY'S RESULTS:
${resultsYesterday.length ? resultsYesterday.join("\n") : "(none)"}

TODAY'S FIXTURES:
${fixturesToday.length ? fixturesToday.join("\n") : "(none)"}
`.trim();

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content:
          "You are putting together a short daily FIFA World Cup 2026 digest for a Microsoft Teams channel. " +
          "Format the message in plain text/Markdown suitable for Teams (no HTML). " +
          "Use a short headline, then a 'Yesterday's Results' section and a 'Today's Fixtures' section " +
          "(omit a section entirely if it has no data). Use football emoji sparingly (⚽ 🟢 🏆). " +
          "Keep it scannable — one line per match. No preamble, no sign-off, just the digest.",
      },
      { role: "user", content: rawData },
    ],
  });

  return completion.choices[0].message.content;
}

// ─── Post to Teams ──────────────────────────────────────────────────────────
async function postToTeams(text) {
  const payload = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    summary: "World Cup Daily Digest",
    themeColor: "00A86B",
    text,
  };

  const res = await fetch(TEAMS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Teams webhook failed: ${res.status} ${body}`);
  }

  console.log("Posted World Cup digest to Teams.");
}

// ─── Main ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    if (!FOOTBALL_API_KEY) throw new Error("Missing FOOTBALL_API_KEY env var");
    if (!GROQ_API_KEY) throw new Error("Missing GROQ_API_KEY env var");
    if (!TEAMS_WEBHOOK_URL) throw new Error("Missing TEAMS_WEBHOOK_URL env var");

    const digest = await buildDigest();
    if (digest) {
      await postToTeams(digest);
    }
  } catch (err) {
    console.error("Agent failed:", err.message);
    process.exit(1);
  }
})();
