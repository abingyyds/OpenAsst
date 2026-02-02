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

# Install Node.js
install_node() {
  echo "Installing Node.js..."

  case "$OS" in
    Linux)
      if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
      elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs
      elif command -v dnf &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo dnf install -y nodejs
      else
        echo "Please install Node.js manually: https://nodejs.org"
        exit 1
      fi
      ;;
    Darwin)
      if command -v brew &> /dev/null; then
        brew install node
      else
        echo "Please install Homebrew first: https://brew.sh"
        exit 1
      fi
      ;;
    *)
      echo "Unsupported OS. Please install Node.js manually."
      exit 1
      ;;
  esac
}

# Main installation
main() {
  # Check/Install Node.js
  if ! check_node; then
    echo "Node.js >= 16 required"
    read -p "Install Node.js? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
      install_node
    else
      exit 1
    fi
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
