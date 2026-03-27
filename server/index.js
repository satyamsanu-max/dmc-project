require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

/* ── Health check ── */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/* ── Claude proxy ── */
app.post("/api/claude", async (req, res) => {
  const { system, userMsg, max_tokens = 300 } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in .env file" });
  }

  try {
    const body = {
      model: "claude-sonnet-4-20250514",
      max_tokens,
      messages: [{ role: "user", content: userMsg }],
    };
    if (system) body.system = system;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    const text = data.content?.map(b => b.type === "text" ? b.text : "").join("") || "";
    res.json({ text });
  } catch (err) {
    console.error("Server error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🏛  DMC CRM Backend running on http://localhost:${PORT}`);
  console.log(`   API key: ${process.env.ANTHROPIC_API_KEY ? "✅ configured" : "❌ NOT SET — add to server/.env"}\n`);
});
