# ShiftSync — Submission Documentation

**Coastal Eats Multi-Location Staff Scheduling Platform**

---

## 1. Application Access

**Live URL:** https://shiftsync-production-aada.up.railway.app

---

## 2. Test Accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@coastaleats.com | admin123 |
| Manager (New York) | sarah.manager@coastaleats.com | manager123 |
| Manager (Los Angeles) | mike.manager@coastaleats.com | manager123 |
| Staff | alex.johnson@coastaleats.com | staff123 |
| Staff | chris.martinez@coastaleats.com | staff123 |

All other staff accounts use the password `staff123`. Full list from the seed:

- maria.garcia@coastaleats.com
- james.wilson@coastaleats.com
- emily.davis@coastaleats.com
- ryan.taylor@coastaleats.com
- lisa.anderson@coastaleats.com
- jessica.thomas@coastaleats.com
- kevin.white@coastaleats.com
- ashley.harris@coastaleats.com
- daniel.clark@coastaleats.com
- amanda.lewis@coastaleats.com

---

## 3. What Each Role Can Do

### Admin
- Full access to all locations, shifts, staff, and analytics
- Can create shifts on past dates (for backfilling records)
- Can override any constraint without restriction
- Access to the Audit Log page

### Manager
- Scoped to their assigned locations only (Sarah → NY; Mike → LA)
- Can create, publish, and edit shifts at their locations
- Can assign/unassign staff, approve swaps and drops
- Cannot edit published shifts within 48 hours (admin-only override)
- Cannot create shifts in the past
- Access to Analytics (fairness and overtime) for their locations

### Staff
- View published shifts for their certified locations
- Set weekly availability and availability exceptions
- Create swap requests and drop requests for their own shifts
- Claim open drop requests from other staff
- Toggle notification preference (in-app or email)

---

## 4. Pre-Loaded Demo Scenarios

The seed data includes four ready-to-test edge cases:

| Scenario | Who | How to see it |
|---|---|---|
| **Overtime** | Ryan Taylor (~40h this week) | Analytics → Overtime Alerts tab |
| **Pending swap** | Alex Johnson ↔ Emily Davis | Log in as admin or Sarah; check Swap Requests |
| **Open drop** | Lisa Anderson (next-week Venice shift) | Log in as any staff → Profile → Pick Up Shifts |
| **6th consecutive day** | Kevin White | Open assign modal for any Harbor shift — Kevin shows a 6-day warning. Attempt to assign him to a 7th day to trigger the override reason requirement |

Additional seed data coverage:
- 4 locations across 2 timezones (America/New_York, America/Los_Angeles)
- 12 staff with varied skills, partial location certifications, and different desired hours (25–40h)
- Jessica Thomas is certified at both Downtown (NY) and Sunset Strip (LA) — cross-timezone constraint testing
- Current week: mostly published shifts with assignments; next week: mix of draft and published

---

## 5. Ambiguity Decisions

The following were deliberately unspecified in the brief. These are the decisions made and the reasoning behind them.

### De-certification from a location — historical data preserved

Removing a location certification does not affect existing shift assignments. Past and future assignments remain in place. De-certification is a forward-looking action; unwinding completed shifts would corrupt payroll history and audit logs. The constraint engine immediately blocks new assignments to the de-certified location, so the system self-corrects going forward.

### "Desired hours" and availability windows are independent

Desired hours (`desiredHours`) and availability windows are treated as separate, non-interacting concepts. Desired hours feeds only the fairness analytics (fulfillment rate, hours vs desired). Availability windows gate whether a shift can be assigned at all. Conflating the two would make overrides ambiguous — they answer different questions.

### Consecutive days: a 1-hour shift counts the same as an 11-hour shift

Any day with at least one non-cancelled assignment is counted as a worked day, regardless of shift duration. The consecutive-days rule is a fatigue protection, not an hours-accumulation rule (that is handled by the separate weekly hours check). Treating a short shift as a day off would create an exploitable loophole.

### Shift edited after swap approval — pending/accepted swaps auto-cancelled; approved swaps untouched

When a shift is edited, any swaps in `pending` or `accepted` status are automatically cancelled and both parties notified. Swaps already in `approved` status (where the assignment transfer has already executed) are left untouched. An approved swap has already mutated the assignment records — auto-unwinding it would have ambiguous target state and is better left to deliberate manager action.

### Timezone boundary locations — single timezone per location

Each location stores exactly one timezone string. There is no concept of a location spanning a timezone boundary. Restaurateurs run operations in one timezone regardless of state lines. The correct resolution for a true boundary case is to create two separate locations with their respective timezones and certify staff for both. Staff availability is always resolved against their home timezone (inferred as the timezone of their first certified location, ordered alphabetically).

---

## 6. Known Limitations

- **Email notifications are simulated.** When a staff member sets their preference to "email", notifications are logged to the server console rather than sent via SMTP. A real integration (e.g. SendGrid, Resend) would replace the `simulateEmail()` call in `lib/notifications.ts`.

- **SSE on serverless platforms has a 60-second timeout.** The real-time update endpoint (`/api/sse`) uses Server-Sent Events with a persistent connection. Vercel serverless functions terminate after 60 seconds, which would cut the stream. The application is deployed on Railway (persistent server) to avoid this.

- **Availability times are stored as a single daily window.** Staff cannot currently set split availability within a day (e.g. "09:00–12:00 and 18:00–23:00"). A single contiguous window per day of the week is supported.

- **No mobile-optimised layout.** The UI is designed for desktop/tablet. The schedule calendar grid in particular does not reflow for small screens.

---

## 7. Technical Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL (via Prisma 5) |
| Auth | NextAuth.js v4 (credentials provider, JWT) |
| Real-time | Server-Sent Events |
| Timezone handling | date-fns-tz |
| Styling | Tailwind CSS |
| Deployment | Railway |
