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
