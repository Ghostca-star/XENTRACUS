module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, email, magicLink, token, msgId } = req.body;

    const SATRIAM_BASE = "https://satriam.satriadeveloperz.workers.dev";
    const TEMPMAIL_BASE = "https://web2.temp-mail.org";
    
    const tempMailHeaders = {
        "accept": "application/json, text/plain, */*",
        "content-type": "application/json",
        "origin": "https://temp-mail.org",
        "referer": "https://temp-mail.org/"
    };

    try {
        if (action === "create_mail") {
            let r = await fetch(`${TEMPMAIL_BASE}/mailbox`, { method: "POST", headers: tempMailHeaders, body: JSON.stringify({}) });
            return res.status(200).json(await r.json());
        }
        
        if (action === "read_inbox") {
            let r = await fetch(`${TEMPMAIL_BASE}/messages`, { method: "GET", headers: { ...tempMailHeaders, authorization: `Bearer ${token}` } });
            return res.status(200).json(await r.json());
        }
        
        if (action === "read_message") {
            let r = await fetch(`${TEMPMAIL_BASE}/messages/${msgId}`, { method: "GET", headers: { ...tempMailHeaders, authorization: `Bearer ${token}` } });
            return res.status(200).json(await r.json());
        }

        if (action === "send_satriam") {
            let r = await fetch(`${SATRIAM_BASE}/api/satriam/send-link`, {
                method: "POST", headers: { "Content-Type": "application/json" }, 
                body: JSON.stringify({ email })
            });
            return res.status(200).json(await r.json());
        }

        if (action === "verify_satriam") {
            let r = await fetch(`${SATRIAM_BASE}/api/satriam/verify-link`, {
                method: "POST", headers: { "Content-Type": "application/json" }, 
                body: JSON.stringify({ email, magicLink })
            });
            return res.status(200).json(await r.json());
        }

        return res.status(400).json({ error: "Invalid Action" });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};