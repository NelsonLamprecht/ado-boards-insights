# Azure DevOps Boards Insights

This project uses TypeScript and Webpack to build a simple application.

## Versioning and Releases

This repo uses a simple SemVer flow:

- Dev builds: increment patch (`X.Y.N`)
- Release candidates: `X.Y.N-rc.1`, then `-rc.2`, etc.
- Stable releases: `X.Y.N`

`package.json` is the source of truth for version changes. Manifest versions are synchronized from npm scripts.

### Common Commands

- `npm run version:dev`: bump patch (for example `0.2.0 -> 0.2.1`)
- `npm run version:rc`: set/increment RC for the current version (for example `0.2.1 -> 0.2.1-rc.1`)
- `npm run version:prod`: convert RC to stable (for example `0.2.1-rc.1 -> 0.2.1`)
- `npm run package:dev`: sync dev manifest and package dev VSIX
- `npm run package`: sync prod manifest and package prod VSIX

### Script Usage Notes

Use scripts in this order depending on what you are trying to do.

#### 1) Create a normal development build

```bash
npm run version:dev
npm run package:dev
```

What happens:

- `version:dev` increments patch version in `package.json` (for example `0.2.0` to `0.2.1`)
- `package:dev` creates a dev VSIX using that version

#### 2) Create another dev build later

Run the same commands again:

```bash
npm run version:dev
npm run package:dev
```

Example version progression: `0.2.1` -> `0.2.2` -> `0.2.3`

#### 3) Start RC testing

```bash
npm run version:rc
npm run package
```

What happens:

- First RC from stable: `0.2.3` -> `0.2.3-rc.1`
- Next RC: `0.2.3-rc.1` -> `0.2.3-rc.2`

#### 4) Promote RC to production

```bash
npm run version:prod
npm run package
```

What happens:

- Strips RC suffix only: `0.2.3-rc.2` -> `0.2.3`
- Produces production VSIX

#### 5) Publish from GitHub Actions manually

When running workflow dispatch:

- Use `release_tag: vX.Y.Z` for stable release
- Use `release_tag: vX.Y.Z-rc.N` for RC release

Examples:

- `v0.2.3`
- `v0.2.3-rc.1`

#### 6) CI behavior (PR vs tag)

- Pull requests build the dev extension artifact
- PR version is set to `X.Y.N` where `N` is the GitHub run number
- Tag pushes using `vX.Y.Z` or `vX.Y.Z-rc.N` build and publish prod/RC artifacts

Examples:

- PR build version: `0.2.154`
- RC tag push: `v0.2.3-rc.1`
- Prod tag push: `v0.2.3`

### Quick Decision Guide

- Need a new dev artifact: `version:dev` then `package:dev`
- Need an RC candidate: `version:rc` then `package`
- Need to finalize stable from RC: `version:prod` then `package`
- Need to only rebuild without changing version: run `package:dev` or `package`

### Promotion Flow

1. Run `npm run version:dev` for each new dev build.
2. Run `npm run version:rc` when ready for release candidate validation.
3. Run `npm run version:prod` to finalize the stable version.
4. Publish with workflow dispatch and `release_tag` as either `vX.Y.Z` or `vX.Y.Z-rc.N`.