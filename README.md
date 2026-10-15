# 📲 Community QR Check-in App

A **100% free, no-backend** QR code check-in system built for meetup communities.  
Born from a real problem: 800 registered, 130 showed up.

---

## ✨ Features

- 📋 **Volunteer login** — phone number as credential (no separate PIN to manage)
- 🔐 **Admin dashboard** — configure Google Sheets, manage users, view analytics
- 📷 **QR Scanner** — in-browser camera scan + manual UUID fallback
- ⏱️ **Auto-logout** — 2-minute inactivity timer with countdown warning
- 📊 **Real-time stats** — registrations vs. attended, show rate
- 📋 **Audit log** — every login, logout, and scan written to Google Sheets
- 👥 **Per-meetup user roles** — Volunteers and Admins managed in a dedicated sheet
- 🎨 **Branding** — upload your community logo, set accent colour
- 🔌 **Offline-tolerant** — works in demo mode with no backend configured

---

## 🛠️ Free Stack

| Tool | Role | Cost |
|---|---|---|
| Google Forms | Registration intake | Free |
| Google Sheets | Database + check-in tracker | Free |
| Google Apps Script | Automation & API | Free |
| api.qrserver.com | QR code generation | Free |
| Gmail (via Apps Script) | QR confirmation emails | Free (100/day) |
| Vercel / Netlify | HTTPS static hosting | Free |

---

## 🚀 Quick Start

### 1. Run locally

```bash
# Clone the repo
git clone https://github.com/Raveendiran-RR/Community-QR-APP.git
cd Community-QR-APP

# Serve over HTTP (demo mode — no Google Sheets needed)
python3 -m http.server 8080
# → open http://localhost:8080
```

> **Android camera note:** Camera API requires HTTPS on mobile.  
> For local testing on Android, deploy to Vercel or use `ngrok http 8080`.

---

### 2. Set up Google Sheets

Create a Google Sheet and add these tabs (exact names):

| Tab | Headers |
|---|---|
| `Registrations` | Name, Email, Phone, UUID, Status, CheckinTime |
| `Users` | Name, Phone, Role, AddedAt |
| `AuditLog` | Timestamp, Event, User, Detail |
| `Config` | Key, Value |

**Or run the helper:** in Apps Script, run `setupSheets()` once — it creates all tabs automatically.

> ⚠️ **Keep the Sheet PRIVATE.** It contains PII (names, emails, phone numbers, UUIDs).  
> Go to Share → "Restricted" (only you).

---

### 3. Deploy Google Apps Script

1. Open your Sheet → **Extensions → Apps Script**
2. Paste the contents of [`apps-script/Code.gs`](apps-script/Code.gs)
3. Replace `YOUR_GOOGLE_SHEET_ID_HERE` with your Sheet ID  
   *(found in the Sheet URL: `.../spreadsheets/d/`**THIS_PART**`/edit`)*
4. Click **Deploy → New deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the `/exec` URL

---

### 4. Configure the app

1. Open the app → choose **Admin** → enter PIN `9999`
2. Go to **⚙️ Sheets** tab
3. Paste your Apps Script URL and Sheet ID → **Save**
4. Go to **🔐 PIN** tab → change the admin PIN immediately

---

### 5. Add volunteers

- In Admin → **👥 Users** tab → enter name, phone, role → **Add User**
- Volunteers log in with their registered phone number at the door

---

### 6. Set up QR confirmation emails (optional but recommended)

In Apps Script, add an **onFormSubmit trigger**:
1. Triggers (⏰ icon) → **Add Trigger**
2. Function: `onFormSubmit`
3. Event source: **From spreadsheet**
4. Event type: **On form submit**

Every new form submission will generate a UUID and email a QR code to the attendee.

---

### 7. Deploy to Vercel (HTTPS — required for Android camera)

```bash
npm install -g vercel
vercel
# Follow prompts — it's a static site, no framework needed
```

Or use the Vercel dashboard: **Import from GitHub → deploy**.

Free tier limits: 100GB bandwidth/month, unlimited edge requests — more than enough for 1,000 attendees in 3 hours.

---

## 📁 Project Structure

```
Community-QR-APP/
├── index.html              # Single-page app UI
├── src/
│   ├── style.css           # Dark terminal theme
│   ├── config.js           # Config module (localStorage)
│   └── app.js              # All application logic
├── apps-script/
│   └── Code.gs             # Google Apps Script backend
├── public/
│   └── uploads/            # Logo uploads (gitignored)
├── .env.example            # Environment variable template
├── .gitignore
└── README.md
```

---

## 🔒 Security Notes

| Item | Recommendation |
|---|---|
| Google Sheet | **Private** — never share the link publicly |
| Apps Script URL | Treat as semi-secret — it's public but rate-limited |
| Admin PIN | Change from `9999` immediately after first login |
| Sheet ID & Script URL | Store in Vercel env vars, not in committed code |
| PII | Name, email, phone, UUID are stored only in your private Sheet |

---

## 🧑‍💻 Roles

| Role | Login method | Access |
|---|---|---|
| Volunteer | Registered phone number | Scan QR codes, see live count |
| Admin | 4-digit PIN | All of above + manage config, users, stats, audit log |

---

## 📊 DPDP Act Compliance (India)

This app collects and processes personal data (name, email, phone, location-adjacent data). As the data fiduciary:

- Store data only as long as needed (delete after each event)
- Restrict Sheet access to organisers only
- Do not share attendee data with third parties
- Inform attendees that their data is used for check-in purposes (add a note to the Google Form)

---

## ❓ FAQ

**Camera not working on Android?**  
Camera API requires HTTPS. Deploy to Vercel/Netlify or use `ngrok http 8080` for local testing.

**Gmail limit (100 emails/day)?**  
Use a Google Workspace account (2,000/day) or batch emails over 2 days for large events.

**Can I use this offline?**  
Demo mode works fully offline. Real mode requires internet to hit Apps Script. For venue WiFi issues, the app falls back gracefully and shows manual entry.

**Is Apps Script fast enough for 1,000 people?**  
Yes. Apps Script cold-starts in ~1–2s; warm requests are ~200–400ms. For peak check-in (first 30 minutes), expect 5–10 scans/minute per volunteer — well within free tier limits.

---

## 📝 Disclaimer

See [DISCLAIMER.md](DISCLAIMER.md) for terms of use, data handling notice, and liability.

---

## 🤝 Contributing

PRs welcome! This project is maintained by the Docker / Kubernetes Meetup Bangalore community.

Built with ❤️ for open community events — 100% free, zero backend code required.
