# macOS Code Signing & Notarization

This guide covers setting up code signing and notarization for PiBun's macOS builds. Signed and notarized apps pass macOS Gatekeeper without security warnings.

## Overview

macOS distribution requires two steps:

1. **Code Signing** — Cryptographically signs the app bundle with an Apple Developer ID certificate. This proves the app came from a known developer.

2. **Notarization** — Submits the signed app to Apple's notary service for automated security checks. Apple returns a "ticket" that macOS trusts. Without this, users see a scary "unidentified developer" dialog.

PiBun uses Electrobun's built-in code signing and notarization support, configured via environment variables.

## Prerequisites

- **Apple Developer Account** — Enrolled in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year). Free accounts cannot create Developer ID certificates.
- **Xcode Command Line Tools** — `xcode-select --install`
- **macOS** — Code signing and notarization only run on macOS (the build host must be a Mac)

## Step 1: Create a Developer ID Certificate

1. Open **Xcode → Settings → Accounts** (or go to [developer.apple.com/account](https://developer.apple.com/account))
2. Select your team → **Manage Certificates**
3. Click **+** → **Developer ID Application**
4. The certificate is installed in your macOS Keychain

Verify it's available:

```bash
security find-identity -v -p codesigning | grep "Developer ID"
```

You should see something like:

```
1) ABC123DEF456 "Developer ID Application: Your Name (TEAMID)"
```

The full quoted string (including "Developer ID Application:") is your `ELECTROBUN_DEVELOPER_ID`.

## Step 2: Set Up Notarization Credentials

Choose **one** of two methods:

### Method 1: Apple ID + App-Specific Password (simpler, good for local builds)

1. Go to [appleid.apple.com/account/manage](https://appleid.apple.com/account/manage)
2. Under **Sign-In and Security → App-Specific Passwords**, click **Generate**
3. Name it "PiBun Notarization" and save the generated password

You'll need:
- `ELECTROBUN_APPLEID` — Your Apple ID email
- `ELECTROBUN_APPLEIDPASS` — The app-specific password (format: `xxxx-xxxx-xxxx-xxxx`)
- `ELECTROBUN_TEAMID` — Your 10-character Apple Developer Team ID (visible at [developer.apple.com/account](https://developer.apple.com/account) under Membership Details)

### Method 2: App Store Connect API Key (recommended for CI)

1. Go to [App Store Connect → Users and Access → Integrations → Keys](https://appstoreconnect.apple.com/access/integrations/api)
2. Click **Generate API Key**
3. Name it "PiBun CI", select **Developer** role
4. Download the `.p8` key file (you can only download it once!)
5. Note the **Key ID** and **Issuer ID** from the page

You'll need:
- `ELECTROBUN_APPLEAPIISSUER` — The Issuer ID (UUID format)
- `ELECTROBUN_APPLEAPIKEY` — The Key ID (10-character alphanumeric)
- `ELECTROBUN_APPLEAPIKEYPATH` — Absolute path to the downloaded `.p8` file

## Step 3: Configure Environment Variables

### Option A: Shell Environment (local builds)

Add to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
# PiBun Code Signing
export ELECTROBUN_DEVELOPER_ID="Developer ID Application: Your Name (TEAMID)"

# Notarization — Apple ID method
export ELECTROBUN_APPLEID="your@apple.id"
export ELECTROBUN_APPLEIDPASS="xxxx-xxxx-xxxx-xxxx"
export ELECTROBUN_TEAMID="XXXXXXXXXX"
```

### Option B: `.env` file (local builds)

Copy the template:

```bash
cp apps/desktop/.env.example apps/desktop/.env
```

Edit `apps/desktop/.env` with your credentials. The `.env` file is gitignored.

> **Note:** You'll need to `source apps/desktop/.env` or use a tool like `dotenv` to load the file before running the build. The build-signed script reads from `process.env`, not from `.env` files directly.

### Option C: CI/CD Secrets (GitHub Actions)

Add these as repository secrets in GitHub → Settings → Secrets:

| Secret | Value |
|--------|-------|
| `ELECTROBUN_DEVELOPER_ID` | Certificate identity string |
| `ELECTROBUN_APPLEAPIISSUER` | API key issuer ID |
| `ELECTROBUN_APPLEAPIKEY` | API key ID |
| `ELECTROBUN_APPLEAPIKEYPATH` | Path where the `.p8` key will be written |

The CI pipeline (Phase 2C.6) will decode and write the key file during the build.

## Step 4: Build

### Signed + Notarized (full release build)

```bash
# From monorepo root
bun run build:desktop:signed

# Or from apps/desktop/
bun run build:signed
```

### Signed Only (no notarization — faster, for testing)

```bash
bun run build:desktop:signed -- --skip-notarize
# Or
cd apps/desktop && bun scripts/build-signed.ts --skip-notarize
```

### Unsigned (development — no credentials needed)

```bash
bun run build:desktop
```

### Canary Channel

```bash
bun run build:desktop:signed:canary
```

## How It Works

PiBun's `electrobun.config.ts` auto-detects signing credentials:

```typescript
const shouldCodesign = !!process.env.ELECTROBUN_DEVELOPER_ID;
const shouldNotarize = shouldCodesign && !!(
  process.env.ELECTROBUN_APPLEID || process.env.ELECTROBUN_APPLEAPIISSUER
);
```

- **No credentials** → `codesign: false, notarize: false` → unsigned build
- **`ELECTROBUN_DEVELOPER_ID` only** → `codesign: true, notarize: false` → signed but not notarized
- **All credentials** → `codesign: true, notarize: true` → full release build

Electrobun handles the signing order automatically:
1. Signs frameworks (if any)
2. Signs helper binaries
3. Signs the launcher with entitlements
4. Signs the complete `.app` bundle
5. Signs the self-extracting wrapper bundle
6. Notarizes the self-extracting bundle (waits for Apple)
7. Staples the notarization ticket
8. Creates and signs the DMG
9. Notarizes the DMG
10. Staples the DMG

## Entitlements

PiBun's hardened runtime includes these entitlements:

| Entitlement | Why |
|-------------|-----|
| `com.apple.security.cs.allow-jit` | Bun's JIT compiler (Electrobun default) |
| `com.apple.security.cs.allow-unsigned-executable-memory` | Bun runtime (Electrobun default) |
| `com.apple.security.cs.disable-library-validation` | Dynamic library loading (Electrobun default) |
| `com.apple.security.network.client` | Pi makes API calls to LLM providers |
| `com.apple.security.network.server` | PiBun runs a local HTTP/WebSocket server |
| `com.apple.security.files.user-selected.read-write` | File dialogs for project folder selection |

Electrobun's defaults are merged with ours automatically.

## Verification

After a signed build, verify the results:

```bash
# Verify code signature
codesign --verify --deep --strict --verbose=2 apps/desktop/build/PiBun.app

# Check notarization staple
xcrun stapler validate -v apps/desktop/build/PiBun.app

# Verify DMG
codesign --verify --verbose=2 apps/desktop/artifacts/stable-macos-arm64-PiBun.dmg
xcrun stapler validate -v apps/desktop/artifacts/stable-macos-arm64-PiBun.dmg

# Assess Gatekeeper acceptance
spctl --assess --type execute --verbose=2 apps/desktop/build/PiBun.app
```

## Troubleshooting

### "Developer ID Application" certificate not found

- Ensure you're enrolled in the Apple Developer Program (not the free tier)
- Check Keychain Access → My Certificates for the certificate
- Try: `security find-identity -v -p codesigning`

### Notarization fails with "Invalid"

- Check the notarization log: `xcrun notarytool log --apple-id ... <uuid>`
- Common issues:
  - Missing entitlements (check `electrobun.config.ts`)
  - Unsigned binaries inside the bundle
  - Hardened runtime not enabled (Electrobun handles this with `--options runtime`)

### "errSecInternalComponent" during signing

- Keychain might be locked. Unlock it: `security unlock-keychain ~/Library/Keychains/login.keychain-db`
- In CI, create a temporary keychain and import the certificate

### App-specific password expired

- Generate a new one at [appleid.apple.com](https://appleid.apple.com/account/manage)
- Update your env var / CI secret
