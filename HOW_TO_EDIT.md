# How to change your website (after it's online)

Your site has two parts that you change in different places:

## 1. Things you change in the ADMIN page (instant, no upload needed)
Open `yourlink/admin.html` and sign in.

| What | Where |
|---|---|
| See / manage orders | Orders tab |
| Drink prices, names, ingredients | Menu tab → edit → Save changes |
| Mark a drink SOLD OUT / available | Menu tab → Available switch |
| Add or delete a drink | Menu tab → Add drink / Delete |
| Bring back a deleted drink (with photo) | Menu tab → yellow bar → Restore |
| Show "Available" or "Sold out" on the public menu | Menu tab → Available switch (the label updates by itself) |

These are saved in Firebase, so they show on the live site immediately.
**Important:** once your menu is saved in Firebase, changing the drinks inside the code
(`js/store.js`) will NOT change the live menu. Always change drinks in the admin.

## 2. Things you change in the FILES (then upload)
| What | File |
|---|---|
| GCash number, delivery fee, Messenger link | `js/config.js` |
| Words on the home page (headline, steps, vibes) | `index.html` |
| Words on the cart / checkout page | `cart.html` |
| "What you'll get" page | `inclusions.html` |
| Colors, fonts, spacing | `css/` (one file per page: `home.css`, `menu.css`, `inclusions.css`, `cart.css`) |
| Photos | `assets/drinks/` (keep the same file name to replace a photo) |

### How to upload a change
**If your site is connected to GitHub:** open the file on GitHub → click the pencil ✏️ →
edit → **Commit changes**. Netlify updates your live site by itself in about a minute.
To replace photos or several files: **Add file → Upload files → Commit changes**.

**If it is NOT connected to GitHub:** go to Netlify → your project → **Deploys** and drag the
whole updated folder into the upload box. (Never use app.netlify.com/drop again. That makes a new site.)

### Good to know
- Your orders and menu live in Firebase. Updating the website files never deletes them.
- Make several changes first, then upload once. Each upload uses a few free Netlify credits.
- If a change doesn't appear, do a hard refresh: Ctrl+Shift+R (on a phone, close the tab and reopen).
- Keep passwords out of these files. The Firebase keys in `js/config.js` are meant to be public.

## Animations and effects
- The motion on the site (floating cups, scroll reveals, "fly to cart", confetti when an order is sent)
  is plain CSS and two small files: `js/fx.js` and the `css/` files. Nothing to maintain.
- Visitors who turn on "Reduce motion" on their phone or computer automatically get a calm version
  with no animation. This is built in.
- Drink photos are transparent cut-outs in `assets/drinks/` (`classic.webp`, `seasalt.webp`, `dream.webp`
  for the drinks, and `sip.webp`, `pour.webp`, `make.webp` for the matcha vibes). To replace one,
  keep the same file name and use a PNG/WebP with a transparent background.
- To change the scrolling ribbon text on the home page, edit the words inside `class="marquee-track"` in `index.html`.

## New drink: Hojicha Latte
The Hojicha Latte is built into the site, but if your menu is already saved in Firebase it won't appear by itself.
1. Open `yourlink/admin.html` → **Menu** tab.
2. Click **Restore** in the yellow bar ("Missing from your menu: Hojicha Latte").
3. **Set the real prices** on its card and click **Save changes**. Until you do, it uses placeholder prices (same as Classic Matcha).
The small "NEW" tag on the card can be removed later: ask for it to be taken out, or delete `badge: 'NEW'` for it in `js/store.js`.
