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

# Install Node.js via nvm (more compatible with old systems)
install_node_via_nvm() {
    info "Installing Node.js via nvm (for better compatibility)..."

    # Install nvm
    export NVM_DIR="$HOME/.nvm"
    if [ ! -d "$NVM_DIR" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    fi

    # Load nvm
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    # Install Node.js 16 (best glibc compatibility for old systems)
    nvm install 16
    nvm use 16
    nvm alias default 16

    # Verify installation
    if command_exists node; then
        success "Node.js $(node -v) installed via nvm"
        return 0
    else
        return 1
    fi
}

# Install Node.js if not present
install_node() {
    if command_exists node; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 16 ]; then
            success "Node.js $(node -v) found"
            return 0
        else
            warn "Node.js version too old ($(node -v)), need v16+"
        fi
    fi

    info "Installing Node.js..."

    OS=$(detect_os)
    case $OS in
        macos)
            if command_exists brew; then
                brew install node
            else
                curl -fsSL https://nodejs.org/dist/v16.20.2/node-v16.20.2.pkg -o /tmp/node.pkg
                sudo installer -pkg /tmp/node.pkg -target /
                rm /tmp/node.pkg
            fi
            ;;
        linux)
            # Try system package manager first, fallback to nvm if it fails
            INSTALL_SUCCESS=false

            if command_exists apt-get; then
                curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash - && \
                sudo apt-get install -y nodejs && INSTALL_SUCCESS=true
            elif command_exists yum; then
                curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo bash - && \
                sudo yum install -y nodejs && INSTALL_SUCCESS=true
            elif command_exists dnf; then
                curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo bash - && \
                sudo dnf install -y nodejs && INSTALL_SUCCESS=true
            fi

            # Check if installation succeeded and version is correct
            if [ "$INSTALL_SUCCESS" = true ] && command_exists node; then
                NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
                if [ "$NODE_VERSION" -ge 16 ]; then
                    success "Node.js $(node -v) installed"
                    return 0
                fi
            fi

            # Fallback to nvm (works on old systems like CentOS 7)
            warn "System package manager failed, trying nvm..."
            if install_node_via_nvm; then
                return 0
            else
                error "Failed to install Node.js. Please install manually."
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

    # Ensure nvm is loaded (in case Node.js was installed via nvm)
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

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

    # Create command - multiple methods for reliability
    info "Creating command..."

    # Method 1: Try npm link
    npm link --silent 2>/dev/null || sudo npm link --silent 2>/dev/null || true

    # Method 2: Create wrapper script in /usr/local/bin (more reliable)
    WRAPPER_PATH="/usr/local/bin/openasst"
    CLI_PATH="$INSTALL_DIR/cli/dist/index.js"

    if [ -w "/usr/local/bin" ] || [ -w "$(dirname $WRAPPER_PATH)" ]; then
        cat > "$WRAPPER_PATH" << EOF
#!/bin/bash
export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
node "$CLI_PATH" "\$@"
EOF
        chmod +x "$WRAPPER_PATH"
    else
        sudo bash -c "cat > $WRAPPER_PATH << EOF
#!/bin/bash
export NVM_DIR=\"\\\$HOME/.nvm\"
[ -s \"\\\$NVM_DIR/nvm.sh\" ] && . \"\\\$NVM_DIR/nvm.sh\"
node $CLI_PATH \"\\\$@\"
EOF"
        sudo chmod +x "$WRAPPER_PATH"
    fi

    # Verify installation
    if command_exists openasst; then
        success "Command 'openasst' created"
    else
        # Method 3: Add to PATH via shell profile
        warn "Adding openasst to PATH..."
        SHELL_PROFILE=""
        [ -f "$HOME/.bashrc" ] && SHELL_PROFILE="$HOME/.bashrc"
        [ -f "$HOME/.zshrc" ] && SHELL_PROFILE="$HOME/.zshrc"

        if [ -n "$SHELL_PROFILE" ]; then
            echo "alias openasst='node $CLI_PATH'" >> "$SHELL_PROFILE"
            success "Added openasst alias to $SHELL_PROFILE"
        fi
    fi
    echo ""

    # Add nvm to shell profile if needed
    if [ -d "$NVM_DIR" ]; then
        info "Adding nvm to shell profile..."
        SHELL_PROFILE=""
        if [ -f "$HOME/.bashrc" ]; then
            SHELL_PROFILE="$HOME/.bashrc"
        elif [ -f "$HOME/.zshrc" ]; then
            SHELL_PROFILE="$HOME/.zshrc"
        elif [ -f "$HOME/.profile" ]; then
            SHELL_PROFILE="$HOME/.profile"
        fi

        if [ -n "$SHELL_PROFILE" ]; then
            # Check if nvm is already in profile
            if ! grep -q "NVM_DIR" "$SHELL_PROFILE"; then
                echo '' >> "$SHELL_PROFILE"
                echo '# NVM (Node Version Manager)' >> "$SHELL_PROFILE"
                echo 'export NVM_DIR="$HOME/.nvm"' >> "$SHELL_PROFILE"
                echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> "$SHELL_PROFILE"
            fi
        fi
    fi

    # Done
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  OpenAsst installed successfully! 🎉${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""

    # Final verification
    info "Verifying installation..."
    if openasst --version >/dev/null 2>&1; then
        success "openasst $(openasst --version) is ready!"
    else
        warn "Please restart your terminal or run: source ~/.bashrc"
    fi
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

    # Remind user to reload shell if nvm was used
    if [ -d "$NVM_DIR" ]; then
        warn "If 'openasst' command not found, run: source ~/.bashrc (or restart terminal)"
    fi
}

# Run main
main
