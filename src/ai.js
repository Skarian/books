const fs = require("fs");
const path = require("path");
const config = require("./config");

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
const CODEX_URL = "https://chatgpt.com/backend-api/codex/responses";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const CLAIM = "https://api.openai.com/auth";

function enabled() {
  return ["codex", "openai"].includes(config.aiProvider);
}

function text(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function decodeJwt(token) {
  const payload = String(token || "").split(".")[1];
  if (!payload) return {};
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function expiresSoon(token) {
  const exp = Number(decodeJwt(token).exp || 0);
  return exp > 0 && exp * 1000 < Date.now() + 60_000;
}

function codexAccountId(token) {
  const accountId = decodeJwt(token)[CLAIM]?.chatgpt_account_id;
  if (!accountId) throw new Error("Codex access token has no ChatGPT account id.");
  return accountId;
}

async function codexToken() {
  const file = path.join(config.codexHome, "auth.json");
  const auth = JSON.parse(fs.readFileSync(file, "utf8"));
  const tokens = auth.tokens || {};
  if (!tokens.access_token || !tokens.refresh_token) throw new Error("Codex auth.json is not logged in.");
  if (!expiresSoon(tokens.access_token)) return tokens.access_token;

  const response = await fetch(CODEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: CODEX_CLIENT_ID
    }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Codex token refresh failed: ${response.status}`);
  const next = await response.json();
  if (!next.access_token || !next.refresh_token) throw new Error("Codex token refresh response was incomplete.");
  auth.tokens = { ...tokens, ...next };
  auth.last_refresh = new Date().toISOString();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  return auth.tokens.access_token;
}

function promptFor(input) {
  const selection = text(input.selection, 500);
  const passage = text(input.passage, 1800);
  if (!selection) throw new Error("Missing selection.");
  if (!passage) throw new Error("Missing passage.");
  return `Return only JSON for a compact dictionary popup entry.\n\nSchema: {"label":"short category","definitions":["definition","optional second definition"]}\n\nThe passage is the local text around the reader's selected word or phrase. Use it to understand the immediate meaning and role of the selection, and do your best not to reveal later plot details beyond the reader progress.\n\nLabel rules: Make the label a short dictionary or Wikipedia-style category useful to the reader. Prefer vivid book-aware categories when they fit, such as ritual object, noble house, imperial title, religious order, desert ecology, political faction, family title, invented language, or place. Use plain categories like noun, phrase, person, object, or term when they are the clearest fit.\n\nDefinition rules: Explain the selected text as used in the supplied passage. Keep definitions concise and reusable. Return one definition when that is enough; add a second only if it teaches a distinct useful meaning, role, or nuance. Do not repeat the selected text as a title. Use web search only when the book metadata and passage are insufficient.\n\nBook: ${text(input.book, 220)}\nChapter/section: ${text(input.chapter, 160)}\nProgress through book: ${text(input.progress, 80)}\n\nSelected text: ${selection}\n\nPassage: ${passage}`;
}

function dictionaryEntry(raw) {
  const parsed = JSON.parse(raw);
  const definitions = Array.isArray(parsed.definitions) ? parsed.definitions.map((item) => text(item, 500)).filter(Boolean).slice(0, 2) : [];
  const label = text(parsed.label, 80) || "term";
  if (!definitions.length) throw new Error("AI provider returned an invalid dictionary entry.");
  return { label, definitions };
}

async function collectSse(response) {
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop();
    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        try {
          answer += JSON.parse(line.slice(5)).delta || "";
        } catch {}
      }
    }
  }
  return answer.trim();
}

async function request(url, headers, input) {
  const response = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      model: config.aiModel,
      store: false,
      stream: true,
      instructions: "You are a concise reading companion. Do not spoil anything beyond the supplied passage.",
      input: [{ role: "user", content: [{ type: "input_text", text: promptFor(input) }] }],
      tools: [{ type: "web_search", external_web_access: true, search_context_size: "medium" }],
      tool_choice: "auto",
      text: { verbosity: "low" },
      reasoning: { effort: "low" }
    }),
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`AI provider request failed: ${response.status}`);
  const answer = await collectSse(response);
  if (!answer) throw new Error("AI provider returned no answer.");
  return dictionaryEntry(answer);
}

async function lookup(input) {
  if (!enabled()) throw new Error("AI dictionary is not enabled.");
  if (config.aiProvider === "openai") {
    if (!config.openaiApiKey) throw new Error("OPENAI_API_KEY is not configured.");
    return request(OPENAI_URL, { Authorization: `Bearer ${config.openaiApiKey}` }, input);
  }
  const token = await codexToken();
  return request(CODEX_URL, {
    Authorization: `Bearer ${token}`,
    "chatgpt-account-id": codexAccountId(token),
    "OpenAI-Beta": "responses=experimental",
    originator: "books"
  }, input);
}

module.exports = { enabled, lookup };
