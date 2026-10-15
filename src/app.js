/**
 * Community QR Check-in App — Main Application Logic
 *
 * Architecture:
 *  - Volunteer logs in with phone number (must match Users sheet)
 *  - Admin logs in with 4-digit PIN
 *  - Both roles can scan QR codes
 *  - 2-minute inactivity auto-logout
 *  - All events written to AuditLog (localStorage + Apps Script sync)
 *  - Demo mode when no scriptUrl configured
 */

const App = (() => {
  /* ── State ────────────────────────────────────────────────── */
  let state = {
    role: null,          // "volunteer" | "admin"
    volunteerId: null,   // phone number used to log in
    scannerRunning: false,
    html5QrCode: null,
    scanCount: 0,
    attendedCount: 0,
    registeredCount: 0,
    inactivityTimer: null,
    inactivityCountdown: null,
    inactivitySecsLeft: 0,
    adminPinBuffer: "",
    auditLog: [],        // [{ts, event, user, detail}]
    // Demo mode in-memory "database"
    demoDb: {
      attendees: [
        { name: "Priya Sharma",   email: "priya@example.com",  phone: "9876543210", uuid: "DEMO-001", status: "" },
        { name: "Arjun Mehta",   email: "arjun@example.com",  phone: "9123456780", uuid: "DEMO-002", status: "" },
        { name: "Sneha Rao",     email: "sneha@example.com",  phone: "9988776655", uuid: "DEMO-003", status: "" },
        { name: "Kiran Babu",    email: "kiran@example.com",  phone: "9001122334", uuid: "DEMO-004", status: "" },
        { name: "Divya Nair",    email: "divya@example.com",  phone: "9445566778", uuid: "DEMO-005", status: "" },
      ],
      users: [
        { phone: "9876543210", name: "Priya Sharma", role: "volunteer" },
        { phone: "9000000001", name: "Demo Volunteer", role: "volunteer" },
      ]
    }
  };

  /* ── DOM helpers ──────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const show = id => { const el = $(id); if (el) el.classList.add("active"); };
  const hide = id => { const el = $(id); if (el) el.classList.remove("active"); };

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    show(id);
  }

  function toast(msg, duration = 2500) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), duration);
  }

  /* ── Inactivity Timer ─────────────────────────────────────── */
  function resetInactivity() {
    const cfg = Config.getAll();
    clearTimeout(state.inactivityTimer);
    clearInterval(state.inactivityCountdown);
    $("inactivity-overlay").classList.remove("show");

    if (!state.role) return; // not logged in

    const warnAt = cfg.inactivityMs - cfg.inactivityWarnMs;

    state.inactivityTimer = setTimeout(() => {
      // Show warning overlay
      state.inactivitySecsLeft = Math.round(cfg.inactivityWarnMs / 1000);
      $("inactivity-overlay").classList.add("show");
      $("inactivity-count").textContent = state.inactivitySecsLeft;
      $("inactivity-bar").style.width = "100%";

      state.inactivityCountdown = setInterval(() => {
        state.inactivitySecsLeft--;
        $("inactivity-count").textContent = state.inactivitySecsLeft;
        const pct = (state.inactivitySecsLeft / (cfg.inactivityWarnMs / 1000)) * 100;
        $("inactivity-bar").style.width = pct + "%";

        if (state.inactivitySecsLeft <= 0) {
          clearInterval(state.inactivityCountdown);
          logout("inactivity");
        }
      }, 1000);
    }, warnAt);
  }

  function stayLoggedIn() {
    $("inactivity-overlay").classList.remove("show");
    clearInterval(state.inactivityCountdown);
    resetInactivity();
  }

  /* ── Audit Log ────────────────────────────────────────────── */
  function auditWrite(event, detail = "") {
    const entry = {
      ts: new Date().toISOString(),
      event,
      user: state.volunteerId || state.role || "unknown",
      role: state.role || "unknown",
      detail,
    };
    state.auditLog.push(entry);

    // Sync to Apps Script (fire-and-forget)
    const cfg = Config.getAll();
    if (cfg.scriptUrl) {
      const params = new URLSearchParams({
        action: "audit",
        ts: entry.ts,
        event: entry.event,
        user: entry.user,
        role: entry.role,
        detail: entry.detail,
      });
      fetch(`${cfg.scriptUrl}?${params}`).catch(() => {});
    }
  }

  /* ── Role Select Screen ───────────────────────────────────── */
  function selectRole(role) {
    state.role = role;
    if (role === "volunteer") {
      showScreen("screen-vol-login");
      $("vol-phone-input").value = "";
      $("vol-phone-input").focus();
    } else {
      state.adminPinBuffer = "";
      updatePinDots(0, "admin");
      showScreen("screen-admin-pin");
    }
  }

  /* ── Volunteer Login (phone number) ──────────────────────── */
  async function submitPhone() {
    const countryCode = $("vol-country-code").value;
    const phone = $("vol-phone-input").value.trim().replace(/\D/g, "");
    if (!phone || phone.length < 8) {
      toast("Enter a valid phone number");
      return;
    }
    const fullPhone = phone; // store without country code for matching

    const cfg = Config.getAll();

    if (!cfg.scriptUrl) {
      // Demo mode: check demoDb.users
      const user = state.demoDb.users.find(u => u.phone === fullPhone);
      if (user) {
        loginAsVolunteer(fullPhone, user.name);
      } else {
        toast("❌ Phone not found. Try 9876543210 (demo)");
      }
      return;
    }

    // Real mode: check Users sheet via Apps Script
    try {
      const res = await fetch(`${cfg.scriptUrl}?action=verifyVolunteer&phone=${encodeURIComponent(fullPhone)}`);
      const data = await res.json();
      if (data.status === "ok") {
        loginAsVolunteer(fullPhone, data.name);
      } else {
        toast("❌ Phone not registered as volunteer");
      }
    } catch {
      toast("⚠️ Network error — check connection");
    }
  }

  function loginAsVolunteer(phone, name) {
    state.volunteerId = phone;
    state.role = "volunteer";
    auditWrite("login", `Volunteer: ${name || phone}`);
    updateScannerBadge();
    fetchStats();
    startScanner();
  }

  /* ── Admin PIN ────────────────────────────────────────────── */
  function buildNumpad(containerId, submitFn) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = "";
    [1,2,3,4,5,6,7,8,9,"⌫",0,"CLR"].forEach(k => {
      const btn = document.createElement("button");
      btn.className = "np-btn" + (k === "⌫" ? " np-del" : k === "CLR" ? " np-clear" : "");
      btn.textContent = k;
      btn.setAttribute("aria-label", k === "⌫" ? "Delete" : k === "CLR" ? "Clear" : String(k));
      btn.addEventListener("click", () => {
        if (k === "⌫") submitFn("del");
        else if (k === "CLR") submitFn("clr");
        else submitFn(String(k));
        resetInactivity();
      });
      container.appendChild(btn);
    });
  }

  function updatePinDots(len, prefix) {
    for (let i = 0; i < 4; i++) {
      const dot = $(`${prefix}-dot-${i}`);
      if (dot) dot.classList.toggle("filled", i < len);
    }
  }

  function handleAdminPin(key) {
    const pin = Config.get("adminPin") || "9999";
    if (key === "del") {
      state.adminPinBuffer = state.adminPinBuffer.slice(0, -1);
    } else if (key === "clr") {
      state.adminPinBuffer = "";
    } else if (state.adminPinBuffer.length < 4) {
      state.adminPinBuffer += key;
    }
    updatePinDots(state.adminPinBuffer.length, "admin");

    if (state.adminPinBuffer.length === 4) {
      if (state.adminPinBuffer === pin) {
        state.adminPinBuffer = "";
        updatePinDots(0, "admin");
        state.role = "admin";
        auditWrite("login", "Admin logged in");
        fetchStats();
        showScreen("screen-admin");
        resetInactivity();
        loadAdminSheetSettings();
      } else {
        state.adminPinBuffer = "";
        updatePinDots(0, "admin");
        toast("❌ Wrong PIN");
      }
    }
  }

  /* ── QR Scanner ───────────────────────────────────────────── */
  function startScanner() {
    showScreen("screen-scanner");
    resetInactivity();

    if (state.html5QrCode) {
      try { state.html5QrCode.stop(); } catch {}
    }

    state.html5QrCode = new Html5Qrcode("qr-reader");

    const cfg = { fps: 10, qrbox: { width: 200, height: 200 }, aspectRatio: 1.0 };

    state.html5QrCode.start(
      { facingMode: "environment" },
      cfg,
      onScanSuccess,
      () => {}
    ).then(() => {
      state.scannerRunning = true;
    }).catch(err => {
      console.warn("Camera unavailable:", err);
      toast("Camera unavailable — use manual entry below");
    });
  }

  function stopScanner() {
    if (state.html5QrCode && state.scannerRunning) {
      state.html5QrCode.stop().catch(() => {});
      state.scannerRunning = false;
    }
  }

  function onScanSuccess(decodedText) {
    resetInactivity();
    // Debounce: ignore if same QR scanned within 3s
    if (state._lastScan === decodedText && Date.now() - state._lastScanTime < 3000) return;
    state._lastScan = decodedText;
    state._lastScanTime = Date.now();

    // Extract UUID from URL or treat as raw UUID
    let uuid = decodedText;
    try {
      const url = new URL(decodedText);
      uuid = url.searchParams.get("id") || decodedText;
    } catch {}

    processCheckin(uuid);
  }

  function manualCheckin() {
    const val = $("manual-uuid").value.trim();
    if (!val) { toast("Enter an attendee ID"); return; }
    processCheckin(val);
    $("manual-uuid").value = "";
    resetInactivity();
  }

  async function processCheckin(uuid) {
    const cfg = Config.getAll();
    showResult("loading", "Checking in…", "");

    if (!cfg.scriptUrl) {
      // Demo mode
      const attendee = state.demoDb.attendees.find(a => a.uuid === uuid);
      if (!attendee) {
        showResult("error", "Not Found", `ID: ${uuid}`);
        auditWrite("checkin_fail", `UUID not found: ${uuid}`);
        return;
      }
      if (attendee.status === "Present") {
        showResult("warn", attendee.name, "Already checked in ⚠️");
        auditWrite("checkin_dupe", `Already present: ${attendee.name}`);
        return;
      }
      attendee.status = "Present";
      attendee.checkinTime = new Date().toLocaleTimeString();
      state.scanCount++;
      state.attendedCount++;
      updateScannerStats();
      showResult("ok", attendee.name, `✓ Checked in at ${attendee.checkinTime}`);
      auditWrite("checkin_ok", `Checked in: ${attendee.name}`);
      return;
    }

    // Real mode
    try {
      const res = await fetch(`${cfg.scriptUrl}?action=checkin&id=${encodeURIComponent(uuid)}&vol=${encodeURIComponent(state.volunteerId || "admin")}`);
      const data = await res.json();
      handleCheckinResponse(data, uuid);
    } catch {
      showResult("error", "Network error", "Check internet connection");
    }
  }

  function handleCheckinResponse(data, uuid) {
    state.scanCount++;
    switch (data.status) {
      case "ok":
        state.attendedCount++;
        updateScannerStats();
        showResult("ok", data.name, `✓ Checked in at ${data.time || new Date().toLocaleTimeString()}`);
        auditWrite("checkin_ok", `Checked in: ${data.name}`);
        break;
      case "already":
        showResult("warn", data.name, `Already checked in at ${data.time}`);
        auditWrite("checkin_dupe", `Duplicate: ${data.name}`);
        break;
      case "not_found":
        showResult("error", "Not Found", `UUID: ${uuid}`);
        auditWrite("checkin_fail", `Not found: ${uuid}`);
        break;
      default:
        showResult("error", "Error", data.message || "Unknown error");
    }
  }

  function showResult(type, title, meta) {
    const card = $("result-card");
    card.className = "result-card show " + {ok:"result-ok", warn:"result-warn", error:"result-err", loading:""}[type];
    card.innerHTML = type === "loading"
      ? `<div class="text-muted text-sm">⏳ ${title}</div>`
      : `<div class="result-name">${type === "ok" ? "✅ " : type === "warn" ? "⚠️ " : "❌ "}${title}</div><div class="result-meta">${meta}</div>`;
  }

  function updateScannerBadge() {
    const badge = $("scanner-role-badge");
    if (!badge) return;
    if (state.role === "admin") {
      badge.textContent = "🔐 Admin";
      badge.className = "scanner-role-badge admin-badge";
    } else {
      badge.textContent = `📱 ${state.volunteerId || "Volunteer"}`;
      badge.className = "scanner-role-badge";
    }
  }

  function updateScannerStats() {
    const sc = $("scan-count");
    const ac = $("attend-count");
    const rc = $("reg-count");
    if (sc) sc.textContent = state.scanCount;
    if (ac) ac.textContent = state.attendedCount;
    if (rc) rc.textContent = state.registeredCount;
  }

  async function fetchStats() {
    const cfg = Config.getAll();
    if (!cfg.scriptUrl) {
      state.registeredCount = state.demoDb.attendees.length;
      state.attendedCount = state.demoDb.attendees.filter(a => a.status === "Present").length;
      updateScannerStats();
      return;
    }
    try {
      const res = await fetch(`${cfg.scriptUrl}?action=stats`);
      const data = await res.json();
      state.registeredCount = data.registered || 0;
      state.attendedCount = data.attended || 0;
      updateScannerStats();
    } catch {}
  }

  /* ── Admin Functions ──────────────────────────────────────── */
  function adminGoToScanner() {
    updateScannerBadge();
    startScanner();
  }

  function adminTab(tab) {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    const btn = document.querySelector(`[data-tab="${tab}"]`);
    if (btn) btn.classList.add("active");
    const panel = $(`panel-${tab}`);
    if (panel) panel.classList.add("active");
    resetInactivity();

    if (tab === "audit") renderAuditLog();
    if (tab === "stats") refreshStats();
    if (tab === "users") loadUsersPanel();
  }

  function loadAdminSheetSettings() {
    const cfg = Config.getAll();
    const fields = ["scriptUrl","sheetId","sheetTab","col-name","col-email","col-phone","col-uuid","col-status","col-time"];
    const set = (id, val) => { const el = $(id); if (el) el.value = val; };
    set("admin-script-url", cfg.scriptUrl);
    set("admin-sheet-id", cfg.sheetId);
    set("admin-sheet-tab", cfg.sheetTab);
    set("col-name",   cfg.cols.name);
    set("col-email",  cfg.cols.email);
    set("col-phone",  cfg.cols.phone);
    set("col-uuid",   cfg.cols.uuid);
    set("col-status", cfg.cols.status);
    set("col-time",   cfg.cols.time);
    set("admin-event-name", cfg.eventName);
    set("admin-accent", cfg.accentColor);
    applyAccent(cfg.accentColor);
    updateLogoPreview(cfg.logoDataUrl);
  }

  function saveSheetConfig() {
    const get = id => { const el = $(id); return el ? el.value.trim() : ""; };
    Config.save({
      scriptUrl: get("admin-script-url"),
      sheetId:   get("admin-sheet-id"),
      sheetTab:  get("admin-sheet-tab"),
      cols: {
        name:   parseInt(get("col-name"))   || 0,
        email:  parseInt(get("col-email"))  || 1,
        phone:  parseInt(get("col-phone"))  || 2,
        uuid:   parseInt(get("col-uuid"))   || 3,
        status: parseInt(get("col-status")) || 4,
        time:   parseInt(get("col-time"))   || 5,
      },
      eventName: get("admin-event-name"),
    });
    toast("✅ Saved");
    auditWrite("config_save", "Sheet config updated");
  }

  function testConnection() {
    const url = $("admin-script-url")?.value.trim();
    if (!url) { toast("Enter Script URL first"); return; }
    toast("Testing…");
    fetch(`${url}?action=ping`)
      .then(r => r.json())
      .then(d => toast(d.status === "ok" ? "✅ Connected!" : "⚠️ Unexpected response"))
      .catch(() => toast("❌ Connection failed"));
  }

  // Admin PIN change
  let _newPinBuffer = "", _confirmPinBuffer = "", _pinStep = "new";
  function handleNewPin(key) {
    const target = _pinStep === "new" ? "_newPinBuffer" : "_confirmPinBuffer";
    if (key === "del")  { window[target] = window[target].slice(0,-1); }
    else if (key==="clr") { window[target] = ""; }
    else if (window[target].length < 4) { window[target] += key; }
    updatePinDots(window[target].length, "new-pin");

    if (window[target].length === 4) {
      if (_pinStep === "new") {
        _pinStep = "confirm";
        $("pin-step-label").textContent = "Confirm new PIN";
        updatePinDots(0, "new-pin");
        toast("Re-enter PIN to confirm");
      } else {
        if (_newPinBuffer === _confirmPinBuffer) {
          Config.save({ adminPin: _newPinBuffer });
          toast("✅ Admin PIN updated");
          auditWrite("pin_change", "Admin PIN changed");
        } else {
          toast("❌ PINs don't match");
        }
        _newPinBuffer = ""; _confirmPinBuffer = ""; _pinStep = "new";
        $("pin-step-label").textContent = "Enter new PIN";
        updatePinDots(0, "new-pin");
      }
    }
  }

  /* ── Users Panel ──────────────────────────────────────────── */
  async function loadUsersPanel() {
    const cfg = Config.getAll();
    let users = state.demoDb.users;
    if (cfg.scriptUrl) {
      try {
        const res = await fetch(`${cfg.scriptUrl}?action=listUsers`);
        const data = await res.json();
        users = data.users || [];
      } catch {}
    }
    renderUsersTable(users);
  }

  function renderUsersTable(users) {
    const tbody = $("users-tbody");
    if (!tbody) return;
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${u.name || "—"}</td>
        <td>${u.phone || "—"}</td>
        <td><span class="badge badge-${u.role==='admin'?'admin':'vol'}">${u.role || "volunteer"}</span></td>
      </tr>
    `).join("");
  }

  function addUser() {
    const name  = $("new-user-name")?.value.trim();
    const phone = $("new-user-phone")?.value.trim().replace(/\D/g,"");
    const role  = $("new-user-role")?.value || "volunteer";
    if (!name || !phone) { toast("Enter name and phone"); return; }

    const cfg = Config.getAll();
    if (!cfg.scriptUrl) {
      state.demoDb.users.push({ name, phone, role });
      loadUsersPanel();
      toast("✅ User added (demo)");
      return;
    }
    fetch(`${cfg.scriptUrl}?action=addUser&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}&role=${role}`)
      .then(r => r.json())
      .then(d => { toast(d.status === "ok" ? "✅ User added" : "❌ " + d.message); loadUsersPanel(); })
      .catch(() => toast("❌ Network error"));
    auditWrite("add_user", `Added: ${name} (${role})`);
  }

  /* ── Audit Log ────────────────────────────────────────────── */
  function renderAuditLog() {
    const tbody = $("audit-tbody");
    if (!tbody) return;
    const rows = [...state.auditLog].reverse().slice(0, 50);
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-sm text-center">No events yet</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(e => `
      <tr>
        <td>${new Date(e.ts).toLocaleTimeString()}</td>
        <td class="audit-event ${e.event.startsWith('checkin')?'checkin':e.event.startsWith('logout')?'logout':''}">${e.event}</td>
        <td>${e.user}</td>
        <td class="text-muted">${e.detail || ""}</td>
      </tr>
    `).join("");
  }

  async function refreshStats() {
    const cfg = Config.getAll();
    if (!cfg.scriptUrl) {
      $("stats-registered").textContent = state.demoDb.attendees.length;
      $("stats-attended").textContent   = state.demoDb.attendees.filter(a=>a.status==="Present").length;
      $("stats-pending").textContent    = state.demoDb.attendees.filter(a=>a.status!=="Present").length;
      const rate = state.demoDb.attendees.length ? Math.round(state.demoDb.attendees.filter(a=>a.status==="Present").length/state.demoDb.attendees.length*100) : 0;
      $("stats-rate").textContent = rate + "%";
      return;
    }
    try {
      const res = await fetch(`${cfg.scriptUrl}?action=stats`);
      const d   = await res.json();
      $("stats-registered").textContent = d.registered || 0;
      $("stats-attended").textContent   = d.attended   || 0;
      $("stats-pending").textContent    = (d.registered||0) - (d.attended||0);
      const rate = d.registered ? Math.round(d.attended/d.registered*100) : 0;
      $("stats-rate").textContent = rate + "%";
    } catch {}
  }

  /* ── Branding ─────────────────────────────────────────────── */
  function handleLogoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      Config.save({ logoDataUrl: e.target.result });
      updateLogoPreview(e.target.result);
      applyBgLogo(e.target.result);
      toast("✅ Logo updated");
      auditWrite("branding", "Logo changed");
    };
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    Config.save({ logoDataUrl: null });
    updateLogoPreview(null);
    applyBgLogo(null);
    toast("Logo removed");
  }

  function updateLogoPreview(dataUrl) {
    const preview = $("logo-preview-img");
    if (!preview) return;
    preview.src = dataUrl || "";
    preview.style.display = dataUrl ? "block" : "none";
    $("logo-placeholder")?.style && ($("logo-placeholder").style.display = dataUrl ? "none" : "flex");
  }

  function saveLogoSettings() {
    const opacity = parseInt($("logo-opacity")?.value || "8");
    const size    = parseInt($("logo-size")?.value    || "280");
    const pos     = $("logo-position")?.value         || "center";
    Config.save({ logoOpacity, logoSize: size, logoPosition: pos });
    applyBgLogo(Config.get("logoDataUrl"));
    toast("✅ Branding saved");
  }

  function applyBgLogo(dataUrl) {
    const cfg = Config.getAll();
    const el  = $("bg-logo");
    if (!el) return;
    if (!dataUrl) { el.style.opacity = 0; return; }
    el.style.backgroundImage = `url('${dataUrl}')`;
    el.style.opacity = cfg.logoOpacity / 100;
    const size = cfg.logoSize || 280;
    el.style.width = el.style.height = size + "px";
    const pos = cfg.logoPosition || "center";
    if (pos === "center") {
      el.style.top = "50%"; el.style.left = "50%";
      el.style.transform = "translate(-50%, -50%)";
    } else if (pos === "top-left") {
      el.style.top = "1rem"; el.style.left = "1rem"; el.style.transform = "";
    } else {
      el.style.top = "1rem"; el.style.right = "1rem"; el.style.left = "auto"; el.style.transform = "";
    }
  }

  function applyAccent(color) {
    if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return;
    document.documentElement.style.setProperty("--accent", color);
    document.documentElement.style.setProperty("--accent-dim", color + "20");
    document.documentElement.style.setProperty("--accent-border", color + "40");
  }

  function saveAccent() {
    const color = $("admin-accent")?.value;
    if (color) { Config.save({ accentColor: color }); applyAccent(color); toast("✅ Accent saved"); }
  }

  /* ── Logout ───────────────────────────────────────────────── */
  function logout(reason) {
    auditWrite("logout", reason === "inactivity" ? "Auto-logout: inactivity" : "Manual logout");
    stopScanner();
    clearTimeout(state.inactivityTimer);
    clearInterval(state.inactivityCountdown);
    $("inactivity-overlay").classList.remove("show");

    state.role = null;
    state.volunteerId = null;
    state.scanCount = 0;
    state.adminPinBuffer = "";

    showScreen("screen-home");
    if (reason === "inactivity") toast("⏱ Session expired — inactivity");
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function init() {
    const cfg = Config.getAll();
    applyAccent(cfg.accentColor);
    applyBgLogo(cfg.logoDataUrl);

    // Event name
    const nameEl = $("event-name");
    if (nameEl) nameEl.textContent = cfg.eventName || "Community Meetup Check-in";

    // Build numpads
    buildNumpad("admin-numpad", handleAdminPin);
    buildNumpad("new-pin-numpad", handleNewPin);

    // Activity tracking
    ["click","touchstart","keydown","mousemove"].forEach(ev =>
      document.addEventListener(ev, () => { if (state.role) resetInactivity(); }, { passive: true })
    );

    // Enter key on phone input
    const phoneInput = $("vol-phone-input");
    if (phoneInput) phoneInput.addEventListener("keydown", e => { if (e.key === "Enter") submitPhone(); });

    // Enter key on manual UUID input
    const manualInput = $("manual-uuid");
    if (manualInput) manualInput.addEventListener("keydown", e => { if (e.key === "Enter") manualCheckin(); });

    // Initialize scanner stat display
    updateScannerStats();

    showScreen("screen-home");
  }

  /* ── Public API ───────────────────────────────────────────── */
  return {
    init,
    selectRole,
    submitPhone,
    adminGoToScanner,
    adminTab,
    saveSheetConfig,
    testConnection,
    addUser,
    handleLogoUpload,
    clearLogo,
    saveLogoSettings,
    saveAccent,
    manualCheckin,
    logout,
    stayLoggedIn,
    renderAuditLog,
    refreshStats,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
