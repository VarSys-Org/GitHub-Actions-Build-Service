# Local Memory Fix Testing Script
# Run this in your project directory to test if the memory settings fix the build
# Usage: .\test-memory-fix-local.ps1 <path-to-your-expo-project>

param(
    [Parameter(Mandatory=$false)]
    [string]$ProjectPath = "."
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "LOCAL BUILD TEST WITH MEMORY FIX" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to project
$ProjectPath = Resolve-Path $ProjectPath
Write-Host "Testing project: $ProjectPath" -ForegroundColor Yellow
cd $ProjectPath

# Check if it's an Expo project
if (-not (Test-Path "app.json")) {
    Write-Host "❌ Error: Not an Expo project (app.json not found)" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Expo project detected" -ForegroundColor Green
Write-Host ""

# Step 1: Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Step 2: Run prebuild if android folder doesn't exist
if (-not (Test-Path "android")) {
    Write-Host "🔧 Running expo prebuild..." -ForegroundColor Yellow
    npx expo prebuild --platform android --clean
}

# Step 3: Create/update gradle.properties with memory settings
Write-Host ""
Write-Host "📝 Configuring Gradle memory settings..." -ForegroundColor Yellow

$gradlePropsPath = "android\gradle.properties"
$gradlePropsContent = @"
# Gradle JVM Memory Settings (MAXIMUM SAFE LIMITS - Future-Proofed)
org.gradle.jvmargs=-Xmx7g -XX:MaxMetaspaceSize=3g -XX:+HeapDumpOnOutOfMemoryError

# Parallel builds
org.gradle.parallel=true
org.gradle.workers.max=4

# Caching
org.gradle.caching=true

# AndroidX
android.useAndroidX=true
android.enableJetifier=true

# KSP optimizations
kapt.incremental.apt=true
kapt.use.worker.api=true

# R8
android.enableR8.fullMode=true
"@

$gradlePropsContent | Out-File -FilePath $gradlePropsPath -Encoding UTF8 -Force
Write-Host "✅ gradle.properties updated with 7GB heap, 3GB metaspace (MAXIMUM)" -ForegroundColor Green

# Step 4: Verify Gradle can start with these settings
Write-Host ""
Write-Host "🔍 Verifying Gradle memory configuration..." -ForegroundColor Yellow
cd android

$env:GRADLE_OPTS = "-Xmx7g -XX:MaxMetaspaceSize=3g -XX:+HeapDumpOnOutOfMemoryError"
$env:JAVA_TOOL_OPTIONS = "-Xmx7g -XX:MaxMetaspaceSize=3g"

Write-Host "GRADLE_OPTS: $env:GRADLE_OPTS" -ForegroundColor Cyan
Write-Host "JAVA_TOOL_OPTIONS: $env:JAVA_TOOL_OPTIONS" -ForegroundColor Cyan
Write-Host ""

# Quick Gradle version check
.\gradlew.bat --version

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "QUICK TEST: KSP Task Detection" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Try to detect KSP tasks (this is fast)
$kspTasks = .\gradlew.bat tasks --all | Select-String "ksp"
if ($kspTasks) {
    Write-Host "✅ KSP tasks detected:" -ForegroundColor Green
    $kspTasks | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Host "ℹ️  No KSP tasks found (project may not use KSP)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "NOW RUNNING ACTUAL BUILD TEST..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "This will attempt to build and SHOULD SUCCEED with the new memory settings." -ForegroundColor Yellow
Write-Host "Watch for the KSP compilation step - it should NOT crash with OutOfMemoryError" -ForegroundColor Yellow
Write-Host ""

$buildStart = Get-Date

# Attempt the build (this is where OOM would happen)
Write-Host "Starting assembleRelease..." -ForegroundColor Cyan
.\gradlew.bat assembleRelease --no-daemon --stacktrace

$buildEnd = Get-Date
$duration = $buildEnd - $buildStart

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host "✅ BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host "Build completed in: $($duration.ToString('mm\:ss'))" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎉 The memory fix works! Your remote builds should now succeed." -ForegroundColor Green
    Write-Host ""
    Write-Host "APK location:" -ForegroundColor Cyan
    Get-ChildItem -Path "app\build\outputs\apk\release\*.apk" -Recurse | ForEach-Object {
        Write-Host "  $($_.FullName)" -ForegroundColor Gray
    }
} else {
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Red
    Write-Host "❌ BUILD FAILED" -ForegroundColor Red
    Write-Host "=========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Check the error above. If it's still OutOfMemoryError, try:" -ForegroundColor Yellow
    Write-Host "  1. Increase memory further: -Xmx8g -XX:MaxMetaspaceSize=3g" -ForegroundColor Yellow
    Write-Host "  2. Close other applications to free up RAM" -ForegroundColor Yellow
    Write-Host "  3. Check if you have at least 8GB RAM available" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
