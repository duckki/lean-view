# Release Workflow

Lean View releases are driven by the version in `package.json`. The GitHub
Actions workflow at `.github/workflows/publish-npm.yml` publishes to npm and
creates the matching GitHub release tag.

## Prerequisites

- The npm package name is `lean-view`.
- The GitHub repository has an environment or repository secret named
  `NPM_TOKEN`.
- The npm token must allow publishing this package.
- GitHub Actions permissions must allow `contents: write` so the workflow can
  create the release tag.

## Release Steps

1. Update the `version` field in `package.json`.
2. Run the local checks:

   ```sh
   npm test
   npm pack --dry-run
   ```

3. Commit the version bump and related release changes.
4. Push to `main`.

The push to `main` starts `.github/workflows/publish-npm.yml`. The workflow:

- reads `name` and `version` from `package.json`,
- computes the tag as `v{version}`,
- checks whether that npm version already exists,
- checks whether the matching Git tag already exists,
- installs dependencies and runs `npm test` when npm does not already have the
  version,
- runs `npm publish --provenance --access public`,
- creates the GitHub release tag when it does not already exist.

## Re-running

The workflow is intended to be idempotent for a given `package.json` version:

- If npm already has the version, publishing is skipped.
- If the Git tag already exists, release creation is skipped.
- If npm has the version but the Git tag is missing, the workflow can still
  create the missing GitHub release tag.

The workflow also supports `workflow_dispatch` for a manual re-run from the
GitHub Actions UI.

## Verification

After the workflow completes, verify the npm package and tag:

```sh
npm view lean-view@<version> version
git fetch --tags
git tag --list "v<version>"
```

For package contents without creating a local `.tgz`, use:

```sh
npm pack --dry-run
```

Avoid plain `npm pack` during routine checks because it writes a local tarball.
