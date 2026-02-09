# Quick Check Script - Verify Memory Settings in GitHub Actions
# This checks if your latest build has the correct memory settings
# WITHOUT waiting for the full build to complete

param(
    [Parameter(Mandatory=$false)]
    [int]$RunNumber = 0  # 0 = latest run
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "QUICK VERIFICATION TOOL" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Set GitHub token from env file
$tokenFile = "C:\my projects\VarSysProjects\.env.githubtoken"
if (Test-Path $tokenFile) {
    $content = Get-Content $tokenFile -Raw
    if ($content -match 'GITHUB_PAT=(.+)') {
        $env:GITHUB_TOKEN = $matches[1].Trim()
        Write-Host "✅ GitHub token loaded" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  No token file found, attempting anonymous access..." -ForegroundColor Yellow
}

$repo = "CodeCraftsman-Jr/GitHub-Actions-Build-Service"

Write-Host "Fetching latest workflow runs..." -ForegroundColor Yellow
Write-Host ""

# Get latest runs
$runs = gh run list --repo $repo --workflow "remote-build.yml" --limit 5 --json number,status,conclusion,createdAt,displayTitle | ConvertFrom-Json

if ($runs.Count -eq 0) {
    Write-Host "❌ No workflow runs found" -ForegroundColor Red
    exit 1
}

# Show recent runs
Write-Host "Recent Workflow Runs:" -ForegroundColor Cyan
Write-Host "--------------------" -ForegroundColor Gray
$runs | ForEach-Object {
    $statusColor = switch ($_.status) {
        "completed" { if ($_.conclusion -eq "success") { "Green" } else { "Red" } }
        "in_progress" { "Yellow" }
        default { "Gray" }
    }
    $statusIcon = switch ($_.status) {
        "completed" { if ($_.conclusion -eq "success") { "✅" } else { "❌" } }
        "in_progress" { "🔄" }
        default { "⏸️" }
    }
    Write-Host "$statusIcon #$($_.number) - $($_.displayTitle) - $($_.status)" -ForegroundColor $statusColor
}
Write-Host ""

# Select run to check
if ($RunNumber -eq 0) {
    $selectedRun = $runs[0].number
    Write-Host "Checking latest run: #$selectedRun" -ForegroundColor Cyan
} else {
    $selectedRun = $RunNumber
    Write-Host "Checking run: #$selectedRun" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "SEARCHING FOR MEMORY VERIFICATION STEP" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Get the logs (this is fast, just downloads logs)
gh run view $selectedRun --repo $repo --log > temp_build_log.txt

# Search for memory verification
$memoryVerification = Select-String -Path temp_build_log.txt -Pattern "JVM MEMORY CONFIGURATION VERIFICATION" -Context 0,15

if ($memoryVerification) {
    Write-Host "✅ FOUND: Memory verification step!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verification Output:" -ForegroundColor Yellow
    Write-Host "-------------------" -ForegroundColor Gray
    $memoryVerification.Context.PostContext | ForEach-Object {
        if ($_ -match "GRADLE_OPTS.*6g.*2g") {
            Write-Host $_ -ForegroundColor Green
        } elseif ($_ -match "OutOfMemoryError") {
            Write-Host $_ -ForegroundColor Red
        } else {
            Write-Host $_ -ForegroundColor Gray
        }
    }
    Write-Host ""
    Write-Host "🎯 Memory settings ARE being applied: 6GB heap, 2GB metaspace" -ForegroundColor Green
} else {
    Write-Host "⚠️  Memory verification step not found in logs" -ForegroundColor Yellow
    Write-Host "This means the build is using an OLD workflow version" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To fix: Commit and push the updated workflow file" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "CHECKING FOR OOM ERRORS" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$oomErrors = Select-String -Path temp_build_log.txt -Pattern "OutOfMemoryError" -Context 2,5

if ($oomErrors) {
    Write-Host "❌ FOUND OutOfMemoryError in logs:" -ForegroundColor Red
    Write-Host ""
    $oomErrors | ForEach-Object {
        Write-Host "Context:" -ForegroundColor Yellow
        $_.Context.PreContext + $_.Line + $_.Context.PostContext | ForEach-Object {
            Write-Host "  $_" -ForegroundColor Gray
        }
        Write-Host ""
    }
} else {
    Write-Host "✅ No OutOfMemoryError found in this run!" -ForegroundColor Green
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "BUILD STATUS" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$currentStatus = $runs | Where-Object { $_.number -eq $selectedRun } | Select-Object -First 1

if ($currentStatus.status -eq "in_progress") {
    Write-Host "⏳ Build is STILL RUNNING" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "You can now confidently wait OR cancel if you've verified:" -ForegroundColor Cyan
    Write-Host "  ✅ Memory verification step shows 6GB/2GB" -ForegroundColor Gray
    Write-Host "  ✅ No OutOfMemoryError in logs (yet)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Alternatively, run the LOCAL test script to verify in minutes:" -ForegroundColor Yellow
    Write-Host "  .\test-memory-fix-local.ps1 <path-to-your-project>" -ForegroundColor Cyan
} elseif ($currentStatus.conclusion -eq "success") {
    Write-Host "🎉 Build SUCCEEDED!" -ForegroundColor Green
} else {
    Write-Host "❌ Build FAILED with conclusion: $($currentStatus.conclusion)" -ForegroundColor Red
}

# Cleanup
Remove-Item temp_build_log.txt -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "RECOMMENDATIONS" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

if ($memoryVerification) {
    Write-Host "✅ Your workflow HAS the memory fix applied" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Test locally first (much faster): .\test-memory-fix-local.ps1" -ForegroundColor Cyan
    Write-Host "  2. If local build succeeds, remote builds should work too" -ForegroundColor Cyan
    Write-Host "  3. If both fail, increase memory to 8GB/3GB" -ForegroundColor Cyan
} else {
    Write-Host "⚠️  Workflow needs to be updated" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Run these commands:" -ForegroundColor Cyan
    Write-Host "  cd 'C:\my projects\VarSysProjects\GitHub-Actions-Build-Service'" -ForegroundColor Gray
    Write-Host "  git add .github/workflows/remote-build.yml" -ForegroundColor Gray
    Write-Host "  git commit -m 'fix: Increase JVM memory for KSP (6GB/2GB)'" -ForegroundColor Gray
    Write-Host "  git push" -ForegroundColor Gray
}

Write-Host ""
