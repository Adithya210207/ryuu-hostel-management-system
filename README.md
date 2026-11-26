<div align="center">

# 🏠 Ryuu Hostel Management System

### *cool rooms · calm days · your next chapter*

**An animated public website and a full hostel portal for admins, residents and guardians:**
**admissions, beds, payments, meals, outpasses and notices in one place.**

`Next.js 16` · `React 19` · `TypeScript` · `PostgreSQL / PGlite` · `PWA + push` · `Docker` · `INR · Asia/Kolkata`

</div>

---

## ✨ What is this?

Ryuu is a complete web system for a single men's hostel in Bengaluru: a public website that sells the stay, and a private portal that runs it day to day.

- 🎬 **A homepage that feels alive.** Handwritten intro, metallic type, parallax photos, magnetic buttons, cursor lighting and curved transitions, with pause and reduced-motion support.
- 🧑‍🎓 **Three kinds of users.** Admins, residents and guardians each get their own dashboard and only see what they should.
- 🛏️ **Admissions to checkout.** Apply, get reviewed, pick a bed, pay within 48 hours, live there, transfer, check out.
- 💳 **Money handled properly.** Monthly bills, proration, penalties, manual payment proof with review, and a PhonePe checkout (simulated in the demo).
- 🍛 **Daily life.** Meal counts with cutoffs, attendance, outpasses and extensions, tickets, announcements, guardian updates.
- 🔔 **Real notifications.** Installable app (PWA) with opt-in phone push alerts, Gmail emails for verification and password recovery, WhatsApp phone verification.
- 🔐 **Built to be safe.** Role isolation, encrypted private uploads, audit log, backups, and a production check that refuses to start with weak settings.

---

## 🧩 Two homepages

| | **Version 1** (`/classic`) | **Version 2** ⭐ (`/`) |
|---|---|---|
| Built with | React components (`components/public/`) | A static page (`public/site/index.html`), layout and scroll motion adapted from the Onda template by 8B (MIT) |
| Hostel details | From the server | Reads address, phone, email and opening date from `/api/public` |
| Portal, login, registration | Same | Same |

Photo slots and the prompts used for the concept pictures: [PHOTO-PROMPTS.md](PHOTO-PROMPTS.md).

---

## 🧭 What each person can do

| Who | Can do |
|---|---|
| **Visitor** | Browse the site, see rooms and life at the hostel, apply to stay (18+ check) |
| **Resident** | Dashboard, bed and bills, payment proof, meals, attendance, outpasses, tickets, notices, *About / My details* |
| **Guardian** | Follow the resident's admission, payments, outpasses and updates |
| **Admin** | Approve admissions, interactive bed map, payments review, meals and cutoffs, attendance, announcements, shared inbox, communication history, Excel/PDF exports, audit and system health |

```text
 Apply online (18+, email + phone verified)
        │
        ▼
 ① Admin reviews and approves the admission
        │
        ▼
 ② 48-hour window: pay rent + deposit (PhonePe or manual proof)
        │
        ▼
 ③ Admin checks the payment → bed confirmed, resident ID issued
        │
        ▼
 ④ Daily life: meals, attendance, outpasses, bills, notices, push alerts
        │
        ▼
 ⑤ Transfer or checkout, with the guardian kept in the loop
```

---

## 🚀 Run it locally

Needs **Node.js 24** and npm.

```powershell
npm ci
copy .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:4174**. On Windows you can also double-click **`Launch Ryuu Localhost.bat`**.

- The sign-in page offers clearly labelled **Resident / Admin / Guardian demo accounts** while `DEMO_MODE=true`. Demo access and visible test codes are switched off in production.
- Data is kept under `.data/` in an embedded PostgreSQL (PGlite). Don't run two processes on the same folder.
- All rooms, prices and people in the demo are **synthetic**.

| Launcher | What it does |
|---|---|
| `Launch Ryuu Localhost.bat` | Laptop-only site on port 4174 |
| `Launch Ryuu.bat` (`npm run dev:phone`) | Preview on your phone over the same trusted Wi-Fi |
| `Launch Ryuu HTTPS Test.bat` | A private HTTPS test link through a Cloudflare quick tunnel, protected by a one-time key gate, with separate demo data |

> 💡 The hostel's own logo and building render are **not in this repository** (they belong to the hostel owner). Put them in `public/images/` as `ryuu-house-logo.png`, `ryuu-logo.webp` and `ryuu-exterior.webp` to see the full design.

---

## ✅ Tests and checks

```powershell
npm run typecheck
npm test
npm run build
```

- **53 automated tests** pass, plus type checking and the production build: account and role isolation, contact verification, admissions, payments, attendance and outpasses, provider limits, notification queues, deployment guards and backup integrity.
- With the demo running, `node scripts/http-check.ts` and `node scripts/admission-check.ts` test the real API flows.
- The admin **System health** page runs isolated checks against an in-memory database.
- `npm run check:production` lists anything missing before a real launch.

---

## 🌐 Deployment

| File | What |
|---|---|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production setup, first admin, HTTPS, providers, recovery |
| [docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md) | Everything to finish before opening |
| [docs/PHONEPE.md](docs/PHONEPE.md) | PhonePe payments setup |
| `Dockerfile` · `compose.yaml` · `deploy/` | Docker image, PostgreSQL 17, nginx examples |

Production refuses to start without an HTTPS `APP_URL`, a PostgreSQL `DATABASE_URL`, a strong file-encryption key, a virus scanner for uploads and `DEMO_MODE=false`. Registration starts closed and sample rooms are rejected. No default password ships with it.

---

## 🗂️ Project map

```text
Ryuu_Hostel_Management_System\
├── README.md                ← you are here
├── LICENSE                  ← copyright & terms of use (all rights reserved)
├── implementation.md        ← the approved specification
├── app\                     ← Next.js pages and API routes (app\api\)
├── components\
│   ├── public\              ← public website (Version 1)
│   └── portal\              ← login, registration, dashboards
├── public\
│   ├── site\                ← Version 2 homepage (Onda-based, MIT)
│   ├── images\              ← concept pictures and photos
│   └── fonts\               ← Inter (SIL OFL)
├── server\
│   ├── domain.ts            ← business rules
│   ├── auth.ts              ← accounts, sessions, OTPs
│   └── uploads.ts           ← encrypted private files
├── shared\domain.ts         ← the API contract shared by server and pages
├── scripts\                 ← worker, backup, bootstrap, previews, checks
├── tests\                   ← 53 automated tests
└── docs\ · deploy\          ← deployment guides and server configs
```

The hostel's data lives in one versioned PostgreSQL JSONB record with a row lock, so admissions, payments and scheduled jobs never clash. Accounts, sessions, OTPs, files and logs have their own tables.

---

## 📜 Credits & licences

- **Homepage Version 2:** adapted from the **Onda** template by 8B, MIT licence ([ONDA-LICENSE.txt](public/site/ONDA-LICENSE.txt)). Its photos come from Unsplash ([ONDA-CREDITS.md](public/site/ONDA-CREDITS.md)).
- **Animation reference:** [Syahril Arfian Almazril](https://www.syahrilarfianalmazril.my.id/), credited in the site footer.
- **Font:** Inter, SIL Open Font License.
- **Concept pictures:** generated for this project and labelled as concepts on the site. See [public/images/ASSETS.md](public/images/ASSETS.md).
- **Hostel logo and building render:** belong to the hostel owner; not included here.
- **Libraries:** Next.js, React, PGlite, PostgreSQL, ExcelJS, PDFKit, Nodemailer, Lucide, each under its own licence.

---

## 📄 Copyright & Terms of Use

**© 2026 Adithya V. All Rights Reserved.**

This repository is published for portfolio, demonstration, and educational viewing purposes only. You are welcome to view the source code to understand the implementation. Downloading, running or deploying a copy is not permitted without permission.

### You may NOT:

- Copy or reproduce substantial portions of this project.
- Redistribute, republish, or mirror this repository.
- Use this code in commercial projects without prior written permission.
- Submit this code, or substantially similar code, as your own for academic purposes.
- Remove copyright notices or claim this work as your own.

If you would like to use any part of this project, please contact me first for permission.

The full legal terms are in the [**LICENSE**](LICENSE) file.

> Third-party parts keep their own owners and licences: the hostel's logo and building render (the hostel owner), the Onda template (MIT), Unsplash photos, the Inter font (SIL OFL) and the npm libraries. See **Credits & licences** above.

<div align="center">

*A place to live. A space to belong.* 🏠

</div>
