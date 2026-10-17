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
