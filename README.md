# Spartans CC Bengaluru — Book a Slot

Fixture availability and booking management for Spartans Cricket Club, Bengaluru.

**Public URL:** `To be updated`
**Tech stack:** Next.js 14 · Supabase · NextAuth (Google OAuth) · Tailwind CSS · Vercel

---

## What this app does

| Who | What they see |
|-----|--------------|
| Organiser (public) | `/schedule` — live slot availability grid, rolling 3 months, WhatsApp CTA |
| Coordinator (admin) | `/admin` — booking dashboard, new booking form with live rule checks, soft block management |

### Scheduling rules enforced automatically
- **R1** Max 3 games per weekend across the club
- **R2** One game per captain per weekend
- **R3** Max 2 games per tournament per calendar month
- **R4** No two bookings on the same date + time slot
- **R5** T20 at 10:30 conflicts with T30 slots (07:30 and 12:30) on the same day

---

## One-time setup (do this once)

### Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in with the club Gmail
2. Click **New project** → name it `spartans-book-a-slot`
3. Choose region: **ap-south-1 (Mumbai)**
4. Save the database password somewhere safe
5. Once created, go to **Project Settings → API** and copy:
   - `Project URL` → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**keep this secret**)

### Step 2 — Run the database migration

1. In Supabase, go to **SQL Editor**
2. Open `supabase/migrations/001_initial_schema.sql` from this repo
3. Paste the entire contents and click **Run**
4. You should see: captains, tournaments, bookings tables created
5. Update the captain names in the seed section before running, or edit them in the Supabase table editor after

### Step 3 — Set up Google OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project → name it `spartans-book-a-slot`
3. Go to **APIs & Services → OAuth consent screen**
   - User type: External
   - App name: Spartans CC Admin
   - Support email: club Gmail
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: Web application
   - Authorised redirect URIs (add both):
     - `http://localhost:3000/api/auth/callback/google`
     - `https://bookslot.spartanscc.in/api/auth/callback/google`
5. Copy the Client ID and Client Secret

### Step 4 — Create the GitHub repository

1. Go to [github.com](https://github.com) and sign in with club Gmail
2. Create a new organisation: `spartans-cc`
3. Inside the org, create a new repository: `spartans-book-a-slot`
4. Make it private
5. Upload this entire codebase (drag and drop the folder contents)

### Step 5 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with club Gmail
2. Click **Add New Project → Import Git Repository**
3. Select `spartans-cc/spartans-book-a-slot`
4. Before deploying, add all environment variables (see below)
5. Click **Deploy**

### Step 6 — Environment variables in Vercel

In your Vercel project → **Settings → Environment Variables**, add:

```
NEXT_PUBLIC_SUPABASE_URL        = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   = eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY        = eyJhbGci...   (mark as Secret)
GOOGLE_CLIENT_ID                 = xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET             = GOCSPX-xxx    (mark as Secret)
NEXTAUTH_SECRET                  = (run: openssl rand -base64 32)
NEXTAUTH_URL                     = https://bookslot.spartanscc.in
ADMIN_EMAILS                     = spartanscc@gmail.com
NEXT_PUBLIC_WA_NUMBER            = 919XXXXXXXXX
```

### Step 7 — Connect your domain

1. In Vercel project → **Settings → Domains**
2. Add `bookslot.spartanscc.in`
3. Vercel will show you a CNAME record to add
4. Log into your domain registrar (wherever spartanscc.in is registered)
5. Add the CNAME record as shown
6. Wait 5–30 minutes for DNS propagation

---

## Day-to-day usage

### Sharing with organisers
Send them: `https://bookslot.spartanscc.in/schedule`
That's it. No login, no instructions needed.

### Logging in as coordinator
Go to: `https://bookslot.spartanscc.in/admin`
Sign in with club Gmail. Session lasts 8 hours.

### Adding a captain or tournament
- Captains: **Admin → Captains → Add**
- Tournaments: **Admin → Tournaments → Add**

### Cancelling a booking
Admin dashboard → find the booking → Edit → Cancel.
The slot re-opens on the public schedule immediately.

### Releasing a soft block
Admin dashboard → find the soft block → Release.

---

## Local development

```bash
# 1. Clone the repo
git clone https://github.com/spartans-cc/spartans-book-a-slot.git
cd spartans-book-a-slot

# 2. Install dependencies
npm install

# 3. Copy env file and fill in values
cp .env.example .env.local
# Edit .env.local with your actual values

# 4. Run development server
npm run dev

# 5. Open http://localhost:3000
```

---

## Project structure

```
src/
  app/
    api/
      auth/           NextAuth Google OAuth handler
      availability/   Public slot grid data (no auth)
      bookings/       CRUD for confirmed bookings (admin auth)
      soft-blocks/    CRUD for soft block reservations (admin auth)
      validate/       Dry-run rule check for live form feedback
      captains/       Captain list and management
      tournaments/    Tournament list and management
    schedule/         Public organiser-facing availability page
    admin/
      (dashboard)     Booking list, stat cards, alerts
      bookings/new    Step form with live rule validation
      soft-blocks/    Soft block creation and management
      login/          Google OAuth sign-in page
  components/
    ui/               SiteNav and shared UI
    schedule/         ScheduleGrid (responsive mobile/tablet/desktop)
    admin/            AdminSidebar
  lib/
    supabase.ts       Supabase client helpers
    auth.ts           NextAuth config with email whitelist
    validation.ts     All 5 scheduling rules + availability computation
    whatsapp.ts       WhatsApp deep link builder
  types/
    index.ts          All TypeScript types and constants
supabase/
  migrations/
    001_initial_schema.sql   Full DB schema — run this once in Supabase
```

---

## Adding a new admin email

Edit the `ADMIN_EMAILS` environment variable in Vercel:
```
ADMIN_EMAILS=spartanscc@gmail.com,anotheradmin@gmail.com
```
Redeploy. Done.

---

## Future phases (not in this build)

- Captain login → self-mark weekend unavailability
- Player login → view schedule, personal stats
- Governing Council login → read-only analytics
- Merge into unified `spartanscricketclub.vercel.app` platform

---

*Built with Claude (claude.ai) · Maintained by Spartans CC · Est. 2014*
