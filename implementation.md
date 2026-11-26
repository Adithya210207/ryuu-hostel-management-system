# Ryuu — Implementation Plan

**Status: APPROVED FOR DEVELOPMENT — owner instructed “proceed” on 16 September 2026**
**Prepared:** 16 September 2026  
**Business timezone:** Asia/Kolkata (IST)  
**Currency:** INR  
**Website language:** English

This document consolidates the requirements discussed with the owner. It is a specification for a complete hostel website and backend, not a claim that the existing visual prototype already implements these features.

**Approval boundary:** The owner approved proceeding with implementation on 16 September 2026, including use of the downloaded animation reference. Proposed defaults in this plan guide implementation; explicitly deferred business settings and provider/hardware choices remain configurable. Production service activation requires actual credentials and final business settings.

## 1. How to read the plan

- **Confirmed:** Explicitly requested or accepted in the discussion.
- **Proposed default:** A recommended detail needed to make the workflows precise; open to changes during this review.
- **Admin-configurable:** Build the setting and validation; the business will enter its values later.
- **Deferred:** A decision, asset, or external integration intentionally left for later.

Proposed defaults must not be mistaken for rules already individually approved. Important defaults and remaining decisions are collected in section 18.

## 2. Business, identity, and design

### 2.1 Confirmed business information

| Item | Value |
| --- | --- |
| Name | Ryuu |
| Type | Men's hostel for students and working men |
| Minimum age | 18 at registration, validated from date of birth |
| Address supplied | Sowripalayam, Bengaluru, Tamil Nadu — 641028 |
| Business phone placeholder | 0000000000 |
| Email placeholder | hello@example.com |
| Opening date | Not decided; show “To be announced” |
| Language | English |

The contact values are demonstration content, not verified delivery destinations. Keep live OTP and notification delivery disconnected from placeholder values. Confirm the final address spelling, contacts, and opening information before launch.

### 2.2 Confirmed facilities

- Food option available; billing method and prices configured by admins.
- AC rooms, mostly three-sharing or four-sharing.
- Attached bathroom for each room.
- Individual lockers/wardrobes.
- Lift and car parking.
- Central city location with a peaceful atmosphere.

Do not invent facilities, room prices, testimonials, occupancy numbers, safety certifications, or opening claims.

### 2.3 Supplied assets and reference

- Visual and animation reference: https://www.syahrilarfianalmazril.my.id/
- Downloaded reference: `C:/Users/user/Documents/my favorite ui design - website 1`.
- Supplied logo: `C:/Users/user/AppData/Local/Temp/codex-clipboard-887d3447-6c05-4ac5-ba1f-2b6b625a5f9f.png`.
- Supplied exterior architectural render: `C:/Users/user/AppData/Local/Temp/codex-clipboard-9d17ba43-62b9-4a93-a7bf-ec83df647594.png`.

The second image depicts the proposed exterior, not the actual completed building or an interior floor plan. Label it accordingly. At implementation time, copy available supplied assets into the project so the site does not depend on temporary attachment paths; request the original again if a temporary file has expired.

The downloaded reference is a mirror of public HTML, compiled browser bundles, fonts, and assets. It is useful for visual inspection and motion timing but is not the original editable source or a hostel backend. Rebuild maintainable components for Ryuu. Preserve required asset attribution/licences and confirm reuse rights for borrowed assets; the mirror's package metadata alone is not proof of rights to every asset.

### 2.4 Visual requirements

**Confirmed:** Match the reference closely: oversized typography, handwritten entrance, metallic text shimmer, moving spotlights, floating symbols, curved transitions, animated navigation, scroll reveals, sticky/zoom compositions, and animated image sections. Use Ryuu branding and hostel content throughout.

- Use the supplied logo and building render.
- Generate a small set of temporary hostel images after plan approval; identify them as illustrative and make replacement with real photos straightforward.
- Start with a clearly labelled dummy floor/room/bed layout. Replace its geometry and inventory when the owner supplies the real floor plan.
- Support mobile and desktop, keyboard navigation, readable text, clear focus states, and reduced-motion preferences.
- **Proposed default:** Keep rich motion on the public site; use restrained motion in dashboards so forms, tables, and daily tasks remain fast and readable.

## 3. Roles, accounts, and permissions

### 3.1 Roles

| Role | Access |
| --- | --- |
| Admin | All administration functions. Multiple admins have equal permissions. |
| Resident | Their own profile, application, booking, payments, meals, attendance, outpasses, messages, tickets, and notices. |
| Guardian | Attendance and outpass information for their linked resident; notices addressed to guardians; their own private admin conversation and tickets. |

Authorization must be enforced on the server for every record, download, export, and action. Redirecting to the correct dashboard is not an access-control mechanism. A resident cannot obtain another resident's data by changing a URL or resident number; a guardian cannot browse arbitrary residents. [Authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

### 3.2 Sign-in and verification

- One sign-in entry point routes a verified account to its appropriate role dashboard.
- Resident password login accepts the permanent resident ID. **Proposed default:** Also accept their verified email or phone.
- Guardians support email OTP login and email/phone plus password.
- Gmail sends email verification, login OTP and password recovery. WhatsApp verifies the signed-in account holder’s saved phone number only. Both email and phone verification are required before resident bed application/admission. Routine updates use website history and opt-in phone push; SMS is removed.
- Admin accounts are created through protected administration; there is no public admin self-registration.
- First admin is provisioned through a one-time deployment bootstrap, not a shipped default password.
- Account creation/invitation, password setup/reset, session revocation, and verification events are audited.
- Use established authentication components, secure password hashing, expiring single-use challenges, resend limits, attempt limits, and secure server sessions.
- Changes to email require re-verification; contact changes require admin review; do not transfer access just because someone knows a resident ID.

**Proposed defaults requiring review:** Guardian invitation requires verification of the registered contact. Guardian email verification is recommended when email/password access is enabled. Resident OTP login is available alongside password login. Admins require an additional authentication factor for sensitive actions. Email OTP, email verification and email password recovery use the configured Gmail sender.

### 3.3 Guardian relationship

**Confirmed:** One guardian account per resident. The guardian is linked through verified registration/invitation, not public resident lookup.

**Proposed default:** A guardian who is responsible for two residents may use one verified account linked to both, while each resident still has only one guardian. Keep this explicit in the data model; do not silently create duplicate accounts for the same phone number. Account linking/replacement requires authenticated admin action and an audit entry.

Guardians have no outpass-extension approval authority. They receive relevant outpass and attendance information; meal and payment reminders remain resident-directed.

### 3.4 Admin account creation and manual residents

**Confirmed:** Any admin can create additional equal-permission admin accounts and manually create residents and assign available rooms/beds.

Recommended manual resident modes, selected by the owner for inclusion in this plan:

1. **Existing resident — already admitted:** Enter actual move-in date, current bed, verified historical payments/deposit, and any opening balance. Bypass the new-admission approval path. Creating the account does not mark any money as paid.
2. **New applicant:** Use the normal admission, payment, and verification path even though an admin entered the information.

Both complete contact verification. Admins never bypass bed-conflict checks. Invitations allow users to set their own passwords. Preserve at least one usable admin account and audit admin creation, deactivation, and sensitive setting changes.

### 3.5 Permanent resident ID

**Confirmed:** Every resident receives a unique roll-number-style ID. **Proposed format and lifecycle:** Automatically issue an ID such as `JN-2026-0001`, with the following behavior.

- Generated when a resident account is created, for public and manual registration alike.
- Globally unique within the hostel, enforced in the database; sequence allocation must be safe under concurrent registrations.
- Year identifies creation year; numbering may restart within a new year because the complete ID remains unique.
- Permanent, never recycled, and unchanged by transfers or departure.
- Appears in resident records, payments, attendance, outpasses, tickets, and exports.
- Internal database IDs remain separate; the resident number is an identifier, not a secret.

## 4. Registration and identity documents

### 4.1 Fields requested by the owner

| Resident | Parent/guardian |
| --- | --- |
| Phone, verified | Phone |
| Email, verified | Email |
| Address | Profession |
| Date of birth | Date of birth |
| Profession: student / working / applicable detail | Aadhaar PDF |
| Aadhaar PDF | One linked guardian account |

**Proposed standard additions:** Full names for both people; guardian relationship; college/employer name where relevant; intended move-in date; optional expected duration; optional resident photo; an emergency contact only if different from the guardian; explicit acknowledgement of hostel rules and account/data notices. The exact mandatory/optional status of these additions is open for review.

Collect guardian information for its stated purpose and obtain the guardian's own verification/acknowledgement through their invitation. Admission and document-review statuses must be visible to the resident.

### 4.2 Requested Aadhaar policy and unresolved production question

**Owner request, recorded faithfully:** Full, unmasked Aadhaar PDFs are mandatory for both resident and guardian; masked PDFs were explicitly declined.

**Production question requiring confirmation:** This requested business policy is not a legal conclusion. UIDAI's current authentication/offline-verification regulations address consent and alternative identification, and regulate collection/use of Aadhaar information. Applicability to the proposed collection and verification method must be checked before enforcing Aadhaar-only admission or retaining full documents. Confirm the lawful basis, required alternative-ID process, guardian-document necessity, and retention/deletion rules with qualified Indian advice. Encryption alone does not settle these questions. Keep the identity-policy implementation configurable and use synthetic documents during development. [UIDAI consolidated regulations, updated December 2025](https://uidai.gov.in/images/The_Aadhaar_Authentication_and_Offline_Verifications_Regulations_2021-_Clean_copy-30122025.pdf), [UIDAI current regulations index](https://www.uidai.gov.in/en/about-uidai/legal-framework/regulations.html).

This question does not authorize silently replacing the owner's requested policy; any required change must be reflected in the reviewed specification.

### 4.3 Document handling

- Store identity files privately and encrypted, outside public website assets. Keep encryption keys separate from file backups.
- Authenticated, authorized admin verification access; log views, downloads, replacements, and deletions without putting document contents in logs.
- Validate actual PDF/image type and size; assign server-generated filenames; quarantine and scan uploads before admin access.
- Keep Aadhaar PDFs out of routine Excel/PDF resident exports and out of notification attachments.
- Use authorized download handlers or short-lived download access. Avoid public, guessable file URLs.
- Password-protected PDFs need an explicit handling policy; propose asking for a readable upload with clear instructions, without retaining a document password.
- Record review result, reviewer, timestamp, and reason for rejection. Uploading a PDF alone does not prove identity or Aadhaar authenticity.
- Set document, rejected-application, departed-resident, and backup-retention policies before production.

File validation and access controls follow the [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

## 5. Admissions, beds, and transfers

### 5.1 Admission flow — confirmed

1. Resident registers and verifies her email.
2. Resident completes the application and chooses a room/bed.
3. Admin reviews and approves or rejects admission.
4. Approval requests first-month rent and the refundable security deposit.
5. Resident submits payment details within **48 hours of admission approval**.
6. Admin verifies or rejects the payment.
7. After verification, booking is confirmed; actual move-in is recorded separately.

Keep application status, bed reservation, payment status, account access, and actual occupancy separate. An applicant needs access to complete admission and payment without being counted as already living in the hostel.

### 5.2 Theatre-style bed selection

- Floor selector, room cards/layout, and individually numbered beds.
- Clear states: Available, Selected by you, Reserved, Occupied, and Unavailable/maintenance.
- Provide a readable list alternative to the visual map and keyboard-operable bed controls.
- Show sharing count, room amenities, and configured price before selection.
- Use dummy inventory and geometry during development, clearly labelled. Actual floor counts, room identifiers, and capacity are deferred.
- Logical floor/room/bed records must remain separate from visual coordinates so the real floor plan can replace the dummy layout without rewriting booking rules.
- Admins manage logical inventory, availability, and pricing. Do not invent a full CAD/floor-plan editor; real layout replacement is a later content/geometry update.

### 5.3 Reservation deadlines — confirmed

| Event | Reservation behavior |
| --- | --- |
| Admission approved | Start a 48-hour payment-submission deadline. |
| No submission by deadline | Expire reservation and release bed. |
| Validly completed proof submission before deadline | Keep the bed reserved while admin verifies it. |
| Admin rejects admission payment proof | Start a fresh 48-hour resubmission window from rejection time. |
| Resubmission within that window | Keep bed reserved during the new review. |
| No resubmission by that window's end | Release bed. |
| Payment verified | Confirm booking; transition to occupied at actual move-in. |

**Proposed default:** Before admission approval, the selected bed is a preference, not an exclusive reservation. Explain this on the selection screen. Several pending applicants may request the same bed, but admin approval atomically reserves it for only one applicant. If it is no longer available, ask the applicant to select an alternative; do not silently substitute another bed. The agreed 48-hour timer starts only after successful approval/reservation. This pre-approval behavior is a proposed detail for review, not a previously agreed rule.

Only server-accepted, complete proof submissions pause expiry. A client-side form draft or failed upload does not. Expiry and submission must be arbitrated atomically using server time; browser countdowns are informational. Final booking requires database-level conflict protection, not a disabled button alone. [PostgreSQL row-locking documentation](https://www.postgresql.org/docs/17/explicit-locking.html)

Repeated payment rejections remain in history. Do not invent a maximum resubmission count; admins can reject/cancel the application if needed.

### 5.4 Room/bed transfers — confirmed

- Resident requests another available room/bed.
- Admin approves or rejects, giving a reason where appropriate.
- Current bed remains assigned until the approved transfer actually takes effect.
- Recheck availability when confirming the transfer and update the two bed assignments atomically.
- Preserve assignment history and permanent resident ID.
- **Unresolved setting:** Effective date and handling of any rent difference. Proposed default: admin explicitly reviews the new rate and any adjustment; do not silently apply a second move-in prorating rule.

### 5.5 Checkout and deposit settlement

Notice period, eligibility for refund, permitted deductions, and their amounts are **admin-configurable later**. Record checkout date, bed release, deposit held, itemized deductions, refundable amount, refund status, and admin actions. Recording a refund is distinct from actually transferring money; automatic bank refunds are not requested.

## 6. Billing and manual payment verification

### 6.1 Initial charges — confirmed

- First month's rent and refundable security deposit; both amounts set by admins later.
- First-month rent is proportional to remaining calendar days, **including the move-in date**.
- Formula: `monthly rent / calendar days in move-in month × billable days remaining`.
- Subsequent months charge full monthly rent.
- Deposit is the full configured amount, not prorated.
- First-month admission payment uses its 48-hour deadline, not a retroactive 1st–5th deadline before the resident joined.
- **Proposed implementation detail:** Calculate in integer paise using decimal-safe arithmetic and round the final prorated line once; show the calculation on the bill. Use the intended move-in date for the initial quote, and audit any approved change to it.

### 6.2 Monthly cycle — confirmed

- Billing opens on the **1st** of each month.
- Payment submission is due by the end of the **5th**, in IST.
- Daily overdue penalties start on the **6th**.
- Admins configure the daily penalty amount.
- Reminders are required; the exact monthly reminder times/frequency remain configurable.
- Do not label a payment as paid until an admin verifies it.

### 6.3 Resident payment tab — confirmed

Show the applicable month/bill, rent, deposit where applicable, food charges, adjustments, penalty, total due, and previous payments. Show admin-configured payment QR/UPI and bank details.

Every submission requires:

1. Amount paid.
2. Payment date.
3. Transaction/UTR reference.
4. Screenshot or PDF proof.

Store bill allocation and payment method with the submission. Protect proof uploads, record submission time separately from the resident-entered payment date, and flag duplicate references/proof for admin review. Do not silently reject legitimate duplicate-looking references across different providers without review.

### 6.4 Admin payment tab — confirmed

- Filter by resident ID/name, billing period, and status.
- View submitted details and authorized proof.
- **Verify** updates both admin and resident records consistently.
- **Reject** requires a reason and notifies the resident, who can resubmit.
- Preserve each submission and decision; do not overwrite rejected proof with new proof.
- Prevent two admins from verifying/allocating the same submission twice.
- **Proposed default:** Verified payment becomes an immutable ledger entry. Corrections use an audited reversal/adjustment, not deletion.

Display separate bill and submission status where needed:

- Bill: Unpaid, Awaiting verification, Paid, Overdue, or outstanding balance if enabled.
- Submission: Submitted, Verified, Rejected, Superseded/withdrawn where supported.

### 6.5 Daily penalty rules — confirmed, with day-boundary default

| State | Penalty behavior |
| --- | --- |
| Unpaid after the 5th | Daily charge accrues. |
| Complete payment proof submitted | Pause further penalties during admin review. |
| Payment rejected | Resume penalties until the next complete submission. |
| Resubmitted | Pause during review again. |
| Verified and bill settled | Stop penalties for the settled bill. |

Time awaiting admin review never attracts penalties and is not charged retroactively following rejection.

**Proposed day-boundary rule for review:** Assess once per resident/bill/IST calendar day, at the end of that day, only if the bill remains unpaid/rejected and there was no valid verification-review interval during that day. A day containing any time awaiting verification gets no new charge; after rejection, charging resumes on the next otherwise chargeable day. A settled bill receives no new charge. This deliberately excludes review time without hourly or duplicate charges. Different treatment of submission/rejection days can be selected before implementation.

Snapshot the penalty policy for each bill; later admin changes should not silently rewrite past charges. Keep penalty entries separate from rent and preserve the reasons for waivers/adjustments.

**Open billing scope:** Partial payments, payment covering multiple months, advances, cash collection, downloadable receipts, exact monthly reminder schedule, and electricity/parking charges have not been explicitly settled. Proposed first-release default: one submission against one bill, full amount expected, and any exception handled by an explicit admin adjustment. Do not mark an underpaid bill settled merely because its transfer was genuine.

## 7. Meal choices and kitchen counts

### 7.1 Confirmed daily flow

The form covers **the next calendar day's breakfast, lunch, and dinner**.

| IST time | Action |
| --- | --- |
| 6:00 PM | Open the next-day form and send the submission message. |
| 9:00 PM | Remind eligible residents who have not submitted. |
| 10:00 PM | Remind only those still pending. |
| 11:00 PM | Close ordinary submissions and lock the kitchen counts. |

- Form opens inside the resident portal; authentication is required. Meal reminders are website-only.
- Breakfast/lunch/dinner each have an explicit Yes/No choice.
- Residents can edit submitted choices until the cutoff. **Proposed default:** No meal is preselected; “No to all three” is a valid completed submission and stops reminders.
- Missing form at 11 PM becomes **Not submitted**, with **zero meals** in kitchen counts.
- An emergency late submission/change is permitted only after admin approval.
- Approved emergency changes update the operational count, create a new count revision, and preserve the original locked snapshot and reason.
- Admins see daily totals and the resident-level breakdown. Proposed convenience: printable kitchen summary using those same counts.

### 7.2 Eligibility and proposed outpass/meal interaction

- The requested audience is current residents living and paying rent, not applicants or checked-out accounts.
- **Proposed default needing review:** Treat all actively occupied residents as eligible while payment is pending or overdue; do not automatically deny meals solely because an admin has not verified rent. If a different “currently paying” definition is intended, specify it explicitly.
- The detailed outpass/meal rules below were recommended during discussion and are included as **proposed defaults** for final review.
- An outpass covering the entire next day removes unnecessary meal prompts/reminders for that day.
- Full days away are excluded; departure/return days allow individual meal choices.
- Outpass creation, cancellation, approved extension, and recorded early return update future meal eligibility before the relevant cutoff.
- Restoring eligibility does not silently order meals: prompt the resident to select them before cutoff, or request an emergency addition afterward.
- After cutoff, changes go through the emergency/admin adjustment process. An anticipated return does not count as a recorded return.
- **Unresolved edge:** If a resident is overdue for return, keep their away status and request/admin-manage any meal reinstatement rather than silently assuming arrival. Meal eligibility uses actual departure/return and explicit plans, not an initial approval alone as proof of leaving.

### 7.3 Food billing — configurable with proposed defaults

Admins will later choose the billing method and prices: food included in rent, optional monthly package, or per-meal billing.

Recommended defaults previously proposed, retained for owner review:

- Included/monthly food: no automatic deduction for missed meals or outpass days; admins may make a reasoned adjustment.
- Per-meal: bill selected meals after cutoff; cancellations before cutoff incur no charge; late cancellations remain chargeable unless an admin grants an adjustment.
- Preserve the selected plan and rates applicable to each billing period; do not backdate price changes.
- Food adjustments require a reason and ledger history.

Menus, dietary variants, takeaway, allergy collection, and meal-service times have not been requested as first-release features. Do not invent those fields as mandatory.

## 8. Daily attendance and biometric integration

### 8.1 Confirmed attendance rules

- Attendance scan window: **6 PM–10 PM IST every day**.
- At 10 PM, missing attendance is labelled **Attendance not recorded**, not automatically “absent” or “left hostel.”
- Notify **admins only** automatically about missing attendance.
- Admin checks device problems/outpasses and contacts the resident. Guardian contact is an admin escalation if the absence remains unexplained and the resident cannot be reached.
- Active outpass residents are shown as **Away on outpass** and exempt while actually away.
- Guardians can see their linked resident's attendance history and recorded scan times.

**Proposed defaults:** First valid attendance scan in the window satisfies the day's check; keep all raw events for reconciliation. A confirmed return in that window may also satisfy attendance if the device event is an actual arrival. A future outpass, a cancelled outpass, or one with no departure record does not automatically excuse attendance. Resolve same-day departure/return cases from the event timeline.

### 8.2 Hardware deferred

Brand, model, fingerprint/face modality, SDK/API, entry/exit reader arrangement, and offline capabilities are **not selected**. Do not claim support for a device or complete biometric integration before its protocol is known and tested.

Design a device adapter accepting a device resident reference, event ID, actual event time, receipt time, and event type (attendance/departure/return). The event must identify direction/purpose explicitly; do not toggle “in/out” blindly on successive scans.

- Keep device templates in the device/vendor system where supported; the portal should work with mapped IDs and attendance events, not collect raw fingerprint/face templates by default.
- This is hostel attendance integration, not Aadhaar biometric authentication.
- Physical door locking/unlocking and access-control hardware are outside the requested event-recording scope.
- Verify incoming device requests, deduplicate events, check timestamp plausibility, and reconcile delayed/out-of-order events.
- Display device heartbeat/last sync and pending reconciliation.
- Provide clearly labelled simulated events in development. Mark production hardware as Not configured until connected.

### 8.3 Manual fallback — confirmed

Admins can manually record outpass departure/return when a scanner fails. Require resident, event type, actual event time, recording time, admin identity, and a mandatory reason. Preserve correction history rather than deleting old events. Manual return closes the outpass and cancels a pending overdue-return alert just like a valid device return.

**Proposed extension of the fallback for review:** Allow reasoned admin correction of daily attendance after a device outage. Manual daily attendance was not separately confirmed and must not be confused with the explicitly approved departure/return fallback.

## 9. Outpasses and extensions

### 9.1 Initial outpass — confirmed

- Used for an absence lasting more than one day.
- Resident enters departure and expected return date/time, destination, reason, and contact information.
- Initial request is **automatically approved** because residents are adults.
- Initial approval creates an approved plan, not evidence of actual departure.
- Departure scan/manual record changes status to Away and sends the guardian a departure notification.
- Return scan/manual record records actual arrival, closes the outpass, and sends the guardian a return notification.

**Proposed defaults:** Prevent overlapping active outpasses; allow cancellation before departure; preserve the original approved return time. Ordinary short outings do not create a new outpass. Handling a scan with no matching active outpass is a separate reconciliation event for the admin.

### 9.2 Extensions — confirmed

- Residents request an extension with a proposed new return time and reason.
- **Admin approval is mandatory** for each extension.
- Maximum approved extension is **48 additional hours in total per outpass**, including multiple requests. It is not 48 hours per request and not a two-day maximum for the original absence.
- Validate the cumulative cap against the original expected return time.
- Validate concurrent extension decisions inside a transaction so two admins cannot exceed the cumulative cap. Keep an already-sent overdue alert in history even if an extension is later approved; reschedule only the outstanding future check.
- Pending/rejected requests do not change the approved deadline or postpone its overdue alert.
- Approved requests update the approved deadline, future meal eligibility, guardian-visible record, and scheduled overdue check.
- Extension decisions and reasons are kept in history; a rejected request does not cancel the existing outpass.

### 9.3 Late-return alert — confirmed

`alert time = latest ADMIN-APPROVED expected return timestamp + 24 hours`

At that time, if there is no valid return scan or manual return record, notify the admin. This applies even if no extension was requested. An unapproved request never delays the alert. Proposed default: send one overdue alert per effective deadline and keep the condition visible until resolved; repeated escalation timing is not yet specified.

Examples:

- Due 10 October at 8 PM, no extension, no return: admin alert 11 October at 8 PM.
- Request submitted but pending: same alert time.
- Admin approves a one-day extension to 11 October at 8 PM: alert moves to 12 October at 8 PM.
- A return recorded before the alert cancels it; a delayed device event reconciles any already-raised alert without deleting history.

## 10. Guardian dashboard

**Confirmed:** One guardian account per resident, with password and email-OTP access.

Show:

- Linked resident's name/ID and relevant account context.
- Daily attendance status, scan time, and history.
- Outpass departure/return plans and actual recorded events.
- Extension requests, admin decisions, and current approved return deadline.
- Departure and return notifications.
- Announcements addressed to Guardians or Both.
- The guardian's own private admin conversation and issue tickets.

Resident-to-admin private conversations are not automatically visible to guardians, and guardian conversations are not automatically visible to residents. Guardian access does not include resident payment history or identity-document exports unless a later explicit requirement changes that scope.

## 11. Announcements, private messages, and tickets

### 11.1 Hostel-wide announcements — confirmed

Admins select **Residents only**, **Guardians only**, or **Both**. The announcement appears in the selected accounts inside the website only.

Room/floor targeting and a separate arbitrary individual-broadcast composer are not part of the agreed broadcast requirement. Individual conversations and system notices still work normally.

**Proposed default:** General hostel broadcasts target current residents and their linked guardians. Former residents and applicants are excluded unless an admin explicitly chooses an additional audience in a later scope change. Preview audience and recipient count before sending; record author and delivery outcomes.

### 11.2 Shared private inbox — confirmed

- Residents and guardians can privately text the admin team.
- All admins can view and reply through the shared inbox.
- Each conversation is visible only to its user and the admin team.
- Show which admin replied and retain thread history.
- Messages remain within the portal, with opt-in phone push alerts. Gmail is reserved for authentication.
- **Proposed defaults:** Track unread/read status; provide modest attachment support using the protected upload pipeline; use near-real-time updates or short polling without requiring the user to reload.

### 11.3 Issue tickets — confirmed scope; workflow defaults for review

All resident and guardian accounts can raise issues; admins manage the queue. Proposed fields: category, subject, description, optional attachment, and priority. Proposed categories: room/facilities, food, payment, account/access, and other; admins can rename/add categories.

Proposed workflow: **Open → In progress → Resolved → Closed**, with discussion, assignment to an admin, and reopening when unresolved. Changes produce in-app updates only. Keep ticket ownership and privacy separate from the linked resident relationship. Response-time targets and automatic closure are not yet specified.

## 12. Notifications, OTPs, and scheduled work

### 12.1 Delivery matrix

| Event | Recipient | Delivery |
| --- | --- | --- |
| Email verification / OTP login | Account holder | Gmail authentication email |
| Resident email verification | Resident | Email |
| Admission decision / payment deadline | Resident | In-app only |
| Payment reminder / rejection / verification | Resident | In-app only |
| Meal request at 6 PM | Eligible resident | In-app only |
| Meal reminders at 9 PM and 10 PM | Eligible, unsubmitted resident | In-app only |
| Actual outpass departure and return | Linked guardian | In-app only |
| Extension decision | Resident | In-app only; record visible to guardian |
| Attendance missing at 10 PM | Admin team only | In-app only |
| Return overdue by 24 hours | Admin team | In-app only |
| Announcement | Admin-selected role audience | In-app only |
| Private reply / ticket update | Relevant conversation/ticket owner | In-app only |

Gmail SMTP sends authentication codes. Web Push alerts devices about new portal notifications. Live credentials and device commissioning remain pending.

### 12.2 Provider dependencies — deferred

Configure the dedicated Gmail sender and Web Push VAPID keys. All routine notifications remain in the website and trigger generic push alerts for subscribed devices. Provider acceptance is separate from confirmed receipt; no WhatsApp or SMS delivery remains active.

Record contact verification and notification opt-in preferences. Keep OTPs, identity files, complete Aadhaar numbers, and private document URLs out of routine notification bodies and logs.

### 12.3 Durable scheduling

Jobs must run server-side independently of open browser tabs. Use a persistent job queue/scheduler with retries, idempotency, delivery logs, and an admin-visible failed-job queue.

Required jobs include:

- Monthly bill generation, configured monthly reminders, and daily penalty assessment.
- Exact per-booking 48-hour expiry and rejection/resubmission windows.
- Meal form opening, conditional reminders, and count locking.
- Attendance close/check at 10 PM.
- Per-outpass approved return plus 24-hour check.
- In-app notification scheduling, export generation, and retention/backup tasks when configured.

Store timestamps in UTC and calculate business dates/windows in IST. Use stable event/job keys so retries or two workers do not create duplicate bills, charges, alerts, or messages.

On restart after downtime, reconcile state before sending: skip obsolete 9/10 PM meal reminders after the cutoff; rebuild missed form/count/billing work; do not send an overdue-return alert for someone already returned. Hardware and service outages need an admin-visible reconciliation path, not fabricated attendance or delivery success.

## 13. Admin dashboard and reporting

### 13.1 Main views

- Overview: occupied/available/reserved beds, applications awaiting review, pending payments, overdue balances, today's attendance, away/overdue residents, meal totals, unread messages, and open tickets.
- Admissions and documents: application review, manual creation, verification status, room/bed assignment.
- Residents: permanent ID search, profile, guardian link, occupancy, payment and attendance/outpass histories.
- Rooms/beds: logical inventory, dummy/real map, pricing, reservations, transfers, and maintenance availability.
- Payments: configured collection details, bills, proof review, verified history, penalties, and audited adjustments.
- Meals: tomorrow's responses, pending responses, locked counts, and emergency requests.
- Attendance/outpasses: date filters, exceptions, manual records, extensions, and late-return alerts.
- Announcements, shared private inbox, and ticket queue.
- Admin accounts and configurable business settings.
- Exports, audit history, and system health.

### 13.2 Excel/PDF exports — confirmed

Export one resident, selected residents, or the full hostel. Support selectable sections and relevant date filters:

- Basic profile and room/bed selected by default.
- Guardian details.
- Payment/balance history.
- Attendance history.
- Outpass and extension history.

Include resident IDs, applied filters, business timezone, and generation time. Keep columns readable in Excel and paginate long PDF tables. Generate large exports as background jobs with expiring authorized downloads. Audit who requested/downloaded an export. Escape spreadsheet formulas in user-entered cells. Exclude full Aadhaar PDFs and secrets from routine exports; individual identity downloads use their separate permissions and audit trail.

### 13.3 System health / end-to-end verification — confirmed

Provide an admin-only **Run system check** action and a history of results, distinguishing:

1. **Live health:** Web/API response, database access, worker/scheduler heartbeat, storage availability, queue backlog, backup freshness, configured provider health, and biometric last contact.
2. **Functional verification:** Tests of login/role restrictions, admission/bed conflict handling, payments, meals, attendance/outpasses, messages/tickets, and exports using dedicated synthetic accounts and isolated test data.

Report Passed, Failed, Warning, Not configured, or Not tested, with a timestamp and a useful summary. A missing scanner/provider is not a passing integration check. A mocked message delivery is not proof of real phone/email delivery.

Live checks should be non-destructive. Run full write-producing tests in a separate test database/environment. Any real delivery probe must be explicitly initiated by an admin to designated test recipients and identified as a test. Health reports must not expose credentials, identity files, or raw internal stack traces to ordinary users.

## 14. Proposed technical architecture

This architecture is a proposal for plan approval; no migration or backend installation has started.

### 14.1 Portable deployment target

The owner wants a complete backend that can be hosted on a future hostel PC/server, but explicitly deferred physical hardware, budget, operating system, network, and final hosting choice. Deliver a portable application and deployment documentation without tying it to one PC model, scanner, cloud account, or hosting vendor. Do not resume the prototype's Sites publication workflow as part of this planning work.

### 14.2 Components

| Component | Proposed choice / responsibility |
| --- | --- |
| Public site and dashboards | React + TypeScript with Next.js; shared accessible UI components |
| Server/API | Node.js backend within the same modular application; server-side authorization and validation |
| Database | PostgreSQL for relational records, transactions, constraints, and migration history |
| Background worker | Separate process with a PostgreSQL-backed durable queue and scheduler |
| Private documents | Encrypted private file volume initially, behind an interface that can move to object storage |
| Authentication | Maintained authentication/session components, with password and provider-backed OTP flows |
| Live updates | Server events or bounded polling for relevant dashboards/inbox |
| Exports | Server-generated XLSX and PDF jobs |
| Packaging | Docker Compose for web, worker, and database; optional reverse proxy and selected integrations |
| Tests | Business-rule tests, integration/database tests, and browser end-to-end tests |

Next.js supports full applications through Node.js and Docker self-hosting; a static export alone is insufficient for these backend workflows. [Official deployment options](https://nextjs.org/docs/app/getting-started/deploying), [self-hosting guidance](https://nextjs.org/docs/app/guides/self-hosting).

Use maintained supported releases and lock versions at implementation time. Keep migrations, configuration examples, health endpoints, seed data, backup/restore commands, and update instructions in source control. Secrets and real uploads stay outside source control. Exact hardware and production network topology remain deferred.

### 14.3 Logical data model

| Area | Main records |
| --- | --- |
| Identity | users, roles, sessions, verification challenges, resident profiles, guardian profiles, guardian links, document metadata, consent records |
| Occupancy | floors, rooms, beds, applications, reservations, assignments, transfer requests, checkout records |
| Finance | versioned price/policy settings, bills, bill lines, submissions, reviews, allocations, penalties, deposits, adjustments, settlements |
| Meals | food plans, daily forms, resident responses, cutoff snapshots, count revisions, emergency requests |
| Attendance | devices, resident-device mappings, incoming events, daily attendance, corrections, reconciliation cases |
| Outpasses | original approved plan, departure/return records, extension requests/decisions, deadline history |
| Communication | announcements/audiences, private threads/messages, tickets/replies/assignments, notifications/delivery attempts |
| Operations | durable jobs, audit events, export jobs/files, health runs/results, backup metadata |

Store money in integer paise, business dates separately from event timestamps, and historical policy/rate versions. Enforce uniqueness of resident ID, occupied/reserved bed ownership, appropriate daily responses, and job/event deduplication. Use transactions for multi-record state changes.

## 15. Security and operational design

These controls address the actual account, financial, document, and guardian-access requirements:

- Server-enforced role and record-level permissions; test cross-user access explicitly.
- Secure password storage; expiring/resettable sessions; OTP brute-force and resend controls; additional admin authentication proposed.
- Private file handling as specified in section 4; separate public promotional media from identity/payment/ticket uploads.
- Durable audit entries for financial approvals, admin creation, guardian changes, transfers, manual events, extensions, exports, and business-setting changes.
- Redact identity data, OTPs, passwords, and credentials from logs/errors/health screens.
- Re-authentication for changing bank/QR details, admin access, and other sensitive settings is a proposed default.
- Encrypted backups covering both database and private files, with separately recoverable keys and a restore test. Destination/frequency/retention remain configuration decisions.
- Notification failures never erase the underlying bill, outpass event, or attendance record. Display delivery failure for admin follow-up.
- Maintain clear test/demo/production separation; synthetic records must not appear in live counts or billing.

## 16. Implementation phases after approval

Each phase produces working, reviewable behavior. Do not skip the backend and substitute browser-local mock persistence for core workflows.

### Phase 1 — Foundation and public website

- Preserve current prototype/reference assets as inputs.
- Establish project structure, database migrations, environment configuration, reusable UI, and test scaffolding.
- Rebuild the public website with Ryuu branding, supplied render, approved placeholder images, reference-style motion, and responsive/reduced-motion behavior.
- Add registration/sign-in entry points and production/demo separation.

### Phase 2 — Accounts, registration, documents, and guardians

- Secure three-role authentication; email verification and phone push adapters; first-admin bootstrap and admin-created accounts.
- Resident IDs, registration fields, document upload/review, manual existing/new resident modes.
- Guardian invitation/linking and private access rules.

### Phase 3 — Inventory, admissions, and payments

- Dummy theatre-style bed map and inventory administration.
- Atomic reservations, admission review, both 48-hour windows, payment proof, verification/rejection, and booking confirmation.
- First-month proration, deposit, recurring bills, daily penalties/pause rules, and admin-configurable prices/collection details.

### Phase 4 — Outpasses, attendance, and meals

- Automatically approved initial outpasses, admin-approved extensions/cumulative cap, actual events, and 24-hour overdue checks.
- Attendance window, admin-only missed-scan alerts, scanner adapter contract/simulator, and approved manual fallback.
- Next-day meal form, 6/9/10/11 PM jobs, counts, outpass integration, emergency approval, and food-billing settings.

### Phase 5 — Communications and reporting

- Three-audience announcements, shared private inbox, tickets, notification delivery/retries.
- Resident/guardian dashboards and admin overview.
- Selectable Excel/PDF exports with controlled downloads and audit history.

### Phase 6 — End-to-end verification and deployment package

- Admin health panel, isolated functional test runs, cross-role and concurrency tests.
- Provider sandbox/live readiness checks after accounts and credentials are supplied.
- Database/file backup and restore validation, migration/update procedures, and portable deployment documentation.
- Finalize real business content, real floor inventory, rates, ID/retention policies, and approved notification templates before production launch.
- Integrate/test the real biometric device only once selected; report that integration as pending until then.

## 17. Acceptance checks

The final implementation must demonstrate these outcomes with synthetic fixtures and appropriate test providers:

1. Under-18 registration is blocked using server-side date validation; a person on their 18th birthday is accepted.
2. Admin, resident, and guardian sign-in opens the correct dashboard; unauthorized direct URLs/API calls/downloads fail.
3. Gmail OTP delivery and email verification work through the configured sender; expired/used codes fail.
4. Resident IDs remain unique under concurrent creation and unchanged through transfers.
5. Two applicants cannot reserve/occupy the same bed; an existing resident cannot be manually assigned a conflicting bed.
6. Post-approval 48-hour expiry releases an unpaid bed; timely complete submission preserves it during review.
7. Rejection starts a fresh 48-hour resubmission deadline; timely resubmission preserves the bed; no resubmission releases it.
8. First-month rent handles 28/29/30/31-day months and includes move-in day; later months are full rent.
9. Monthly billing opens on the 1st, is due by the 5th, and penalties begin on the 6th under the reviewed day-boundary rule.
10. Penalties pause during review, resume after rejection, pause on resubmission, and never charge review-wait days retroactively.
11. Payment verification/rejection appears consistently in both dashboards, with no double credit under concurrent admin review.
12. Next-day meal reminders occur at 6/9/10 PM appropriately; all-No submission stops reminders; 11 PM locks counts.
13. Missing meal submission counts zero; approved emergency changes create an audited revised count.
14. Attendance accepts the agreed 6–10 PM window, distinguishes missing scans from absence, and alerts admins only by default.
15. An approved but not-yet-departed outpass is not falsely recorded as an actual departure.
16. Outpass departure/return events update guardian records and queue the correct notification exactly once.
17. Extension requests need admin approval and cannot total more than 48 hours beyond the original deadline.
18. Pending/rejected/no extension all preserve the existing deadline; an overdue alert fires at that deadline plus 24 hours if no return exists.
19. A timely valid/manual return cancels the overdue alert; replayed/late device events reconcile without duplicate notifications.
20. Transfer preserves the existing bed until the approved move takes effect, then changes assignments atomically.
21. Broadcast audience selection reaches Residents, Guardians, or Both exactly as chosen.
22. Private messages/tickets are visible to the sender and all admins, with no leakage between residents and guardians.
23. Selected Excel/PDF sections match the selected people/date range and exclude protected identity files.
24. Health tests distinguish unconfigured, untested, failing, and passing integrations and do not mutate real resident records.
25. Restart/retry tests do not duplicate bills, penalties, meal counts, notifications, or expiry actions; stale reminders are skipped.
26. Mobile, keyboard, reduced-motion, upload-error, empty, loading, and rejected-action states remain usable.
27. A restore test recovers relational data, protected files, and the ability to decrypt them in a controlled environment.

## 18. Decisions and settings still open

### 18.1 Explicitly deferred or admin-configurable

- Final address spelling, business phone/email, opening date, and eventual real photos.
- Real floor plan, room/bed identifiers and capacity; dummy layout first.
- Rent/deposit amounts, daily penalty amount, food model/prices, and other charge settings.
- Checkout notice, deposit deductions/refund policy.
- Biometric hardware, modality, protocol, connectivity, and live commissioning.
- PC/server hardware, physical setup, hosting provider, operating system, and final network/domain configuration.
- Gmail sender credentials, sending allowance, HTTPS hosting and Web Push keys.

### 18.2 Proposed defaults needing owner review in this draft

| Topic | Proposed default / question |
| --- | --- |
| Dashboard motion | Lighter than public marketing pages |
| Extra registration fields | As listed in 4.1; optional photo/expected duration |
| Guardian verification | Verify invitation contact and email when email login is used |
| Shared guardian across siblings | One verified guardian account can link to multiple residents; one guardian per resident |
| Resident OTP login | Available as well as resident-ID/password login |
| OTP channels | Gmail email for OTP, verification and password recovery |
| Admin protection | Additional factor / re-authentication for sensitive operations |
| Pending admission bed | Preference until admin approval; approval atomically reserves an available bed |
| Penalty day boundary | End-of-day rule in 6.5, excluding any day with review time |
| Initial payment date change | Admin-reviewed quote adjustment if actual move-in changes |
| Partial/advance payments | Full single-bill payments initially, explicit admin adjustments for exceptions |
| Monthly reminder timing | Configurable, exact default cadence still to set |
| Transfer rent difference | Admin reviews effective date and any adjustment |
| Food refund/deduction | Proposed defaults in 7.3; admin-configurable |
| Meal eligibility with overdue rent | Active residents remain eligible; no automatic food suspension |
| Daily attendance manual correction | Extend reasoned manual fallback to attendance corrections |
| Return in attendance window | May satisfy daily attendance when it is a genuine arrival event |
| Admin alerts | In-app history and opt-in phone push |
| Guardian extension updates | Guardian dashboard and opt-in phone push |
| Private inbox/ticket details | Attachment limits, priority/status/reopening defaults, and response targets |
| Public content editing | Simple admin settings for actual hostel content/media proposed; no general website builder |
| Receipt document | Downloadable payment acknowledgement proposed after verification; not a bank-generated receipt |

### 18.3 Before live personal data or production launch

- Resolve the identity-document legal basis, acceptable-ID policy, guardian-data handling, consent and retention question in 4.2.
- Supply legitimate business payment QR/account details and verify them before residents use them.
- Configure message providers and templates and confirm real delivery to designated test recipients.
- Finalize deployment, backups, recovery access, and service monitoring.
- Confirm all required business rates/policies are set; zero/default/demo values must be clearly distinguished from configured charges.
- Replace or clearly retain illustrative media; do not present renders or generated interiors as photographs of the completed hostel.
- Verify real biometric integration separately when the selected device becomes available.

## 19. Additional approved feature — Communication history

On 16 September 2026 the owner requested an admin history of messages sent through email, WhatsApp and the website. SMS was subsequently removed at the owner's request on 27 September 2026. Existing SMS audit records are retained as legacy records; no new SMS delivery or SMS login/verification option is supported.

- Admin-only searchable history with channel, recipient, subject, content summary, timestamp, delivery state and date filters.
- Website private messages, announcements and notifications remain recorded; external delivery status is recorded separately.
- Email verification attempts are visible with their secret codes redacted.
- Distinguish local simulation, not configured, queued, failed and provider accepted. Provider acceptance does not prove handset delivery or reading.
- Keep historical records and paginate older entries.

## 20. Review outcome

Owner can approve this draft, correct any rule, or identify additions. Approval should cover the proposed defaults as well as the confirmed features, while leaving explicitly deferred configuration items open.

**Current state:** Owner approved development. The full application, domain backend, protected uploads, local role demonstrations and deployment files are implemented and undergoing validation. Final server deployment, live message providers and physical biometric commissioning remain dependent on the deferred owner configuration. See README.md and docs/DEPLOYMENT.md for the verified build status and operating steps.

### Historical decision: authentication-only WhatsApp — superseded below

The owner confirmed WhatsApp is used only for phone verification, login OTP and password-reset authentication. Email verification/recovery remains available. Meal, rent, admission, outpass, attendance, ticket, private-message and announcement notifications stay in the website. SMS remains removed. Unsent legacy WhatsApp notification jobs are cancelled without deleting portal notices or previous delivery history. No routine notification template is configured or sent.


### Gmail authentication and phone push — 27 September 2026 (phone verification amended below)

This decision supersedes earlier phone OTP and WhatsApp requirements. SMS and WhatsApp sending are removed. One owner-supplied Gmail account sends email verification, login OTP and password recovery messages. Phone numbers remain contact details; email verification does not verify phone ownership. Bed applications require email verification, with admission document review unchanged.

All three dashboards have a Notifications tab with persisted history, unread filtering, search, mark-as-read and links to related portal pages. Routine messages, announcements, meals, rent, admission, outpass, attendance and ticket events create website notifications and queue generic phone push alerts for enrolled devices. Admin communication history contains email and push attempt statuses; legacy external-channel records stay readable.

The site includes a PWA manifest, Home Screen icons, install guidance and a service worker. Notifications require HTTPS, explicit device permission and a running worker. iPhone/iPad requires Home Screen installation on iOS/iPadOS 16.4+. Sensitive pages are never cached offline. Push enrollment is tied to the account and seven-day session; logout/expiry stops new sends. Alerts sent before device enrollment are not replayed. The owner must supply Gmail credentials privately and commission real phone delivery before launch.


### Final amendment: About pages and WhatsApp phone verification — 27 September 2026

The owner restored WhatsApp **only to verify the account holder’s phone number**. This supersedes the preceding complete WhatsApp removal. A signed-in account requests the code for its own saved number. WhatsApp cannot be selected for login or password recovery; those use Gmail email. Routine updates remain in website notification history and opt-in phone push. SMS remains removed. Both email and phone verification are required for resident bed application/admission.

The existing My account page is extended to **About / My details** on admin, resident and guardian dashboards. Each role can edit its personal name, DOB, profession, address, organisation and emergency contact. Contacts are editable with the current password and must be reverified after a change; other sessions and old codes are invalidated. Guardian profile edits update linked resident contact summaries. Role, resident ID, room/bed and guardian links remain controlled by the hostel team. Resident name/DOB changes return documents to review. Private documents and role-specific hostel details remain available with existing access restrictions.
