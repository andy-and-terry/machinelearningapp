#Requires -Version 5.1
<#
.SYNOPSIS
    Install and configure the Local ML Platform on Windows.

.DESCRIPTION
    This script will:
      1. Check if Ollama is installed; guide the user to install it if not.
      2. Ensure Ollama is running.
      3. Pull the selected ML models via Ollama.
      4. Install Node.js dependencies for the app.

.PARAMETER Models
    Comma-separated list of models to pull.
    Defaults to all supported models.
    Example: -Models "qwen2.5:0.5b,llama3.2:1b"

.PARAMETER SkipNodeInstall
    Skip installing Node.js dependencies (useful if already done).

.EXAMPLE
    .\install.ps1
    .\install.ps1 -Models "qwen2.5:0.5b,llama3.2:1b"
#>

[CmdletBinding()]
param(
    [string]$Models = "qwen2.5:0.5b,llama3.2:1b,mistral:7b,deepseek-r1:7b,deepseek-r1:8b",
    [switch]$SkipNodeInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
function Write-Header([string]$Text) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor White
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

function Write-Ok([string]$Text)   { Write-Host "  [OK]  $Text" -ForegroundColor Green  }
function Write-Warn([string]$Text) { Write-Host "  [!!]  $Text" -ForegroundColor Yellow }
function Write-Fail([string]$Text) { Write-Host "  [XX]  $Text" -ForegroundColor Red    }
function Write-Info([string]$Text) { Write-Host "  [..]  $Text" -ForegroundColor Gray   }

function Test-CommandExists([string]$Cmd) {
    return $null -ne (Get-Command $Cmd -ErrorAction SilentlyContinue)
}

function Wait-OllamaReady([int]$MaxSeconds = 30) {
    Write-Info "Waiting for Ollama to be ready (up to $MaxSeconds s)…"
    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" `
                                      -Method Get -TimeoutSec 2 -ErrorAction Stop
            Write-Ok "Ollama is ready (version: $($resp.version))"
            return $true
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    return $false
}

# ─────────────────────────────────────────────
# 1. Check / install Ollama
# ─────────────────────────────────────────────
Write-Header "Step 1 – Ollama"

if (Test-CommandExists "ollama") {
    $ollamaVer = (ollama --version 2>&1) -join ""
    Write-Ok "Ollama is installed: $ollamaVer"
} else {
    Write-Warn "Ollama is not installed."
    Write-Host ""
    Write-Host "  Please install Ollama for Windows:" -ForegroundColor Yellow
    Write-Host "  https://ollama.com/download/windows" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  After installing, re-run this script." -ForegroundColor Yellow
    Write-Host ""

    $choice = Read-Host "  Open the Ollama download page now? [Y/n]"
    if ($choice -ne 'n' -and $choice -ne 'N') {
        Start-Process "https://ollama.com/download/windows"
    }
    exit 1
}

# ─────────────────────────────────────────────
# 2. Ensure Ollama is running
# ─────────────────────────────────────────────
Write-Header "Step 2 – Start Ollama service"

$ollamaReady = $false
try {
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" `
                              -Method Get -TimeoutSec 3 -ErrorAction Stop
    Write-Ok "Ollama is already running (version: $($resp.version))"
    $ollamaReady = $true
} catch {
    Write-Info "Ollama is not running. Starting it now…"
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    $ollamaReady = Wait-OllamaReady -MaxSeconds 30
}

if (-not $ollamaReady) {
    Write-Fail "Ollama did not start within 30 seconds."
    Write-Warn "Try running 'ollama serve' manually in a separate terminal, then re-run this script."
    exit 1
}

# ─────────────────────────────────────────────
# 3. Pull models
# ─────────────────────────────────────────────
Write-Header "Step 3 – Pull models"

$modelList = $Models -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }

Write-Info "Models to install: $($modelList -join ', ')"
Write-Host ""

foreach ($model in $modelList) {
    Write-Host "  Pulling $model …" -ForegroundColor Cyan
    try {
        & ollama pull $model
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Successfully pulled: $model"
        } else {
            Write-Warn "Pull exited with code $LASTEXITCODE for model: $model"
        }
    } catch {
        Write-Warn "Failed to pull $model : $_"
    }
    Write-Host ""
}

# ─────────────────────────────────────────────
# 4. Install Node.js dependencies
# ─────────────────────────────────────────────
Write-Header "Step 4 – Node.js dependencies"

if ($SkipNodeInstall) {
    Write-Info "Skipping Node.js dependency install (--SkipNodeInstall flag set)."
} elseif (-not (Test-CommandExists "node")) {
    Write-Warn "Node.js not found. Please install it from https://nodejs.org/ (LTS recommended)."
    Write-Warn "After installing Node.js, run:  npm install  in the app directory."
} else {
    $nodeVer = node --version
    Write-Ok "Node.js found: $nodeVer"

    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $appDir    = Split-Path -Parent $scriptDir

    if (Test-Path "$appDir\package.json") {
        Push-Location $appDir
        try {
            Write-Info "Running npm install…"
            & npm install --omit=dev
            if ($LASTEXITCODE -eq 0) {
                Write-Ok "Node.js dependencies installed."
            } else {
                Write-Warn "npm install exited with code $LASTEXITCODE."
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Warn "package.json not found at $appDir — skipping npm install."
    }
}

# ─────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────
Write-Header "All done!"
Write-Host ""
Write-Ok "Setup complete."
Write-Host ""
Write-Host "  To start the app:" -ForegroundColor White
Write-Host "    cd $(Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))" -ForegroundColor Cyan
Write-Host "    npm start" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Then open your browser at:" -ForegroundColor White
Write-Host "    http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
