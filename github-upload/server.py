#!/usr/bin/env python3
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, request
import json
import os


ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8123"))
OPENAI_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5-mini")

SYSTEM_PROMPT = """
Sei il coach AI di Progetto ADHD Quest, un gioco che aiuta una persona ADHD a scegliere la prossima azione.

Rispondi sempre in italiano naturale, concreto e gentile. Non ripetere frasi generiche.
Usa il contesto della quest: titolo, scadenza, durata, energia, attrito, priorità, motivo e cronologia.

Stile:
- massimo 8 righe;
- frasi brevi, leggibili, niente muro di testo;
- dai una prima azione specifica, una micro-preparazione e un criterio di stop;
- se l'utente chiede come prepararsi, entra nel merito della quest;
- se mancano dati, fai al massimo una domanda, solo se serve davvero;
- niente diagnosi, terapia o giudizi: resta su supporto pratico, pianificazione e riduzione del carico.

Formato consigliato:
Prima: ...
Prepara: ...
Occhio a: ...
Dopo: ...
""".strip()


class CoachHandler(SimpleHTTPRequestHandler):
  def __init__(self, *args, **kwargs):
    super().__init__(*args, directory=str(ROOT), **kwargs)

  def do_OPTIONS(self):
    self.send_response(204)
    self.end_headers()

  def do_GET(self):
    if self.path.split("?")[0] == "/api/coach/status":
      self._send_json(
        200,
        {
          "configured": bool(os.environ.get("OPENAI_API_KEY")),
          "model": DEFAULT_MODEL if os.environ.get("OPENAI_API_KEY") else "",
        },
      )
      return
    super().do_GET()

  def do_POST(self):
    if self.path.split("?")[0] != "/api/coach":
      self.send_error(404)
      return

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
      self._send_json(
        503,
        {
          "error": "AI_NOT_CONFIGURED",
          "message": "Coach AI non configurato: manca OPENAI_API_KEY.",
        },
      )
      return

    try:
      body = self._read_json()
      reply = ask_openai(api_key, body)
      self._send_json(200, {"reply": reply, "model": DEFAULT_MODEL})
    except ValueError as exc:
      self._send_json(400, {"error": "BAD_REQUEST", "message": str(exc)})
    except error.HTTPError as exc:
      self._send_json(502, {"error": "OPENAI_ERROR", "message": upstream_message(exc)})
    except Exception:
      self._send_json(
        502,
        {
          "error": "AI_REQUEST_FAILED",
          "message": "Il coach AI non ha risposto. Riprova tra poco.",
        },
      )

  def _read_json(self):
    length = int(self.headers.get("Content-Length", "0"))
    if length <= 0:
      raise ValueError("Richiesta vuota.")
    if length > 100_000:
      raise ValueError("Richiesta troppo grande.")
    raw = self.rfile.read(length).decode("utf-8")
    try:
      return json.loads(raw)
    except json.JSONDecodeError as exc:
      raise ValueError("JSON non valido.") from exc

  def _send_json(self, status, payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(data)))
    self.end_headers()
    self.wfile.write(data)


def ask_openai(api_key, body):
  user_text = str(body.get("userText", "")).strip()
  task = body.get("task") if isinstance(body.get("task"), dict) else {}
  history = body.get("history") if isinstance(body.get("history"), list) else []

  if not user_text:
    raise ValueError("Scrivi una domanda per il coach.")
  if not task.get("title"):
    raise ValueError("Quest non trovata.")

  coach_input = {
    "messaggio_utente": user_text,
    "quest": task,
    "cronologia_recente": history[-8:],
    "data_locale": datetime.now().astimezone().isoformat(timespec="minutes"),
  }
  payload = {
    "model": DEFAULT_MODEL,
    "instructions": SYSTEM_PROMPT,
    "input": json.dumps(coach_input, ensure_ascii=False),
    "max_output_tokens": 520,
  }
  data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
  openai_request = request.Request(
    OPENAI_URL,
    data=data,
    headers={
      "Authorization": f"Bearer {api_key}",
      "Content-Type": "application/json",
    },
    method="POST",
  )
  with request.urlopen(openai_request, timeout=18) as response:
    result = json.loads(response.read().decode("utf-8"))
  reply = extract_output_text(result)
  if not reply:
    raise RuntimeError("Risposta vuota.")
  return reply


def extract_output_text(result):
  if isinstance(result.get("output_text"), str):
    return result["output_text"].strip()

  chunks = []
  for item in result.get("output", []):
    for content in item.get("content", []):
      text = content.get("text")
      if isinstance(text, str):
        chunks.append(text)
      elif isinstance(text, dict) and isinstance(text.get("value"), str):
        chunks.append(text["value"])
  return "\n".join(chunk.strip() for chunk in chunks if chunk.strip()).strip()


def upstream_message(exc):
  detail = exc.read().decode("utf-8", errors="replace")
  message = ""
  try:
    payload = json.loads(detail)
    message = payload.get("error", {}).get("message") or ""
  except json.JSONDecodeError:
    message = ""

  if exc.code == 401:
    return "La chiave OpenAI non è valida o non è stata accettata."
  if exc.code == 404:
    return "Il modello AI configurato non è disponibile. Puoi cambiarlo con OPENAI_MODEL."
  if exc.code == 429:
    lower = message.lower()
    if "quota" in lower or "billing" in lower or "insufficient" in lower:
      return "Quota o credito OpenAI non disponibile. Controlla piano e billing della chiave."
    return "OpenAI sta limitando temporaneamente le richieste. Riprova tra poco."
  if message:
    return message
  return "OpenAI non ha accettato la richiesta del coach."


if __name__ == "__main__":
  server = ThreadingHTTPServer(("127.0.0.1", PORT), CoachHandler)
  print(f"Progetto ADHD Quest: http://127.0.0.1:{PORT}/index.html")
  server.serve_forever()
