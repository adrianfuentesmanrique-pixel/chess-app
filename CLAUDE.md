# Chess Training Center — rules for any session in this folder

## Read first
`HANDOVER.md` — current status and what is already done.
`HANDOFFS.md` — the remaining tasks, each with a ready prompt.

## Never read these whole — they will eat the session
| File | Size | Instead |
|---|---|---|
| `js/app.js` | 232 KB (~58k tokens) | Grep the symbol, then Read with offset/limit |
| `js/endgames-data.js` | 212 KB | Grep only |
| `puzzles/*.json` | 5.1 MB total | Grep only |
| `graphify-out/graph.json` | 292 KB | Read `graphify-out/GRAPH_REPORT.md` (8 KB) instead |

## One task per conversation
Do the task, verify it, commit, then tell me to start a new conversation.
Do not drift into a second task. If I ask for something unrelated, say so and
suggest a fresh session.

## ALWAYS end by writing the next session's prompt — do not wait to be asked
I am not a programmer, so I cannot write these myself. Every session ends with a
copy-paste prompt for the next one, in a fenced block, **without me asking for
it.** This rule is part of the prompt you hand over, so it keeps propagating.

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
