# Google Play Books connection — one-time setup

The Library module's Google shelf needs Nestly registered with Google (free, ~15 min of
clicking). Until this is done, the Library page shows a "Google connection — not set up
yet" card and everything else works normally.

## What you're creating

A Google Cloud **project** with the **Books API** switched on and an **OAuth client**
registered for Nestly. Google hands you two values — a Client ID and a Client Secret —
which go into the environment. Family members never touch any of this; they each just
click **Connect Google** on the Library page and sign in with their own account.

## Steps

1. **Create the project**
   - Go to https://console.cloud.google.com and sign in with your own Google account.
   - Top bar → project picker → **New project**. Name: `Nestly` → Create → make sure
     it's the selected project.

2. **Enable the Books API**
   - Left menu → **APIs & Services → Library** (Google's API library, not ours).
   - Search **Books API** → open it → **Enable**.

3. **Configure the consent screen**
   - **APIs & Services → OAuth consent screen** (Google now calls this "Branding" under
     *Google Auth Platform* — same thing).
   - User type: **External** → Create.
   - App name `Nestly`, support email = your email, developer contact = your email.
     Skip logo and the rest → Save.
   - **Scopes**: add `https://www.googleapis.com/auth/books` (plus `openid` and `email`
     if it asks) → Save.
   - **Test users** (while the app is in "Testing" publishing status): add the Google
     email of every family member who'll connect (yours, your wife's, the kids'). Only
     listed accounts can connect until you hit **Publish app** — for a private family
     app, staying in Testing with test users is perfectly fine and skips Google's
     verification review. Note: in Testing mode Google expires refresh tokens after
     7 days — so for daily family use it's better to **Publish** the app (unverified is
     OK for the `books` scope; members just see an "unverified app" warning once and
     click through via "Advanced → continue").

4. **Create the OAuth client**
   - **APIs & Services → Credentials → + Create credentials → OAuth client ID**.
   - Application type: **Web application**. Name: `Nestly web`.
   - **Authorised redirect URIs** — add BOTH (exact, character for character):
     - `http://localhost:3000/api/google-books/callback` (for local dev)
     - `https://nestlyapp.co/api/google-books/callback` (production)
   - Create → copy the **Client ID** and **Client Secret**.

5. **Put the values in the environment**
   - Local: add to `.env.local`:
     ```
     GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
     GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
     ```
   - Production: Vercel → nestly project → Settings → Environment Variables → add the
     same two for Production (and Preview if you want) → redeploy.

6. **Test it**
   - Restart `npm run dev`, open **Library**, hit **Connect Google**, approve the
     consent screen → you land back on the Library with "Google connected" and your
     Play Books titles on the shelf.

## Troubleshooting

- **`redirect_uri_mismatch`** — the URI in step 4 doesn't exactly match the one Nestly
  sent. Check protocol (http vs https), domain and path spelling.
- **`access_denied` for a family member** — they're not in Test users (step 3) and the
  app isn't published.
- **Connected but "Google reports no books"** — the Google account genuinely has no
  books on its Play Books shelves, or the books sit on a different Google account.
  Family Library shares appear on each member's own shelf once Family Library is set up
  in Google Play (play.google.com → Account → Family).
- **"Google session expired — disconnect and connect again"** — in Testing mode Google
  kills refresh tokens after 7 days; publish the app (step 3) to stop that.
