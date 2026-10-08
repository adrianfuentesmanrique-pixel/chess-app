# Chess Training Center — rules for any session in this folder

## Read first
`HANDOVER.md` — current status and what is already done.
`HANDOFFS.md` — the remaining tasks, each with a ready prompt.

## Never read these whole — they will eat the session
| File | Size | Instead |
|---|---|---|
| `js/app.js` | 293 KB (~73k tokens) | Grep the symbol, then Read with offset/limit |
| `js/endgames-data.js` | 212 KB | Grep only |
| `puzzles/*.json` | 5.1 MB total | Grep only |
| `graphify-out/graph.json` | 292 KB | Read `graphify-out/GRAPH_REPORT.md` (8 KB) instead |

## One task per conversation
Do the task, verify it, commit, then tell me to start a new conversation.
Do not drift into a second task. If I ask for something unrelated, say so and
suggest a fresh session.

## Finish by pushing (my rule since 2026-10-08)
When the work is verified and committed, **push to `main` without asking me** —
pushing is what deploys, and a job that is not live is not finished. Then check
that the live `sw.js` shows the new version and say so.

Stop and ask me instead of pushing only when something is still mine to decide:
- `firestore.rules` or the indexes changed — I run `npm.cmd run rules:deploy`
  first, and the push waits for that.
- A choice about how the feature behaves is still open, or you built something
  I did not ask for.
- A check is failing, or something could not be verified and going live with it
  is a real risk — say which.
- The push would carry commits that are not this session's, or `main` has moved
  and does not merge cleanly.

Never push with `--force`. Stage only your own files; another session's unstaged
files stay where they are. This rule goes into the prompt you hand over, in
place of any "ask me before pushing" line.

## ALWAYS end by writing the next session's prompt — do not wait to be asked
I am not a programmer, so I cannot write these myself. Every session ends with a
copy-paste prompt for the next one, in a fenced block, **without me asking for
it.** This rule is part of the prompt you hand over, so it keeps propagating.

### The prompt must continue THIS session's work — never pick a backlog item
The handover exists so a task that outgrew one conversation can carry on. It is
**not** a "what should Adrian do next" suggestion. So:

- **The next task must come out of the work we just did** — the part that was
  deferred, the follow-on it unblocked, or a real defect this session found and
  did not fix.
- **If the work is genuinely finished with nothing following from it, say so in
  one line and write NO prompt.** That is the correct ending, not a failure to
  follow this rule. Do not go shopping in HANDOVER's "Still to do" list for
  something to fill the block with — I did not ask for it, it costs tokens, and
  a stale backlog item wastes a whole conversation.
- **Never hand over a task without first checking against git that it is still
  undone.** HANDOVER and the plan files go stale; another session may have
  finished the thing while this one was running. `git log --oneline -15` and a
  grep for the symbol, every time.

The prompt must contain, in this order:
1. The standing token rules (`js/app.js` sizes, never read the data files, the
   `cd C:\Users\Adrian\chess-app;` + `npm.cmd` command shape, one task per chat).
2. **TASK:** one sentence naming the task, and the plan or spec file to read.
3. **What is already built that must NOT be redone** — the real function names
   and file paths, and which existing helpers to reuse instead of rewriting.
4. **Anything stale in the plan or the docs, called out by name**, so the next
   session does not follow an out-of-date instruction.
5. **Scope** — what to build, plus any decision I need to make and your
   recommendation.
6. **Verify** — the concrete checks, always including 375px, light AND dark,
   both languages.
7. **Known limits and things not to chase** (App Check 403, screenshots time
   out, another session's unstaged files, what is still owed).
8. This same rule, so the next session ends the same way.

Facts in the prompt must be checked against the code first, not copied out of a
handover note — those go stale.

## Data that must never be renamed
`'endgame'` is one of four ELO domains (puzzle/opening/endgame/blindfold). It is
a storage key and a radar-chart key, not a label. Renaming it wipes every
existing user's endgame rating. Visible labels can change freely; keys cannot.

## House rules
- Offline-first PWA heading to the Play Store as a TWA. Everything self-hosted:
  no CDN, no external API, no placeholder images.
- Audit against the existing design language (Kael, navy and gold). Do not
  invent a new visual style.
- Mobile-first — judge everything at 375px width first, in light AND dark mode.
- Verify in the browser pane before claiming something works.
- I am not a programmer. Explain in plain language, keep instructions simple.

## Commands you give me to run — always in this exact shape

I run them in a plain PowerShell window that opens in `C:\Users\Adrian`, and
that window is NOT set up the way your tool session is. A bare `npm run x`
fails for me twice over: wrong folder, and PowerShell refuses to load
`npm.ps1` ("running scripts is disabled on this system").

So every command you hand me must **start with the `cd` and use `npm.cmd`**:

```
cd C:\Users\Adrian\chess-app; npm.cmd run test:rules
cd C:\Users\Adrian\chess-app; npm.cmd run rules:deploy
```

Same rule for `npx` → `npx.cmd`. Do not tell me to change my execution policy
to fix this; `.cmd` works and touches no system setting. Note the separator is
`;` — `&&` is a syntax error in my PowerShell.
