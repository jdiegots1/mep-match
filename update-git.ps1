# update-git.ps1
# Uso: haz doble clic o ejecuta:  powershell -ExecutionPolicy Bypass -File .\update-git.ps1

# ================== CONFIG ==================
# Nombre del repo en tu cuenta. Cambia si no es "mep-match".
$RepoName   = "mep-match"

# Remoto preferido (SSH). Requiere haber configurado tu clave SSH con GitHub.
$RemoteSSH  = "git@github.com:jdiegots1/$RepoName.git"

# Si prefieres HTTPS con PAT, comenta la línea de SSH y usa esta (sustituye <TOKEN>):
# $RemoteHTTPS = "https://<TOKEN>@github.com/jdiegots1/$RepoName.git"

# Rama por defecto si no existe ninguna todavía:
$DefaultBranch = "main"

# Patron(es) a excluir de commits automáticos (se ignoran si ya están en .gitignore)
$ExcludeGlobs = @("*.env", ".env*", "node_modules/", ".next/", "dist/", "out/")
# ============================================

function Write-Info($msg)  { Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# 1) Comprobaciones básicas
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Err "Git no está instalado o no está en PATH."
  exit 1
}

# 2) Ir a la carpeta del script (raíz del proyecto)
Set-Location -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)

# 3) Inicializar repo si no existe
if (-not (Test-Path ".git")) {
  Write-Info "Inicializando repositorio Git…"
  git init | Out-Null
  # Crear .gitignore si no existe
  if (-not (Test-Path ".gitignore")) {
    @(
      "node_modules/"
      ".next/"
      "dist/"
      "out/"
      ".DS_Store"
      "*.log"
      ".env"
      ".env.*"
    ) | Set-Content ".gitignore" -Encoding UTF8
    Write-Ok "Creado .gitignore básico."
  }
}

# 4) Detectar rama actual o crear una
$branch = (git rev-parse --abbrev-ref HEAD 2>$null)
if (-not $branch -or $branch -eq "HEAD") {
  Write-Info "Creando rama '$DefaultBranch'…"
  git checkout -b $DefaultBranch | Out-Null
  $branch = $DefaultBranch
}

# 5) Configurar remoto origin si falta
$origin = (git remote get-url origin 2>$null)
if (-not $origin) {
  $remoteToUse = $RemoteSSH
  if ($RemoteHTTPS) { $remoteToUse = $RemoteHTTPS }
  Write-Info "Asignando remoto 'origin' a $remoteToUse"
  git remote add origin $remoteToUse
} else {
  Write-Info "Remoto origin ya configurado: $origin"
}

# 6) Asegurar que la rama remota existe (si el repo remoto ya tiene main)
# Intentar traer refs (no falla si el repo remoto está vacío)
git fetch origin --prune 2>$null | Out-Null

# 7) Pull con rebase y autostash (si hay remoto y la rama existe)
try {
  Write-Info "Sincronizando (git pull --rebase --autostash)…"
  git pull --rebase --autostash origin $branch 2>$null | Out-Null
  Write-Ok "Pull completado."
} catch {
  Write-Warn "No se pudo hacer pull (es normal si el remoto está vacío o no existe la rama remota). Continuo…"
}

# 8) Añadir archivos (respetando exclusiones)
#   - Excluir temporalmente los globs no ignorados
$TempExclude = @()
foreach ($glob in $ExcludeGlobs) {
  $matches = Get-ChildItem -Path . -Recurse -Force -ErrorAction SilentlyContinue -Include $glob
  foreach ($m in $matches) {
    $rel = Resolve-Path -Relative $m.FullName
    # git update-index --assume-unchanged (solo si ya está trackeado) no sirve para no trackeados.
    # Usaremos "git add -A" y luego "git restore --staged" para lo excluido.
    $TempExclude += $rel
  }
}

git add -A

# Quitar del índice lo excluido
foreach ($rel in ($TempExclude | Select-Object -Unique)) {
  git restore --staged -- "$rel" 2>$null | Out-Null
}

# 9) Comprobar si hay cambios
$pending = (git status --porcelain)
if (-not $pending) {
  Write-Info "No hay cambios locales que commitear."
} else {
  # 10) Commit con timestamp
  $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $who = $env:USERNAME
  $msg = "auto: sync at $ts by $who"
  Write-Info "Haciendo commit: $msg"
  git commit -m "$msg" | Out-Null
  Write-Ok "Commit creado."
}

# 11) Empujar al remoto
try {
  Write-Info "Haciendo push a origin/$branch…"
  git push -u origin $branch
  Write-Ok "Push completado."
} catch {
  Write-Err "Fallo el push. Verifica permisos (SSH/PAT) y que el repo remoto existe."
  Write-Host "Sugerencia (SSH):"
  Write-Host "  - Añade tu clave a GitHub y arranca el agente:"
  Write-Host "      Start-SshAgent; ssh-add ~\.ssh\id_rsa"
  Write-Host "  - Crea el repo en GitHub: https://github.com/new  (nombre: $RepoName)"
  exit 1
}

Write-Ok "Repositorio sincronizado con origin/$branch."
