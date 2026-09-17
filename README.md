# LISS — Supabase schema & RLS

Run in the Supabase SQL editor, in this order:

1. `01_schema.sql` — tables, enums, indexes
2. `02_rls_policies.sql` — enables RLS and adds one policy set per table
3. `03_seed.sql` — school info, 2026/2027 academic year, semesters/periods, subjects, classes, fee types (run as service role)

## How roles map to access

| Role | Students | Scores | Attendance | Fees | Announcements |
|---|---|---|---|---|---|
| admin / super_admin | full | full, can reopen submitted results | full | full | post to anyone |
| teacher | read-only, own classes | write own class+subject while draft; locked once submitted | write own classes | — | post, read all |
| accountant | full | — | — | full | read all |
| parent | own children only | read submitted only | read own children | read own children's payments | read matching audience |
| student | own record only | read submitted only | read own record | — | read matching audience |

Key mechanics:
- Every table carries `school_id`, so one Supabase project can host multiple schools cleanly if LISS ever expands.
- A teacher's "own classes" are derived from `class_subjects` (subject↔class↔teacher assignments) and `classes.class_teacher_id` — matches the brief's `Teacher → Class → Subject` model.
- **Result locking**: `scores.status` starts `draft`. The teacher policy only allows `update` while `status = 'draft'`; once submitted, only the `admin` policy (via `scores_staff_all`) can change it — that's the "reopen" workflow from the brief.
- **Configurable grading weight**: `school_settings.period_weight` / `exam_weight` hold the period-vs-exam split (defaults to 50/50, matching the prototype) instead of hard-coding the formula.
- `auth_role()`, `auth_school_id()`, `auth_teacher_class_ids()`, `auth_student_id()`, `auth_parent_child_ids()` are `security definer` helper functions — they're what keep the policies short and avoid RLS recursion on the `users` table.

## Username login + admin-created accounts

LISS logs people in with a **username**, not an email — run `04_username_login.sql`
after the files above, then follow the bootstrap steps in that file to create the
first admin account (username `LISS001`, password `LISS001`). Every other account
(teachers, parents, accountants, more admins) is then created from the app's
**Users → Add user**, which calls the `admin-users` Edge Function in
`/edge-functions/admin-users` — deploy it with:

```
supabase functions deploy admin-users
```

That function is the only place a login is ever created: it runs with the service
role key server side, and re-checks that the caller is really an admin before doing
anything. The service role key never reaches the browser.

Change the `LISS001` password on first login (Users → reset-password action) — it's
a one-time bootstrap credential, not a permanent shared login.

## Where the service role key goes (and where it doesn't)

Supabase Dashboard → **Settings → API** → the **`service_role`** key (labeled "secret" —
different from the `anon` `public` key already in `index.html`).

**It never goes into `index.html` or any other file that reaches the browser.** Anyone
who views page source would get full, unrestricted read/write access to every table in
your database, bypassing every RLS policy in `02_rls_policies.sql` — game over for the
whole "teachers only see their own class" / "parents only see their own child" model.

The only place it belongs is inside the `admin-users` Edge Function's runtime. You don't
paste it in yourself — Supabase automatically injects it as the `SUPABASE_SERVICE_ROLE_KEY`
environment variable for every Edge Function in your project. Just deploy the function
(`supabase functions deploy admin-users`) and it's already there.

## Photos: avatars, student/teacher photos, and the school logo

Run `05_storage.sql` after the files above — it creates a `media` Storage bucket and the
policies that let each person upload their own picture-frame photo (Users → the sidebar
avatar), and let admins upload student/teacher photos (Students / Teachers pages). All of
that is wired up in `index.html` already.

The **school logo** is different: it's not in the database at all. Drop your real logo in
as **`logo.png`** at the site root, next to `index.html` (a green/pink placeholder is
included so nothing looks broken until you do) — it shows on the login screen, the sidebar,
and the report card header automatically. If `logo.png` is missing, those spots quietly
fall back to a plain "L" mark instead of a broken image.

## Not included here

- The score-calculation engine (period avg → semester final → yearly avg) currently lives in the app layer (`index.html`); happy to move it into a Postgres function/view if you want it computed server-side instead.
- Signature images on the report card (principal/teacher signature graphics) — the current report card leaves signature lines blank for a physical signature; ask if you'd like uploaded signature images there too.
- Setting up the run order end-to-end: `01` → `02` → `03` → `04` → `05`, then the bootstrap admin steps in `04_username_login.sql`, then deploy `admin-users`, then drop in your real `logo.png`.
