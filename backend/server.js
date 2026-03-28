const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();

// ─── MIDDLEWARE ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── 1. SERVE FRONTEND STATIC FILES (CRITICAL FOR RENDER) ──────────────────
// This ensures the backend hosts your React build folder
app.use(express.static(path.join(__dirname, "../frontend/build")));

// ─── FILE DATABASE CONFIGURATION ─────────────────────────────────────────────
const DB_FILE = path.join(__dirname, "database.json");

const SEED = {
  complaints: [
    { id: "DMC-001", title: "Overflowing garbage bins", desc: "Overflowing for 5 days.", dept: "Sanitation & Solid Waste", zone: "South Delhi", priority: "High", status: "In Progress", citizenId: "CIT-001", citizenName: "Vikram Mehra", createdAt: "25 Mar, 10:30 AM", aiConfidence: 96, timeline: [] }
  ],
  users: []
};

const loadDB = () => {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(SEED, null, 2));
    return SEED;
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    return data.complaints ? data : SEED;
  } catch (e) {
    return SEED;
  }
};

const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const nowStr = () => new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });

// ─── AI CONFIGURATION ────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ─── USER & LOGIN ROUTES ─────────────────────────────────────────────────────
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.email === email && u.password === password);

  if (user) {
    res.json({ id: user.id, name: user.name, email: user.email, role: "citizen" });
  } else if (email === "admin@delhi.gov.in" && password === "Admin@123") {
    res.json({ id: "ADM-001", name: "System Admin", email, role: "admin" });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.post("/api/users", (req, res) => {
  const db = loadDB();
  const newUser = { ...req.body, id: `CIT-${Date.now()}` };
  db.users.push(newUser);
  saveDB(db);
  res.status(201).json(newUser);
});

// ─── COMPLAINT ROUTES ────────────────────────────────────────────────────────
app.get("/api/complaints", (req, res) => {
  const db = loadDB();
  res.json(db.complaints);
});

app.post("/api/complaints", (req, res) => {
  const db = loadDB();
  
  // ─── DYNAMIC ID GENERATION ───
  const newID = `DMC-${Math.floor(100000 + Math.random() * 900000)}`;
  
  const newComplaint = { 
    ...req.body, 
    id: newID,
    status: "Submitted",
    createdAt: nowStr(), 
    updatedAt: nowStr(),
    timeline: [{ s: "Submitted", t: nowStr(), by: req.body.citizenName || "User", note: "" }]
  };

  db.complaints.unshift(newComplaint);
  saveDB(db);
  res.status(201).json(newComplaint);
});

// ─── AI CLASSIFICATION ROUTE ────────────────────────────────────────────────
app.post("/api/ai/classify", async (req, res) => {
  try {
    const { title, description } = req.body;
    const prompt = `Classify this Delhi civic complaint: Title: ${title}, Description: ${description}. Return ONLY JSON: {"department": "string", "priority": "string"}`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    res.json(JSON.parse(text));
  } catch (err) {
    res.status(500).json({ error: "AI failed" });
  }
});

// ─── 2. THE CATCH-ALL ROUTE (CRITICAL) ──────────────────────────────────────
// This handles React routing so page refreshes don't break the app
app.get("/*", (req, res) => {
  const finalIndexPath = fs.existsSync(frontendBuildPath) 
    ? path.join(frontendBuildPath, "index.html")
    : path.join(rootBuildPath, "index.html");
  
  res.sendFile(finalIndexPath);
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server live on port ${PORT}`);
});