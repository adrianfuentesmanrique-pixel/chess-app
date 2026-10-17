# School pilot ("College tab") — session 1: groups, class codes, badge, less data

Written 2026-10-16. Builds on `docs/plans/2026-09-29-students.md` (section 3.1),
which stays the source for the coaching link and the summary.

Adrian's decisions (16 Oct 2026, not to reopen): Panama only, one free pilot
school, kids use the normal login plus a badge, collect as little as possible
(the teacher never sees email, real name or date of birth), no new social
features, no videos/tournaments/payments yet. Class code = **6 characters with
no look-alikes** (no 0/O, 1/I): alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.

## In plain words

- A teacher makes **groups** ("5.º A", "Principiantes"…). Each gets a code like
  `K7RM3P`. The teacher can rename it, close it (no new joins) and delete it.
- A student types the code. **Typing it is the yes**: the link to the teacher is
  created already active, by the student. Same promise as before: the teacher
  sees only the training summary, never email, real name or birth date.
- The teacher's list loads **one group at a time**, so hundreds of students
  are fine. Students invited the old way (friends) sit under "Individual".
- The student sees a navy/gold **badge** with the group (and school) name.
- First name, last name and birth date become **optional** at sign-up.

## Data

**`groups/{code}`** — the code IS the document id.

| Field | |
|---|---|
| `teacherUid` | owner, never changes |
| `name` | 1–40 chars |
| `school` | optional, ≤ 60 chars |
| `open` | `true` = joinable |
| `createdAt` | `request.time`, never changes |

Rules: `get` any signed-in user (knowing the code is the whole point);
`list` only with `teacherUid == me` (codes cannot be enumerated); create by the
owner with a valid code id and `open == true`; update only `name`/`school`/`open`;
delete by the owner. A code collision is a create on an existing doc, which is
an update, which fails unless it is your own — the app checks with a `get` first
and retries with a new code.

**`coaching/{teacherUid}_{studentUid}`** gains **`groupId`**:
- `''` on a teacher's friends invite (optional key, so a phone still on the old
  version can invite until it updates).
- The group code on a link a student created by joining.

New clauses:
- **create by the student (join):** `studentUid == me`, id = `teacher_me`,
  `status == 'active'`, `createdAt == respondedAt == request.time`, and
  `get(groups/{groupId})` is owned by that teacher and `open == true`. Refused
  if the teacher has blocked the student.
- **update by the student (join with a link that already exists):** only
  `status`, `groupId`, `respondedAt` move; result is active in an open group of
  the same teacher. Covers: a pending invite from the same teacher, an old
  decline, or moving to another of that teacher's groups.
- The 3-teacher cap stays where it is: the join is ONE batch with the summary,
  and the summary rule refuses a 4th teacher.
- Leaving = the existing **End** (student deletes the link); removal = the
  existing teacher delete. No new delete clause.

## Loading for hundreds

- Group roster: `coaching where teacherUid == me and groupId == X` (equality
  only, no composite index), limit `MAX_GROUP_STUDENTS` (200).
- Individual roster: `groupId == ''` plus a one-off **legacy** query for links
  made before `groupId` existed: `teacherUid == me and createdAt < 2026-11-01`,
  grouped ones filtered out. This needs one composite index
  (`coaching: teacherUid ASC, createdAt ASC`).
- Summaries: one `getDoc` per student of the loaded roster, not the old
  array-contains-everything query.
- `MAX_STUDENTS` (30) stays the advisory cap for **individual** invites; the
  real capacity comes from `MAX_GROUPS` (30) × `MAX_GROUP_STUDENTS` (200).

## Screens (Kael navy/gold, existing classes only)

- Teacher, "My students": a row of chips — Individual + one per group + "＋
  New group". Picking a chip loads that roster. A group shows its code big
  with Copy, and ⋯ for Rename / Close-Open / Delete (delete removes its students
  and their homework, after a confirm).
- Student, "My teachers": a **Join a class** button → code box → readable
  errors (no such code, closed, your own class, 3 teachers already). A group
  link shows the group badge.
- Profile: the badge under the name.

## Owed, not this session

- `js/legal-data.js` still says the app is not for under-13s — legal text update.
- A one-page note for parents at the pilot school.
- Session 2: homework to a whole group + a per-group grade table with ranking.

## Session 2 — homework to the whole group, grade table, ranking

**No rule changes.** A group's homework is ordinary `homework/{id}` docs, one
per student, exactly what `assignHomework` writes.

**Sending (`assignHomeworkToMany` in js/firebase.js).** Each create's rule
reads its coaching link. Measured on the emulator: one batch takes up to 20
creates (18 for a chapter, which also reads the class) and 30 is refused —
so the app sends **batches of 8** (`GROUP_HW_BATCH`), pinned by
`tests/rules/group-homework.test.js`. A refused batch is retried one student
at a time, so only the real failures are reported.

- Who gets it: the group's students whose link is **active right now**.
  Students who join later do not get it.
- Skipped before sending: anyone with `MAX_OPEN_HOMEWORK` (10) open homework
  from me. Counted with ONE `count()` query per student (1 read each, no
  documents downloaded; equality filters, no new index).
- Chapter: each student is first added as a viewer of the class
  (`ensureViewer`); a full class skips the rest, reported.
- Result in words: "Sent to 27 of 28 — 1 already has 10 open".
- Same assign sheet. A group has its own list draft and position slot, keyed
  `grp:<code>`, so it never mixes with a student's.

**Grade table (per group, on the group card).** One row per student: profile
name (never real name/email), puzzle rating, puzzles solved, minutes this
week, homework done this week / open. Tap a column to sort; the **rank**
column is fixed by the official ranking.

- Data: the summaries already loaded with the roster (`fetchReportsFor`) +
  ONE query: my homework finished in the last 7 days
  (`teacherUid == me, completedAt > now − 7 d`, the existing index), counted
  per student. "Open" is the summary's `hwOpen`.
- **Ranking (Adrian, 2026-10-16): effort, not rating** — homework finished
  this week, then minutes practised this week. Ties share a rank.

**Owed after session 2:** session 3 — the teacher's class report to print or share (built from the same table data); the legal text and the parents' note stay owed separately.

## Session 3 — the class report (a picture to share)

**Format (Adrian, 2026-10-16): a PNG image**, not a print page — it goes
straight into WhatsApp, which is how Panamanian schools talk to parents.
**No rule changes, no new query.**

- A **"Share report"** button inside the grade table. It draws the SAME rows
  and ranks the table shows: the row building and the effort ranking move out
  of `gradeTable` into module helpers (`gradeRows`, `rankGradeRows`) that the
  table and the report both call — nothing is computed twice.
- One picture, Kael's light navy/gold (it is a paper-like sheet, the same in
  light and dark mode): app name, group name, school, the date range (last 7
  days), the effort rule in one line, the table in rank order (#, student, Hw
  ✓, min, open, rating, solved), and the "Open" note (it is each student's
  last summary, counting all their teachers — so it does not move right after
  sending homework).
- Profile names only — the rows hold nothing else (no email, real name or
  birth date ever reaches the table). Long names are cut with "…".
- A big group is cut into pages of 40 rows, shared together (one share sheet,
  several images); the download fallback saves each.
- Shared through `shareCanvas` in js/app.js (now exported, and taking several
  canvases) — the share sheet first, a download otherwise.
