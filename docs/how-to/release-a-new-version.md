# Release a new version to npm

*How-to. Part of the [documentation set](../README.md). For maintainers with push access.*

Releases are automated with [release-please](https://github.com/googleapis/release-please) and
published to npm with [OIDC Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (no
stored `NPM_TOKEN`). You never run `npm publish` by hand. The whole flow is driven by
[Conventional Commits](https://www.conventionalcommits.org/) landing on `main`.

## The two-hop flow

1. **Merge normal work into `main`.** Every `feat:` / `fix:` commit is picked up by the
   `release-please` workflow (`.github/workflows/release-please.yml`), which opens or updates a
   **Release PR** titled `chore(main): release event-storming-recovery x.y.z`. It bumps the version
   in `package.json` / `package-lock.json` / `.release-please-manifest.json` and updates
   `CHANGELOG.md`. Nothing is published yet.
2. **Merge the Release PR when you want to ship.** That push to `main` runs `release-please` again;
   this time it cuts the GitHub Release and tag, and the *same job* (gated on the action's
   `release_created` output) runs `npm ci` and `npm publish --provenance`, pushing to npm with a
   signed provenance statement.

The publish lives in the release-please job on purpose: a GitHub Release created with the automatic
`GITHUB_TOKEN` does **not** trigger a separate `on: release` workflow, so a standalone publish
workflow would silently never fire.

## Version bumps

release-please derives the next version from the commit types since the last release: `fix:` → patch,
`feat:` → minor, and a `!` / `BREAKING CHANGE:` footer → major. To force a specific version
regardless of commit types, add a `Release-As: x.y.z` footer to a commit on `main`.

## One-time setup (already done, listed for recovery)

- **GitHub → Settings → Actions → General → Workflow permissions:** enable *"Allow GitHub Actions to
  create and approve pull requests"* so release-please can open the Release PR.
- **npmjs.com → package Settings → Trusted Publishing:** add a GitHub Actions publisher for repo
  `bhastings-t3/event-storming-recovery` with workflow filename **`release-please.yml`** (the
  workflow that actually publishes) and no environment. The workflow filename must match exactly, or
  the registry rejects the publish with `E404`.

## Verifying a release

- Watch the run: `gh run watch $(gh run list --workflow=release-please.yml --limit 1 --json databaseId --jq '.[0].databaseId')`.
- Confirm npm updated: `npm view event-storming-recovery version`.
- Provenance shows on the package page and in the [Sigstore transparency log](https://search.sigstore.dev/).
