# Source of the opening library

`a.tsv` … `e.tsv` are unmodified copies from
https://github.com/lichess-org/chess-openings at commit
`a6189a30dc273ccb21fc2536a9a2fefd5592a67a` (fetched 2026-10-12).

Licence: CC0 1.0 Public Domain Dedication (the repository's README: "As a
collection of facts, this data set is in the public domain").

Dev input only, never loaded by the app. `tools/build-opening-library.mjs`
turns these into `js/opening-library.js`. To update: replace the five files
from a newer commit, write the commit here, run the tool, run `test:tree`.
