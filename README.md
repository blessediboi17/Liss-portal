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

## Not included here

- Creating real login accounts: `users.id` is a foreign key into `auth.users`, so accounts are created via Supabase Auth (`auth.signUp` or an admin invite flow) first, then a matching row is inserted into `users`/`teachers`/`parents`/`students.user_id`. That's an onboarding function, not seed SQL.
- The score-calculation engine (period avg → semester final → yearly avg) — that logic lives in the app layer (or a Postgres function/view if you want it server-side); happy to write that next as a SQL view or an edge function.
- Storage policies for the `logo`, student/teacher photos, and signature images (Supabase Storage buckets + policies) — separate from table RLS, can follow once you're ready for file uploads.
