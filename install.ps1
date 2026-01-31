# OpenAsst CLI Installer for Windows
# Usage: iwr -useb https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

# Colors
function Write-Color($Text, $Color) {
    Write-Host $Text -ForegroundColor $Color
}

function Write-Info($Text) { Write-Host "[INFO] " -ForegroundColor Blue -NoNewline; Write-Host $Text }
function Write-Success($Text) { Write-Host "[OK] " -ForegroundColor Green -NoNewline; Write-Host $Text }
function Write-Warn($Text) { Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $Text }
function Write-Err($Text) { Write-Host "[ERROR] " -ForegroundColor Red -NoNewline; Write-Host $Text; exit 1 }

# Print banner
function Print-Banner {
    Write-Host ""
    Write-Color "  ___                    _            _   " "Blue"
    Write-Color " / _ \ _ __   ___ _ __  / \   ___ ___| |_ " "Blue"
    Write-Color "| | | | '_ \ / _ \ '_ \/ _ \ / __/ __| __|" "Blue"
    Write-Color "| |_| | |_) |  __/ | | |_| |\__ \__ \ |_ " "Blue"
    Write-Color " \___/| .__/ \___|_| |_\___/ |___/___/\__|" "Blue"
    Write-Color "      |_|                                 " "Blue"
    Write-Host ""
    Write-Host "AI-powered terminal assistant"
    Write-Host ""
}

# Check if command exists
function Test-Command($Command) {
    return [bool](Get-Command -Name $Command -ErrorAction SilentlyContinue)
}

# Install Node.js
function Install-NodeJS {
    if (Test-Command "node") {
        $version = (node -v) -replace 'v', '' -split '\.' | Select-Object -First 1
        if ([int]$version -ge 16) {
            Write-Success "Node.js $(node -v) found"
            return
        } else {
            Write-Warn "Node.js version too old, need v16+"
        }
    }

    Write-Info "Installing Node.js..."

    # Check if winget is available
    if (Test-Command "winget") {
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    }
    # Check if choco is available
    elseif (Test-Command "choco") {
        choco install nodejs-lts -y
    }
    # Check if scoop is available
    elseif (Test-Command "scoop") {
        scoop install nodejs-lts
    }
    else {
        Write-Host ""
        Write-Warn "No package manager found (winget/choco/scoop)"
        Write-Host "Please install Node.js manually from: https://nodejs.org"
        Write-Host "Then run this script again."
        exit 1
    }

    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    Write-Success "Node.js installed"
}

# Install Git
function Install-Git {
    if (Test-Command "git") {
        Write-Success "Git found"
        return
    }

    Write-Info "Installing Git..."

    if (Test-Command "winget") {
        winget install Git.Git --silent --accept-package-agreements --accept-source-agreements
    }
    elseif (Test-Command "choco") {
        choco install git -y
    }
    elseif (Test-Command "scoop") {
        scoop install git
    }
    else {
        Write-Host ""
        Write-Warn "No package manager found (winget/choco/scoop)"
        Write-Host "Please install Git manually from: https://git-scm.com"
        Write-Host "Then run this script again."
        exit 1
    }

    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    Write-Success "Git installed"
}

# Main installation
function Main {
    Print-Banner

    Write-Info "Starting OpenAsst installation..."
    Write-Host ""

    # Check and install dependencies
    Write-Info "Checking dependencies..."
    Install-Git
    Install-NodeJS
    Write-Host ""

    # Set install directory
    $InstallDir = "$env:USERPROFILE\.openasst"

    # Remove old installation if exists
    if (Test-Path $InstallDir) {
        Write-Warn "Existing installation found, updating..."
        Remove-Item -Recurse -Force $InstallDir
    }

    # Clone repository
    Write-Info "Downloading OpenAsst..."
    git clone --depth 1 https://github.com/abingyyds/OpenAsst.git $InstallDir
    Write-Success "Downloaded"
    Write-Host ""

    # Install dependencies
    Write-Info "Installing dependencies..."
    Set-Location "$InstallDir\cli"
    npm install --silent 2>$null
    Write-Success "Dependencies installed"
    Write-Host ""

    # Build
    Write-Info "Building..."
    npm run build --silent 2>$null
    Write-Success "Build complete"
    Write-Host ""

    # Create global command
    Write-Info "Creating command..."
    npm link --silent 2>$null
    Write-Success "Command 'openasst' created"
    Write-Host ""

    # Done
    Write-Host ""
    Write-Color "========================================" "Green"
    Write-Color "  OpenAsst installed successfully!    " "Green"
    Write-Color "========================================" "Green"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Configure API key:"
    Write-Color "     openasst config" "Blue"
    Write-Host ""
    Write-Host "  2. Start using:"
    Write-Color "     openasst do `"your task here`"" "Blue"
    Write-Host ""
    Write-Host "  3. Get help:"
    Write-Color "     openasst --help" "Blue"
    Write-Host ""
}

# Run main
Main
