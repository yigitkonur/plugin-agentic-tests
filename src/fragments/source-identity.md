## Source identity and files the app writes

The engine fingerprints the project's source at start and re-checks it at every dispatch and submission, so the checkout must not change while a campaign runs (not by you, not by the app under test).

- Git project with a commit: `source: {revision: <git rev-parse HEAD>, worktree: <project>, provider: {type: git, root: <project>, config_files: []}}`. Ignored files the service needs (a `.env.local`) go in `config_files`: paths and hashes are recorded, never values.
- No Git repository, or no commit yet: `source: {revision: "<short description>", provider: {type: files, root: <project>, paths: [<the source files that define the service>]}}`. List files explicitly; never `.` (it would hash `node_modules`).
- Files the service writes while it runs (a JSON or SQLite store, uploads, logs) must not count as source. Grep the source for the writes (`grep -rnE "writeFile|appendFile|createWriteStream|sqlite|\.db\b|open\(.*['\"]w" <source dirs>`), then for each such path that is untracked add a line `/<path>` to `<project>/.git/info/exclude` (local to the clone; it changes no tracked file). A tracked file the service rewrites cannot be excluded: say so in `capability_notes`; that case then needs a copy of the project.
- Compare `git -C <project> status --porcelain --untracked-files=all` before and after your probe run; whatever the probe created is excluded the same way. Never commit, stash, clean or edit the user's files.
- A successor worktree after a repair: install dependencies from the lockfile only (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`; never a command that rewrites the lockfile), then `git -C <worktree> status --porcelain` must print nothing before you run `runtime start`.
