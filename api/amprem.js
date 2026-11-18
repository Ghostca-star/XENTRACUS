// ============================================================
// AM PREM API - Hobby Plan Edition (10s timeout safe)
// 
// Public:
//   GET  /                      → info
//
// Auth required:
//   POST /api/send-link         → kirim magic link manual
//   POST /api/verify-link       → verifikasi magic link manual
//
// Auto-generate (split step, tiap call <5s):
//   POST /api/gen-start         → bikin mailbox + kirim link
//                                 return {email, token}
//   POST /api/gen-check         → cek inbox pakai token
//                                 return {status, magicLink?, result?}
// ============================================================

// ---------- CONFIG ----------
const BASE_URL = "https://am-premium-hanzz.vercel.app";
const FN_SEND = "25d7ce74f235572d2a1c16bd9ad28b886affdf03cb809065045a8925c7206950";
const FN_VERIFY = "0b242e6b2deb78eb17b2d0f566d63a0314db7bc98fbb81c7afbabbf756853be5";

const BASE_SATRIAM = "https://satriam.satriadeveloperz.workers.dev";
const TEMPMAIL_API = "https://web2.temp-mail.org";

const UA = "Mozilla/5.0 (Linux; Android 14; TECNO KL4 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/157.0.8103.5 Mobile Safari/537.36";

const HEADERS_AM = {
  "User-Agent": UA,
  "Referer": `${BASE_URL}/aktivasi`,
  "Origin": BASE_URL,
  "Content-Type": "application/json"
};

const HEADERS_TM = {
  "accept": "application/json, text/plain, */*",
  "content-type": "application/json",
  "origin": "https://temp-mail.org",
  "referer": "https://temp-mail.org/",
  "user-agent": UA
};

// ---------- AUTH ----------
function validateApiKey(req) {
  const auth = req.headers.authorization || "";
  const key = auth.replace(/^Bearer\s+/i, "").trim();
  if (!key) return { valid: false, error: "API key missing" };

  const validKeys = (process.env.API_KEYS || "")
    .split(",").map(k => k.trim()).filter(Boolean);
  const masterKey = process.env.MASTER_KEY || "";

  if (masterKey && key === masterKey) return { valid: true, tier: "master" };
  if (validKeys.includes(key)) return { valid: true, tier: "user" };
  return { valid: false, error: "Invalid API key" };
}

function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ---------- HELPERS: AM PREMIUM ----------
async function kirimLinkAM(email) {
  const payload = {
    t: {
      t: 10, i: 0,
      p: {
        k: ["data"],
        v: [{ t: 10, i: 1, p: { k: ["email"], v: [{ t: 1, s: email }] }, o: 0 }]
      }, o: 0
    },
    f: 127, m: []
  };
  const r = await fetch(`${BASE_URL}/_serverFn/${FN_SEND}`, {
    method: "POST", headers: HEADERS_AM, body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`Upstream send error ${r.status}`);
  return true;
}

async function verifikasiLinkAM(email, magicLink) {
  const payload = {
    t: {
      t: 10, i: 0,
      p: {
        k: ["data"],
        v: [{
          t: 10, i: 1,
          p: { k: ["email", "magicLink"], v: [{ t: 1, s: email }, { t: 1, s: magicLink }] },
          o: 0
        }]
      }, o: 0
    },
    f: 127, m: []
  };
  const r = await fetch(`${BASE_URL}/_serverFn/${FN_VERIFY}`, {
    method: "POST", headers: HEADERS_AM, body: JSON.stringify(payload)
  });
  const text = await r.text();
  const ok = r.ok && (text.toLowerCase().includes("uid") || text.toLowerCase().includes("success"));
  return { ok, raw: text.slice(0, 500) };
}

// ---------- HELPERS: TEMP-MAIL ----------
async function tmRequest(method, path, token, body) {
  const headers = { ...HEADERS_TM };
  if (token) headers.authorization = `Bearer ${token}`;
  const opts = { method: method.toUpperCase(), headers };
  if (method.toUpperCase() === "POST") opts.body = JSON.stringify(body || {});
  const r = await fetch(`${TEMPMAIL_API}${path}`, opts);
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, code: r.status, data };
}

async function createTempMail() {
  const r = await tmRequest("POST", "/mailbox", null, {});
  if (!r.ok) throw new Error(`Gagal bikin mailbox: ${JSON.stringify(r.data)}`);
  return { email: r.data.mailbox, token: r.data.token };
}

async function getInbox(token) {
  const r = await tmRequest("GET", "/messages", token);
  return r.ok ? (r.data.messages || []) : [];
}

async function readMsg(token, id) {
  const r = await tmRequest("GET", `/messages/${id}`, token);
  return r.ok ? r.data : null;
}

async function sendSatriam(email) {
  const r = await fetch(`${BASE_SATRIAM}/api/satriam/send-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": UA },
    body: JSON.stringify({ email })
  });
  return r.json();
}

async function verifySatriam(email, magicLink) {
  const r = await fetch(`${BASE_SATRIAM}/api/satriam/verify-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": UA },
    body: JSON.stringify({ email, magicLink })
  });
  return r.json();
}

function extractMagicLink(detail) {
  const body = `${detail.bodyPreview || ""}\n${detail.bodyHtml || ""}`;
  const links = body.match(/https?:\/\/[^\s"'<>]+/g) || [];
  for (const link of links) {
    if (
      (link.includes("alight-creative.firebaseapp.com") ||
       link.includes("alightcreative.com")) &&
      (link.includes("signInWithEmailLink") || link.includes("auth_action"))
    ) {
      return link.replace(/&amp;/g, "&");
    }
  }
  return null;
}

// ---------- ROUTE HANDLERS ----------

async function handleInfo(req, res) {
  return res.status(200).json({
    success: true,
    service: "AM PREM API",
    version: "1.1.0-hobby",
    routes: {
      public: ["GET /"],
      auth: [
        "POST /api/send-link",
        "POST /api/verify-link",
        "POST /api/gen-start",
        "POST /api/gen-check"
      ]
    },
    flow_generate: [
      "1. POST /api/gen-start → {email, token}",
      "2. loop tiap 4-5s: POST /api/gen-check {token}",
      "3. kalau result.status='verified' → selesai",
      "4. kalau status='pending' → tunggu & ulangi (max 12x)"
    ],
    auth_header: "Authorization: Bearer <API_KEY>"
  });
}

async function handleSendLink(req, res) {
  const { email } = req.body || {};
  if (!email || !email.includes("@")) {
    return res.status(400).json({ success: false, error: "Email tidak valid" });
  }
  try {
    await kirimLinkAM(email);
    return res.status(200).json({ success: true, message: "Magic link terkirim", email });
  } catch (e) {
    return res.status(502).json({ success: false, error: e.message });
  }
}

async function handleVerifyLink(req, res) {
  const { email, magicLink } = req.body || {};
  if (!email || !magicLink || !magicLink.startsWith("http")) {
    return res.status(400).json({ success: false, error: "email & magicLink wajib diisi" });
  }
  try {
    const r = await verifikasiLinkAM(email, magicLink);
    return res.status(r.ok ? 200 : 400).json({ success: r.ok, raw: r.raw });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

// STEP 1: bikin mailbox + minta link ke Satriam (cepat: ~2-4s)
async function handleGenStart(req, res) {
  try {
    const mail = await createTempMail();
    const sendRes = await sendSatriam(mail.email);
    if (!sendRes.success) {
      return res.status(400).json({
        success: false,
        error: sendRes.error || "gagal kirim link"
      });
    }
    return res.status(200).json({
      success: true,
      email: mail.email,
      token: mail.token,
      inboxUrl: `https://temp-mail.org/en/?token=${encodeURIComponent(mail.token)}`,
      next: "poll POST /api/gen-check {token, email} tiap 4-5s"
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

// STEP 2: cek inbox 1x. kalau link udah masuk → langsung verify. (cepat: <5s)
async function handleGenCheck(req, res) {
  const { token, email } = req.body || {};
  if (!token || !email) {
    return res.status(400).json({ success: false, error: "token & email wajib" });
  }

  try {
    const msgs = await getInbox(token);
    if (!msgs.length) {
      return res.status(200).json({
        success: true,
        status: "pending",
        message: "Email belum masuk, coba lagi 4-5s",
        count: 0
      });
    }

    for (const m of msgs) {
      const id = m._id; if (!id) continue;
      const detail = await readMsg(token, id); if (!detail) continue;
      const link = extractMagicLink(detail);
      if (!link) continue;

      // verify ke satriam
      const verify = await verifySatriam(email, link);
      if (verify.success || verify.validUntil || verify.planName) {
        return res.status(200).json({
          success: true,
          status: "verified",
          email,
          plan: verify.planName || "PREMIUM",
          validUntil: verify.validUntil || "Unknown",
          magicLink: link,
          inboxUrl: `https://temp-mail.org/en/?token=${encodeURIComponent(token)}`
        });
      } else {
        return res.status(200).json({
          success: false,
          status: "verify_failed",
          error: verify.error || "verify satriam gagal",
          raw: verify,
          magicLink: link
        });
      }
    }

    return res.status(200).json({
      success: true,
      status: "pending",
      message: "Email ada tapi belum nemu link magic",
      count: msgs.length
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

// ---------- MAIN ----------
export default async function handler(req, res) {
  setCORS(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  if (path === "/" || path === "/api" || path === "/api/info") {
    return handleInfo(req, res);
  }

  const auth = validateApiKey(req);
  if (!auth.valid) {
    return res.status(401).json({
      success: false,
      error: auth.error,
      hint: "Header: Authorization: Bearer <API_KEY>"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  switch (path) {
    case "/api/send-link":   return handleSendLink(req, res);
    case "/api/verify-link": return handleVerifyLink(req, res);
    case "/api/gen-start":   return handleGenStart(req, res);
    case "/api/gen-check":   return handleGenCheck(req, res);
    default:
      return res.status(404).json({ success: false, error: "Endpoint not found", path });
  }
}
