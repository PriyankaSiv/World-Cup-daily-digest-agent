const Groq = require("groq-sdk");

// ─── Config ─────────────────────────────────────────────────────────────────
const TIMEZONE = "Africa/Johannesburg";
// Free, public, no API key, no rate limit — a static JSON file maintained by
// the openfootball project. Updated roughly once a day by a volunteer, but
// has been fully current for every match so far in this tournament.
const DATA_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;

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

// The data source stores kickoff as e.g. "13:00 UTC-6" alongside a separate
// "date" field (the host city's local kickoff time + that city's UTC offset).
// This combines them into one real instant we can convert to any timezone.
function parseKickoff(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*UTC([+-]\d+)$/i);
  if (!m) return null;
  const [, hh, mm, offset] = m;
  const offsetNum = parseInt(offset, 10);
  const sign = offsetNum >= 0 ? "+" : "-";
  const offsetAbs = String(Math.abs(offsetNum)).padStart(2, "0");
  const iso = `${dateStr}T${hh.padStart(2, "0")}:${mm}:00${sign}${offsetAbs}:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function formatScore(home, away, score) {
  if (!score || !score.ft) return null;
  const [hFt, aFt] = score.ft;
  const pen = score.p ? ` (${score.p[0]}-${score.p[1]} pens)` : "";
  return `${home} ${hFt} - ${aFt} ${away}${pen}`;
}

// ─── Fetch fixtures ─────────────────────────────────────────────────────────
async function fetchMatches() {
  const res = await fetch(DATA_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch World Cup data: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.matches || [];
}

// ─── Build digest ───────────────────────────────────────────────────────────
async function buildDigest() {
  const now = new Date();
  const todayStr = localDateString(now);
  const yesterdayStr = localDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const matches = await fetchMatches();

  const resultsYesterday = [];
  const fixturesToday = [];
  let pendingResults = 0;

  for (const m of matches) {
    const kickoff = parseKickoff(m.date, m.time);
    if (!kickoff) continue; // skip entries with an undetermined kickoff (e.g. far-future knockout slots)
    const localDay = localDateString(kickoff);
    const round = m.round || "";

    if (localDay === yesterdayStr) {
      const line = formatScore(m.team1, m.team2, m.score);
      if (line) {
        resultsYesterday.push(`${line} (${round})`);
      } else {
        pendingResults++; // match happened yesterday SAST but no score in the data yet
      }
    } else if (localDay === todayStr) {
      const finished = formatScore(m.team1, m.team2, m.score);
      const ground = m.ground ? `, ${m.ground}` : "";
      if (finished) {
        fixturesToday.push(`FT - ${finished} (${round}${ground})`);
      } else {
        const time = localTimeString(kickoff);
        fixturesToday.push(`${time} SAST - ${m.team1} vs ${m.team2} (${round}${ground})`);
      }
    }
  }

  if (resultsYesterday.length === 0 && fixturesToday.length === 0 && pendingResults === 0) {
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

  let digest = completion.choices[0].message.content;

  if (pendingResults > 0) {
    digest += `\n\n_Note: ${pendingResults} match${pendingResults > 1 ? "es" : ""} from yesterday ` +
      `hadn't had a result entered in the data source yet at post time — check back later._`;
  }

  return digest;
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

