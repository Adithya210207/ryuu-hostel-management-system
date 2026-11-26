# Ryuu launch checklist

## Code and local verification

The application includes production configuration guards, closed-by-default registration, real PostgreSQL support, private encrypted uploads, role and session checks, account editing, notification history, durable phone-push delivery and authentication-provider adapters. Production starts with no demonstration rooms. An existing database containing demonstration inventory/residents is rejected; keep development data separate.

Automated checks use synthetic data and mocked delivery providers. They do not establish real message delivery or successful deployment. The CI workflow includes a production HTTP smoke test against disposable PostgreSQL; its execution on the chosen server/CI remains to be confirmed.

## Required before inviting residents

- [ ] Choose the server and final domain; configure HTTPS and the supplied reverse proxy example.
- [ ] Create `.env.production` from `.env.production.example`; fill secrets privately.
- [ ] Use a new production PostgreSQL database and private storage. Keep encryption and VAPID recovery keys separately protected.
- [ ] Build/start the containers on the chosen server and confirm their health. Docker deployment has not been verified on this development PC.
- [ ] Bootstrap the first admin with a unique password, remove bootstrap credentials, and test all three roles.
- [ ] Set actual rooms/beds, rates/deposit/penalties, meals, checkout rules, bank/QR and contact details. Finalize the identity-document policy.
- [ ] Configure Gmail with an App Password; test email verification, OTP sign-in and password recovery.
- [ ] Configure the official WhatsApp authentication template; test saved phone-number verification. Routine messages must stay in the website and phone push.
- [ ] Configure stable VAPID keys and test Android and installed iPhone notifications, including with the app closed. Check dashboard history and disabled permissions.
- [ ] Confirm the scheduled worker is healthy and scheduled attendance, meals, rent and outpass reminders appear at the correct India-local times.
- [ ] Confirm the document scanner accepts a harmless PDF, rejects unsafe/unscanned files, and private downloads remain account-restricted.
- [ ] Make a coordinated backup, verify its checksums, copy it off the server and restore it on an isolated instance. Check file decryption using the separately saved key.
- [ ] Confirm public page text/images and terms with the hostel owner. The building rendering and interior illustrations remain placeholders.
- [ ] Test production HTTP behavior against a disposable PostgreSQL database using the CI workflow; never point smoke tests at real hostel data.
- [ ] Complete the manual checks in Admin → Reports & health. Set `REGISTRATION_OPEN=true`, recreate web/worker, then run `npm run check:production` inside the web container and confirm there are no automated blockers.

Keep public registration closed while commissioning. Configuration checks confirm settings and worker status; they do not prove live delivery, antivirus operation or restoration. The hardware scanner remains optional until selected; use the audited manual attendance/departure/return fallback meanwhile.

## Ongoing operation

- Monitor worker heartbeat, provider failures, disk capacity and backup success.
- Keep off-server encrypted backups and periodically repeat restoration.
- Apply reviewed dependency, operating system, database and antivirus updates; back up before upgrades.
- Keep identity-document access and exports restricted to authorized accounts; follow the finalized retention policy.

Detailed commands and provider setup: [Deployment guide](DEPLOYMENT.md).
