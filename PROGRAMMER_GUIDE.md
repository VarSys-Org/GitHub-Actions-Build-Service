# Programmer's Guide: Remote Build Service

A technical guide for developers integrating this remote build service into their workflow.

## Quick Start (5 Minutes)

```bash
# 1. Install CLI globally
cd GitHub-Actions-Build-Service/cli
npm install -g .

# 2. Configure once
build-service configure \
  --appwrite-endpoint https://cloud.appwrite.io/v1 \
  --appwrite-project YOUR_PROJECT_ID \
  --appwrite-key YOUR_API_KEY \
  --appwrite-bucket YOUR_BUCKET_ID \
  --github-token YOUR_GITHUB_TOKEN \
  --github-repo username/GitHub-Actions-Build-Service

# 3. Build from any Expo/RN project with EAS profiles
cd my-expo-app

# Development build (with dev client)
build-service build --profile development

# Production build
build-service build --profile production

# Done! Check GitHub Actions for build status
```

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                    CLIENT (CLI)                       │
│  • Packages project (tar.gz)                         │
│  • Excludes: node_modules, .git, android, ios       │
│  • Uploads to Appwrite Storage                       │
│  • Triggers GitHub Actions via repository_dispatch   │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│              APPWRITE STORAGE                         │
│  • Temporary file storage                            │
│  • Authenticated download URL                        │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│            GITHUB ACTIONS RUNNER                      │
│  1. Download source (with auth headers)              │
│  2. Extract tar.gz                                    │
│  3. npm install                                       │
│  4. Prepare android project (Expo prebuild OR        │
│     Capacitor build+sync OR existing android/)       │
│  5. ./gradlew <gradleCommand> (from eas.json)        │
│  6. Upload APK/AAB to Appwrite                       │
│  7. Save as GitHub Artifacts                         │
└──────────────────────────────────────────────────────┘
```

## EAS Profile Support

The build service reads your `eas.json` configuration and maps profiles to build settings:

### Supported eas.json Fields

```json
{
  "build": {
    "development": {
      "developmentClient": true,        // → debug variant
      "distribution": "internal",       
      "android": {
        "buildType": "apk",             // → APK or AAB
        "gradleCommand": ":app:assembleDebug"
      }
    },
    "production": {
      "autoIncrement": true,            // → Increment versionCode
      "android": {
        "buildType": "aab"              // → Google Play bundle
      },
      "env": {
        "API_URL": "https://api.prod.com"  // → Passed to build
      }
    }
  }
}
```

### Profile Mapping

| EAS Setting | Build Behavior |
|-------------|----------------|
| `developmentClient: true` | Uses `debug` variant, includes dev client |
| `buildType: "apk"` | Generates APK file |
| `buildType: "aab"` | Generates AAB (Play Store bundle) |
| `autoIncrement: true` | Increments `versionCode` in app.json |
| `gradleCommand` | Custom gradle command (e.g., `:app:assembleRelease`) |
| `env` | Environment variables passed to build |
| `distribution` | Metadata only (not enforced) |

## API Reference

### CLI Commands

#### `build-service configure`

Saves credentials to `~/.build-service.json`

```bash
build-service configure \
  --appwrite-endpoint <url> \
  --appwrite-project <id> \
  --appwrite-key <key> \
  --appwrite-bucket <id> \
  --github-token <token> \
  --github-repo <owner/repo>
```

**Configuration file location:**
- Linux/Mac: `~/.build-service.json`
- Windows: `C:\Users\<username>\.build-service.json`

**File format:**
```json
{
  "appwriteEndpoint": "https://cloud.appwrite.io/v1",
  "appwriteProject": "507f1f77bcf86cd799439011",
  "appwriteKey": "d1_...",
  "appwriteBucket": "builds",
  "githubToken": "ghp_...",
  "githubRepo": "username/GitHub-Actions-Build-Service"
}
```

#### `build-service build`

Triggers a remote build with EAS profile support.

```bash
# Build with development profile (from eas.json)
build-service build --profile development

# Build with preview profile
build-service build --profile preview

# Build with production profile (default)
build-service build --profile production

# Build specific project path
build-service build /path/to/project

# Options
build-service build --platform android  # Default
build-service build --wait              # Wait for completion (WIP)
```

**What gets packaged:**
- ✅ Source code
- ✅ package.json, package-lock.json
- ✅ app.json / app.config.js
- ✅ assets/
- ❌ node_modules/
- ❌ android/, ios/
- ❌ .git/
- ❌ .expo/

**Returns:**
```javascript
{
  buildId: "1767264765206",
  fileId: "695651fd001359780a70",
  actionsUrl: "https://github.com/user/repo/actions"
}
```

#### `build-service status [buildId]`

Check build status (future enhancement).

```bash
build-service status 1767264765206
```

#### `build-service config`

Display current configuration (tokens masked).

```bash
build-service config
```

## GitHub Actions Workflow

### Workflow File: `.github/workflows/remote-build.yml`

#### Trigger Event

```yaml
on:
  repository_dispatch:
    types: [remote-build]
```

**Payload structure:**
```json
{
  "event_type": "remote-build",
  "client_payload": {
    "source_url": "https://cloud.appwrite.io/v1/storage/buckets/builds/files/abc123/download",
    "build_id": "1767264765206",
    "platform": "android",
    "callback_url": "https://optional-webhook.com/notify"
  }
}
```

#### Key Steps

1. **Download Source**
   ```yaml
   - name: Download source code
     env:
       APPWRITE_API_KEY: ${{ secrets.APPWRITE_API_KEY }}
     run: |
       curl -L -o source.tar.gz \
         -H "X-Appwrite-Project: ${{ secrets.APPWRITE_PROJECT_ID }}" \
         -H "X-Appwrite-Key: $APPWRITE_API_KEY" \
         "${{ steps.build_info.outputs.SOURCE_URL }}"
   ```

2. **Install Dependencies**
   ```yaml
   - name: Install dependencies
     working-directory: project
     run: |
       if [ -f "package-lock.json" ]; then
         npm ci
       elif [ -f "yarn.lock" ]; then
         yarn install --frozen-lockfile
       else
         npm install
       fi
   ```

3. **Prepare Android Project (Auto-Detect)**
   ```yaml
   - name: Prepare Android project (Expo or Capacitor)
     working-directory: project
     run: |
       if [ -f "capacitor.config.ts" ] || [ -f "capacitor.config.js" ] || [ -f "capacitor.config.json" ]; then
         npm run cap:build || (npm run build && npx cap sync android)
       elif [ -f "app.json" ] || [ -f "app.config.js" ] || [ -f "app.config.ts" ]; then
         npx expo prebuild --platform android --clean
       elif [ -d "android" ]; then
         echo "Using existing android directory"
       else
         exit 1
       fi
   ```

4. **Build APK/AAB**
   ```yaml
   - name: Build Android APK
     working-directory: project/android
     run: ./gradlew assembleRelease --no-daemon

   - name: Build Android AAB
     working-directory: project/android
     run: ./gradlew bundleRelease --no-daemon
   ```

## Programmatic Usage

### Node.js Integration

```javascript
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function buildApp(projectPath) {
  try {
    const { stdout, stderr } = await execPromise(
      `build-service build ${projectPath}`
    );
    
    // Parse build ID from output
    const buildIdMatch = stdout.match(/Build ID: (\d+)/);
    const buildId = buildIdMatch ? buildIdMatch[1] : null;
    
    console.log('Build started:', buildId);
    return buildId;
  } catch (error) {
    console.error('Build failed:', error);
    throw error;
  }
}

// Usage
buildApp('/path/to/expo-app')
  .then(buildId => console.log(`Building: ${buildId}`))
  .catch(err => console.error(err));
```

### Python Integration

```python
import subprocess
import re

def build_app(project_path):
    try:
        result = subprocess.run(
            ['build-service', 'build', project_path],
            capture_output=True,
            text=True,
            check=True
        )
        
        # Extract build ID
        match = re.search(r'Build ID: (\d+)', result.stdout)
        build_id = match.group(1) if match else None
        
        print(f'Build started: {build_id}')
        return build_id
    except subprocess.CalledProcessError as e:
        print(f'Build failed: {e.stderr}')
        raise

# Usage
build_id = build_app('/path/to/expo-app')
```

### CI/CD Integration

#### GitLab CI

```yaml
# .gitlab-ci.yml
build_android:
  stage: build
  image: node:20
  script:
    - npm install -g @yourcompany/build-service-cli
    - build-service configure --appwrite-endpoint $APPWRITE_ENDPOINT --appwrite-project $APPWRITE_PROJECT --appwrite-key $APPWRITE_KEY --appwrite-bucket $APPWRITE_BUCKET --github-token $GITHUB_TOKEN --github-repo $GITHUB_REPO
    - build-service build .
  only:
    - main
```

#### Jenkins

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    stages {
        stage('Build Android') {
            steps {
                sh 'npm install -g @yourcompany/build-service-cli'
                sh '''
                    build-service configure \
                        --appwrite-endpoint $APPWRITE_ENDPOINT \
                        --appwrite-project $APPWRITE_PROJECT \
                        --appwrite-key $APPWRITE_KEY \
                        --appwrite-bucket $APPWRITE_BUCKET \
                        --github-token $GITHUB_TOKEN \
                        --github-repo $GITHUB_REPO
                '''
                sh 'build-service build .'
            }
        }
    }
}
```

#### CircleCI

```yaml
# .circleci/config.yml
version: 2.1

jobs:
  build_android:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - run:
          name: Install CLI
          command: npm install -g @yourcompany/build-service-cli
      - run:
          name: Configure
          command: |
            build-service configure \
              --appwrite-endpoint $APPWRITE_ENDPOINT \
              --appwrite-project $APPWRITE_PROJECT \
              --appwrite-key $APPWRITE_KEY \
              --appwrite-bucket $APPWRITE_BUCKET \
              --github-token $GITHUB_TOKEN \
              --github-repo $GITHUB_REPO
      - run:
          name: Build
          command: build-service build .

workflows:
  build:
    jobs:
      - build_android
```

## Advanced Configuration

### Build Variants Configuration

This service now supports multiple build variants: **development**, **preview**, and **release**.

#### CLI Usage

```bash
# Development build
build-service build --variant development

# Preview build
build-service build --variant preview

# Release build (default)
build-service build --variant release
build-service build  # Same as above
```

#### What Each Variant Does

**Development**
- Debug mode enabled
- Source maps included
- No code obfuscation
- Faster build time
- Gradle command: `assembleDebug` or `assembleDevelopment`

**Preview**
- Optimized but debuggable
- Good for testing before release
- Can include staging API endpoints
- Gradle command: `assemblePreview`

**Release**
- Fully optimized
- Code minified and obfuscated
- Production ready
- Smallest APK size
- Gradle command: `assembleRelease`

#### Setting Up Variants in Your Project

**Option 1: Use Expo Build Profiles**

Add to your `app.json`:

```json
{
  "expo": {
    "android": {
      "buildTypes": {
        "development": {},
        "preview": {},
        "release": {}
      }
    }
  }
}
```

**Option 2: Configure Gradle Build Variants**

After running `expo prebuild`, edit `android/app/build.gradle`:

```gradle
android {
    buildTypes {
        debug {
            applicationIdSuffix ".debug"
            versionNameSuffix "-debug"
            debuggable true
        }
        
        development {
            applicationIdSuffix ".dev"
            versionNameSuffix "-dev"
            debuggable true
            minifyEnabled false
        }
        
        preview {
            applicationIdSuffix ".preview"
            versionNameSuffix "-preview"
            debuggable true
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
        
        release {
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

**Option 3: Product Flavors (Advanced)**

For multiple app variants with different features:

```gradle
android {
    flavorDimensions "version"
    
    productFlavors {
        free {
            dimension "version"
            applicationIdSuffix ".free"
        }
        
        paid {
            dimension "version"
            applicationIdSuffix ".paid"
        }
    }
}
```

Then build with:
```bash
build-service build --variant free
build-service build --variant paid
```

#### Environment Variables Per Variant

Create variant-specific environment files:

```
.env.development
.env.preview  
.env.production
```

Update the workflow to load the correct env file:

```yaml
- name: Create .env file
  run: |
    VARIANT="${{ steps.build_info.outputs.VARIANT }}"
    if [ -f "project/.env.$VARIANT" ]; then
      cp project/.env.$VARIANT project/.env
    fi
```

#### Build Variant Examples

**Development Build**
```bash
build-service build --variant development
```
**Output:** `build-1767264765206-1767264800-development.apk`

**Preview Build**
```bash
build-service build --variant preview
```
**Output:** `build-1767264765206-1767264800-preview.apk`

**Release Build**
```bash
build-service build --variant release
# or simply
build-service build
```
**Output:** `build-1767264765206-1767264800-release.apk`

#### Build Matrix (Multiple Variants at Once)

Want to build all variants in one go? Update workflow:

```yaml
strategy:
  matrix:
    variant: [development, preview, release]

steps:
  - name: Build ${{ matrix.variant }}
    run: ./gradlew assemble${{ matrix.variant }} --no-daemon
```

Then trigger with all variants in the payload.

#### Artifact Naming

Artifacts are now named with the variant:
- `build-{buildId}-{timestamp}-development.apk`
- `build-{buildId}-{timestamp}-preview.apk`
- `build-{buildId}-{timestamp}-release.apk`

This makes it easy to identify which build is which!

### App Signing

#### Step 1: Create Keystore

```bash
keytool -genkey -v -keystore my-release-key.keystore \
  -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

#### Step 2: Add to GitHub Secrets

```bash
# Encode keystore to base64
base64 -w 0 my-release-key.keystore > keystore.b64

# Add as secret
gh secret set ANDROID_KEYSTORE --body "$(cat keystore.b64)" --repo username/repo
gh secret set KEYSTORE_PASSWORD --body "your-password" --repo username/repo
gh secret set KEY_ALIAS --body "my-key-alias" --repo username/repo
gh secret set KEY_PASSWORD --body "key-password" --repo username/repo
```

#### Step 3: Update Workflow

```yaml
- name: Decode Keystore
  run: |
    echo "${{ secrets.ANDROID_KEYSTORE }}" | base64 -d > project/android/app/my-release-key.keystore

- name: Build Signed APK
  working-directory: project/android
  env:
    KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
    KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
    KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
  run: |
    ./gradlew assembleRelease \
      -Pandroid.injected.signing.store.file=$PWD/app/my-release-key.keystore \
      -Pandroid.injected.signing.store.password=$KEYSTORE_PASSWORD \
      -Pandroid.injected.signing.key.alias=$KEY_ALIAS \
      -Pandroid.injected.signing.key.password=$KEY_PASSWORD
```

### Environment Variables

#### Add to GitHub Secrets

```bash
gh secret set API_URL --body "https://api.example.com" --repo username/repo
gh secret set API_KEY --body "abc123" --repo username/repo
```

#### Update Workflow

```yaml
- name: Create .env file
  working-directory: project
  run: |
    cat > .env << EOF
    API_URL=${{ secrets.API_URL }}
    API_KEY=${{ secrets.API_KEY }}
    APPWRITE_ENDPOINT=${{ secrets.APPWRITE_ENDPOINT }}
    APPWRITE_PROJECT_ID=${{ secrets.APPWRITE_PROJECT_ID }}
    EOF
```

### Build Caching

The workflow uses `gradle/actions/setup-gradle@v3` which automatically caches:
- Gradle wrapper
- Gradle dependencies
- Generated Gradle jars
- Kotlin DSL caches

To optimize further:

```yaml
- name: Cache node modules
  uses: actions/cache@v3
  with:
    path: project/node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

## API Endpoints

### GitHub API

**Trigger Build:**
```bash
curl -X POST \
  https://api.github.com/repos/username/GitHub-Actions-Build-Service/dispatches \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  -d '{
    "event_type": "remote-build",
    "client_payload": {
      "source_url": "https://cloud.appwrite.io/v1/storage/buckets/builds/files/abc123/download",
      "build_id": "1767264765206"
    }
  }'
```

**Check Workflow Status:**
```bash
curl -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  https://api.github.com/repos/username/GitHub-Actions-Build-Service/actions/runs
```

### Appwrite API

**Upload File:**
```javascript
const { Client, Storage, ID, InputFile } = require('node-appwrite');

const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('YOUR_PROJECT_ID')
  .setKey('YOUR_API_KEY');

const storage = new Storage(client);

const file = await storage.createFile(
  'YOUR_BUCKET_ID',
  ID.unique(),
  InputFile.fromPath('./archive.tar.gz', 'project.tar.gz')
);
```

**Download File:**
```bash
curl -H "X-Appwrite-Project: YOUR_PROJECT_ID" \
     -H "X-Appwrite-Key: YOUR_API_KEY" \
     "https://cloud.appwrite.io/v1/storage/buckets/BUCKET_ID/files/FILE_ID/download"
```

## Debugging

### Enable Verbose Logging

Add to workflow:

```yaml
- name: Debug - Show environment
  run: |
    echo "Node version: $(node --version)"
    echo "NPM version: $(npm --version)"
    echo "Java version: $(java -version)"
    env | grep -E 'ANDROID|JAVA' | sort
```

### Local Testing

Test the build locally before triggering remotely:

```bash
# Test prebuild
cd your-expo-app
npx expo prebuild --platform android --clean

# Test gradle build
cd android
./gradlew assembleRelease --info
```

### View Build Logs

```bash
# List recent runs
gh run list --repo username/GitHub-Actions-Build-Service

# View specific run
gh run view RUN_ID --repo username/GitHub-Actions-Build-Service --log

# Watch live
gh run watch RUN_ID --repo username/GitHub-Actions-Build-Service
```

## Performance Optimization

### Build Time Breakdown

Typical build: **10-15 minutes**
- Download dependencies: 2-3 min
- Expo prebuild: 1-2 min
- Gradle build: 6-10 min
- Upload artifacts: 1-2 min

### Optimization Tips

1. **Use npm ci instead of npm install**
   ```yaml
   run: npm ci  # Faster, uses package-lock.json
   ```

2. **Enable Gradle Build Cache**
   ```yaml
   - uses: gradle/actions/setup-gradle@v3  # Already included
   ```

3. **Parallel Gradle Builds**
   ```yaml
   run: ./gradlew assembleRelease --parallel --max-workers=4
   ```

4. **Reduce APK Size**
   ```javascript
   // app.json
   {
     "expo": {
       "android": {
         "enableDangerousExperimentalLeanBuilds": true
       }
     }
   }
   ```

## Error Handling

### Common Errors

**Error: "gzip: stdin: not in gzip format"**
- **Cause:** Appwrite download failed (missing auth)
- **Fix:** Ensure `APPWRITE_API_KEY` secret is set

**Error: "npm ERR! code ENOTFOUND"**
- **Cause:** Network issue downloading packages
- **Fix:** Retry build, GitHub Actions will handle transient failures

**Error: "Task :app:processReleaseResources FAILED"**
- **Cause:** Invalid Android resources
- **Fix:** Run `npx expo prebuild` locally to test

### Retry Logic

Add to workflow:

```yaml
- name: Build with retry
  uses: nick-invision/retry@v2
  with:
    timeout_minutes: 20
    max_attempts: 3
    command: |
      cd project/android
      ./gradlew assembleRelease --no-daemon
```

## Security Considerations

### Token Permissions

**GitHub Token (minimal required):**
- `repo:status` - Read commit status
- `repo_deployment` - Create deployments
- `public_repo` - Access public repositories
- `workflow` - Update workflows

**Appwrite API Key:**
- `files.read` - Download source files
- `files.write` - Upload built APKs

### Secrets Management

**Never expose secrets in:**
- Workflow logs
- Environment variable dumps
- Error messages
- PR comments

**Use GitHub's built-in masking:**
```yaml
- name: Safe secret usage
  run: |
    echo "::add-mask::$MY_SECRET"
    echo "Using secret: $MY_SECRET"  # Will show as ***
```

## Cost Analysis

### GitHub Actions

**Free Tier (Public Repos):**
- Unlimited minutes ✅

**Free Tier (Private Repos):**
- 2,000 minutes/month
- ~10 min per build
- = 200 builds/month free

**Paid Plans:**
- $0.008/minute after free tier
- $0.08 per build (10 min)

### Appwrite

**Free Tier:**
- 2 GB storage
- 10 GB bandwidth/month
- Unlimited file uploads

**Typical Usage:**
- Source upload: ~2 MB
- APK download: ~40 MB
- = ~20 builds/month within free tier bandwidth

## Monitoring & Analytics

### Track Build Metrics

```yaml
- name: Report metrics
  if: always()
  run: |
    echo "Build duration: ${{ steps.build.outputs.duration }}"
    echo "APK size: $(du -h build-*.apk | cut -f1)"
    echo "Success: ${{ job.status }}"
```

### Webhooks

Send build notifications:

```yaml
- name: Notify webhook
  if: always()
  run: |
    curl -X POST ${{ secrets.WEBHOOK_URL }} \
      -H "Content-Type: application/json" \
      -d '{
        "build_id": "${{ steps.build_info.outputs.BUILD_ID }}",
        "status": "${{ job.status }}",
        "duration": "${{ steps.build.outputs.duration }}"
      }'
```

## Migration from EAS

### 1. Export EAS Configuration

```bash
# Export your eas.json settings
cat eas.json
```

### 2. Update app.json

```javascript
// app.json - Add any EAS-specific configs
{
  "expo": {
    "android": {
      "package": "com.yourcompany.app",
      "versionCode": 1
    }
  }
}
```

### 3. Update Build Commands

Replace:
```bash
eas build --platform android --profile production
```

With:
```bash
build-service build
```

### 4. Update CI/CD

Replace EAS build steps with build-service commands.

## Extending the Service

### Add iOS Support

1. Add macOS runner to workflow
2. Install Xcode command line tools
3. Run `expo prebuild --platform ios`
4. Build with `xcodebuild`

### Add Web Support

```yaml
- name: Build Web
  working-directory: project
  run: |
    npx expo export:web
    tar -czf web-build.tar.gz web-build/
```

### Custom Upload Destinations

Upload to S3, Firebase, or custom CDN:

```yaml
- name: Upload to S3
  run: |
    aws s3 cp build-*.apk s3://my-bucket/builds/
```

---

## Quick Reference Card

```bash
# Setup (once)
npm install -g @yourcompany/build-service-cli
build-service configure [options]

# Daily usage
build-service build              # Build current dir
build-service build /path        # Build specific project
build-service config             # View config
build-service status BUILD_ID    # Check status

# Download builds
gh run download RUN_ID --repo username/repo

# View logs
gh run view RUN_ID --log --repo username/repo
```

---

**Need help?** Open an issue on GitHub or check the troubleshooting section below.

---

## Troubleshooting

### OutOfMemoryError: Metaspace During KSP

**Symptom:**
```
> Task :expo-updates:kspReleaseKotlin
e: [ksp] java.lang.OutOfMemoryError: Metaspace
```

**Cause:** Insufficient metaspace memory for Kotlin Symbol Processing (KSP) in expo-updates and other modules.

**Solution (Updated February 9, 2026 - MAXIMUM SAFE LIMITS):**

The GitHub Actions workflow has been updated with **maximum safe memory allocation** to future-proof against all project sizes:

```yaml
# In .github/workflows/remote-build.yml
env:
  GRADLE_OPTS: -Xmx7g -XX:MaxMetaspaceSize=3g -XX:+HeapDumpOnOutOfMemoryError
  JAVA_TOOL_OPTIONS: -Xmx7g -XX:MaxMetaspaceSize=3g
```

**Why These Limits:**
- GitHub Actions ubuntu-latest runners have 7GB RAM total
- 7GB heap + 3GB metaspace = maximum safe allocation
- Future-proofed for projects with 100+ dependencies
- Handles large KSP generation, multi-module builds, extensive analysis

**For Project Developers:**

1. **Copy the gradle.properties template** to your project:
   ```bash
   cp android-gradle.properties.template YourProject/android/gradle.properties
   ```

2. **Ensure your android/gradle.properties includes:**
   ```properties
   org.gradle.jvmargs=-Xmx7g -XX:MaxMetaspaceSize=3g -XX:+HeapDumpOnOutOfMemoryError
   org.gradle.parallel=true
   android.enableR8.fullMode=true
   ```

3. **For extremely large projects** (200+ dependencies):
   - These settings are already at maximum for GitHub Actions
   - Consider modularizing your project
   - Or use self-hosted runners with more RAM

**Important:** The issue is NOT with the GitHub-hosted runner (ubuntu-latest has sufficient resources). It's a JVM memory configuration issue that affects Kotlin compilation.

### Build Takes Too Long (>30 minutes)

**Common Causes:**
- First build (no cache)
- Many native dependencies
- Complex build configurations

**Solutions:**
1. ✅ GitHub Actions caches are configured (Gradle, npm, Android SDK)
2. Enable parallel builds in `gradle.properties` (already in template)
3. Reduce dependencies if possible
4. Use development builds (faster than production)

### Build Succeeds Locally but Fails on GitHub Actions

**Check these differences:**
1. **Memory settings**: Local machine may have more RAM
2. **Gradle daemon**: GitHub uses `--no-daemon` flag
3. **Environment variables**: Ensure secrets are configured
4. **Android SDK versions**: Check `build.gradle` matches GitHub setup-android action

### APK/AAB Not Found After Build

**Ensure your project has:**
```json
// app.json
{
  "expo": {
    "android": {
      "package": "com.yourcompany.yourapp",
      "versionCode": 1
    }
  }
}
```
