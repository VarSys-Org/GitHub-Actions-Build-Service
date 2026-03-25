# 🚀 Remote Build Service for Expo/React Native/Capacitor Apps

Build your Expo, React Native, and Capacitor Android apps remotely using GitHub Actions - **unlimited and completely free!**

## ✨ Features

- � **EAS-Compatible** - Reads and uses your `eas.json` build profiles (development, preview, production)
- 🆓 **Unlimited Builds** - No monthly limits like EAS (30 builds/month)
- 📦 **Build from Anywhere** - Local machine, CI/CD, or any computer with Node.js
- ⚡ **Fast Setup** - 5 minutes to get started
- 🔒 **Secure** - Uses GitHub Actions and Appwrite for storage
- 📱 **APK & AAB** - Generates both Android APK and AAB (Play Store) files
- ☁️ **Cloud Storage** - Automatically uploads builds to Appwrite Storage
- 🔄 **Auto Version Increment** - Supports autoIncrement from EAS profiles

## 📋 Prerequisites

Before you begin, you'll need:

1. **GitHub Account** with a repository
2. **Appwrite Account** (free tier works perfectly)
3. **Node.js** installed on your machine (v16 or higher)
4. **Expo/React Native/Capacitor project** ready to build

## 🔧 One-Time Setup

### Step 1: Create GitHub Personal Access Token

1. Go to [GitHub Settings → Tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Give it a name (e.g., "Build Service")
4. Select these scopes:
   - ✅ `repo` (Full control of repositories)
   - ✅ `workflow` (Update GitHub Actions workflows)
   - ✅ `read:org` (Read organization data)
5. Click **"Generate token"**
6. **Copy and save the token** - you won't see it again!

### Step 2: Set Up Appwrite

1. Go to [Appwrite Cloud](https://cloud.appwrite.io) or your self-hosted instance
2. Create a new project or use existing one
3. Create a **Storage Bucket**:
   - Go to Storage → Create Bucket
   - Name it (e.g., "builds")
   - Set permissions as needed
   - Copy the **Bucket ID**
4. Create an **API Key**:
   - Go to Settings → API Keys → Create API Key
   - Name: "Build Service"
   - Scopes: Select `files.read` and `files.write`
   - Copy the **API Key**
5. Note your **Project ID** and **Endpoint URL**

### Step 3: Clone and Set Up This Repository

```bash
# Clone this repository
git clone https://github.com/vasanthanE/GitHub-Actions-Build-Service.git
cd GitHub-Actions-Build-Service

# Install CLI tool globally
cd cli
npm install -g .
```

### Step 4: Configure the CLI

Run this command with your credentials:

```bash
build-service configure \
  --appwrite-endpoint https://cloud.appwrite.io/v1 \
  --appwrite-project YOUR_PROJECT_ID \
  --appwrite-key YOUR_API_KEY \
  --appwrite-bucket YOUR_BUCKET_ID \
  --github-token YOUR_GITHUB_TOKEN \
  --github-repo YOUR_USERNAME/GitHub-Actions-Build-Service
```

**Windows PowerShell users** - use backticks for line continuation:
```powershell
build-service configure `
  --appwrite-endpoint https://cloud.appwrite.io/v1 `
  --appwrite-project YOUR_PROJECT_ID `
  --appwrite-key YOUR_API_KEY `
  --appwrite-bucket YOUR_BUCKET_ID `
  --github-token YOUR_GITHUB_TOKEN `
  --github-repo YOUR_USERNAME/GitHub-Actions-Build-Service
```

### Step 5: Add GitHub Secrets

The CLI already added these, but verify in your repo:

Go to **Repository Settings → Secrets and variables → Actions** and ensure these exist:
- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_API_KEY`
- `APPWRITE_BUCKET_ID`

## 🎯 How to Use

### Build Your Project

Navigate to your mobile project and run:

```bash
cd /path/to/your/expo-project

# Development build (with expo-dev-client)
build-service build --profile development

# Preview build (internal distribution)
build-service build --profile preview

# Production build (release to stores)
build-service build --profile production
```

**The CLI automatically reads your `eas.json` configuration!**

**Example output:**
```
📦 Packaging project...
📊 Archive size: 1.71 MB
☁️  Uploading to Appwrite...
✅ Uploaded: 6956460a0030d25a9af6
🚀 Triggering build...

✅ Build started!
🔗 Build ID: 1767264765206
🔗 GitHub Actions: https://github.com/yourname/GitHub-Actions-Build-Service/actions
```

### Build Options

```bash
# Basic build
build-service build

# Build from specific directory
build-service build /path/to/project

# Build and wait (coming soon)
build-service build --wait
```

### Check Build Status

```bash
# View recent builds
gh run list --repo YOUR_USERNAME/GitHub-Actions-Build-Service --limit 5

# Check specific build
build-service status BUILD_ID
```

### View Current Configuration

```bash
build-service config
```

## 📥 Getting Your Built APK

You have **three ways** to download your APK:

### Method 1: GitHub CLI (Recommended)

```bash
# List recent builds
gh run list --repo YOUR_USERNAME/GitHub-Actions-Build-Service

# Download specific build artifacts
gh run download RUN_ID --repo YOUR_USERNAME/GitHub-Actions-Build-Service
```

### Method 2: GitHub Web Interface

1. Go to your repository on GitHub
2. Click **"Actions"** tab
3. Click on the build you want
4. Scroll down to **"Artifacts"** section
5. Download the APK/AAB files

### Method 3: Appwrite Storage

1. Go to your Appwrite Console
2. Navigate to **Storage → Your Bucket**
3. Find your build files (named `build-{buildId}-{timestamp}.apk`)
4. Click to download

## 🏗️ How It Works

```
┌─────────────────┐
│  Your Machine   │
│  (Any Project)  │
└────────┬────────┘
         │ 1. Package & Upload
         ▼
┌─────────────────┐
│    Appwrite     │
│     Storage     │
└────────┬────────┘
         │ 2. Trigger Build
         ▼
┌─────────────────┐
│ GitHub Actions  │
│  Build Servers  │
└────────┬────────┘
         │ 3. Download → Build → Upload
         ▼
┌─────────────────────────────┐
│    Build Artifacts:         │
│  • Appwrite Storage         │
│  • GitHub Artifacts         │
└─────────────────────────────┘
```

**Build Process:**
1. CLI packages your project (excluding node_modules, native folders)
2. Uploads compressed archive to Appwrite Storage
3. Triggers GitHub Actions via `repository_dispatch` event
4. GitHub Actions:
   - Downloads your project
   - Installs dependencies
   - Runs `expo prebuild`
   - Builds APK and AAB with Gradle
   - Uploads results to Appwrite Storage
   - Saves as GitHub Artifacts

## 🎛️ Advanced Usage

### Build Configuration

Your project's build configuration comes from:
- `app.json` or `app.config.js` (Expo config)
- `android/` folder settings (after prebuild)

### Environment Variables

If your project needs environment variables, add them to GitHub Secrets:

```bash
gh secret set MY_API_KEY --body "your-api-key" --repo YOUR_USERNAME/GitHub-Actions-Build-Service
```

Then update [.github/workflows/remote-build.yml](.github/workflows/remote-build.yml) to include them in the `.env` file.

### Custom Build Commands

Edit [.github/workflows/remote-build.yml](.github/workflows/remote-build.yml) to customize:
- Build variants (debug/release)
- Signing configuration
- Build flags
- Post-build steps

### Signing Your APK

For signed APKs ready for distribution:

1. Create a keystore file
2. Upload as GitHub secret: `gh secret set ANDROID_KEYSTORE --body "$(base64 -w 0 your-keystore.jks)"`
3. Add signing config to workflow
4. Set keystore password as secret

## 🆚 Comparison with EAS

| Feature | EAS Build | This Service |
|---------|-----------|--------------|
| Cost (Free Tier) | 30 builds/month | ∞ Unlimited |
| Cost (Paid) | $99/month | $0 (GitHub Actions free tier) |
| Build from anywhere | ✅ | ✅ |
| CLI interface | ✅ | ✅ |
| Self-hosted | ❌ | ✅ |
| Setup time | 5 minutes | 10 minutes |
| iOS builds | ✅ | ❌ (Android only) |
| Custom runners | ❌ | ✅ |

## 🛠️ Troubleshooting

### "Missing configuration" Error

**Solution:** Run `build-service configure` with all required options.

### Build Fails - "npm install" Errors

**Issue:** Missing dependencies in your project.

**Solution:** 
- Make sure `package.json` is valid
- Run `npm install` locally first to verify

### Build Fails - Expo Prebuild Errors

**Issue:** Invalid `app.json` configuration.

**Solution:**
- Validate your `app.json`
- Check Expo SDK compatibility
- Run `npx expo prebuild` locally to test

### "Permission denied" on GitHub Push

**Issue:** GitHub token lacks required scopes.

**Solution:** Create new token with `repo` and `workflow` scopes.

### Archive Too Large

**Issue:** Project archive exceeds size limits.

**Solution:**
- CLI automatically excludes `node_modules`, `android`, `ios`, `.git`
- Check for large assets in your project
- Add more exclusions in CLI configuration

### Appwrite Upload Fails

**Issue:** Invalid API key or bucket permissions.

**Solution:**
- Verify API key has `files.read` and `files.write` scopes
- Check bucket ID is correct
- Ensure bucket exists and is accessible

## 📊 GitHub Actions Usage Limits

**Free Tier (Public Repos):**
- ✅ Unlimited build minutes
- ✅ Unlimited storage for 90 days

**Free Tier (Private Repos):**
- 2,000 minutes/month
- Each Android build takes ~10-15 minutes
- = ~130-200 builds/month free

**Paid Tiers:**
- Pro: $4/month for 3,000 additional minutes
- Team: Included in subscription

## 🔐 Security Best Practices

1. **Never commit tokens** - Always use environment variables or GitHub Secrets
2. **Rotate tokens regularly** - Regenerate tokens every few months
3. **Use minimal scopes** - Only grant necessary permissions
4. **Keep CLI config secure** - `~/.build-service.json` contains sensitive data
5. **Review workflow runs** - Check logs for any suspicious activity

## 🤝 Contributing

Want to improve this service?

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

**Ideas for contributions:**
- iOS build support
- Web UI for managing builds
- Build notifications (email, Slack, Discord)
- Build status polling in CLI
- Multiple project configurations
- Build caching improvements

## 📄 License

MIT License - Feel free to use this for personal or commercial projects!

## 🆘 Support

- **Issues:** [GitHub Issues](https://github.com/vasanthanE/GitHub-Actions-Build-Service/issues)
- **Discussions:** [GitHub Discussions](https://github.com/vasanthanE/GitHub-Actions-Build-Service/discussions)

## 🎓 Learn More

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Expo Documentation](https://docs.expo.dev/)
- [Appwrite Documentation](https://appwrite.io/docs)
- [React Native Documentation](https://reactnative.dev/)

---

**Built with ❤️ by developers, for developers**

**Star ⭐ this repo if it helped you!**
