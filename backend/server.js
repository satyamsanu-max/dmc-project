const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ─── 1. SERVE FRONTEND STATIC FILES (CRITICAL FOR DEPLOYMENT) ──────────────
// This tells Express where your React "build" folder is.
// On Render, we usually put 'frontend' and 'backend' in the same root.
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
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch (e) {
    return SEED;
  }
};

const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// Initial Load
let db = loadDB();

// ─── AI CONFIGURATION ────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const nowStr = () => new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });

// ─── COMPLAINT ROUTES ────────────────────────────────────────────────────────
app.get("/api/complaints", (req, res) => {
  const currentDB = loadDB();
  res.json(currentDB.complaints);
});

app.post("/api/complaints", (req, res) => {
  const currentDB = loadDB();
  
  // ─── 2. DYNAMIC ID GENERATION (FIXES THE "SAME ID" ISSUE) ──────────────────
  const newID = `DMC-${Math.floor(100000 + Math.random() * 900000)}`;
  
  const newComplaint = { 
    ...req.body, 
    id: newID,
    status: "Submitted",
    createdAt: nowStr(), 
    updatedAt: nowStr(),
    timeline: [{ s: "Submitted", t: nowStr(), by: req.body.citizenName || "User", note: "" }]
  };

  currentDB.complaints.unshift(newComplaint);
  saveDB(currentDB);
  res.status(201).json(newComplaint);
});

// ─── USER & LOGIN ROUTES ─────────────────────────────────────────────────────
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const currentDB = loadDB();
  const user = currentDB.users.find(u => u.email === email && u.password === password);

  if (user) {
    res.json({ id: user.id, name: user.name, email: user.email, role: "citizen" });
  } else if (email === "admin@delhi.gov.in" && password === "Admin@123") {
    res.json({ id: "ADM-001", name: "System Admin", email, role: "admin" });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

// ─── AI ROUTES ───────────────────────────────────────────────────────────────
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

// ─── 3. THE "CATCH-ALL" ROUTE (CRITICAL FOR REACT ROUTING) ──────────────────
// This must be the VERY LAST route. It sends index.html for any non-API request.
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server live on port ${PORT}`);
});