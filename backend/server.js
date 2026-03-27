const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ─── FILE DATABASE CONFIGURATION ─────────────────────────────────────────────
const DB_FILE = path.join(__dirname, "database.json");

const SEED = [
  { id:"DMC-001", title:"Overflowing garbage bins near Lajpat Nagar Market", desc:"Three large municipal bins have been overflowing for 5 days.", dept:"Sanitation & Solid Waste", zone:"South Delhi", priority:"High", status:"In Progress", citizenId:"CIT-001", citizenName:"Vikram Mehra", citizenPhone:"9876543210", citizenEmail:"citizen@delhi.gov.in", createdAt:"25 Mar, 10:30 AM", updatedAt:"26 Mar, 02:15 PM", aiConfidence:96, timeline:[{s:"Submitted",t:"25 Mar, 10:30 AM",by:"Vikram Mehra",note:""}] },
  { id:"DMC-002", title:"Large pothole on Outer Ring Road", desc:"A 3-foot wide pothole developed near Mukundpur flyover.", dept:"Roads & Infrastructure", zone:"North-West Delhi", priority:"Critical", status:"Assigned", citizenId:"CIT-002", citizenName:"Priya Sharma", citizenPhone:"9812345678", citizenEmail:"priya@gmail.com", createdAt:"26 Mar, 08:45 AM", updatedAt:"26 Mar, 11:00 AM", aiConfidence:98, timeline:[{s:"Submitted",t:"26 Mar, 08:45 AM",by:"Priya Sharma",note:""}] }
];

const loadDB = () => {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    } catch (e) {
      return { complaints: SEED, users: [] };
    }
  }
  return { complaints: SEED, users: [] };
};

const saveDB = (data) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

let db = loadDB();
let complaints = db.complaints;
let users = db.users || [];

// ─── AI CONFIGURATION ────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_KEY_HERE");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const nowStr = () => new Date().toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit", hour12:true });

// ─── USER ROUTES (Registration & Login) ──────────────────────────────────────
app.get("/api/users", (req, res) => res.json(users));

// Registration
app.post("/api/users", (req, res) => {
  const newUser = { ...req.body, id: `CIT-${Date.now()}` };
  users.push(newUser);
  saveDB({ complaints, users });
  res.status(201).json(newUser);
});

// LOGIN ROUTE (The missing piece!)
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  
  // Find user in the database.json array
  const user = users.find(u => u.email === email && u.password === password);

  if (user) {
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: "citizen"
    });
  } else {
    // If it's the demo admin, allow it
    if (email === "admin@delhi.gov.in" && password === "Admin@123") {
        return res.json({ id: "ADM-001", name: "System Admin", email, role: "admin" });
    }
    res.status(401).json({ error: "Invalid credentials" });
  }
});

// ─── COMPLAINT ROUTES ────────────────────────────────────────────────────────
app.get("/api/complaints", (req, res) => res.json(complaints));

app.post("/api/complaints", (req, res) => {
  const c = { ...req.body, createdAt: nowStr(), updatedAt: nowStr() };
  complaints = [c, ...complaints];
  saveDB({ complaints, users });
  res.status(201).json(c);
});

app.patch("/api/complaints/:id", (req, res) => {
  const { id } = req.params;
  const changes = req.body;
  let found = false;
  complaints = complaints.map(c => {
    if (c.id !== id) return c;
    found = true;
    const newTimeline = changes.status && changes.status !== c.status
      ? [...c.timeline, { s: changes.status, t: nowStr(), by: "Admin", note: changes.adminNote || "" }]
      : c.timeline;
    return { ...c, ...changes, timeline: newTimeline, updatedAt: nowStr() };
  });
  if (!found) return res.status(404).json({ error: "Not found" });
  saveDB({ complaints, users });
  res.json(complaints.find(c => c.id === id));
});

// ─── GEMINI AI ROUTE ─────────────────────────────────────────────────────────
app.post("/api/ai/messages", async (req, res) => {
  try {
    let userPrompt = "";
    if (req.body.messages && req.body.messages.length > 0) {
      userPrompt = req.body.messages[req.body.messages.length - 1].content;
    } else {
      userPrompt = req.body.prompt || req.body.message || "Hello";
    }

    const result = await model.generateContent(userPrompt);
    const response = await result.response;
    const text = response.text();

    res.json({
      content: [{ type: "text", text: text }],
      reply: text 
    });
  } catch (err) {
    console.error("Gemini Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
// ─── AI CLASSIFICATION ROUTE ────────────────────────────────────────────────
app.post("/api/ai/classify", async (req, res) => {
  try {
    const { title, description } = req.body;
    const prompt = `Classify this Delhi civic complaint:
      Title: ${title}
      Description: ${description}
      Return ONLY JSON: {"department": "string", "priority": "string"}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    res.json(JSON.parse(text));
  } catch (err) {
    res.status(500).json({ error: "AI failed" });
  }
});
app.listen(PORT, () => {
    console.log(`✅ DMC backend running on http://localhost:${PORT}`);
    console.log(`📁 Database saved at: ${DB_FILE}`);
});