#!/bin/bash

# OpenAsst CLI Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print banner
print_banner() {
    echo -e "${BLUE}"
    echo "  ___                    _            _   "
    echo " / _ \ _ __   ___ _ __  / \   ___ ___| |_ "
    echo "| | | | '_ \ / _ \ '_ \/ _ \ / __/ __| __|"
    echo "| |_| | |_) |  __/ | | |_| |\__ \__ \ |_ "
    echo " \___/| .__/ \___|_| |_\___/ |___/___/\__|"
    echo "      |_|                                 "
    echo -e "${NC}"
    echo "AI-powered terminal assistant"
    echo ""
}

# Print colored message
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)     OS="linux";;
        Darwin*)    OS="macos";;
        MINGW*|MSYS*|CYGWIN*) OS="windows";;
        *)          OS="unknown";;
    esac
    echo $OS
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install Node.js if not present
install_node() {
    if command_exists node; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 16 ]; then
            success "Node.js $(node -v) found"
            return 0
        else
            warn "Node.js version too old, need v16+"
        fi
    fi

    info "Installing Node.js..."

    OS=$(detect_os)
    case $OS in
        macos)
            if command_exists brew; then
                brew install node
            else
                curl -fsSL https://nodejs.org/dist/v20.10.0/node-v20.10.0.pkg -o /tmp/node.pkg
                sudo installer -pkg /tmp/node.pkg -target /
                rm /tmp/node.pkg
            fi
            ;;
        linux)
            if command_exists apt-get; then
                curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
                sudo apt-get install -y nodejs
            elif command_exists yum; then
                curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
                sudo yum install -y nodejs
            elif command_exists dnf; then
                curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
                sudo dnf install -y nodejs
            else
                error "Unsupported package manager. Please install Node.js manually."
            fi
            ;;
        *)
            error "Unsupported OS. Please install Node.js manually from https://nodejs.org"
            ;;
    esac

    success "Node.js installed"
}

# Install Git if not present
install_git() {
    if command_exists git; then
        success "Git found"
        return 0
    fi

    info "Installing Git..."

    OS=$(detect_os)
    case $OS in
        macos)
            xcode-select --install 2>/dev/null || brew install git
            ;;
        linux)
            if command_exists apt-get; then
                sudo apt-get install -y git
            elif command_exists yum; then
                sudo yum install -y git
            elif command_exists dnf; then
                sudo dnf install -y git
            fi
            ;;
    esac

    success "Git installed"
}

# Main installation
main() {
    print_banner

    info "Starting OpenAsst installation..."
    echo ""

    # Check and install dependencies
    info "Checking dependencies..."
    install_git
    install_node
    echo ""

    # Set install directory
    INSTALL_DIR="$HOME/.openasst"

    # Remove old installation if exists
    if [ -d "$INSTALL_DIR" ]; then
        warn "Existing installation found, updating..."
        rm -rf "$INSTALL_DIR"
    fi

    # Clone repository
    info "Downloading OpenAsst..."
    git clone --depth 1 https://github.com/abingyyds/OpenAsst.git "$INSTALL_DIR"
    success "Downloaded"
    echo ""

    # Install dependencies
    info "Installing dependencies..."
    cd "$INSTALL_DIR/cli"
    npm install --silent
    success "Dependencies installed"
    echo ""

    # Build
    info "Building..."
    npm run build --silent
    success "Build complete"
    echo ""

    # Create symlink
    info "Creating command..."
    sudo npm link --silent 2>/dev/null || npm link --silent
    success "Command 'openasst' created"
    echo ""

    # Done
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  OpenAsst installed successfully! 🎉${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Configure API key:"
    echo -e "     ${BLUE}openasst config${NC}"
    echo ""
    echo "  2. Start using:"
    echo -e "     ${BLUE}openasst do \"your task here\"${NC}"
    echo ""
    echo "  3. Get help:"
    echo -e "     ${BLUE}openasst --help${NC}"
    echo ""
}

# Run main
main
