#!/bin/bash
# OpenAsst Local Agent Installation Script (macOS/Linux)

set -e

INSTALL_DIR="$HOME/.openasst"
AGENT_URL="https://raw.githubusercontent.com/abingyyds/OpenAsst/main/local-agent/agent.js"

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   OpenAsst Local Agent Installer      ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[Error] Node.js not found, please install Node.js first"
    echo "  Visit: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "[Error] Node.js version too low, requires v16 or higher"
    exit 1
fi

echo "[1/3] Creating installation directory..."
mkdir -p "$INSTALL_DIR"

echo "[2/3] Downloading agent..."
curl -fsSL "$AGENT_URL" -o "$INSTALL_DIR/agent.js"
chmod +x "$INSTALL_DIR/agent.js"

echo "[3/3] Creating startup script..."
cat > "$INSTALL_DIR/start.sh" << 'EOF'
#!/bin/bash
cd "$HOME/.openasst"
node agent.js
EOF
chmod +x "$INSTALL_DIR/start.sh"

echo ""
echo "  ✓ Installation complete!"
echo ""
echo "  Start agent: ~/.openasst/start.sh"
echo "  Or run:      node ~/.openasst/agent.js"
echo ""

# Ask whether to start immediately
read -p "  Start agent now? [Y/n] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    exec "$INSTALL_DIR/start.sh"
fi
