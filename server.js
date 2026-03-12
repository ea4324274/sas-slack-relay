const express = require("express");
const app = express();
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "YOUR_SLACK_WEBHOOK_URL_HERE";
const AUTH_KEY = process.env.SAS_AUTH_KEY || "";
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("SAS->Slack relay is running");
});

app.post("/", async (req, res) => {
  if (AUTH_KEY) {
    const provided = req.headers["authorization"] || req.headers["x-auth-key"] || req.body?.auth_key;
    if (provided !== AUTH_KEY && provided !== "Bearer " + AUTH_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const data = req.body || {};
  const callerName  = data.caller_name  || data.name         || "Unknown";
  const callerPhone = data.caller_phone || data.phone        || "-";
  const company     = data.company      || null;
  const email       = data.email        || null;
  const message     = data.message      || data.notes        || "(no message)";
  const urgency     = data.urgency      || null;
  const callDate    = data.call_date    || null;
  const callTime    = data.call_time    || null;
  const operator    = data.operator     || data.agent        || null;

  const isUrgent = urgency && urgency.toLowerCase().includes("urgent");
  const headerText = (isUrgent ? "URGENT - " : "") + "New Answering Service Message";
  const timestamp = callDate && callTime
    ? callDate + " at " + callTime
    : new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });

  const fields = [];
  fields.push({ type: "mrkdwn", text: "*Caller:* " + callerName });
  fields.push({ type: "mrkdwn", text: "*Phone:* " + callerPhone });
  if (company)  fields.push({ type: "mrkdwn", text: "*Company:* " + company });
  if (email)    fields.push({ type: "mrkdwn", text: "*Email:* " + email });
  if (urgency)  fields.push({ type: "mrkdwn", text: "*Urgency:* " + urgency });
  if (operator) fields.push({ type: "mrkdwn", text: "*Taken by:* " + operator });

  const slackPayload = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: headerText, emoji: true }
      },
      {
        type: "section",
        fields: fields.slice(0, 10)
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Message:* " + message }
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "Received: " + timestamp }]
      },
      { type: "divider" }
    ]
  };

  try {
    const slackRes = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload)
    });
    if (!slackRes.ok) {
      const e = await slackRes.text();
      return res.status(502).json({ error: "Slack error", detail: e });
    }
    console.log("Forwarded to Slack: " + callerName + " " + callerPhone);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Relay error" });
  }
});

app.listen(PORT, () => {
  console.log("SAS->Slack relay listening on port " + PORT);
});
