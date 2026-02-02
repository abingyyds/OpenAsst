#!/bin/bash

set -e

echo "================================"
echo "  OpenAsst CLI Installer"
echo "================================"
echo ""

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

echo "Detected: $OS $ARCH"

# Check Node.js
check_node() {
  if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 16 ]; then
      echo "✓ Node.js $(node -v) found"
      return 0
    fi
  fi
  return 1
}

# Install Node.js via nvm (fallback for old systems)
install_node_nvm() {
  echo "Installing Node.js via nvm..."
  export NVM_DIR="$HOME/.nvm"

  if [ ! -d "$NVM_DIR" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi

  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install 16
  nvm use 16
  nvm alias default 16
}

# Install Node.js
install_node() {
  echo "Installing Node.js..."

  case "$OS" in
    Linux)
      INSTALL_SUCCESS=false

      if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash - && \
        sudo apt-get install -y nodejs && INSTALL_SUCCESS=true
      elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo bash - && \
        sudo yum install -y nodejs && INSTALL_SUCCESS=true
      elif command -v dnf &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo bash - && \
        sudo dnf install -y nodejs && INSTALL_SUCCESS=true
      fi

      # Verify installation
      if [ "$INSTALL_SUCCESS" = true ] && check_node; then
        return 0
      fi

      # Fallback to nvm
      echo "System package manager failed, trying nvm..."
      install_node_nvm
      ;;
    Darwin)
      if command -v brew &> /dev/null; then
        brew install node
      else
        install_node_nvm
      fi
      ;;
    *)
      install_node_nvm
      ;;
  esac
}

# Main installation
main() {
  # Load nvm if available
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  # Check/Install Node.js (non-interactive)
  if ! check_node; then
    echo "Node.js >= 16 required, installing..."
    install_node
    # Reload nvm after installation
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  fi

  # Verify Node.js is available
  if ! check_node; then
    echo "ERROR: Failed to install Node.js"
    exit 1
  fi

  # Install OpenAsst CLI
  echo ""
  echo "Installing OpenAsst CLI..."
  npm install -g openasst-cli@latest 2>/dev/null || {
    # If npm registry fails, install from GitHub
    echo "Installing from GitHub..."
    TEMP_DIR=$(mktemp -d)
    git clone --depth 1 https://github.com/abingyyds/OpenAsst.git "$TEMP_DIR"
    cd "$TEMP_DIR/cli"
    npm install
    npm run build
    npm link
    cd -
    rm -rf "$TEMP_DIR"
  }

  echo ""
  echo "================================"
  echo "  Installation Complete!"
  echo "================================"
  echo ""
  echo "Next steps:"
  echo "  1. openasst config    # Set up API key"
  echo "  2. openasst do <task> # Execute tasks"
  echo ""
}

main
