#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

// Create config directory
const configDir = path.join(os.homedir(), '.openasst-cli');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
  console.log('Created config directory: ~/.openasst-cli');
}

console.log('\n✅ OpenAsst CLI installed successfully!');
console.log('\nQuick start:');
console.log('  1. Run "openasst config" to set up your API key');
console.log('  2. Run "openasst do <task>" to execute tasks\n');
