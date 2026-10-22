# 🚀 PrepAI

**PrepAI** is an AI-powered web platform built for university students preparing for software engineering job placements. It offers personalized support in three critical areas: **DSA problem-solving**, **behavioral interview coaching**, and **resume feedback** — all in one place.

---

## 🎯 Features

### 🔢 DSA Arena
- Three-panel UI: Problem → Code Editor → AI Feedback
- AI-generated coding problems by topic (e.g. Arrays, Trees)
- Real-time AI evaluation of:
  - Code correctness
  - Time & space complexity
  - Edge case analysis
  - Optimal solution with explanation

### 💬 Behavioral Coach
- Chat-style interface (like WhatsApp)
- AI acts as your HR interviewer
- You respond to behavioral questions
- AI gives feedback using the **STAR** (Situation-Task-Action-Result) method

### 📄 Resume Reviewer
- Upload your resume in PDF format
- AI parses and evaluates:
  - Action verbs and clarity
  - Quantification of achievements
  - ATS-friendliness (Applicant Tracking System)

---

## 🧱 Tech Stack

### Frontend
- [React.js](https://reactjs.org/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [@uiw/react-codemirror](https://github.com/uiwjs/react-codemirror)
- [Axios](https://axios-http.com/)

### Backend
- [Node.js](https://nodejs.org/)
- [Express.js](https://expressjs.com/)
- [@google/generative-ai (Gemini Pro)](https://www.npmjs.com/package/@google/generative-ai)
- [MongoDB Atlas](https://www.mongodb.com/atlas)
- [Mongoose](https://mongoosejs.com/)

### Deployment
- **Frontend:** Vercel
- **Backend:** Render

---

### 🧠 Learning Goals

This project is also a full learning journey for backend tech. The developer is mastering:

- Node.js & Express.js  
- MongoDB & Mongoose  
- AI integration using Gemini API  
- Full-stack app design and deployment  

---

## 🏢 Company-Specific DSA Question Catalog & Automatic Sync

PrepAI maintains an automated catalog of company-specific DSA interview questions sourced from public community repositories:
- [snehasishroy/leetcode-companywise-interview-questions](https://github.com/snehasishroy/leetcode-companywise-interview-questions)
- [liquidslr/leetcode-company-wise-problems](https://github.com/liquidslr/leetcode-company-wise-problems)

### 🔄 Data Flow: GitHub → MongoDB Atlas → Pepe DSA Coach
```
[GitHub Repositories] 
       │ (Weekly Cron / workflow_dispatch)
       ▼
[Shallow Git Clone in Temporary Sandbox]
       │
       ▼
[Node.js Importer & CSV Normalizer]
  ├── Canonical company aliases (e.g. "amzn" → "Amazon", "goog" → "Google")
  ├── Canonical URLs & problem slugs (e.g. /problems/two-sum/)
  ├── Recency tiers & frequency percentage normalization
  └── In-memory deduplication by (problemSlug, company)
       │
       ▼
[MongoDB Atlas]
  ├── company_questions (unique compound index on problemSlug + company)
  └── catalog_sync_logs (audit history & revision tracking)
       │
       ▼
[Express Backend API /api/company-questions]
       │
       ▼
[Pepe AI Coach & DSA Arena]
  ├── Ranked company question retrieval (recency & frequency)
  ├── Excludes recently attempted user problems
  ├── Direct LeetCode links & community attribution disclaimers
  └── Optional runnable AI challenge generation for the DSA Arena
```

### ⚙️ How to Run an Import Manually
From the `server` directory:
```bash
# 1. Dry run (validates CSVs and reports aggregation metrics without database writes)
node scripts/syncCompanyQuestions.js --dry-run

# 2. Production sync to MongoDB Atlas
npm run sync:questions
# or directly:
node scripts/syncCompanyQuestions.js
```
*(Requires `MONGODB_URI` or `DATABASE_URL` configured in `server/.env`)*

### ⏱️ Weekly Automated Sync (GitHub Actions)
The workflow located at [`.github/workflows/sync-company-questions.yml`](.github/workflows/sync-company-questions.yml):
- **Schedule**: Executes automatically every Sunday at midnight UTC (`0 0 * * 0`).
- **Manual Trigger**: Can be run on demand from the GitHub **Actions** tab via `workflow_dispatch` (with optional `dry_run` toggle).
- **Runner**: Runs on standard `ubuntu-latest` with Node.js 20.
- **Required Secret**:
  - `MONGODB_URI`: Add your MongoDB Atlas connection string in **Repository Settings → Secrets and variables → Actions → Repository secrets**.
  - Database credentials are automatically sanitized and never logged or committed.

### 🔍 Inspecting Failures & Safe Recovery
- **Audit Logs**: Every sync records a document in the `catalog_sync_logs` MongoDB collection detailing files scanned, parsed counts, imported/updated/skipped/failed records, and error messages.
- **Console Logs**: The script automatically masks connection URIs (e.g. `mongodb+srv://user:****@cluster...`) to protect credentials in CI logs.
- **Idempotency & Safe Recovery**: All database operations use upserts (`$set` and `$addToSet`). If a sync run is interrupted or fails midway, existing catalog records remain completely intact and subsequent runs safely resume without creating duplicate entries.
- **Licensing Notice**: Neither upstream repository includes an explicit open-source license. PrepAI indexes only public metadata (problem titles, URLs, tags, difficulties, and community frequencies) and does not redistribute copyrighted LeetCode problem statements or test suites.

### 🌐 Local DNS Resolution Troubleshooting (Windows)
When connecting to MongoDB Atlas (`mongodb+srv://...`) on Windows, Node.js uses the internal `c-ares` library for SRV record lookups instead of the OS `getaddrinfo`. If your local Windows DNS configuration points to `127.0.0.1` without an active DNS daemon on port 53, Node.js may fail with `querySrv ECONNREFUSED`, even if Windows `nslookup` succeeds.

To resolve this locally without altering your operating system's network configuration, add the optional `MONGODB_DNS_SERVERS` variable to `server/.env`:
```env
# Optional: Fallback DNS resolvers for MongoDB Atlas SRV resolution
MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1
```
- **Safety**: When absent, default DNS behavior is completely untouched. Application code never hardcodes third-party DNS servers.
- **Validation**: Server addresses are strictly validated as valid IPv4/IPv6 addresses before being passed to `dns.setServers()`.
- **Scope**: Applied automatically in both the main application (`connectDB`) and the standalone catalog sync script before any MongoDB connection occurs.

---

### ✅ Status

🛠️ In development.  
📌 Currently working on: **Company-Specific DSA Question Catalog & Pepe Coach Integration**

---

### 🤝 Contributions

This is a solo learning project by **Aman Rawat**, but open to feedback, feature requests, and collaboration ideas.

---

### ⭐ Show Your Support!

If you like this project, consider giving it a ⭐ on GitHub — it helps a lot!

