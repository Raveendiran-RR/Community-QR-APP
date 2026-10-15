/**
 * Community QR Check-in App — Google Apps Script Backend
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet → Extensions → Apps Script
 * 2. Paste this entire file into the editor
 * 3. Replace SHEET_ID below with your spreadsheet ID
 * 4. Click "Deploy" → "New deployment" → Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the /exec URL → paste into Admin > Sheets > Script URL
 *
 * REQUIRED SHEET TABS (exact names):
 *   Registrations — attendee data (created by Google Form trigger)
 *   Users         — volunteers & admins
 *   AuditLog      — all login/logout/scan events
 *   Config        — key/value settings (optional)
 *
 * DATA PROTECTION / DPDP ACT NOTICE:
 * Keep your Google Sheet PRIVATE. This file handles PII (names,
 * emails, phone numbers). Never share the Sheet publicly.
 */

// ── Configuration ─────────────────────────────────────────────────
const SHEET_ID  = "YOUR_GOOGLE_SHEET_ID_HERE"; // ⬅ Replace this
const TABS = {
  registrations: "Registrations",
  users:         "Users",
  audit:         "AuditLog",
  config:        "Config",
};

// Column indices in Registrations tab (0-indexed)
const COL = {
  name:   0,
  email:  1,
  phone:  2,
  uuid:   3,
  status: 4,
  time:   5,
};

// ── Entry Point ───────────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action || "";
  try {
    switch (action) {
      case "ping":            return corsJSON({ status: "ok" });
      case "checkin":         return corsJSON(handleCheckin(e.parameter));
      case "audit":           return corsJSON(handleAuditLog(e.parameter));
      case "stats":           return corsJSON(handleStats());
      case "list":            return corsJSON(handleList());
      case "verifyVolunteer": return corsJSON(verifyVolunteer(e.parameter.phone));
      case "addUser":         return corsJSON(addUser(e.parameter));
      case "listUsers":       return corsJSON(listUsers());
      default:
        return corsJSON({ status: "error", message: "Unknown action: " + action });
    }
  } catch (err) {
    return corsJSON({ status: "error", message: err.toString() });
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function getSheet(tabName) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  return ss.getSheetByName(tabName);
}

function corsJSON(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Check-in ──────────────────────────────────────────────────────
function handleCheckin(params) {
  const uuid = (params.uuid || params.id || "").trim();
  const vol  = (params.vol || "unknown").trim();
  if (!uuid) return { status: "error", message: "No UUID provided" };

  const sheet = getSheet(TABS.registrations);
  if (!sheet) return { status: "error", message: "Registrations sheet not found" };

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {          // skip header row
    if (String(data[i][COL.uuid]).trim() === uuid) {
      const name   = data[i][COL.name];
      const email  = data[i][COL.email];
      const status = String(data[i][COL.status]).trim();

      if (status === "Present") {
        return {
          status: "already",
          name: name,
          time: String(data[i][COL.time]),
        };
      }

      const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      sheet.getRange(i + 1, COL.status + 1).setValue("Present");
      sheet.getRange(i + 1, COL.time   + 1).setValue(now);

      logAudit("checkin_ok", vol, `Checked in: ${name} (${uuid})`);
      return { status: "ok", name: name, email: email, time: now };
    }
  }

  return { status: "not_found", message: "UUID not in registrations" };
}

// ── Volunteer Verification ────────────────────────────────────────
function verifyVolunteer(phone) {
  if (!phone) return { status: "error", message: "No phone provided" };
  const sheet = getSheet(TABS.users);
  if (!sheet) return { status: "error", message: "Users sheet not found" };

  const data = sheet.getDataRange().getValues();
  const clean = phone.replace(/\D/g, "");

  for (let i = 1; i < data.length; i++) {
    const rowPhone = String(data[i][1]).replace(/\D/g, "");
    if (rowPhone === clean) {
      return { status: "ok", name: data[i][0], role: data[i][2] };
    }
  }
  return { status: "not_found", message: "Phone not registered" };
}

// ── Add User ──────────────────────────────────────────────────────
function addUser(params) {
  const name  = (params.name  || "").trim();
  const phone = (params.phone || "").trim();
  const role  = (params.role  || "volunteer").trim();
  if (!name || !phone) return { status: "error", message: "Name and phone required" };

  const sheet = getSheet(TABS.users);
  if (!sheet) return { status: "error", message: "Users sheet not found" };

  sheet.appendRow([name, phone, role, new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })]);
  logAudit("add_user", "admin", `Added: ${name} (${role})`);
  return { status: "ok" };
}

// ── List Users ────────────────────────────────────────────────────
function listUsers() {
  const sheet = getSheet(TABS.users);
  if (!sheet) return { users: [] };

  const rows = sheet.getDataRange().getValues().slice(1); // skip header
  return {
    users: rows.map(r => ({
      name:  r[0] || "",
      phone: r[1] || "",
      role:  r[2] || "volunteer",
    }))
  };
}

// ── Stats ─────────────────────────────────────────────────────────
function handleStats() {
  const sheet = getSheet(TABS.registrations);
  if (!sheet) return { registered: 0, attended: 0 };

  const data = sheet.getDataRange().getValues().slice(1); // skip header
  const registered = data.filter(r => r[COL.uuid]).length;
  const attended   = data.filter(r => String(r[COL.status]).trim() === "Present").length;
  return { registered, attended };
}

// ── List Attendees ────────────────────────────────────────────────
function handleList() {
  const sheet = getSheet(TABS.registrations);
  if (!sheet) return { attendees: [] };

  const rows = sheet.getDataRange().getValues().slice(1);
  return {
    attendees: rows.map(r => ({
      name:   r[COL.name],
      email:  r[COL.email],
      uuid:   r[COL.uuid],
      status: r[COL.status],
      time:   r[COL.time],
    }))
  };
}

// ── Audit Log ─────────────────────────────────────────────────────
function handleAuditLog(params) {
  logAudit(
    params.event  || "unknown",
    params.user   || "unknown",
    params.detail || "",
    params.ts     || ""
  );
  return { status: "ok" };
}

function logAudit(event, user, detail, ts) {
  const sheet = getSheet(TABS.audit);
  if (!sheet) return;
  const now = ts || new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  sheet.appendRow([now, event, user, detail]);
}

// ── onFormSubmit trigger ──────────────────────────────────────────
/**
 * Attach this as a Form Submit trigger on your Google Sheet:
 *   Apps Script → Triggers → Add Trigger → onFormSubmit
 *
 * Assumes the form collects: Name, Email, Phone (in that order).
 * Generates a UUID, writes it to column D, sends confirmation email.
 */
function onFormSubmit(e) {
  const sheet = e.range.getSheet();
  const row   = e.range.getRow();

  // Generate UUID
  const uuid = Utilities.getUuid();
  sheet.getRange(row, COL.uuid + 1).setValue(uuid);

  // Read attendee details
  const values = sheet.getRange(row, 1, 1, 6).getValues()[0];
  const name   = values[COL.name]  || "Attendee";
  const email  = values[COL.email] || "";
  const phone  = values[COL.phone] || "";

  if (!email) return; // no email, skip

  // Build QR URL (points to check-in action)
  const scriptUrl = ScriptApp.getService().getUrl();
  const qrData    = `${scriptUrl}?action=checkin&id=${uuid}`;
  const qrImgUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;

  // Send confirmation email
  sendConfirmationEmail(name, email, qrImgUrl, uuid);
}

function sendConfirmationEmail(name, email, qrImgUrl, uuid) {
  const eventName = "Community Meetup";

  const html = `
    <div style="font-family:sans-serif;max-width:500px;margin:auto;">
      <h2 style="color:#00C896;">You're confirmed for ${eventName}! 🎉</h2>
      <p>Hi ${name},</p>
      <p>Your registration is confirmed. Show this QR code at the entry gate:</p>
      <div style="text-align:center;margin:24px 0;">
        <img src="${qrImgUrl}" alt="Your QR Code" width="200" height="200"
             style="border:4px solid #00C896;border-radius:8px;" />
      </div>
      <p style="color:#888;font-size:12px;">
        Attendee ID: ${uuid}<br/>
        Screenshot this email and show at check-in.
      </p>
      <p style="color:#888;font-size:11px;">
        If you can't attend, please let us know so we can open your spot.
      </p>
    </div>
  `;

  MailApp.sendEmail({
    to: email,
    subject: `✅ Your QR Check-in Pass — ${eventName}`,
    htmlBody: html,
  });
}

// ── Sheet Setup Helper (run once) ────────────────────────────────
/**
 * Run this function ONCE from the Apps Script editor to create
 * all required sheet tabs with correct headers.
 */
function setupSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  function ensureTab(name, headers) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground("#0F172A")
        .setFontColor("#00C896")
        .setFontWeight("bold");
    }
    return sheet;
  }

  ensureTab(TABS.registrations, ["Name", "Email", "Phone", "UUID", "Status", "CheckinTime"]);
  ensureTab(TABS.users,         ["Name", "Phone", "Role", "AddedAt"]);
  ensureTab(TABS.audit,         ["Timestamp", "Event", "User", "Detail"]);
  ensureTab(TABS.config,        ["Key", "Value"]);

  SpreadsheetApp.getUi().alert("✅ Sheets created successfully!");
}
