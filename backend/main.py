"""SignLink AI backend: history, translation, SOS alerts to emergency contacts. Also serves ../frontend."""
import asyncio, csv, io, json, os, re, sqlite3, time
from contextlib import contextmanager
from pathlib import Path
from typing import List

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "data" / "signlink.db"
FRONTEND = BASE.parent / "frontend"


def load_env():
    """Tiny .env reader (no extra package): backend/.env first, then project-root .env. Real environment variables win."""
    for p in (BASE / ".env", BASE.parent / ".env"):
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
# tried in order until one works (model names change over time; override with GEMINI_MODEL in .env)
GEMINI_MODELS = [m for m in [os.environ.get("GEMINI_MODEL", "").strip(), "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-flash-latest"] if m]
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM = os.environ.get("TWILIO_FROM", "").strip()        # your Twilio number, or a Messaging Service SID (starts with MG)
TG_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "").strip()       # group chat that contains the bot and your emergency contacts
GEMINI_WAIT = 5.0     # seconds to wait for Gemini before using Google Translate instead

app = FastAPI(title="SignLink AI")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@contextmanager
def db():
    DB_PATH.parent.mkdir(exist_ok=True)
    con = sqlite3.connect(DB_PATH); con.row_factory = sqlite3.Row
    try:
        yield con; con.commit()
    finally:
        con.close()


with db() as c:
    c.executescript("""
    CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY, sign TEXT, sentence TEXT, created_at REAL);
    """)


# ---------- history ----------
class HistoryIn(BaseModel):
    sign: str = Field(max_length=40)
    sentence: str = Field(default="", max_length=500)


@app.get("/api/health")
def health():
    return {"ok": True, "ai": bool(GEMINI_KEY), "sms": bool(TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM), "telegram": bool(TG_TOKEN and TG_CHAT)}


@app.post("/api/history")
def add_history(h: HistoryIn):
    with db() as c:
        cur = c.execute("INSERT INTO history(sign,sentence,created_at) VALUES(?,?,?)", (h.sign, h.sentence, time.time()))
        return {"id": cur.lastrowid}


@app.get("/api/history")
def list_history(limit: int = Query(200, le=1000)):
    with db() as c:
        return [dict(r) for r in c.execute("SELECT * FROM history ORDER BY id DESC LIMIT ?", (limit,))]


@app.delete("/api/history")
def clear_history():
    with db() as c:
        c.execute("DELETE FROM history")
    return {"ok": True}


@app.get("/api/history/export")
def export_history():
    buf = io.StringIO(); w = csv.writer(buf); w.writerow(["sign", "sentence", "time"])
    with db() as c:
        for r in c.execute("SELECT * FROM history ORDER BY id"):
            w.writerow([r["sign"], r["sentence"], time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(r["created_at"]))])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=signlink_history.csv"})


# ---------- translation ----------
CACHE: dict = {}      # (kind, text, target) -> result ; repeated requests are instant


RETRYABLE = {429, 500, 502, 503, 504}      # busy / rate-limited / server hiccup -> worth another try
def why(r) -> str:
    """Google's own explanation of an error response, shortened"""
    try:
        e = r.json()["error"]; return f"{e.get('status','')} {e.get('message','')}".strip()[:180]
    except Exception:
        return (r.text or "")[:180]


RETRY_DELAY = 0.7                            # seconds between tries
GEMINI_BUDGET = 24.0                         # never spend longer than this on one request


async def gemini(prompt: str, max_tokens: int = 256):
    """-> (text, error). Retries busy/timeout errors, then tries the next model (separate capacity and quota).
    Stops at once for errors that retrying can't fix (bad key, bad request)."""
    if not GEMINI_KEY:
        return "", "GEMINI_API_KEY is empty - add it to backend/.env and restart the backend"
    last, deadline = "", time.monotonic() + GEMINI_BUDGET
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=4.0)) as client:
        for model in GEMINI_MODELS:
            cfg = {"temperature": 0, "maxOutputTokens": max_tokens}
            if model.startswith("gemini-2.5-flash") and "lite" not in model:
                cfg["thinkingConfig"] = {"thinkingBudget": 0}          # thinking = slow; not needed here
            for attempt in range(3):
                if time.monotonic() > deadline:
                    print("GEMINI ERROR:", last or "out of time"); return "", last or "out of time"
                try:
                    r = await client.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                        headers={"x-goog-api-key": GEMINI_KEY, "content-type": "application/json"},
                        json={"contents": [{"parts": [{"text": prompt}]}], "generationConfig": cfg})
                except Exception as e:                                    # timeout / connection hiccup
                    last = f"{model}: {type(e).__name__} (slow or no connection)"
                    if attempt < 1:
                        await asyncio.sleep(RETRY_DELAY); continue
                    break                                                 # give up on this model -> next
                if r.status_code == 400 and "thinkingConfig" in cfg:
                    cfg.pop("thinkingConfig"); continue                   # model doesn't accept it: retry plain
                if r.status_code == 404:
                    last = f"{model}: not found"; break
                if r.status_code in RETRYABLE:
                    last = f"{model}: HTTP {r.status_code} {why(r)}"
                    if attempt < 1:
                        await asyncio.sleep(RETRY_DELAY); continue
                    break
                if r.status_code != 200:                                  # 400/401/403: key or request problem
                    last = f"{model}: HTTP {r.status_code} {why(r)}"; print("GEMINI ERROR:", last); return "", last
                try:
                    text = "".join(p.get("text", "") for p in r.json()["candidates"][0]["content"]["parts"]).strip().strip('"')
                except Exception:
                    text = ""
                if text:
                    return text, ""
                last = f"{model}: empty answer"; break
    print("GEMINI ERROR:", last)
    return "", last


@app.get("/api/ai-test")
async def ai_test():
    """Open http://localhost:8000/api/ai-test in the browser: shows, per model, whether Gemini answers and Google's exact error."""
    if not GEMINI_KEY:
        return {"key_loaded": False, "hint": "GEMINI_API_KEY is empty - put it in backend/.env and restart the backend"}
    out = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=4.0)) as client:
        for model in GEMINI_MODELS:
            t0 = time.monotonic()
            try:
                r = await client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                                      headers={"x-goog-api-key": GEMINI_KEY, "content-type": "application/json"},
                                      json={"contents": [{"parts": [{"text": "Reply with the single word: ok"}]}], "generationConfig": {"maxOutputTokens": 20}})
                out.append({"model": model, "http": r.status_code, "seconds": round(time.monotonic() - t0, 1),
                            "result": "WORKS" if r.status_code == 200 else why(r)})
            except Exception as e:
                out.append({"model": model, "http": None, "seconds": round(time.monotonic() - t0, 1), "result": type(e).__name__ + " (slow or no connection)"})
    return {"key_loaded": True, "key_ends_with": GEMINI_KEY[-4:], "models": out}


LANGS = {"te": "Telugu", "hi": "Hindi", "ta": "Tamil", "kn": "Kannada", "ml": "Malayalam", "bn": "Bengali",
         "es": "Spanish", "fr": "French", "de": "German"}


class TranslateIn(BaseModel):
    text: str = Field(max_length=500)
    target: str = Field(pattern=r"^[a-z]{2}(-[A-Z]{2})?$")


def usable(t: str, src: str) -> bool:
    """reject empty text, echoes of the input, MyMemory warnings, and answers that ramble far beyond the source"""
    t = (t or "").strip()
    if not t or t.lower() == src.strip().lower() or t.upper().startswith(("MYMEMORY WARNING", "INVALID", "PLEASE SELECT", "QUERY LENGTH")):
        return False
    return len(t.split()) <= len(src.split()) * 3 + 4


async def google_tr(text: str, target: str):
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(6.0, connect=3.0)) as client:
            r = await client.get("https://translate.googleapis.com/translate_a/single",
                                 params={"client": "gtx", "sl": "en", "tl": target, "dt": "t", "q": text})
        r.raise_for_status()
        return "".join(seg[0] for seg in r.json()[0] if seg[0]), ""
    except Exception as e:
        return "", f"google: {type(e).__name__}"


async def mymemory_tr(text: str, target: str):
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(6.0, connect=3.0)) as client:
            r = await client.get("https://api.mymemory.translated.net/get", params={"q": text, "langpair": f"en|{target}"})
        return r.json()["responseData"]["translatedText"], ""
    except Exception as e:
        return "", f"mymemory: {type(e).__name__}"


@app.post("/api/translate")
async def translate(t: TranslateIn):
    """Gemini and Google run IN PARALLEL. Gemini's answer is used if it arrives within GEMINI_WAIT seconds (better with names),
    otherwise Google's. MyMemory is the last resort. Results are cached."""
    key = ("t", t.text, t.target)
    if key in CACHE:
        return CACHE[key]
    errors = []
    lang = LANGS.get(t.target.split("-")[0], t.target)
    g_task = asyncio.create_task(gemini(
        f"Translate the English text inside <text> tags into {lang}. Translate exactly what is written: do NOT add, explain or expand anything. "
        f"If it is a single word or a name, give just that word (names transliterated into {lang} script). "
        f"Output ONLY the {lang} translation.\n<text>{t.text}</text>", 300)) if GEMINI_KEY else None
    goog = asyncio.create_task(google_tr(t.text, t.target))
    if g_task:
        try:
            out, err = await asyncio.wait_for(g_task, GEMINI_WAIT)
        except asyncio.TimeoutError:
            out, err = "", "gemini: too slow"
        if usable(out, t.text):
            goog.cancel(); res = {"translation": out, "engine": "gemini"}; CACHE[key] = res; return res
        errors.append("gemini: " + (err or "unusable result"))
    out, err = await goog
    if usable(out, t.text):
        res = {"translation": out, "engine": "google"}; CACHE[key] = res; return res
    errors.append(err or "google: unusable result")
    out, err = await mymemory_tr(t.text, t.target)
    if usable(out, t.text):
        res = {"translation": out, "engine": "mymemory"}; CACHE[key] = res; return res
    errors.append(err or ("mymemory: " + out[:60]))
    print("TRANSLATE ERROR:", errors)
    raise HTTPException(502, " | ".join(errors))


# ---------- SOS: automatic alerts to emergency contacts ----------
class Contact(BaseModel):
    name: str = Field(default="", max_length=40)
    phone: str = Field(max_length=25)


class SosIn(BaseModel):
    sender: str = Field(default="", max_length=40)
    message: str = Field(max_length=300)
    location: str = Field(default="", max_length=200)
    contacts: List[Contact] = Field(default_factory=list, max_length=5)     # max 5 emergency contacts
    country_code: str = Field(default="+91", max_length=5)


def norm_phone(raw: str, cc: str = "+91"):
    """-> '+919876543210' or None if it can't be a phone number"""
    s = re.sub(r"[^\d+]", "", raw or "")
    if s.startswith("00"):
        s = "+" + s[2:]
    if not s.startswith("+"):
        s = (cc if cc.startswith("+") else "+" + cc) + s.lstrip("0")
    return s if re.fullmatch(r"\+\d{8,15}", s) else None


SOS_LOG: dict = {}      # ip -> [timestamps]   (stops accidental floods / abuse of the SMS endpoint)
SOS_LIMIT, SOS_WINDOW = 8, 600


async def twilio_sms(client, to: str, body: str):
    data = {"To": to, "Body": body}
    data["MessagingServiceSid" if TWILIO_FROM.startswith("MG") else "From"] = TWILIO_FROM
    r = await client.post(f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json", data=data, auth=(TWILIO_SID, TWILIO_TOKEN))
    if r.status_code in (200, 201):
        return True, ""
    try:
        return False, r.json().get("message", f"HTTP {r.status_code}")[:160]
    except Exception:
        return False, f"HTTP {r.status_code}"


async def telegram_msg(client, body: str):
    r = await client.post(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", json={"chat_id": TG_CHAT, "text": body})
    if r.status_code == 200:
        return True, ""
    try:
        return False, r.json().get("description", f"HTTP {r.status_code}")[:160]
    except Exception:
        return False, f"HTTP {r.status_code}"


@app.post("/api/sos")
async def sos(body: SosIn, request: Request):
    """Sends the alert automatically: SMS to every contact (Twilio) and/or one message to a Telegram group. No channel configured -> channels=[]."""
    ip = request.client.host if request.client else "?"
    now = time.time(); hits = [t for t in SOS_LOG.get(ip, []) if now - t < SOS_WINDOW]
    if len(hits) >= SOS_LIMIT:
        raise HTTPException(429, "too many SOS requests - wait a few minutes")
    SOS_LOG[ip] = hits + [now]
    who = body.sender.strip() or "Someone"
    text = f"🚨 SOS from {who}: {body.message}" + (f"\n📍 Location: {body.location}" if body.location else "") + "\n— sent by SignLink AI"
    results, channels = [], []
    async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=4.0)) as client:
        if TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM:
            channels.append("sms")
            for ct in body.contacts:
                num = norm_phone(ct.phone, body.country_code)
                if not num:
                    results.append({"name": ct.name or ct.phone, "channel": "sms", "ok": False, "error": "invalid phone number"}); continue
                try:
                    ok, err = await twilio_sms(client, num, text)
                except Exception as e:
                    ok, err = False, type(e).__name__
                results.append({"name": ct.name or ct.phone, "channel": "sms", "ok": ok, **({"error": err} if err else {})})
        if TG_TOKEN and TG_CHAT:
            channels.append("telegram")
            try:
                ok, err = await telegram_msg(client, text)
            except Exception as e:
                ok, err = False, type(e).__name__
            results.append({"name": "Telegram group", "channel": "telegram", "ok": ok, **({"error": err} if err else {})})
    print("SOS:", [(r["name"], r["channel"], r["ok"], r.get("error", "")) for r in results])
    return {"channels": channels, "results": results}


# frontend (must be last)
app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
