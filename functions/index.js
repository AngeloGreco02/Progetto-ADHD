const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const openAiKey = defineSecret("OPENAI_API_KEY");
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const OPENAI_URL = "https://api.openai.com/v1/responses";

const SYSTEM_PROMPT = `
Sei il coach AI di Progetto ADHD Quest, un gioco che aiuta una persona ADHD a scegliere la prossima azione.

Rispondi sempre in italiano naturale, concreto e gentile. Non ripetere frasi generiche.
Usa il contesto della quest: titolo, scadenza, durata, energia, attrito, priorita, motivo e cronologia.

Stile:
- massimo 8 righe;
- frasi brevi, leggibili, niente muro di testo;
- dai una prima azione specifica, una micro-preparazione e un criterio di stop;
- se l'utente chiede come prepararsi, entra nel merito della quest;
- se mancano dati, fai al massimo una domanda, solo se serve davvero;
- niente diagnosi, terapia o giudizi: resta su supporto pratico, pianificazione e riduzione del carico.
`.trim();

exports.coachStatus = onRequest({ cors: true, secrets: [openAiKey] }, (req, res) => {
  res.json({
    configured: Boolean(openAiKey.value()),
    model: openAiKey.value() ? DEFAULT_MODEL : "",
  });
});

exports.coach = onRequest({ cors: true, secrets: [openAiKey], timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "METHOD_NOT_ALLOWED", message: "Usa POST." });
    return;
  }

  const apiKey = openAiKey.value();
  if (!apiKey) {
    res.status(503).json({ error: "AI_NOT_CONFIGURED", message: "Coach AI non configurato." });
    return;
  }

  try {
    const userText = String(req.body?.userText || "").trim();
    const task = typeof req.body?.task === "object" && req.body.task ? req.body.task : {};
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];

    if (!userText) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Scrivi una domanda per il coach." });
      return;
    }
    if (!task.title) {
      res.status(400).json({ error: "BAD_REQUEST", message: "Quest non trovata." });
      return;
    }

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        instructions: SYSTEM_PROMPT,
        input: JSON.stringify({
          messaggio_utente: userText,
          quest: task,
          cronologia_recente: history,
          data_locale: new Date().toISOString(),
        }),
        max_output_tokens: 520,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(502).json({ error: "OPENAI_ERROR", message: upstreamMessage(response.status, payload) });
      return;
    }

    const reply = extractOutputText(payload);
    if (!reply) {
      res.status(502).json({ error: "EMPTY_RESPONSE", message: "Risposta AI vuota." });
      return;
    }
    res.json({ reply, model: DEFAULT_MODEL });
  } catch (error) {
    res.status(502).json({
      error: "AI_REQUEST_FAILED",
      message: error?.message || "Il coach AI non ha risposto.",
    });
  }
});

function extractOutputText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text.trim();
  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
      if (content.text && typeof content.text.value === "string") chunks.push(content.text.value);
    }
  }
  return chunks.map((chunk) => chunk.trim()).filter(Boolean).join("\n");
}

function upstreamMessage(status, payload) {
  const message = payload?.error?.message || "";
  const lower = message.toLowerCase();
  if (status === 401) return "La chiave OpenAI non e valida o non e stata accettata.";
  if (status === 404) return "Il modello AI configurato non e disponibile.";
  if (status === 429) {
    if (lower.includes("quota") || lower.includes("billing") || lower.includes("insufficient")) {
      return "Quota o credito OpenAI non disponibile. Controlla piano e billing.";
    }
    return "OpenAI sta limitando temporaneamente le richieste. Riprova tra poco.";
  }
  return message || "OpenAI non ha accettato la richiesta del coach.";
}
