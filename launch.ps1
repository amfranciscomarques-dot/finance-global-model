# Launches the finance-global-model app.
#   .\launch.ps1          -> dev server with hot reload (default)
#   .\launch.ps1 -Prod    -> production build + start
param(
    [switch]$Prod
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found. Install Node.js first: https://nodejs.org"
}

# First-run setup: dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed." }
}

# Prisma client (lives in node_modules, so regenerate if missing)
if (-not (Test-Path "node_modules\.prisma\client")) {
    Write-Host "Generating Prisma client..." -ForegroundColor Cyan
    npm run db:generate
    if ($LASTEXITCODE -ne 0) { Write-Error "prisma generate failed." }
}

# SQLite database (path from .env: file:../db/custom.db, relative to prisma/)
if (-not (Test-Path "db\custom.db")) {
    Write-Host "Creating database schema..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path "db" | Out-Null
    npm run db:push
    if ($LASTEXITCODE -ne 0) { Write-Error "prisma db push failed." }
}

if ($Prod) {
    Write-Host "Building for production..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "Build failed." }
    Write-Host "Starting production server at http://localhost:3000" -ForegroundColor Green
    npm run start
} else {
    Write-Host "Starting dev server at http://localhost:3000" -ForegroundColor Green
    npm run dev
}
