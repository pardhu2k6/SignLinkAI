# SignLink AI

Real-time ASL fingerspelling: **webcam → MediaPipe hand landmarks → pretrained neural net → stabiliser → text → speech.**
The model is **already included** (`frontend/model/model.json`) — no training or data recording needed.

## Run it
```bash
pip install -r backend/requirements.txt
cd backend && uvicorn main:app --reload --port 8000     # open http://localhost:8000
```
Camera needs `localhost` or HTTPS.

**Gemini key (optional, only improves translation):** open `backend/.env`, paste your key after `GEMINI_API_KEY=`, save, **restart** the backend. Get a key at https://aistudio.google.com/apikey. To test it open `http://localhost:8000/api/ai-test`. Without a key, translation still works through Google's free endpoint. Open the app via `http://localhost:8000`.
Static-only (no backend): just deploy `frontend/` to Netlify — everything except AI sentence/history-on-server still works.

## Structure
```
frontend/   index.html, css/, js/ (tracker, classifier, pages), model/model.json, signs/*.svg
backend/    main.py  (FastAPI: history, AI sentence, translate; also serves frontend)
ml/         build_pretrained.py (how the model was made), features.py, make_sign_images.py, test_parity.py
```

## What it recognises (honest numbers)
- **24 static letters** (A–Y except J) from a pretrained model: **91.3 %** on a different dataset (other people/camera), ~0.15 ms per prediction. Weakest: **M (≈49 % recall), N, D**, then P/Q.
- **J and Z (motion)**: make the pose (J = only little finger up, Z = only index finger up), then draw a **big** J / Z in the air (at least ~half a palm wide). If the pose was first accepted as I / D / L…, the J/Z replaces it. A failed attempt shows a hint ("draw bigger / slower"). Backup: the **+J / +Z** buttons. Pose gate checked on real hand data: I→J pose 93–95 %, Z pose 85–93 %. Matching calibrated on 400 simulated sloppy drawings per letter (99.8 % Z, 100 % J accepted; circles, waves, N, 7, ✓ rejected) A cyan trail shows what the camera sees. Matching is geometric (no training needed), works for left or right hand, and is tested on simulated hands (`node tests/motion.test.mjs`, `node tests/engine.test.mjs`, `node tests/shape_calibration.mjs`; UI flows: `cd tests/dom && npm i && npm test`) — **not yet on a real camera**, so tune `MATCH_MAX` in `js/motion.js` if it is too strict/loose.
- Tips: good light, plain background, hand fully in frame, palm toward camera, hold steady.

## Features
- **Form Sentence** (no AI): offline formatting — fixes spacing for text typed without spaces (`ILOVEYOU → I love you.`), capitalises, adds `.`/`?`, keeps unknown words as names. Plus manual buttons: Sentence case, Title Case, lower, UPPER, `.` `?` `!`, Split words.
- **Speech** reads text as words/names (not letter by letter). Voice uses `en-IN` when available.
- **Translation**: with a Gemini key it uses Gemini first (best for Hindi/Telugu/Tamil etc., and transliterates names), then Google's public endpoint, then MyMemory; useless results (echoes, quota warnings) are rejected and the reason is shown, can speak the result in that language, and has an "Open in Google Translate" button. Needs internet; Telugu/Hindi/etc. voices depend on what your device has installed.
- **SOS**: Need Help, Medical, Call Police, Fire, Can't Breathe, I am Lost → full-screen alert, spoken message, call button (India: 112/108/100/101 — change in `js/sos.js`), map link for "I am Lost".
- **Emergency contacts (up to 5)**: SOS menu → *Emergency contacts*. Saved in the browser. Tapping an SOS option alerts them with your name, message and location:
  - **Automatic**: needs a channel configured in `backend/.env` (see below) and the backend running.
  - **No channel configured**: you get one-tap WhatsApp / SMS buttons per contact (browsers are not allowed to send SMS silently).

### Setting up automatic SOS alerts (pick one or both)
**Telegram group (free)**: 1) In Telegram open **@BotFather** → `/newbot` → copy the token → `TELEGRAM_BOT_TOKEN=`. 2) Create a group with your emergency contacts and add the bot. 3) In the group send `/start@YourBotName`, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `"chat":{"id":-100…}` → `TELEGRAM_CHAT_ID=`. 4) Restart the backend, press **Send test alert** in the contacts screen.
**SMS via Twilio (paid; trial only texts numbers you verified)**: fill `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (your Twilio number). Delivery to Indian numbers can need extra registration — test with **Send test alert**.
The backend limits SOS to 5 contacts per alert and 8 alerts / 10 min per IP. Don't expose it publicly without adding login.

## Learn page images
`frontend/signs/photos/A.jpg … Z.jpg` are cropped from the ASL chart you supplied (Gérard Aflague Collection — © its owner; fine for your own project/demo, check permission before publishing commercially). `signs/*.svg` are fallback drawings.

## Rebuild the model (optional)
```bash
git clone --depth 1 https://github.com/AkramOM606/American-Sign-Language-Detection ml/data/akram
git clone --depth 1 https://github.com/EvaNathani/SignBridge ml/data/eva    # optional, accuracy check only
cd ml && pip install -r requirements.txt && python build_pretrained.py
python make_sign_images.py     # regenerates signs/*.svg
```
