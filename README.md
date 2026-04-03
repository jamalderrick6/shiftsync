# ShiftSync

Multi-location staff scheduling platform for Coastal Eats — 4 restaurant locations across New York and Los Angeles.

**Live demo:** https://shiftsync-production-aada.up.railway.app

## Test Accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@coastaleats.com | admin123 |
| Manager (NY) | sarah.manager@coastaleats.com | manager123 |
| Manager (LA) | mike.manager@coastaleats.com | manager123 |
| Staff | alex.johnson@coastaleats.com | staff123 |

## Features

- **Shift scheduling** — weekly calendar view with draft/publish workflow
- **Constraint engine** — skill match, location certification, double-booking, 10hr rest period, timezone-aware availability, weekly overtime (35h warning / 40h block), consecutive days (6th warning / 7th blocked with override reason)
- **Swap requests** — staff-initiated shift swaps with manager approval workflow
- **Drop requests** — staff can drop shifts for others to claim, manager approves transfer
- **Real-time updates** — Server-Sent Events push schedule changes to all open sessions
- **Analytics** — fairness scoring, premium shift distribution (Fri/Sat evenings), overtime alerts
- **Audit log** — full before/after history of all actions with CSV export
- **On-duty dashboard** — live view of staff currently on shift per location

## Stack

Next.js 14 · TypeScript · Prisma 5 · PostgreSQL · NextAuth.js · Tailwind CSS

## Running Locally

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

# Push schema and seed data
npx prisma db push
npm run seed

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  (dashboard)/        # All authenticated pages
    page.tsx          # Dashboard with On-Duty widget
    schedule/         # Weekly shift calendar + assign modal
    analytics/        # Fairness and overtime analytics
    audit/            # Audit log (admin only)
    profile/          # Staff availability, drops, swap requests
  api/                # API routes
lib/
  scheduling.ts       # Constraint engine (all 7 checks)
  notifications.ts    # In-app + simulated email notifications
  audit.ts            # Audit log helpers
  timezone.ts         # Timezone conversion utilities
prisma/
  schema.prisma       # Database schema
  seed.ts             # Demo data with edge case scenarios
```

## Seed Scenarios

| Scenario | Who |
|---|---|
| Overtime (~40h/week) | Ryan Taylor |
| Pending swap request | Alex Johnson ↔ Emily Davis |
| Open drop request | Lisa Anderson |
| 6 consecutive days | Kevin White (assign a 7th to trigger override) |
