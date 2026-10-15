# Disclaimer

## Community QR Check-in App

**Last updated:** October 2026  
**Maintained by:** Raveendiran R — Docker / Kubernetes Meetup Bangalore

---

### 1. Purpose

This software is provided as an open-source tool for community meetup organisers to manage event attendance using QR codes. It is designed for non-commercial, community use.

---

### 2. No Warranty

This software is provided **"as is"**, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.

In no event shall the authors or maintainers be liable for any claim, damages, or other liability — whether in an action of contract, tort, or otherwise — arising from, out of, or in connection with the software or the use or other dealings in the software.

---

### 3. Data Collection & Privacy

This application processes personal data including:
- Full name
- Email address
- Phone number
- Event attendance records

**You, the event organiser, are the data fiduciary** under applicable law (including India's Digital Personal Data Protection Act, 2023). By deploying this software, you accept responsibility for:

- Obtaining informed consent from attendees (via your Google Form)
- Storing data only as long as necessary
- Restricting access to authorised personnel only
- Notifying attendees of the purpose of data collection
- Complying with applicable data protection regulations in your jurisdiction

The software authors do not collect, access, or process any attendee data. All data is stored in **your own** Google Sheet and Google account.

---

### 4. Third-Party Services

This application uses the following third-party services. Their terms of service and privacy policies apply:

| Service | Purpose | Link |
|---|---|---|
| Google Sheets / Apps Script | Data storage & automation | [terms.google.com](https://policies.google.com/terms) |
| api.qrserver.com | QR code image generation | [goqr.me](https://goqr.me/api/) |
| html5-qrcode (library) | In-browser camera scanning | [github.com/mebjas/html5-qrcode](https://github.com/mebjas/html5-qrcode) |
| Vercel (hosting) | Static site hosting | [vercel.com/legal](https://vercel.com/legal) |

The QR codes generated via `api.qrserver.com` do not contain personal data — they encode only a unique UUID. No personal information is transmitted to the QR generation service.

---

### 5. Security

While the software is designed with security in mind:

- You are responsible for keeping your Google Sheet private
- You are responsible for keeping your Apps Script URL, Sheet ID, and Admin PIN confidential
- You should change the default Admin PIN (`9999`) immediately after deployment
- The authors are not responsible for data breaches resulting from misconfiguration

---

### 6. Limitations of Liability

The maximum liability of the authors, to the extent permitted by law, shall not exceed zero (₹0 / $0). Use this software at your own risk.

---

### 7. Governing Law

This disclaimer is governed by the laws of India. Any disputes shall be subject to the jurisdiction of courts in Bangalore, Karnataka.

---

### 8. Contact

For questions, security disclosures, or contributions:
- GitHub: [github.com/Raveendiran-RR/Community-QR-APP](https://github.com/Raveendiran-RR/Community-QR-APP)
- Community: Docker / Kubernetes Meetup Bangalore

---

*This disclaimer does not constitute legal advice. Consult a qualified legal professional for compliance with your specific jurisdiction's data protection requirements.*
