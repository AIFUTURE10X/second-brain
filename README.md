# ◆ Second Brain

Clips, notes, links & thoughts — synced across all your devices.

**Stack:** Next.js 14 · Neon Postgres · Drizzle ORM · NextAuth · Tailwind CSS

## Quick Setup

### 1. Clone & install

```bash
git clone https://github.com/AIFUTURE10X/second-brain.git
cd second-brain
npm install
```

### 2. Create Neon database

1. Go to [neon.tech](https://neon.tech) → your project
2. Copy the connection string from the dashboard

### 3. Create GitHub OAuth app

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Set:
   - **App name:** Second Brain
   - **Homepage URL:** `http://localhost:3000`
   - **Callback URL:** `http://localhost:3000/api/auth/callback/github`
4. Copy Client ID and Client Secret

### 4. Configure environment

```bash
cp .env.example .env.local
```

Fill in your values:
```
DATABASE_URL=your-neon-connection-string
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=run-openssl-rand-base64-32
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

Generate the secret:
```bash
openssl rand -base64 32
```

### 5. Push database schema

```bash
npx drizzle-kit push
```

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: Second Brain"
git remote add origin https://github.com/AIFUTURE10X/second-brain.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import `AIFUTURE10X/second-brain`
3. Add environment variables:
   - `DATABASE_URL`
   - `NEXTAUTH_URL` → your Vercel URL (e.g. `https://second-brain.vercel.app`)
   - `NEXTAUTH_SECRET`
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
4. Deploy

### 3. Update GitHub OAuth callback

Go back to your GitHub OAuth app settings and update:
- **Homepage URL:** `https://second-brain.vercel.app`
- **Callback URL:** `https://second-brain.vercel.app/api/auth/callback/github`

---

## Features

- **4 item types** — Notes, Links, Clips, Thoughts
- **Full-text search** across all content
- **Tag system** with clickable tag cloud
- **Pin** important items to top
- **Cross-device sync** via Neon Postgres
- **GitHub sign-in** — one click, no passwords
- **Mobile-first** dark UI

## License

MIT
