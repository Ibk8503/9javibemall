# 9jaVibeMall Partner Hub

# 9jaVibeMall Logistics Hub Dashboard

Partner-facing dashboard for 9jaVibeMall Logistics Hub to see incoming 9jaVibeMall

Enable a logistics partner be able to add user(manager/rider-this adds more role to a single logistics) the new users can receive invitation to setup their account.

Add a new screen where each partner can see their API credentials (API key, and partner_id - role sensitive)

orders, acknowledge them, mark deliveries, and view delivery history.

## Before deploying

Open `src/LogisticsDashboard.jsx` and replace these two placeholders near the top

with your real Supabase project values (Supabase dashboard → Settings → API):

```js
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";

const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
```

Use the **anon/public** key only — never the service_role key in this file,

since it ships to the browser.

This also assumes the backend from `9jaVibeMall-logistics-backend/` (the Supabase

migration + Edge Functions) is already deployed. The dashboard has nothing to

talk to until that's live.

## Deploy to Vercel

**Option A — GitHub (recommended)**

1. Push this folder to a new GitHub repo.

1. In Vercel: New Project → Import the repo.

1. Vercel auto-detects Vite. Leave build settings as default:

- Build command: `npm run build`

- Output directory: `dist`

1. Deploy.

**Option B — Vercel CLI, no GitHub needed**

```bash

npm install -g vercel

cd 9jaVibeMall-logistics-dashboard

vercel

```

Follow the prompts; it deploys directly from your machine.

## Local testing before you deploy

```bash

npm install

npm run dev

```

Opens at `http://localhost:5173`. You'll need a real 9jaVibeMall Logistics Hub login

(email/password) created in Supabase Auth, and the backend already deployed,

for the dashboard to load any data.

## Project structure

```

index.html               # entry HTML

src/main.jsx              # React mount point

src/LogisticsDashboard.jsx  # the actual dashboard — this is the file to edit

vercel.json               # SPA routing so page refreshes don't 404

package.json

vite.config.js

```

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6ea6477a-d194-4ab5-89a1-af350f3c20fa).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
