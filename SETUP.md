# Going live with orders + admin (about 15 minutes, free)

Until you do this, the site runs in **demo mode**: orders and menu edits are saved only in the browser
you used, so customers on other phones can't reach you. Firebase's free plan is far more than a small
shop needs.

## 1. Create the project
1. Go to https://console.firebase.google.com and sign in with a Google account.
2. **Add project** → name it (e.g. `whisked-by-trix`) → you can turn Google Analytics off.

## 2. Create the database
1. **Build → Firestore Database → Create database**.
2. Choose a location close to the Philippines (**asia-southeast1 / Singapore**).
3. Choose **Production mode** (the rules in step 5 replace the defaults).

## 3. Connect the website
1. Project Overview → the **`</>` (Web)** icon → register an app (skip Hosting for now).
2. Copy the `firebaseConfig` values it shows you.
3. Open `js/config.js` and paste them into the `firebase: { ... }` block (remove the `null`).
   Only `apiKey`, `authDomain`, `projectId` and `appId` are needed.
   (This key is *meant* to be public; the security rules in step 5 are what protect your data.)

## 4. Create your admin login
1. **Build → Authentication → Get started → Email/Password → Enable**.
2. **Users → Add user** → your email + a strong password. This is what you use at `/admin.html`.

## 5. Lock it down with the rules
1. **Firestore Database → Rules**.
2. Paste the contents of `firestore.rules`.
3. Replace `YOUR_ADMIN_EMAIL@example.com` with the exact email from step 4 → **Publish**.

## 6. Put the site online
Any static host works: **Firebase Hosting**, Netlify, Vercel, GitHub Pages…
If you use a custom domain, add it under **Authentication → Settings → Authorized domains**.

## 7. First run
1. Open `https://your-site/admin.html` and sign in.
2. **Menu** tab → **Load default menu to edit** → change prices, add drinks, mark sold out.
3. Place a test order on the public site. It should appear in **Orders** with a beep.
   Keep the admin page open on your phone while you're taking orders.

## Good to know
- The admin URL isn't linked anywhere on the public site. Don't share it; the login protects it anyway.
- Customers can't read anyone's orders, including their own after placing them.
- Order totals are calculated in the customer's browser, so glance at the items when you confirm
  an order (normal for a small shop; a larger shop would add a server-side check).
- GCash payments are still confirmed by you manually (customer sends a screenshot on Messenger).
