#!/usr/bin/env node
/**
 * Enhanced Build Service - EAS-Compatible Profile Support
 * 
 * Reads eas.json build profiles and maps them to GitHub Actions builds
 * Compatible with EAS Build configuration but uses our free self-hosted service
 * 
 * Usage:
 *   node enhanced-build-service.js build --profile development
 *   node enhanced-build-service.js build --profile preview
 *   node enhanced-build-service.js build --profile production
 */

const fs = require('fs');
const path = require('path');
const sdk = require('node-appwrite');
const archiver = require('archiver');
const os = require('os');

// Extract SDK components
const { Client, Storage, ID, InputFile } = sdk;

// Configuration
const CONFIG_FILE = path.join(os.homedir(), '.build-service.json');

// Read configuration
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('❌ Configuration not found. Run: build-service configure');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

// Read eas.json from project
function loadEasConfig(projectPath) {
  const easJsonPath = path.join(projectPath, 'eas.json');
  if (!fs.existsSync(easJsonPath)) {
    console.log('⚠️  eas.json not found. Using default configuration.');
    return null;
  }
  
  try {
    const easConfig = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'));
    console.log('✅ Loaded eas.json configuration');
    return easConfig;
  } catch (error) {
    console.error('❌ Failed to parse eas.json:', error.message);
    return null;
  }
}

// Map EAS profile to build configuration
function mapProfileToConfig(profile, profileConfig) {
  const config = {
    variant: 'release',
    buildType: 'apk',
    gradleCommand: null,
    env: {},
    autoIncrement: false,
    distribution: 'internal'
  };

  if (!profileConfig) {
    console.log(`⚠️  Profile "${profile}" not found in eas.json, using defaults`);
    return config;
  }

  // Map developmentClient to debug variant
  if (profileConfig.developmentClient === true) {
    config.variant = 'debug';
    console.log('📱 Development client enabled → using debug variant');
  }

  // Map distribution type
  if (profileConfig.distribution) {
    config.distribution = profileConfig.distribution;
  }

  // Map android-specific configuration
  if (profileConfig.android) {
    if (profileConfig.android.buildType) {
      config.buildType = profileConfig.android.buildType; // 'apk' or 'aab'
      console.log(`📦 Build type: ${config.buildType.toUpperCase()}`);
    }
    
    if (profileConfig.android.gradleCommand) {
      config.gradleCommand = profileConfig.android.gradleCommand;
      console.log(`⚙️  Custom gradle command: ${config.gradleCommand}`);
    }
  }

  // Map environment variables
  if (profileConfig.env) {
    config.env = profileConfig.env;
    console.log(`🔧 Environment variables: ${Object.keys(config.env).length} variables`);
  }

  // Map autoIncrement
  if (profileConfig.autoIncrement === true) {
    config.autoIncrement = true;
    console.log('🔢 Auto-increment version code enabled');
  }

  return config;
}

// Determine gradle command based on configuration
function getGradleCommand(config) {
  // If custom gradle command specified, use it
  if (config.gradleCommand) {
    return config.gradleCommand;
  }

  // Map variant and build type to gradle command
  const variantCapitalized = config.variant.charAt(0).toUpperCase() + config.variant.slice(1);
  
  if (config.buildType === 'aab') {
    return `bundle${variantCapitalized}`;
  } else {
    return `assemble${variantCapitalized}`;
  }
}

// Package project
async function packageProject(projectPath, excludePatterns = []) {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const outputPath = path.join(os.tmpdir(), `build-${timestamp}.tar.gz`);
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('tar', { gzip: true });

    output.on('close', () => {
      const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`📦 Package created: ${sizeInMB} MB`);
      resolve(outputPath);
    });

    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    // Read .buildignore if exists
    let buildIgnorePatterns = [];
    const buildIgnorePath = path.join(projectPath, '.buildignore');
    if (fs.existsSync(buildIgnorePath)) {
      const buildIgnoreContent = fs.readFileSync(buildIgnorePath, 'utf8');
      buildIgnorePatterns = buildIgnoreContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => line.endsWith('/') ? line + '**' : line);
      console.log(`📋 Using .buildignore (${buildIgnorePatterns.length} patterns)`);
    }

    // Default excludes if no .buildignore
    const defaultExcludes = buildIgnorePatterns.length > 0 ? buildIgnorePatterns : [
      'node_modules/**',
      '.git/**',
      '.expo/**',
      'dist/**',
      'build/**',
      '.vscode/**',
      '*.log',
      'android/app/build/**',
      'android/.gradle/**',
      'android/build/**',
      'ios/build/**',
      'ios/Pods/**'
    ];

    const allExcludes = [...defaultExcludes, ...excludePatterns];

    console.log('📁 Packaging project...');
    archive.glob('**/*', {
      cwd: projectPath,
      ignore: allExcludes,
      dot: true
    });

    archive.finalize();
  });
}

// Upload to Appwrite
async function uploadToAppwrite(filePath, config) {
  const client = new Client()
    .setEndpoint(config.appwriteEndpoint)
    .setProject(config.appwriteProject)
    .setKey(config.appwriteKey);

  const storage = new Storage(client);

  console.log('📤 Uploading to Appwrite Storage...');
  
  // Read file and create buffer
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  
  const file = await storage.createFile(
    config.appwriteBucket,
    ID.unique(),
    InputFile.fromBuffer(fileBuffer, fileName)
  );

  console.log(`✅ Uploaded: ${file.$id}`);
  return file;
}

// Trigger GitHub Actions
function detectProjectType(projectPath) {
  if (fs.existsSync(path.join(projectPath, 'pubspec.yaml'))) {
    return 'flutter';
  }
  if (
    fs.existsSync(path.join(projectPath, 'capacitor.config.ts')) ||
    fs.existsSync(path.join(projectPath, 'capacitor.config.js')) ||
    fs.existsSync(path.join(projectPath, 'capacitor.config.json'))
  ) {
    return 'capacitor';
  }
  if (
    fs.existsSync(path.join(projectPath, 'app.json')) ||
    fs.existsSync(path.join(projectPath, 'app.config.js')) ||
    fs.existsSync(path.join(projectPath, 'app.config.ts'))
  ) {
    return 'expo';
  }
  return 'auto';
}

async function triggerBuild(sourceUrl, buildConfig, config, projectType) {
  const buildId = Date.now().toString();
  
  const payload = {
    event_type: 'remote-build',
    client_payload: {
      source_url: sourceUrl,
      build_id: buildId,
      platform: 'android',
      variant: buildConfig.variant,
      project_type: projectType,
      build_type: buildConfig.buildType,
      gradle_command: getGradleCommand(buildConfig),
      auto_increment: buildConfig.autoIncrement,
      env: buildConfig.env
    }
  };

  console.log('\n🚀 Triggering GitHub Actions build...');
  console.log(`📋 Build ID: ${buildId}`);
  console.log(`📦 Variant: ${buildConfig.variant}`);
  console.log(`⚙️  Gradle: ${payload.client_payload.gradle_command}`);
  console.log(`📦 Output: ${buildConfig.buildType.toUpperCase()}`);

  const response = await fetch(
    `https://api.github.com/repos/${config.githubRepo}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  console.log('✅ Build triggered successfully');
  console.log(`🔗 Monitor: https://github.com/${config.githubRepo}/actions`);
  
  return buildId;
}

// Main build command
async function build(options) {
  try {
    const projectPath = options.path || process.cwd();
    const profile = options.profile || 'production';
    
    console.log('\n🏗️  Enhanced Build Service (EAS-Compatible)\n');
    console.log(`📂 Project: ${projectPath}`);
    console.log(`🎯 Profile: ${profile}`);
    console.log('');

    // Load configurations
    const config = loadConfig();
    const easConfig = loadEasConfig(projectPath);
    
    // Get profile configuration
    const profileConfig = easConfig?.build?.[profile];
    const buildConfig = mapProfileToConfig(profile, profileConfig);
    const projectType = detectProjectType(projectPath);
    console.log(`🧭 Project type: ${projectType}`);

    // Package project
    const packagePath = await packageProject(projectPath);

    // Upload to Appwrite
    const file = await uploadToAppwrite(packagePath, config);
    const sourceUrl = `${config.appwriteEndpoint}/storage/buckets/${config.appwriteBucket}/files/${file.$id}/download`;

    // Trigger build
    const buildId = await triggerBuild(sourceUrl, buildConfig, config, projectType);

    // Cleanup
    fs.unlinkSync(packagePath);

    console.log('\n✨ Done!\n');
    console.log('📋 Build Information:');
    console.log(`   Build ID: ${buildId}`);
    console.log(`   File ID: ${file.$id}`);
    console.log(`   Profile: ${profile}`);
    console.log(`   Variant: ${buildConfig.variant}`);
    console.log(`   Output: ${buildConfig.buildType.toUpperCase()}`);
    console.log('');
    console.log('⏳ Build typically takes 15-25 minutes');
    console.log(`🔗 Monitor at: https://github.com/${config.githubRepo}/actions`);

  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

// CLI handling
const args = process.argv.slice(2);
const command = args[0];

if (command === 'build') {
  const options = {
    path: null,
    profile: 'production'
  };

  // Parse arguments
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--path' || args[i] === '-p') {
      options.path = args[i + 1];
      i++;
    } else if (args[i] === '--profile' || args[i] === '--eas-profile') {
      options.profile = args[i + 1];
      i++;
    } else if (args[i] === '-a' || args[i] === '--app') {
      // App name parameter (for compatibility)
      i++;
    } else if (args[i] === '-v' || args[i] === '--version') {
      // Version parameter (for compatibility)
      i++;
    }
  }

  build(options);
} else {
  console.log('Enhanced Build Service - EAS-Compatible');
  console.log('');
  console.log('Usage:');
  console.log('  build --profile <profile>    Build with EAS profile (development, preview, production)');
  console.log('  build -p <profile>           Short form');
  console.log('');
  console.log('Examples:');
  console.log('  node enhanced-build-service.js build --profile development');
  console.log('  node enhanced-build-service.js build -p preview');
  console.log('  node enhanced-build-service.js build -p production');
}
