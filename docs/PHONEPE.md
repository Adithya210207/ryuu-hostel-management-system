# PhonePe payments: going live

Residents can pay a bill with **Pay with PhonePe** on the Payments page (UPI, cards, net banking). The site confirms every payment with PhonePe's own servers before marking the bill paid, and the receipt is ready straight away. Paying by bank transfer and uploading proof still works as a backup.

## 1. Get a PhonePe Payment Gateway account
Sign up at PhonePe Business as a merchant and complete KYC. In the **PhonePe Business Dashboard → Developer Settings** you will find:
- Client ID
- Client Secret
- Client Version

PhonePe gives you **test (sandbox)** keys first, then **live (production)** keys after review.

## 2. Add the keys to the server settings
In `.env.production` (or the hosting provider's environment settings):

```
PHONEPE_ENV=sandbox            # change to production with live keys
PHONEPE_CLIENT_ID=...
PHONEPE_CLIENT_SECRET=...
PHONEPE_CLIENT_VERSION=...
PHONEPE_WEBHOOK_USERNAME=...   # you choose these two in step 3
PHONEPE_WEBHOOK_PASSWORD=...
```

Restart the site. **Reports & health** in the admin portal shows "Phonepe Payments" as configured.

## 3. Register the webhook
Dashboard → Developer Settings → **Webhook** → Create Webhook:
- URL: `https://<your-domain>/api/payments/phonepe/webhook`
- Authentication: **username and password**: use the same values as `PHONEPE_WEBHOOK_USERNAME` / `PHONEPE_WEBHOOK_PASSWORD`
- Events: `checkout.order.completed`, `checkout.order.failed`
- Turn **Test Mode** on for sandbox keys, off for live keys.

If a webhook is ever missed, the background worker asks PhonePe for the result of any open payment every 30 seconds, so bills still update.

## 4. Test, then go live
1. With sandbox keys, pay a small bill as a test resident and finish the payment on PhonePe's test page.
2. Check the bill shows **Paid**, the receipt downloads, and admins got a "PhonePe payment received" notification.
3. Swap in the live keys, set `PHONEPE_ENV=production`, switch the webhook's Test Mode off, restart, and do one real ₹1–₹10 payment.

## How it behaves
- Residents always pay the bill's **full outstanding amount**.
- If something doesn't add up (amount differs, the bill was already paid by bank transfer, the bill changed), the payment is recorded but **not** marked as settled, and admins get "PhonePe payment needs a look" to decide on a refund.
- Refunds are done from the PhonePe Business Dashboard for now.
- On the local demo, `PHONEPE_SIMULATE=true` in `.env.local` shows a fake checkout page so the flow can be tried with no keys and no money. It never works in production.
