# Ryuu — self-hosting

## Configuration

Copy `.env.production.example` to `.env.production`. Set `APP_URL` to the final HTTPS origin, `DEMO_MODE=false`, a strong `POSTGRES_PASSWORD`, and a `FILE_ENCRYPTION_KEY` containing 32 random bytes encoded as base64. Keep a separate recovery copy of the encryption key. A hex database password avoids connection-URL escaping issues. Never commit environment secrets.

Set the first-admin bootstrap name, email, phone and unique password (12+ characters). No default production admin/password ships with the application.

```sh
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production exec web npm run bootstrap
docker compose --env-file .env.production logs --tail=100 web worker
```

Bootstrap refuses if an active admin already exists. Create subsequent admins in the portal. Remove bootstrap credentials from the environment after provisioning. Account holders can use verified OTP login and password setup/reset once delivery is configured.

Production registration stays closed until `REGISTRATION_OPEN=true`. Fresh production databases contain no sample rooms; databases with demo residents/inventory refuse initialization. Configure real inventory and business settings through admin first. Startup rejects missing core security settings. `docker compose --env-file .env.production exec web npm run check:production` checks configuration, business settings and worker readiness and lists manual delivery/restore checks. Complete [the launch checklist](LAUNCH-CHECKLIST.md) before opening registration, then recreate web/worker to apply changed environment variables.

The web service binds to `127.0.0.1:3000`. Put a maintained HTTPS reverse proxy in front of it, with a roughly 9 MB request limit, connection/rate limits and timeouts. Overwrite untrusted forwarding headers. Do not expose PostgreSQL or private file volumes publicly. [Next.js self-hosting guidance](https://nextjs.org/docs/app/guides/self-hosting)

Adapt `deploy/nginx.conf.example` for your hostname and certificate, and install `deploy/ryuu-proxy.conf` as `/etc/nginx/snippets/ryuu-proxy.conf`. Validate with `nginx -t` before reloading. The application uses secure host-scoped cookies and HSTS in production. `/api/status` returns minimal database availability; detailed health and launch blockers require an admin account. Production document storage is capped per account (256 MB by default, configurable with `UPLOAD_STORAGE_LIMIT_MB`).

## Services

- **PostgreSQL:** Required for production and separate worker processes. Compose supplies `DATABASE_URL`. Local embedded PostgreSQL is only for a single-process preview.
- **Worker:** Runs every 30 seconds, with durable event keys, transaction-protected scheduled actions and in-portal notifications. Check its heartbeat in admin Reports & health. Keep the web and worker on the same application version.
- **Private files:** AES-256-GCM encryption in a private volume. Keep `FILE_ENCRYPTION_KEY` separate from backups. Authenticated downloads generate audit events.
- **Antivirus:** Compose shares ClamAV signatures with the web container. Production uploads require `CLAMSCAN_PATH` and a successful scan. Wait for signature initialization; missing signatures or scan failures reject uploads. Local synthetic uploads are marked unscanned.
- **HTTPS:** Required for production secure cookies. Set `APP_URL` correctly so same-origin checks accept the live website.

Docker build/launch has not been verified on the owner’s final server. Complete that deployment check after hardware/hosting choices are made.

## Gmail authentication

One Gmail account sends verification, login OTP and password-reset codes. SMS is removed. WhatsApp is used only for phone-number verification from a signed-in account; legacy audit records are retained. Password login can still accept a phone number as an account identifier.

1. Enable Google 2-Step Verification on the sender account.
2. Create a Google App Password for Ryuu. Store the Gmail address in GMAIL_USER and this App Password in GMAIL_APP_PASSWORD in the private server environment. Never use the normal Gmail password or paste credentials in chat.
3. Set DEMO_MODE=false, restart the web service, then request a verification code for a designated test account. Local demo mode deliberately simulates email and does not send.

The sender connects to smtp.gmail.com using TLS on port 465. Personal Gmail has no per-email fee, but Google applies sending and abuse limits; delivery is not guaranteed. The app defaults to a conservative 400 send attempts per 24-hour window through GMAIL_DAILY_LIMIT, capped at 450. Manual emails and other applications using the same account also consume Google's allowance and are not visible to this counter. Keep volume low and use a dedicated hostel Gmail address where possible.

[Google App Password help](https://support.google.com/accounts/answer/185833?hl=en) · [Gmail sending limits](https://support.google.com/mail/answer/22839?hl=en)

## WhatsApp phone verification only

Configure WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_API_VERSION, WHATSAPP_LANGUAGE and WHATSAPP_AUTH_TEMPLATE for the official Meta Cloud API. Select a currently supported API version and an approved authentication template with a copy-code button. The adapter sends the same six-digit code in the body parameter and button URL parameter. Meta/provider authentication-message charges still apply; Gmail’s allowance does not cover WhatsApp.

Only a signed-in account can request this code for its own saved number. WhatsApp codes never log in an account, reset a password, or send routine alerts. Email remains the login/recovery channel. Verify real delivery with a designated consenting account after configuration. Local demo mode simulates both kinds of codes. No SMS fallback is enabled.

## About / My details

Every role can edit its own name, date of birth, profession, address, employer/college and emergency contact. Residents also see their permanent resident ID, allocation, guardian and private documents. Guardian changes update the corresponding contact information shown to the linked resident. Role, resident ID, bed and guardian account links are not self-editable.

Changing email or phone requires the current password. Changed verification flags are reset, older codes are invalidated and other sessions are signed out. New codes are bound to the saved contact value, so an old code cannot verify a replacement number/address. Users who sign in by email OTP can first set a password through email recovery. Resident name or birth-date changes require document review again. Both resident email and phone verification are required before a new bed application/admission.

## Installable app and phone notifications

The manifest, icons and service worker enable Home Screen installation. The service worker caches only a public offline explanation, never portal pages, APIs, messages or identity documents. The portal requires a connection.

1. Host at the final HTTPS address and set APP_URL. Localhost on this PC is not reachable from a resident's phone.
2. Run npm run setup:push -- mailto:your-address@gmail.com locally. It writes VAPID keys privately to .env.local without printing them. Transfer WEB_PUSH_ENABLED, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT securely to the production environment used by both web and worker. Retain and securely back up the same keys; changing them requires devices to subscribe again.
3. Keep the worker running. Open Notifications on each account's dashboard, install the app if desired, then tap Enable phone notifications. Permission is requested only on that tap. On iPhone/iPad, install to the Home Screen and open it there first (iOS/iPadOS 16.4+).
4. Use Send a test notification on that device, then test a designated private-message recipient, an announcement and a scheduled reminder. Test with the app closed, browser permission blocked and connectivity interrupted. Physical-device delivery remains unverified until this commissioning is done.

New portal notifications queue generic phone alerts only for opted-in devices. Private content remains inside the account. Admin, resident and guardian dashboards each have searchable read/unread notification history. Admin Communication history also records per-device push attempts and Gmail authentication attempts; secret codes and push subscription URLs are not exposed there.

Subscriptions belong to a specific account and login session. Signing out, session expiry (seven days) or account deactivation stops delivery. Sign in and enable notifications again. Disabling alerts on one device does not disable other devices. Browser/OS permission, network access and battery settings affect delivery; the website history remains the record of the update.

The worker retries temporary failures with backoff, up to five attempts, and expires queued alerts after a day. Expired browser subscriptions are removed. Notices from before device enrollment are never replayed. Provider acceptance is recorded separately from website read state; acceptance does not prove phone delivery. Rare duplicate delivery after an interrupted network request is possible; notification tags group the same notice on the device.

[Apple Home Screen push support](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## Biometric event adapter

Hardware remains unselected. The software records events and mapped resident IDs, not raw fingerprints or face templates. Physical door unlocking is outside scope.

The eventual trusted device bridge sends `POST /api/device/events`:

```json
{
  "id": "stable-vendor-event-id",
  "deviceId": "hostel-reader-1",
  "residentId": "internal-resident-user-id",
  "type": "departure",
  "eventAt": "2026-10-10T12:30:00.000Z",
  "outpassId": "matching-outpass-id"
}
```

Sign the exact body with HMAC-SHA256 using `DEVICE_INGEST_SECRET`. Header `x-ryuu-timestamp` contains current Unix milliseconds; `x-ryuu-signature` contains hexadecimal HMAC of `timestamp + '.' + raw JSON body`. Request time has a five-minute tolerance; event time can be older for offline scans. Stable event IDs deduplicate retries. Direction must explicitly identify attendance, departure or return.

Unmatched/invalid events remain for admin reconciliation. The final bridge must map hardware references to internal resident IDs and be tested against delayed/repeated/out-of-order events. Until then, use the reasoned manual attendance/departure/return controls. Do not label a device integration live merely because its secret is configured.

## Business settings and data policy

Set real rooms/beds, rent/deposit, daily penalty, meal pricing model, contacts/opening date, bank details/QR and checkout policy in the admin account. Demo values are examples. The actual floor geometry and completed-building photographs can replace the current illustrations later.

The identity policy starts pending review. The owner requested resident and guardian Aadhaar PDFs. Resolve applicable collection/alternative-ID, consent, retention and guardian-data rules before enabling real identity submissions. Development tests use synthetic PDFs. No automated retention deletion runs until a policy is agreed.

## Backup and restore

`npm run backup` uses `pg_dump` and copies encrypted files. Run it with production database access and a PostgreSQL client; the supplied Docker image includes one. The encryption key is deliberately excluded. Keep backups off the primary server and keep keys separately protected. Files receive SHA-256 integrity checks; failed runs retain an `.incomplete` directory and never report a completed backup.

For a coordinated application backup, pause incoming writes and the worker, leave PostgreSQL available, dump the database and copy matching encrypted files. For uninterrupted service, use proper database/file snapshot tooling. A successful copy does not constitute a restore test.

For the supplied single-host Compose deployment:

```sh
docker compose --env-file .env.production stop web worker
docker compose --env-file .env.production run --rm --no-deps -e BACKUP_WRITES_PAUSED=true web npm run backup
docker compose --env-file .env.production start web worker
```

Restart services even if the backup fails, after reviewing the failure. `BACKUP_WRITES_PAUSED=true` is an operator assertion, not an automatic write lock: stop every app writer first. Backups persist in the `backups` volume. Copy completed folders to protected storage on another machine; a volume on the same disk is not a disaster-recovery copy. Run `npm run backup:verify -- /path/to/completed-backup` to recheck files after copying. A checksum match still requires the restore drill below.

Restore drill:

1. Create an isolated empty database/storage location.
2. Restore the dump using `pg_restore` and restore the matching encrypted-files directory.
3. Configure the matching key separately; keep real delivery providers disabled.
4. Start the restored app and verify records, balances, bed assignments and a protected file’s successful decryption.
5. Record the test date/outcome before describing backups as verified.

Back up before upgrades. Retain PostgreSQL/private volumes and keys when replacing containers. The versioned JSONB domain aggregate targets one hostel; large-scale use needs a normalization and migration plan.

## Validation and launch boundaries

Run `npm run typecheck`, `npm test` and `npm run build`. Local API scripts create synthetic fixtures; the admin health suite uses an isolated in-memory database. These checks do not send real provider messages or change real payments.

The GitHub Actions workflow builds and tests with Node 24 and PostgreSQL 17. `npm run test:production` requires a disposable database named `ryuu_ci` or `ryuu_test` and a completed production build. It starts a separate server, checks authorization, secure cookies, disabled demo access, closed registration, manifest and headers. Do not use it against real hostel data. CI execution and Docker/HTTPS deployment must be verified in the destination environment.

Final provider delivery, physical scanner commissioning, HTTPS/domain setup and a restore drill on the chosen server are still required. The English PDF report uses a built-in font; identity PDFs remain separate from bulk reports. This repository includes deployment tooling, not a claim that the final server is already deployed.
