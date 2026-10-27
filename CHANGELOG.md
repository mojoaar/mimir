# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project settings now says how much of the memory is learned: **N memories · N summarised · N embedded**, with
  **Summarise now** and **Embed missing** for the owner. The embed button is replaced by a sentence when the install
  has no embedding provider.
- Turning learning on now summarises what was already there. Extraction used to be queued only by a write, so
  memories written while learning was off stayed unsummarised forever.
- A digest entry carries the date it was last written, so an agent can tell a convention from last week from one
  from last year.

### Changed

- One user-settings page: **Settings → Profile** now holds two-factor authentication, appearance and API keys as well
  as the name, password and sessions. `/app/settings` and `/app/settings/mfa` redirect there, Settings is gone from
  the header nav, and Providers keeps its own link.

## [0.16.0] - 2026-10-27

### Added

- New projects can start with learning on. The default lives in **Admin → Settings → Site** and is off unless you
  turn it on; it is copied into a project when that project is created, so projects that already exist keep their
  own setting.

### Fixed

- Opening another memory from the tree now shows *that* memory's text. The reader's body box kept the previous
  memory's text while the heading changed, because a client-side navigation left the same editor mounted.

- Testing a provider now says what happened. The button reads **Testing…** while it runs, then **Works.** — with
  the embedding dimension when the provider is an embedding one — or the provider's error, instead of leaving the
  row looking untouched until the page is reloaded.

## [0.15.0] - 2026-10-27

Every clock in one place.

### Added

- One timezone for the whole install, set in **Admin → Settings → Site**. Every timestamp, the audit day filter
  and the usage bars follow it instead of hard-coded UTC.
- A 12-hour or 24-hour clock, set beside the timezone. Dates always read as `YYYY-MM-DD` either way.
- **Admin → Jobs.** The queue's state, what each job did, embedding calls per purpose for the last day, and how
  many memories actually carry a vector — with the model that built it.

### Changed

- The audit log's action filter is a dropdown of the actions that exist, grouped by prefix with their counts,
  instead of a field that needed the exact action name.
- A memory records when and with which model it was embedded, so a vector left behind by an old model is visible
  instead of hiding behind "100%".

### Fixed

- A finished job now reports what it did ("12 embedded") instead of storing nothing, and Admin → Jobs shows every
  job from the last seven days with its duration, retries and failure message.

## [0.14.0] - 2026-10-27

Your agent starts informed.

### Changed

- The OpenCode plugin runs on the v2 plugin API and installs straight from this repository, so it works in OpenCode
  2.1 without publishing to npm. The digest still arrives on its own, once per session, and the package now builds
  itself so a git install needs nothing prebuilt.

### Fixed

- The OpenCode plugin's two tools stay available when the MCP server for the same Mimir is not configured, disabled or
  broken, and a folder without a git remote keeps writing to one project instead of a new one per memory.
- A `~` in the plugin's token file path is expanded instead of silently disabling the plugin.

## [0.13.1] - 2026-10-26

### Fixed

- Testing an LLM provider no longer fails with `provider responded 404` when the provider has no model-list
  endpoint — OpenCode Go and OpenCode Console among them. The test now asks the model a one-line question, which is
  what Mimir actually uses a language model for.

## [0.13.0] - 2026-10-26

Pick the model, not the name.

### Added

- Mistral is a provider for both chat and embeddings. Its chat list is Large 4, Medium 3.5, Small 4 (the default) and
  Codestral; for embeddings it offers Codestral Embed, which takes an `output_dimension` and so fits the stored 768.
  `mistral-embed` is deliberately absent: it is fixed at 1024 dimensions.
- **Admin → Usage** counts every remote provider call: the month's spend split between language models and embeddings,
  thirty days of daily spend, twenty-four hours of calls, a breakdown by model and by person, and recent failures. A
  provider with no price is still counted, and the page says how many calls that is.
- A dismissible `Usage spike` pill in the admin row and the header when the current hour has at least twenty calls and
  more than five times the median of the previous week. Dismissing it hides it for that admin until a new hour spikes.
- Octen is a new embedding preset (`https://api.octen.ai`), offering `octen-embedding-0.6b`, `-4b` and `-8b` at 768 dimensions, each shown with its price. Embeddings sent to it are marked as a query or a document, which is what the model expects.
- **Admin → Usage** can prune the call log: delete everything older than the number of days you choose, and it tells
  you how many rows went. The audit trail is untouched — it ages itself out on its own schedule.
- Two documentation pages that explain the product rather than the commands: **How Mimir works** (projects, paths,
  versions, digest, hybrid search, teams, audit, backups, accounts) and **Providers and embeddings** (which model does
  what, the preset table, why the column is 768, prices and the usage page). The overview now says what is in the box,
  and why the project is called Mimir.
- The HTTP API and MCP pages show request *and* response for a full walkthrough — projects, tree, read, write, search,
  digest as text, versions and restore, ingest, and a raw JSON-RPC call — with a fuller error catalogue.
- Documentation code blocks are syntax highlighted with Prism, coloured from the theme variables so both themes work.
- The landing page says what it is selling: a bold opening, three proof chips, an entry link in the header and the
  hero, and a closing call to action. Instead of a lone `docker compose` line it shows a mock OpenCode session where
  the agent calls `memory_digest` and `memory_search` over MCP and answers from the result. The theme switcher is gone
  from it; appearance stays under **Settings → Appearance**.
- A real icon set — an eye in the well with an M in the pupil — as `icon.svg`, a 192 and 512 png, an Apple touch icon,
  a regenerated `favicon.ico`, and a web app manifest that opens at `/app` when installed.

### Changed

- Each provider carries its own price per million tokens, seeded from the preset's list price when it has one, and
  editable in place under **Settings → Providers**. A call's cost is recorded when it happens, so changing a price
  later does not rewrite history.
- The model field in **Settings → Providers** is a dropdown of the models the chosen provider offers, not a text field: DeepSeek's two current models, the live OpenCode catalogue (cached for an hour), and Octen's three. A preset with no catalogue, such as Ollama or an OpenAI-compatible host, keeps the text field.
- A preset only offers the kinds it supports, so DeepSeek and Octen show their kind as text instead of a dropdown with one real choice.
- The footer credits the author with a link to his site, opens GitHub and Docs in a new tab, and no longer says MIT.
- The README's test database line says Postgres 18, which is what the compose files actually run, and its provider
  section now names Mistral and points at the usage page.
- The mark sits before the name in the landing, app and docs headers, and the public pages say **Open app** rather
  than **Sign in** when a session already exists.

### Fixed

- DeepSeek's default model was `deepseek-chat`, which the provider no longer lists. It is `deepseek-flash`.
- A model list belonged to the preset rather than to the kind it was for; Mistral's chat and embedding models now
  each get their own list, so picking Embeddings no longer offers a chat model.
- A stalled release build used to leave the run in progress forever; the job now fails after thirty minutes, so it can
  be retried instead of hanging.

## [0.12.0] - 2026-10-25

Your face in the corner.

### Added

- Every account can upload a round icon in **Settings → Profile**. It sits before your email in the header menu and
  falls back to your initial when you have not uploaded one. png, jpeg or webp, up to 128 KB, stored on the account
  so it follows you between browsers.

### Changed

- The app column is wider (`max-w-5xl`), and the profile, security and admin pages now share it instead of each
  picking their own width.
- Appearance (language and theme) moved from the header into **Settings → Appearance**, so the header carries only
  destinations.
- Profile and sign out live behind your account name in the header.
- Admin destinations render as buttons rather than a strip of small links.

### Fixed

- The account menu closes when you click the page or press Escape, instead of only on a second click.
- A newly uploaded picture appears at once, without a hard reload.
- The footer is centred under the docs column.

## [0.11.0] - 2026-10-25

Every screen, in your language.

### Added

- A language menu in the app header: English, Danish and German. The choice is saved on the account, so the next
  page is already in that language on its first paint, on any browser you sign in from.
- The sign-in, memory, project, team, settings and admin screens are translated, and so are the messages forms
  answer with. Anything that has not been translated yet falls back to English rather than showing a raw key.

### Changed

- The public pages keep their own addresses (`/`, `/da`, `/de`) so search engines can index each language; the
  signed-in app uses one path and the saved preference instead.

### Fixed (review pass)

- The project settings screen, including its sharing and danger-zone copy, is translated too — it was the last
  screen still answering in English.
- Form errors now speak the reader's language instead of the service layer's English, and a driver message can no
  longer reach a page.
- A new account no longer claims to have chosen English: it starts blank and follows the browser's language until
  someone picks one from the menu.
- The language menu has a real submit button, so it also works with JavaScript disabled.
- Three German sentences that said something other than the English were corrected, and a Danish/German page now
  declares its language on the page itself.

## [0.10.1] - 2026-10-25

Room to breathe.

### Changed

- The app header sits in the same padded, centred column as the admin and docs
  headers, so the navigation no longer hugs the corners of the window.
- **Docs** and — for an admin — **Admin** are now links in the header, instead
  of a URL you had to remember.
- A footer on every app and docs page: author, GitHub, licence, docs, the
  version you are running, and the year.
- The profile and two-factor screens sit in the same padded column as the
  rest of the app, and a long email address no longer pushes the theme and
  sign-out controls off a phone screen.

### Fixed

- Sign out was only on the dashboard; it is now in the header, so every page
  offers a way out.

## [0.10.0] - 2026-10-25

Your account, your control.

### Added

- **Settings → Profile** (`/app/settings/profile`): edit your own name and
  email address, and change your password without leaving the app. An email
  change asks for your current password and refuses one already in use.
- A sessions list on the same page: every device signed in to your account,
  with its address and browser, so you can revoke one device or sign out
  everywhere else.

### Changed

- A password change signs out every other device and keeps the one making the
  change. The same is true of the reset link, as before.

### Fixed (review pass)

- A password change used to open a second database connection while its own
  transaction was still open. Enough parallel requests could hold every
  connection in the pool and leave the app unresponsive until a restart; the
  revocation now runs inside the same transaction.
- Signing out every other device is recorded in the audit log with a count,
  which it previously was not.
- Current-password guesses on the profile and password forms are throttled
  the same way sign-in is, so a stolen session cookie cannot be turned into an
  account takeover by grinding a password.
- A session id that is no longer valid reports that your session expired
  rather than failing with a database error.
- An email address is checked for a plausible shape, not just for an `@`.
- Session times say UTC, and form errors are announced to screen readers.
- The release commit no longer carries local scratch files.

## [0.9.0] - 2026-10-25

Hardening: fewer ways to be surprised.

### Security

- A provider base URL that points inside your own network is refused when you
  save it, naming the address. Loopback, private ranges and link-local
  addresses (including the cloud metadata address) are rejected; the homelab
  hostnames `host.docker.internal` and `ollama` still work, so a local model
  keeps working.
- Audit failure logs no longer echo a connection string. Passwords inside a
  URL are masked, and a bare token is masked except its last four characters,
  while table and constraint names stay readable — a log you can act on
  instead of one you have to squint at.

### Fixed

- The login throttle is keyed on the account instead of on an address the
  runtime cannot see. Five wrong passwords lock the account for fifteen
  minutes no matter where they come from, and the database lock still holds
  after a restart.
- A provider key shorter than five characters is no longer shown in full in
  the UI; short keys are masked completely.
- IPv6 subnets are accepted in `MIMIR_TRUSTED_PROXIES`, so a v6-only proxy
  network can be configured.
- A project or memory that does not exist now says "There is nothing here"
  instead of claiming a 404 the router cannot send once Next has started
  streaming. Unknown addresses are still a real 404.
- The provider user-agent reports the version actually running rather than
  `mimir/0.2.0`.

### Changed

- A member can leave a team, and an owner can rename one. The last owner
  cannot leave: hand the team over or delete it.
- The OpenCode plugin adds the project digest to the system prompt when a
  session starts, so the agent begins informed without being asked. It waits
  at most 1.5 seconds and stays silent when Mimir is unreachable, slow or
  unconfigured.
- One rule now backs every access query, so a `write` grant from a team and
  from a person can never be ranked differently by two code paths.
- Listing projects is one query per page rather than one per project, and an
  authenticated call no longer waits for its own last-used timestamp.

### Added

- A forgotten-password page. The answer is identical whether or not the
  address has an account, and when email is not configured the page says so
  rather than pretending to send.

### Fixed (review pass)

- The provider URL check now also catches the ways around it: a trailing dot
  (`localhost.`), IPv4-mapped and NAT64 IPv6 addresses, and a public name that
  resolves to a private address. Provider requests also refuse to follow a
  redirect, so a public endpoint cannot bounce the server into the network.
- The reset request is rate limited on its own budget (three per fifteen
  minutes) and respects the IP allowlist. It used to mint a token on every
  request and to fire before the allowlist check.
- The reset answer no longer takes longer for a real account: the link is
  minted and mailed without holding the reply, so timing cannot be used to ask
  "does this address exist".
- The session digest is fetched once per session instead of once per model
  step, so a long session no longer pays a 1.5 s lookup and 800 tokens before
  every dispatch.
- A provider key of eight characters or fewer is now hidden whole.
- A team rename reports failure when row-level security refuses the update
  instead of claiming success.
- An IPv6 address in `MIMIR_TRUSTED_PROXIES` no longer carries a wrong address
  family into the peer check.
- `getProject` no longer invents `read` when no grant backs the row.

## [0.8.0] - 2026-10-25

Share with people, not accounts.

### Added

- Teams: a group of accounts with one owner and any number of members,
  created and managed at **Teams** in the app. Membership is checked from the
  database on every request, so removing someone ends their access
  immediately rather than when a session expires.
- A project can be shared with a person or with a team at `read` or
  `read and write`, from **Settings → Sharing**. A share is never ownership:
  only the owner can rename, archive, delete or re-share a project or change
  its settings.
- `project_list` and `GET /api/v1/projects` include projects shared with a
  team the caller belongs to, under the role the team grants.
- Deleting a team removes the shares it held; the projects themselves and
  their memories are untouched.

### Fixed

- A project shared with a team is now reachable by slug and by repo key, not
  only by `project_list`: `resolveProject` and `getProject` still matched
  person grants only, so every REST and MCP call for a team-shared project
  answered `404 project_not_found` while the project showed up in the list.
- Two teams with the same name no longer collapse onto one page: team URLs
  carry the team's id, so each owner and member reaches their own team.
- Deleting a team also removes the shares it held on projects its owner does
  not own. Those grant rows used to survive, invisible, while the app said
  everything had been revoked.
- The grant list is owner-only; a write grantee can no longer enumerate who
  else a project is shared with.
- Team actions surface only messages the service wrote, never a raw database
  error.

## [0.7.0] - 2026-10-25

Bring your own project.

### Added

- `mimir ingest` walks a folder and imports its documentation and
  configuration — READMEs, `docs/`, markdown, compose files, `package.json` —
  in batches the server accepts, into `import/` where search finds them.
  Source code is skipped by default, because the agent already has it.
- `--project` names a project yourself, for a folder that is not a git
  repository. In a repository the import joins the project your agents already
  write to.
- `--all` imports every text file; `--dry-run` prints the plan and sends
  nothing.
- A project can now be created by the name the caller asks for, so a named
  import does not need a second run.

### Fixed (review pass)

- The published `mimir` command did nothing: npm installs a bin as a symlink,
  so the entrypoint's self-check never matched. It is now its own file behind
  the bin, and a test runs it through a symlink the way npm does.
- A git checkout imported into a project called `repo` instead of the one your
  agents use: the remote lookup used `require` inside an ES module, failed
  silently, and sent no repo key.
- Reading an unknown project created it. `GET /api/v1/projects/typo/tree` made
  an empty project and answered 200; it is a 404 again, and only a caller that
  asks to create may create.
- A repository with more than 10,000 entries imported a prefix of its files and
  reported success. The cap is now a guard against a symlinked home directory,
  it is reported when hit, and the run fails instead of pretending.
- An imported file the server refused is now reported with the server's reason,
  not "refused by the server".
- Files are batched by decoded size, so a Latin-1 file that inflates when read
  as UTF-8 no longer takes its whole batch down.
- `--url` and `--token` reach the request; a folder that is neither a
  repository nor named with `--project` now says so and exits 2.
- Re-importing a named project after archiving it reuses the project instead of
  forking `name-2`.

## [0.6.0] - 2026-10-26

History you can undo.

### Added

- Every write keeps the body it replaced, so an agent that overwrites a memory
  no longer destroys what was there. The last 20 versions per memory are kept
  and pruned by the nightly purge job.
- A history panel in the memory browser: the versions of a memory, a line diff
  against what is live now, and a restore button. A restore is itself a write,
  so a mistaken restore can be undone the same way.
- `GET /api/v1/projects/:slug/memory/*path/versions` and
  `POST /api/v1/projects/:slug/versions/:id/restore`, so an agent can read and
  restore history too.
- `diff` as a dependency, for the line diff.

### Changed

- A wrong URL now gets a real 404 and a page worth reading instead of the
  framework's bare one. The theme cookie picks the colours and the line is
  stable per path.
- `runPurge` reports `{ removed, versionsRemoved }`, and the `memory.purge`
  audit row carries both counts.

### Fixed (review pass)

- A body is no longer lost when two writers create the same memory at the same
  time. The archive now reads the row the update actually replaced, instead of
  locking a row that does not exist yet.
- History stays at twenty bodies per memory as it is written, not only after the
  nightly sweep, so a path rewritten in a loop cannot grow all day.
- The history panel ignores a version id belonging to a different memory, and
  the API's restore audit row records `via: api`.
- Size is reported in bytes, not characters, so a body of emoji reports what it
  costs on disk.

## [0.5.0] - 2026-10-26

Seeing what the agents wrote.

### Added

- A memory browser at `/app/projects/<slug>`: the project's directory tree, a reader with the path, title, summary and body, search scoped to the project, and a deep link per memory (`?path=…`).
- Edit, delete and restore from the browser. A rewrite clears the summary until the learning job writes a new one; a delete is recoverable, and a nightly job purges anything older than 30 days.
- Project archiving: an owner can hide a project from every list and API call and restore it later, with its memories and grants intact.

### Fixed

- A URL that is not a page — an unknown locale, an unknown docs agent, any path with no route — answers a real `404` instead of `200` with a not-found body, and `/app/*` keeps its `noindex` header. A valid route with a missing id (a purged memory, a deleted project) still renders the not-found page with `200`, because Next streams a dynamic route's shell before the page can decide.
- An archived project refuses reads and writes through the API instead of failing with an internal error, and the zero-config repo lookup no longer dead-ends on the repo-key unique index.
- Editing a memory in the browser keeps its title, and a refused or impossible restore says why instead of landing silently.
- Archiving is owner-only in the UI: a write or read grantee no longer sees a Restore button that cannot work.


## [0.4.0] - 2026-10-26

Public surface: the parts a stranger meets first.

### Fixed (review pass)

- The marketing pages emit absolute canonical and `hreflang` URLs and a link-preview image; the docs no longer advertise Danish or German alternates that do not exist.
- An ingest batch over 1 MiB is accepted up to its documented 2 MB, and one oversized or malformed file refuses the whole batch instead of writing the rest.
- The OpenCode plugin reads the git remote under ESM, and its docs no longer claim a session-start digest it does not do.
- The OpenCode plugin gains a build and a guarded publish step in the release workflow, so the package can actually be installed.
- The login page is marked `noindex`.

### Added

- The marketing page is localised: English at `/`, Danish at `/da`, German at `/de`, with the reader's choice remembered.
- `sitemap.xml`, `robots.txt`, per-page canonical URLs, `hreflang` alternates and an Open Graph image, all built from the configured public URL.
- A public `/docs` site: self-hosting, backups, MCP, the REST API, every tool, how search works, and the changelog rendered from this file.
- One page per agent with the exact config file and a snippet that agent accepts: OpenCode, Claude Code, Codex, Cursor, Gemini CLI, Pi, Antigravity, Hermes, Muse.
- `memory_ingest` over MCP and `POST /api/v1/projects/:slug/ingest`, for loading an existing repository (100 files / 2 MB per batch).
- `@mojoaar/opencode-mimir`: an OpenCode plugin that registers `mimir_digest` and `mimir_remember`.
- A Claude Code session-start hook (`hooks/mimir-session-start.sh`) and `format=text` on the digest endpoint so a shell can use it.

### Changed

- Marketing paths are served through a `[locale]` segment; `/en/...` redirects to the unprefixed form so there is no duplicate page.

## [0.3.0] - 2026-10-25

Mimir can now be operated: it backs itself up, it manages its users, and an
admin can see what happened.

### Added

- Encrypted scheduled backups to S3 or WebDAV (pCloud included): two artifacts
  per run, a `pg_dump -Fc` of the database and a JSON export of settings,
  projects and provider labels. Every upload is read back and its size checked
  before the run is recorded as successful.
- Retention: the newest N runs are kept (14 by default) and older artifacts
  under the configured prefix are pruned; nothing outside that prefix is touched.
- A backup admin page: target and schedule form, `Run now`, last-success age,
  and the last 20 runs with their errors.
- `scripts/decrypt-backup.mjs` and an encrypted branch in `scripts/restore.sh`,
  so an uploaded `.enc` artifact restores without ever writing plaintext to disk.
- Admin user management: create, verify, enable, disable, change role, reset a
  password, reset MFA and delete. Disabling a user revokes their sessions and
  API keys in the same transaction.
- TOTP two-step login, optional per user, with a `require_mfa` install switch
  and a replay guard on the last accepted step. The bootstrap admin is exempt so
  a misconfigured install cannot lock its only operator out.
- An optional IP allowlist (CIDR blocks) enforced on `/api/v1`, `/mcp`, the
  login page and the product area. `/health` and the marketing page stay open.
- An audit viewer with filters, pagination and CSV export, plus a nightly prune
  that keeps memory traffic for 30 days and everything else for a year.
- An admin overview with user, project, memory, embedding and job counts.
- A site settings page for the public URL, site name, meta description,
  `require_mfa` and the allowlist.
- Invitation and password-reset links by email through Resend, falling back to a
  copyable one-time link when email is not configured.

### Changed

- PostgreSQL 18 (was 17). A pre-0.3.0 install must be dumped and restored; the image will not start on the old data directory.
- The runtime image installs `postgresql18-client`, because `pg_dump` refuses a
  server newer than itself and the backup job would fail at 3 a.m.
- `scripts/restore.sh` is POSIX `sh` so it runs inside the Alpine image.

### Fixed

- Encrypted settings and provider credentials are sealed as one blob, so a
  partially written settings row can no longer leave a secret in the clear.


### Fixed (review pass)

- Retention counts restore points, not files. It deleted every database dump once 14 runs existed, because `mimir-…` names sort before `settings-…` names, and then recorded the run `ok`.
- A failed backup now removes the objects it already uploaded, so a truncated dump cannot sit next to the good ones.
- Saving the backup form a second time no longer wipes the S3 access key id, and saving email settings without a key is refused instead of silently disabling email.
- The IP allowlist now covers server actions and route handlers, not just page renders, so a blocked network cannot mutate anything with an old cookie.
- Admin user actions no longer report "That did not work" after a successful change; `redirect()` was being caught as a failure.
- The audit CSV export returns up to 10,000 rows instead of being clamped to 200.
- A password reset action exists, and a user created without a password can be re-invited from the users page.
- The TOTP step is rate limited, and the replay guard is a single conditional write so two simultaneous submissions cannot both pass.
- An invalid cron expression is rejected when saved and can no longer stop the job queue from starting.
- Audit retention ages out reads at 30 days; writes and deletes are kept for a year.

## [0.2.0] - 2026-10-25

Mimir now learns. Memory is titled and summarised by your own model, and
search matches meaning as well as words.

### Added

- Background jobs on pg-boss, running inside the server process: an `extract`
  queue debounced per project, a `backfill` queue and a `reembed` queue.
- Provider presets for DeepSeek, OpenCode Go, OpenCode Console, Ollama and any
  OpenAI-compatible endpoint, with keys encrypted at rest and only a hint ever
  shown back.
- Provider management at **Settings → Providers**, with **Test connection**
  probing the endpoint and recording the outcome.
- Install-wide embedding model at **Admin → Settings**, with the dimension
  fixed at 768 and a rebuild action that nulls and refills every vector.
- Extraction writes a one-line title and a short summary for each memory,
  using the project owner's language model, and can be switched on per
  project at **Project → Settings**.
- Memory is embedded on write when an embedding model is configured, so
  search finds it by meaning; backfill fills in anything written before.
- Project list on the dashboard, and a project settings page with the
  learning toggle and a per-project provider override.

### Changed

- Retrieval is hybrid when an embedding model is configured: a keyword arm and
  a vector arm are fused with reciprocal rank fusion. Without one it is
  keyword-only, exactly as before.
- A write never fails because a provider is down, slow or misconfigured — the
  memory is stored either way, and search stays on keywords.

### Fixed (review pass)

- A provider that could not be resolved — an embedding provider whose key was
  encrypted under another `MIMIR_SECRET`, for example — failed the write
  instead of degrading to keyword search.
- A provider that answered with a full-length vector of non-numbers reached the
  `::vector` cast and failed the write.
- A write grantee could toggle learning on a project, be told "Saved.", and
  change nothing, because the row-level policy is owner-only. Project settings
  are now owner-only and say so.
- **Admin → Settings** probed the stored model but saved the typed one, so a
  typo could pass the dimension check and then leave every memory unembedded.
- Re-embedding could drop every vector and report success when the provider was
  unavailable; it now refuses to start without a provider and fails the job if
  rows are still empty afterwards.
- Extraction took the newest memories first, so a slow model starved older rows
  indefinitely; it now works oldest-first, fails the job on a provider error so
  the queue retries, and queues another batch when one fills.

## [0.1.1] - 2026-10-25

Review pass on 0.1.0, plus the theme system the UI was waiting for.

### Added

- Rimfrost tokens vendored from upstream, with eight themes (`nordlys` default,
  plus `fjord`, `ravn` and `skumring`, each in dark and light) and semantic
  aliases (`--bg`, `--fg`, `--border`, `--accent`, …) so pages never name a
  palette colour.
- Theme resolved from a cookie in the root layout, so there is no flash on
  load; a switcher on every page writes it back and updates `theme-color`.
- `/health` and `/api/v1/health` as aliases of `/api/health`.

### Fixed

- Paths are validated instead of rewritten: `café`, `caf!`, whitespace-only
  input, a whitespace-only segment (`deploy/ `) and `.` segments are rejected
  with `invalid_path` naming the offending character, rather than silently
  colliding with another memory.
- `path_prefix` matching is literal, so an underscore no longer acts as a SQL
  wildcard and a prefix equal to an exact path now matches that memory.
- One input contract for MCP and REST: empty bodies and unknown `kind` values
  are rejected by both, and `body_too_large` no longer reports itself as a path
  error.
- A failed audit write logs a readable reason instead of a redacted one.
- The anonymous health check queries the database, so a dead database reports
  503 instead of `ok`, and a caller holding a token gets the same 503 instead
  of an empty 500.
- Login spends the same time on an unknown email as on a wrong password.
- Listing a project's grants requires `write`, so a read-only grantee cannot
  enumerate the other grantees.
- MCP `initialize` answers with the protocol version Mimir implements rather
  than echoing the client's claim.
- The landing-page test renders the page; the unused `otpauth` dependency is
  gone.
- README states what 0.1.1 actually does, and the quick start names the two
  database passwords the compose stack requires.
- Tailwind's PostCSS plugin is configured and its stylesheet imported, so the
  utility classes the pages use are generated at all; before this, the themed
  markup shipped without any of its layout or colour rules.
- `docker-compose.yml` pins the 0.1.1 image rather than 0.1.0.

## [0.1.0] - 2026-10-25

First usable slice: Mimir boots from one container, authenticates a user, and
stores and retrieves project memory over MCP and REST.

### Fixed (review pass)

- REST calls now write one audit row each, the same as MCP calls.
- A memory body or title containing a NUL byte is refused with `invalid_params` instead of surfacing a Postgres error.
- MCP never forwards an unrecognised error code; anything outside the documented set becomes `internal`.
- `X-Forwarded-For` is read right to left, so a client-supplied first hop cannot spoof the audited IP or the rate-limit bucket.
- The session digest renders a top-level memory path whole instead of slicing off its first characters.
- Requests declaring more than 1 MB are rejected before the body is parsed.
- The app header links to Settings, so the first-run path to an API key is reachable.

### Added

- Repository scaffold: Next.js 16 (App Router, TypeScript strict), Tailwind v4, Vitest.
- Fail-fast configuration: `MIMIR_SECRET` is required and never generated.
- AES-256-GCM encryption helpers and secret redaction.
- Postgres schema with row-level security and two database roles (`mimir_owner`, `mimir_app`).
- Locked, idempotent migrations that run at boot.
- Transaction helper that sets `mimir.user_id` per request and cannot leak between pooled connections.
- Append-only audit log, one row per MCP or REST call.
- argon2id passwords, hashed session cookies, login rate limiting, and trusted-proxy aware client IPs.
- Bootstrap admin created from environment variables, once, on an empty install.
- API keys for agents: shown once, hashed at rest, revocable, with a small settings page.
- Projects resolved from a normalised git remote, so two agents in one repo share one project.
- Project grants with `read` and `write` roles. Admins do not implicitly see other users' memory.
- Path-based memory with progressive detail (title, summary, body), virtual directories, 256 KB body cap, and soft delete.
- Keyword retrieval with `websearch_to_tsquery`, path-prefix scoping, and reciprocal rank fusion.
- Session digest: an 800-token, grouped summary an agent can inject at session start.
- MCP endpoint at `POST /mcp` (JSON-RPC 2.0, stateless) with seven tools.
- REST API at `/api/v1` mirroring the MCP tools, and a split `/api/health`.
- Multi-stage Dockerfile (amd64 + arm64), compose file, and a tag-driven release workflow.
