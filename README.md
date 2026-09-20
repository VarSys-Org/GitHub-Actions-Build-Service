# GitHub Actions Build Service

Remote Android build infrastructure for Expo, React Native, Capacitor, and
Flutter projects. The repository has two distinct parts:

- `cli/` is the Node.js `build-service` package that packages source, uploads
  it to Appwrite Storage, and dispatches a remote build.
- `.github/workflows/remote-build.yml` is the GitHub Actions worker. It accepts
  repository or manual dispatch input, prepares the project, builds Android
  artifacts, uploads them, and stores short-lived GitHub artifacts.

This README documents the checked-in implementation. `PROGRAMMER_GUIDE.md` and
`SETUP.md` contain deeper historical and operator material; verify examples
against the workflow before relying on them.

## Stack

| Area | Version or choice |
| --- | --- |
| CLI package | `@yourcompany/build-service-cli` `2.0.0` |
| CLI runtime | Node.js; uses Commander, Axios, Archiver, Tar, and node-appwrite |
| Workflow Node | Node.js 22 |
| Workflow Java | Temurin Java 21 |
| Build runner | GitHub-hosted `ubuntu-latest` |
| Storage | Appwrite Storage, configured per consuming repository |
| Package manager | npm for the CLI; pnpm projects are supported by the workflow |

## Prerequisites

- A GitHub repository with Actions enabled and permission to dispatch its
  workflow
- Node.js and npm for installing the CLI
- An Appwrite project, build bucket, project ID, endpoint, and least-privilege
  API key
- A supported mobile project with valid Expo, Capacitor, Flutter, or Android
  configuration
- Android package/version configuration and signing setup when producing a
  distributable release

The CLI stores configuration in the user's untracked
`~/.build-service.json` (Windows: `%USERPROFILE%\.build-service.json`). Do not
commit or print that file.

## Install and configure the CLI

```powershell
cd cli
npm install -g .
build-service --help
```

Configure with environment-managed values or interactive shell substitution;
never paste real tokens into tracked documentation or shell history:

```powershell
build-service configure `
  --appwrite-endpoint <APPWRITE_ENDPOINT> `
  --appwrite-project <APPWRITE_PROJECT_ID> `
  --appwrite-key <APPWRITE_API_KEY> `
  --appwrite-bucket <APPWRITE_BUCKET_ID> `
  --github-token <GITHUB_TOKEN> `
  --github-repo <OWNER/REPOSITORY>
```

Run `build-service config` to inspect the configuration with masked values.
The CLI package currently exposes a placeholder `npm test` script that reports
that tests do not yet exist; do not treat it as meaningful coverage.

## Use the CLI

From an Expo/React Native/Capacitor project:

```powershell
build-service build
build-service build --profile production
build-service status <BUILD_ID>
```

The CLI reads `eas.json` profile data where supported. It packages source and
excludes build-heavy or generated folders such as `node_modules`, `.git`, and
native folders according to its implementation. Review the archive contents
before sending proprietary or secret files to Appwrite.

## Workflow contract

The worker is triggered by `repository_dispatch` type `remote-build` or by
`workflow_dispatch`. It can receive an Appwrite source file ID, a legacy source
archive URL (which is validated and converted to a file ID), a repository to
checkout, build ID, callback URLs, project type, variant, build channel, and
Flutter version. It defaults missing project type to `auto`, missing variant to
`release` in the workflow, and missing build channel to `staging`.

The workflow:

1. Installs Node 22, pnpm, Java 21, Android SDK, and Flutter when needed.
2. Checks out a source repository or downloads an Appwrite archive.
3. Installs with pnpm, npm, yarn, or Flutter based on project files.
4. Detects Flutter, Capacitor, Expo, or an existing `android/` directory.
5. Builds APK/AAB artifacts with Gradle or Flutter.
6. Uploads artifacts to Appwrite Storage and GitHub Actions.
7. Sends optional allowlisted, HMAC-signed callbacks and retains GitHub
   artifacts for 7 days.

Required repository secrets referenced by the workflow include
`APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`,
`APPWRITE_BUCKET_ID`, and, for repository checkout, `GH_PAT`. Secure callback
delivery requires `CALLBACK_ALLOWED_HOSTS` and `CALLBACK_SIGNING_SECRET`.
Admission control requires `BUILD_ALLOWED_TEAMS`, `BUILD_ALLOWED_PROJECTS`,
`BUILD_MAX_TEAM_CONCURRENCY` (default `2`), and
`BUILD_MAX_PROJECT_CONCURRENCY` (default `1`). Values in the allowlists are
comma-separated IDs and must match the dispatch payload. Project-specific
environment values are also mapped by the workflow and must be reviewed before
use. GitHub masks secrets, but logs and callback payloads can still leak other
sensitive values if scripts print them.

## Validation

From `cli/`, run `npm install` and `npm test` to execute the package's current
placeholder check, then run `build-service --help` after installation. For a
real integration test, use a disposable Appwrite bucket and a non-production
mobile project, trigger a debug or staging build, inspect the Actions logs, and
verify both artifact destinations.

Before changing the workflow, validate its YAML and review all expressions,
secret names, artifact paths, project-type branches, and callback behavior.
Do not run a production release merely as a syntax check.

## Security and release cautions

- Use least-privilege GitHub and Appwrite credentials and rotate them when
  exposed or no longer needed.
- Never commit tokens, keystores, passwords, `.build-service.json`, or project
  environment files.
- Do not upload secrets inside source archives; the workflow creates a project
  `.env` from configured Actions secrets.
- Treat callback URLs and source URLs as untrusted inputs. Source downloads are
  rebuilt from the configured Appwrite endpoint, bucket, and validated file ID;
  callbacks must resolve to an allowlisted public HTTPS host and include the
  `X-Build-Signature` HMAC header.
- Android signing keys must remain in GitHub Secrets or an approved secret
  store. Confirm version code and build variant before publishing to the Store.
