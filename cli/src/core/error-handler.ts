import Anthropic from '@anthropic-ai/sdk';
import { Config, ErrorContext, ErrorSolution, ExecutionLog } from '../types';

export class ErrorHandler {
  private client: Anthropic;
  private model: string;

  constructor(config: Config) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.model = config.model || 'claude-3-5-sonnet-20241022';
  }

  /**
   * Analyze error and generate fix solution
   */
  async analyzeError(context: ErrorContext): Promise<ErrorSolution> {
    const prompt = this.buildErrorAnalysisPrompt(context);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('AI response format error');
    }

    return this.parseErrorSolution(content.text);
  }

  private buildErrorAnalysisPrompt(context: ErrorContext): string {
    return `You are a professional Linux system administrator and troubleshooting expert. Please analyze the following command execution error and provide a fix solution.

## Error Info

**Executed command**: ${context.command}

**Exit code**: ${context.exitCode}

**Output/Error message**:
\`\`\`
${context.output.substring(0, 2000)}
\`\`\`

## System Info
${context.systemInfo}

## Previously executed commands
${context.previousCommands.slice(-5).map((cmd, i) => `${i + 1}. ${cmd}`).join('\n')}

${context.projectContext ? `## Project Context\n${context.projectContext}` : ''}

## Please provide

1. **Error analysis**: Detailed analysis of error cause
2. **Fix commands**: Provide directly executable fix commands
3. **Explanation**: Explain why these commands can fix the problem
4. **Confidence**: Confidence score from 0-100
5. **Alternative solutions**: Provide alternatives if main solution fails

Please return in JSON format:
{
  "analysis": "Error cause analysis",
  "fixCommands": ["fix command 1", "fix command 2"],
  "explanation": "Fix solution explanation",
  "confidence": 85,
  "alternativeSolutions": [["alternative 1 commands"], ["alternative 2 commands"]]
}

**Important rules**:
- Fix commands must be complete and directly executable
- Prefer simplest and safest fix solution
- Include sudo if needed
- Consider differences between Linux distributions`;
  }

  private parseErrorSolution(text: string): ErrorSolution {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Parse failed, try to extract key info
    }

    // Fallback: extract info from text
    return {
      analysis: text,
      fixCommands: [],
      explanation: 'Unable to parse AI response, please analyze manually',
      confidence: 0,
      alternativeSolutions: []
    };
  }

  /**
   * Detect common error patterns and quick fix
   */
  detectCommonError(log: ExecutionLog): ErrorSolution | null {
    const output = log.output + (log.error || '');
    const outputLower = output.toLowerCase();

    // Permission error
    if (outputLower.includes('permission denied') ||
        outputLower.includes('operation not permitted')) {
      return {
        analysis: 'Permission denied error',
        fixCommands: [`sudo ${log.command}`],
        explanation: 'Command requires admin privileges, adding sudo prefix',
        confidence: 90
      };
    }

    // Command not found
    if (outputLower.includes('command not found') ||
        outputLower.includes('not found')) {
      const cmdName = log.command.split(' ')[0];
      return {
        analysis: `Command ${cmdName} not installed`,
        fixCommands: this.getSuggestedInstallCommands(cmdName),
        explanation: `Need to install ${cmdName} first`,
        confidence: 80
      };
    }

    // Package manager locked
    if (outputLower.includes('could not get lock') ||
        outputLower.includes('dpkg was interrupted')) {
      return {
        analysis: 'Package manager locked or previous operation interrupted',
        fixCommands: [
          'sudo rm -f /var/lib/dpkg/lock-frontend',
          'sudo rm -f /var/lib/dpkg/lock',
          'sudo dpkg --configure -a'
        ],
        explanation: 'Clear package manager lock files and fix interrupted config',
        confidence: 85
      };
    }

    // Port in use
    const portMatch = output.match(/address already in use.*:(\d+)/i) ||
                      output.match(/port (\d+).*already in use/i);
    if (portMatch) {
      const port = portMatch[1];
      return {
        analysis: `Port ${port} is already in use`,
        fixCommands: [
          `sudo lsof -i :${port}`,
          `sudo kill $(sudo lsof -t -i :${port})`
        ],
        explanation: `Find and terminate process using port ${port}`,
        confidence: 85
      };
    }

    // Disk space insufficient
    if (outputLower.includes('no space left on device') ||
        outputLower.includes('disk quota exceeded')) {
      return {
        analysis: 'Disk space insufficient',
        fixCommands: [
          'df -h',
          'sudo du -sh /var/log/*',
          'sudo journalctl --vacuum-time=3d'
        ],
        explanation: 'Check disk usage and clean up log files',
        confidence: 80
      };
    }

    // Network error
    if (outputLower.includes('could not resolve host') ||
        outputLower.includes('network is unreachable') ||
        outputLower.includes('connection refused')) {
      return {
        analysis: 'Network connection issue',
        fixCommands: [
          'ping -c 3 8.8.8.8',
          'cat /etc/resolv.conf',
          'sudo systemctl restart NetworkManager || sudo systemctl restart networking'
        ],
        explanation: 'Check network connection and DNS config',
        confidence: 70
      };
    }

    // npm/yarn errors
    if (outputLower.includes('eacces') && outputLower.includes('npm')) {
      return {
        analysis: 'npm permission error',
        fixCommands: [
          'sudo chown -R $(whoami) ~/.npm',
          'sudo chown -R $(whoami) /usr/local/lib/node_modules'
        ],
        explanation: 'Fix npm directory permissions',
        confidence: 85
      };
    }

    if (outputLower.includes('enoent') && outputLower.includes('package.json')) {
      return {
        analysis: 'package.json not found',
        fixCommands: ['npm init -y'],
        explanation: 'Initialize a new package.json file',
        confidence: 90
      };
    }

    // Python/pip errors
    if (outputLower.includes('modulenotfounderror') ||
        outputLower.includes('no module named')) {
      const moduleMatch = output.match(/no module named ['"']?(\w+)['"']?/i);
      const moduleName = moduleMatch ? moduleMatch[1] : 'unknown';
      return {
        analysis: `Python module ${moduleName} not installed`,
        fixCommands: [`pip install ${moduleName}`, `pip3 install ${moduleName}`],
        explanation: `Install the missing Python module`,
        confidence: 85
      };
    }

    // Docker errors
    if (outputLower.includes('docker daemon') ||
        outputLower.includes('cannot connect to the docker')) {
      return {
        analysis: 'Docker daemon not running',
        fixCommands: [
          'sudo systemctl start docker',
          'sudo systemctl enable docker'
        ],
        explanation: 'Start the Docker daemon service',
        confidence: 90
      };
    }

    // Git errors
    if (outputLower.includes('not a git repository')) {
      return {
        analysis: 'Not in a git repository',
        fixCommands: ['git init'],
        explanation: 'Initialize a new git repository',
        confidence: 95
      };
    }

    if (outputLower.includes('failed to push') ||
        outputLower.includes('rejected')) {
      return {
        analysis: 'Git push rejected - remote has changes',
        fixCommands: ['git pull --rebase', 'git push'],
        explanation: 'Pull remote changes first, then push',
        confidence: 80
      };
    }

    // Memory errors
    if (outputLower.includes('out of memory') ||
        outputLower.includes('cannot allocate memory') ||
        outputLower.includes('killed')) {
      return {
        analysis: 'Out of memory error',
        fixCommands: [
          'free -h',
          'sudo sync && sudo sysctl -w vm.drop_caches=3'
        ],
        explanation: 'Check memory usage and clear cache',
        confidence: 75
      };
    }

    // SSL/TLS errors
    if (outputLower.includes('ssl') &&
        (outputLower.includes('certificate') || outputLower.includes('verify'))) {
      return {
        analysis: 'SSL certificate verification failed',
        fixCommands: [
          'sudo update-ca-certificates',
          'export NODE_TLS_REJECT_UNAUTHORIZED=0'
        ],
        explanation: 'Update CA certificates or disable verification temporarily',
        confidence: 70
      };
    }

    // Timeout errors
    if (outputLower.includes('timeout') || outputLower.includes('timed out')) {
      return {
        analysis: 'Operation timed out',
        fixCommands: [],
        explanation: 'The operation took too long. Check network or increase timeout.',
        confidence: 60
      };
    }

    return null;
  }

  private getSuggestedInstallCommands(cmdName: string): string[] {
    const packageMap: { [key: string]: string[] } = {
      // Node.js ecosystem
      'node': ['curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs'],
      'npm': ['sudo apt-get install -y npm || sudo yum install -y npm'],
      'yarn': ['npm install -g yarn'],
      'pnpm': ['npm install -g pnpm'],
      'npx': ['npm install -g npx'],

      // Version control
      'git': ['sudo apt-get install -y git || sudo yum install -y git || brew install git'],

      // Containers
      'docker': ['curl -fsSL https://get.docker.com | sudo sh'],
      'docker-compose': ['sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose && sudo chmod +x /usr/local/bin/docker-compose'],

      // Python
      'python3': ['sudo apt-get install -y python3 || sudo yum install -y python3 || brew install python3'],
      'python': ['sudo apt-get install -y python3 || sudo yum install -y python3'],
      'pip': ['sudo apt-get install -y python3-pip || sudo yum install -y python3-pip'],
      'pip3': ['sudo apt-get install -y python3-pip || sudo yum install -y python3-pip'],
      'pipenv': ['pip3 install pipenv'],
      'poetry': ['pip3 install poetry'],

      // Network tools
      'curl': ['sudo apt-get install -y curl || sudo yum install -y curl'],
      'wget': ['sudo apt-get install -y wget || sudo yum install -y wget'],
      'netstat': ['sudo apt-get install -y net-tools || sudo yum install -y net-tools'],
      'ss': ['sudo apt-get install -y iproute2 || sudo yum install -y iproute'],
      'nmap': ['sudo apt-get install -y nmap || sudo yum install -y nmap'],

      // Build tools
      'make': ['sudo apt-get install -y build-essential || sudo yum groupinstall -y "Development Tools"'],
      'gcc': ['sudo apt-get install -y build-essential || sudo yum install -y gcc'],
      'g++': ['sudo apt-get install -y build-essential || sudo yum install -y gcc-c++'],
      'cmake': ['sudo apt-get install -y cmake || sudo yum install -y cmake'],

      // Databases
      'mysql': ['sudo apt-get install -y mysql-client || sudo yum install -y mysql'],
      'psql': ['sudo apt-get install -y postgresql-client || sudo yum install -y postgresql'],
      'redis-cli': ['sudo apt-get install -y redis-tools || sudo yum install -y redis'],
      'mongo': ['sudo apt-get install -y mongodb-clients'],

      // Other languages
      'go': ['sudo apt-get install -y golang || brew install go'],
      'rust': ['curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh'],
      'cargo': ['curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh'],
      'java': ['sudo apt-get install -y default-jdk || sudo yum install -y java-11-openjdk'],
      'javac': ['sudo apt-get install -y default-jdk || sudo yum install -y java-11-openjdk-devel'],

      // Utilities
      'jq': ['sudo apt-get install -y jq || sudo yum install -y jq || brew install jq'],
      'htop': ['sudo apt-get install -y htop || sudo yum install -y htop'],
      'vim': ['sudo apt-get install -y vim || sudo yum install -y vim'],
      'nano': ['sudo apt-get install -y nano || sudo yum install -y nano'],
      'tree': ['sudo apt-get install -y tree || sudo yum install -y tree'],
      'unzip': ['sudo apt-get install -y unzip || sudo yum install -y unzip'],
      'zip': ['sudo apt-get install -y zip || sudo yum install -y zip'],

      // Web servers
      'nginx': ['sudo apt-get install -y nginx || sudo yum install -y nginx'],
      'apache2': ['sudo apt-get install -y apache2 || sudo yum install -y httpd'],

      // SSL
      'certbot': ['sudo apt-get install -y certbot || sudo yum install -y certbot'],
      'openssl': ['sudo apt-get install -y openssl || sudo yum install -y openssl'],
    };

    return packageMap[cmdName] || [
      `sudo apt-get install -y ${cmdName} || sudo yum install -y ${cmdName} || brew install ${cmdName}`
    ];
  }
}
