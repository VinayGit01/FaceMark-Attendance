# FaceMark — Smart Attendance System (MERN + Face Recognition)

Check-in / check-out by face, working hours, Present / Late / Half-day / Absent / Leave, reports, leave approval, admin-managed accounts and **password reset by mobile OTP**.

| Layer | Tech |
|---|---|
| Database | MongoDB + Mongoose |
| API | Node.js, Express, JWT, bcrypt, express-validator, helmet, express-rate-limit |
| UI | React 18 (Vite), Tailwind CSS, React Router, Axios |
| Face recognition | face-api.js reads the face in the browser (model files bundled in `client/public/models`); the **server** does all matching, so stored faces never reach a browser |

## Run it

```bash
npm run install:all
npm run server     # API  http://localhost:5000
npm run client     # UI   http://localhost:5173
```
Needs Node 18+ and MongoDB (local or Atlas). Edit `server/.env` first (`MONGO_URI`, `JWT_SECRET`).
The **first account you create becomes the admin** (name, email, mobile, password).

> Upgrading from the first version? The attendance data shape changed. Drop the old collection once:
> `mongosh smart_attendance --eval "db.attendances.drop()"`

## Feature map

| Requirement | Where it lives |
|---|---|
| Check-in | First face scan of the day at the attendance terminal (`POST /api/attendance/recognize`) |
| Check-out | A later scan after the minimum gap. Camera can be set to Both / Check-in only / Check-out only. The **official check-out time** is set in Settings, just like the check-in time |
| Status: Present, Absent, Late, Half-day | Late = check-in after the cut-off. Half-day = worked less than the set hours. Absent = no record and no approved leave. All rules are on **Settings** |
| Working hours | `checkOut − checkIn`, stored as `workingMinutes`. Leaving before the check-out time is flagged **early out**, staying past it is counted as **overtime** (shown in Daily records, History, Reports and CSV) |
| Block early check-out (optional) | Settings → "Block check-out before the check-out time". When on, an early scan is not recorded and the camera screen says check-out is not open yet |
| Attendance history | **History** page: one student, any date range, with summary |
| Reports: daily / weekly / monthly | **Reports** page, per-student table, totals, CSV export |
| Admin dashboard | **Dashboard** (live counts, 7-day chart, latest activity, pending leave) + **Daily records** (admin/teacher can correct any record) |
| Leave integration | **Leave** page. Approved leave shows as "On leave" instead of absent, is excluded from attendance %, and blocks a face scan on that day |
| Face login (2-factor) | Sign in = password **then** a live face scan with a blink check. Password alone never opens a session |
| Self sign-up with admin approval | **Request an account** page: details + face enrolment. The account stays *pending* until an admin approves it **with the admin's own face scan** |
| Admin face check | Creating users, approving/rejecting sign-ups, resetting passwords or faces, disabling and deleting accounts all ask the admin for a face scan first |
| Admin creates users | **Staff accounts** page: set a temporary password; the user must choose their own at first sign-in |
| Forgot password by mobile OTP | Login → "Forgot password?" → mobile → 6-digit SMS code → new password |

## Forgot password: OTP flow

```
POST /api/auth/forgot-password  { mobile }                -> SMS with 6-digit code (valid 5 min, resend after 30 s)
POST /api/auth/verify-otp       { mobile, otp }           -> { resetToken }  (valid 10 min, single purpose)
POST /api/auth/reset-password   { resetToken, newPassword }
```
Security built in: the code is stored only as an HMAC hash and expires automatically; 5 wrong tries cancel it;
the response is identical whether or not the number is registered; auth routes are rate-limited; after any
password change older sessions stop working.

### Sending the SMS — choose in `server/.env`

| `SMS_PROVIDER` | What happens |
|---|---|
| `console` (default) | OTP is printed in the server terminal and shown on screen. **Development only**, switched off when `NODE_ENV=production` |
| `webhook` | Your **workflow API** (n8n, Make, Zapier, or any HTTP endpoint) is called and sends the SMS |
| `twilio` | Sent directly through Twilio |

**Workflow API contract** (`SMS_PROVIDER=webhook`, set `WORKFLOW_WEBHOOK_URL`, optional `WORKFLOW_API_KEY`):

```http
POST <WORKFLOW_WEBHOOK_URL>
Content-Type: application/json
x-api-key: <WORKFLOW_API_KEY>      (only if you set one)

{
  "event": "password_reset_otp",
  "app": "FaceMark",
  "mobile": "+919876543210",
  "otp": "482913",
  "message": "Your FaceMark password reset code is 482913. It expires in 5 minutes. Do not share it with anyone.",
  "expiresInMinutes": 5
}
```
Reply with any `2xx` status to mean "sent". Any other status shows the user "Could not send the SMS".
In n8n or Make: **Webhook** trigger → your SMS node (MSG91, Fast2SMS, Twilio, WhatsApp…) using `{{mobile}}` and `{{message}}`.

## Face login and face-verified sign-up

```
NEW USER                                   ADMIN
Request an account
 details + blink + face samples
 -> account = "pending"  ------------->   Dashboard banner / Staff accounts
                                           "Approve with face scan"
                                            -> admin blinks + scans face
                                            -> server matches it to the ADMIN's enrolled face
                                            -> account becomes active
Sign in
 1) email + password   -> only a 5-minute pass to the face step (no session yet)
 2) blink + face scan  -> server matches against the enrolled face -> session
```

- The **server** compares faces. The browser only sends 128-number descriptors, so it cannot declare "match".
- Wrong face 5 times locks face sign-in for 15 minutes for that account.
- A scanned admin face unlocks sensitive actions for `FACE_PROOF_MINUTES` (default 3) minutes.
- Accounts that existed before this feature, and accounts an admin creates, **enrol their face at their first sign-in** (after the password). Admins can remove someone's face (Staff accounts, face icon) so they re-enrol.
- **Locked out?** `cd server && npm run reset-face -- admin@school.com`, then sign in and enrol again.
- Settings in `server/.env`: `FACE_LOGIN_REQUIRED` (true/false), `FACE_LOGIN_THRESHOLD` (lower = stricter, default 0.45), `FACE_PROOF_MINUTES`.

### Honest limits (read before relying on it)
- Face is a **second factor on top of the password**, not a replacement for it.
- The blink check runs in the browser. It stops a held-up photo, but a determined attacker with a video of the person, or one who crafts requests directly, is not stopped by it. For high-security use, add server-verified liveness (a commercial liveness service) or hardware keys.
- First-time enrolment trusts the password that was just entered. Share temporary passwords privately.
- Face data is biometric data: get consent, serve over HTTPS, protect the database and its backups.

## Roles, permissions and privacy

One system serves a **company** (Super Admin, CEO / Director, HR Manager, Employee) and a **college** (Super Admin, Head of Department, Faculty, Student). The two sides have separate permissions: HR only ever reaches employees, HOD and Faculty only ever reach students of their own department.

| Role | Sign-in | What they can do by default |
|---|---|---|
| **Super Admin** | Staff and admin | Create / deactivate accounts, assign roles and extra permissions, change attendance rules and working hours, see all attendance and reports, read the audit log. **No face-data access unless it is granted** |
| **CEO / Director** | Staff and admin | Executive overview only: organisation totals, department-wise statistics, trends. **Employees only, totals only.** Individual records only if a Super Admin grants them |
| **HR Manager** | Staff and admin | Employees only: monitor attendance and late arrivals, review correction requests, handle leave and exceptions, employee-wise and monthly reports, manage employee profiles and sign-ins |
| **Head of Department** | Staff and admin | Students **of their own department** only: attendance, corrections, leave, reports, student profiles |
| **Faculty** | Staff and admin | Students of their own department: view attendance and reports, review correction requests |
| **Attendance terminal** | Staff and admin | A device account that can only run the face terminal |
| **Employee / Student** | Student / Employee | Own attendance history, own check-in/out times and hours, own status and leave, correction requests, own profile (mobile) and password. **Nothing else.** Optional face self-marking if switched on |

### How privacy is enforced
- **On the server, not just in the menus.** Every route checks the caller's permissions and then limits the query to the people in their scope. Someone outside the scope gets "not found", not "forbidden", so they cannot even confirm a record exists.
- **Two separate sign-in portals.** Students and employees use *Student / Employee*, everyone else uses *Staff and admin*. A password for one never opens the other.
- **Face data is locked down.** Stored faces are never returned by any API. The terminal sends a freshly captured face and the server answers only with who it was. The permissions to **capture faces** (`biometric.enroll`) and to **change recognition settings** (`biometric.settings`) belong to no role. A Super Admin has to grant them to a named person, and they are on top of the face-scan check below.
- **Fresh face scan for sensitive actions.** Creating accounts, changing roles or permissions, approving sign-ups, resetting passwords or faces, creating a student's or employee's sign-in, replacing face data and changing face settings all ask the person doing it to scan their own face first.
- **Audit log.** Sign-ins and failures, account and permission changes, profile changes, face enrolment, settings changes, attendance edits, leave and correction decisions, and every time staff open an individual's history or run a report.
- **Safeguards.** There is always at least one active Super Admin; you cannot demote, disable or delete yourself; extra permissions must be on the known list.

### Extra permissions
A Super Admin can tick extra permissions for one person under **Accounts & access**. Permissions are named `<capability>.<scope>`, for example `attendance.view.employee` or `people.manage.dept`. Scopes: `all`, `employee`, `student`, `dept` (students in the user's own department).

### Corrections and leave
- Students and employees can request a **correction** for any day in the last 30 days. HR (employees) or HOD / Faculty (students in their department) approve or reject. Approving updates the attendance record and is audited.
- **Leave:** students and employees request their own; HR or HOD approve within their scope. Approved leave shows as "On leave", not absent.

### Upgrading from the earlier two-role version
On first start the server upgrades the database automatically: old `teacher` accounts become **Faculty**, people become `student` kind, and existing admins keep what they could already do (face capture and the terminal) as visible grants you can revoke. **Faculty and HOD accounts need a department** (set it under Accounts & access) or they will see nobody.

## MongoDB collections

`users` (role, department, granted permissions, status, face data, lock state) · `students` (students **and** employees, with face descriptors) · `attendances` (one per student per day: status, checkIn, checkOut, workingMinutes) ·
`leaves` · `corrections` · `auditlogs` · `settings` (single document) · `otptokens` (auto-expiring)

## API summary

| Area | Routes |
|---|---|
| Auth | `GET /auth/config`, `/auth/setup-status`, `POST /auth/register` (first admin, needs face), `/signup`, `/login` (step 1, takes `portal`), `/face/login` (step 2), `/face/enroll`, `/face/verify-admin`, `GET /me`, `PATCH /profile`, `POST /change-password`, `/forgot-password`, `/verify-otp`, `/reset-password` |
| Accounts (`users.manage` + face scan) | `GET /users`, `/users/catalog`, `POST /users`, `/users/:id/approve`, `/reject`, `/reset-face`, `/reset-password`, `PATCH /users/:id`, `PUT /users/:id/permissions`, `DELETE /users/:id` |
| People (scoped) | `GET/POST /students`, `PUT/DELETE /students/:id`, `PUT /students/:id/face` (needs `biometric.enroll`), `POST /students/:id/login` |
| Terminal | `POST /attendance/recognize` (needs `attendance.terminal`) |
| Attendance (scoped) | `POST /attendance/manual`, `GET /attendance/day/:date`, `/history/:studentId`, `/report`, `/stats/summary` |
| Self-service (student / employee) | `GET /me/overview`, `POST /me/mark` (only if self-marking is on) |
| Corrections | `GET/POST /corrections`, `PATCH /corrections/:id/review`, `DELETE /corrections/:id` |
| Leave | `GET/POST /leaves`, `PATCH /leaves/:id/review`, `DELETE /leaves/:id` |
| Executive | `GET /summary/org?days=7\|30\|90` (needs `summary.view`, totals only) |
| Audit | `GET /audit` (needs `audit.view`) |
| Settings | `GET /settings`, `PUT /settings` (rules need `settings.manage`; face settings need `biometric.settings` + face scan) |

## Notes

- Times are computed on the **server** in the organisation timezone (default `Asia/Kolkata`, change in Settings), so a wrong laptop clock cannot change attendance.
- Camera access needs `localhost` or HTTPS.
- Face descriptors are biometric data. Get consent, use HTTPS, keep the database private.
- Tune terminal recognition in **Settings → Face recognition** (needs `biometric.settings`). Lower = stricter.
- The terminal and self-marking have **no liveness check** (a held-up photo could be matched). Use the terminal in a supervised place, and keep self-marking off unless you accept that.
