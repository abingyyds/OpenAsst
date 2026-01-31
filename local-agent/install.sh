#!/bin/bash
# OpenAsst Local Agent 安装脚本 (macOS/Linux)

set -e

INSTALL_DIR="$HOME/.openasst"
AGENT_URL="https://raw.githubusercontent.com/abingyyds/OpenAsst/main/local-agent/agent.js"

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   OpenAsst Local Agent 安装程序       ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js"
    echo "  访问: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "[错误] Node.js 版本过低，需要 v16 或更高"
    exit 1
fi

echo "[1/3] 创建安装目录..."
mkdir -p "$INSTALL_DIR"

echo "[2/3] 下载代理程序..."
curl -fsSL "$AGENT_URL" -o "$INSTALL_DIR/agent.js"
chmod +x "$INSTALL_DIR/agent.js"

echo "[3/3] 创建启动脚本..."
cat > "$INSTALL_DIR/start.sh" << 'EOF'
#!/bin/bash
cd "$HOME/.openasst"
node agent.js
EOF
chmod +x "$INSTALL_DIR/start.sh"

echo ""
echo "  ✓ 安装完成！"
echo ""
echo "  启动代理: ~/.openasst/start.sh"
echo "  或运行:   node ~/.openasst/agent.js"
echo ""

# 询问是否立即启动
read -p "  是否立即启动代理? [Y/n] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    exec "$INSTALL_DIR/start.sh"
fi
