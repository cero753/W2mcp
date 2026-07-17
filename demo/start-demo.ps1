# w2mcp — one-command demo launcher (localhost).
# Starts the multi-tenant gateway (:8080) and the web UI (:5173), each in its own window,
# then pre-warms both hero servers so the first on-stage click is instant.
# Usage:  powershell -ExecutionPolicy Bypass -File demo\start-demo.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# Env-loader run INSIDE each child window: load .env, but force the file store (drop the broken
# Supabase DATABASE_URL). Self-contained so children don't rely on parent env inheritance.
$load = "Get-Content .env | Where-Object { `$_ -match '^\s*[^#].*=' } | ForEach-Object { `$kv = `$_ -split '=',2; if (`$kv[0].Trim() -ne 'DATABASE_URL') { Set-Item -Path Env:\`$(`$kv[0].Trim()) `$kv[1].Trim() } }; `$env:DATABASE_URL = `$null"

# Seed the store once (idempotent) in THIS process.
Invoke-Expression $load
if (-not (Test-Path "anymcp-store.json")) {
  Write-Host "seeding credential store..." -ForegroundColor Cyan
  npx tsx demo/seed-store.mjs
}

Write-Host "starting gateway on :8080 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '$root'; $load; npx tsx src/gateway-cli.ts"

Write-Host "starting web UI on :5173 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '$root'; $load; npx tsx web/server.ts"

# Wait for both to bind.
foreach ($u in @("http://localhost:8080/mcp/coingecko","http://localhost:5173/")) {
  for ($i=0; $i -lt 30; $i++) { try { Invoke-WebRequest $u -Method Head -TimeoutSec 1 -ErrorAction Stop | Out-Null; break } catch { Start-Sleep -Milliseconds 500 } }
}

# Pre-warm the subprocesses (gateway spawns them on first request) so the first live click is instant.
Write-Host "pre-warming coingecko + frankfurter ..." -ForegroundColor Cyan
$hdr = @{ Authorization = "Bearer ak_demo_w2mcp_2026"; "Content-Type" = "application/json"; Accept = "application/json, text/event-stream" }
$body = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
foreach ($api in @("coingecko","frankfurter")) {
  try { Invoke-RestMethod "http://localhost:8080/mcp/$api" -Method Post -Headers $hdr -Body $body -TimeoutSec 10 | Out-Null; Write-Host "  warmed $api" -ForegroundColor DarkGray } catch { Write-Host "  warm $api failed (retry on stage)" -ForegroundColor Yellow }
}

Start-Process "http://localhost:5173"
Write-Host "`nDemo up:  web http://localhost:5173  |  gateway http://localhost:8080  |  key ak_demo_w2mcp_2026" -ForegroundColor Yellow
