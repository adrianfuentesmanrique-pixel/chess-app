// A COPY, for the record. The live one is the Cloudflare Worker `ctc-reminder-clock`
// in Adrian's Cloudflare account (free plan), pasted in by hand on 2026-10-09.
// Nothing in this repository deploys it; if you change this file, the Worker does
// not change until the code is pasted into the Cloudflare editor again.
//
// Why it exists: GitHub's own schedule for .github/workflows/streak-reminder.yml
// skipped most hours (2 scheduled runs in the first 18 hours). The "Run workflow"
// button always worked, so this presses it once an hour.
//
//   Cron trigger (Worker settings): 5 * * * *   (UTC, minute 5 of every hour)
//   Secret (Worker settings):       GITHUB_TOKEN, a fine-grained GitHub token for
//                                   this one repository, Actions: read and write.
//
// GitHub's schedule stays on as a backup. The job remembers the last hour it
// handled, so two starts in one hour send nothing twice.
export default {
  async scheduled(controller, env, ctx) {
    const r = await fetch(
      'https://api.github.com/repos/adrianfuentesmanrique-pixel/chess-app/actions/workflows/streak-reminder.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'ctc-reminder-clock',
        },
        body: JSON.stringify({ ref: 'main', inputs: { dry_run: 'false' } }),
      }
    );
    console.log('GitHub answered ' + r.status);
    if (!r.ok) throw new Error('GitHub answered ' + r.status);
  },
  // The public address does nothing on purpose: only the timer can start a run.
  async fetch() {
    return new Response('Nothing here.', { status: 404 });
  },
};
