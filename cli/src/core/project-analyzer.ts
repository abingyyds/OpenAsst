import * as fs from 'fs';
import * as path from 'path';
import { CommandExecutor } from './executor';

export interface ProjectInfo {
  name: string;
  type: ProjectType;
  language: string;
  framework?: string;
  packageManager?: string;
  configFiles: ConfigFile[];
  dependencies: string[];
  scripts: { [key: string]: string };
  ports: number[];
  envVars: string[];
}

export interface ConfigFile {
  path: string;
  type: ConfigFileType;
  content?: any;
}

export type ProjectType =
  | 'nodejs' | 'python' | 'go' | 'rust' | 'java'
  | 'php' | 'ruby' | 'docker' | 'static' | 'unknown';

export type ConfigFileType =
  | 'package.json' | 'requirements.txt' | 'go.mod' | 'Cargo.toml'
  | 'pom.xml' | 'composer.json' | 'Gemfile' | 'Dockerfile'
  | '.env' | 'config.json' | 'config.yaml' | 'nginx.conf' | 'other';

export class ProjectAnalyzer {
  private executor: CommandExecutor;

  constructor() {
    this.executor = new CommandExecutor();
  }

  /**
   * Analyze project directory
   */
  async analyze(projectPath: string): Promise<ProjectInfo> {
    const absPath = path.resolve(projectPath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`Project path not found: ${absPath}`);
    }

    const name = path.basename(absPath);
    const configFiles = this.findConfigFiles(absPath);
    const type = this.detectProjectType(configFiles);
    const language = this.detectLanguage(type);
    const framework = await this.detectFramework(absPath, type);
    const packageManager = this.detectPackageManager(configFiles);
    const dependencies = await this.extractDependencies(absPath, type);
    const scripts = this.extractScripts(absPath, type);
    const ports = this.detectPorts(absPath, configFiles);
    const envVars = this.extractEnvVars(absPath);

    return {
      name,
      type,
      language,
      framework,
      packageManager,
      configFiles,
      dependencies,
      scripts,
      ports,
      envVars
    };
  }

  /**
   * Find config files
   */
  private findConfigFiles(projectPath: string): ConfigFile[] {
    const configPatterns: { pattern: string; type: ConfigFileType }[] = [
      { pattern: 'package.json', type: 'package.json' },
      { pattern: 'requirements.txt', type: 'requirements.txt' },
      { pattern: 'go.mod', type: 'go.mod' },
      { pattern: 'Cargo.toml', type: 'Cargo.toml' },
      { pattern: 'pom.xml', type: 'pom.xml' },
      { pattern: 'composer.json', type: 'composer.json' },
      { pattern: 'Gemfile', type: 'Gemfile' },
      { pattern: 'Dockerfile', type: 'Dockerfile' },
      { pattern: '.env', type: '.env' },
      { pattern: '.env.example', type: '.env' },
      { pattern: 'config.json', type: 'config.json' },
      { pattern: 'config.yaml', type: 'config.yaml' },
      { pattern: 'config.yml', type: 'config.yaml' },
    ];

    const found: ConfigFile[] = [];

    for (const { pattern, type } of configPatterns) {
      const filePath = path.join(projectPath, pattern);
      if (fs.existsSync(filePath)) {
        found.push({ path: filePath, type });
      }
    }

    return found;
  }

  /**
   * Detect project type
   */
  private detectProjectType(configFiles: ConfigFile[]): ProjectType {
    const types = configFiles.map(f => f.type);

    if (types.includes('package.json')) return 'nodejs';
    if (types.includes('requirements.txt')) return 'python';
    if (types.includes('go.mod')) return 'go';
    if (types.includes('Cargo.toml')) return 'rust';
    if (types.includes('pom.xml')) return 'java';
    if (types.includes('composer.json')) return 'php';
    if (types.includes('Gemfile')) return 'ruby';
    if (types.includes('Dockerfile')) return 'docker';

    return 'unknown';
  }

  /**
   * Detect programming language
   */
  private detectLanguage(type: ProjectType): string {
    const langMap: { [key in ProjectType]: string } = {
      nodejs: 'JavaScript/TypeScript',
      python: 'Python',
      go: 'Go',
      rust: 'Rust',
      java: 'Java',
      php: 'PHP',
      ruby: 'Ruby',
      docker: 'Docker',
      static: 'HTML/CSS',
      unknown: 'Unknown'
    };
    return langMap[type];
  }

  /**
   * Detect framework
   */
  private async detectFramework(projectPath: string, type: ProjectType): Promise<string | undefined> {
    if (type === 'nodejs') {
      const pkgPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps['next']) return 'Next.js';
        if (deps['nuxt']) return 'Nuxt.js';
        if (deps['react']) return 'React';
        if (deps['vue']) return 'Vue.js';
        if (deps['express']) return 'Express';
        if (deps['fastify']) return 'Fastify';
        if (deps['nest']) return 'NestJS';
      }
    }

    if (type === 'python') {
      const reqPath = path.join(projectPath, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const content = fs.readFileSync(reqPath, 'utf-8');
        if (content.includes('django')) return 'Django';
        if (content.includes('flask')) return 'Flask';
        if (content.includes('fastapi')) return 'FastAPI';
      }
    }

    return undefined;
  }

  /**
   * Detect package manager
   */
  private detectPackageManager(configFiles: ConfigFile[]): string | undefined {
    const types = configFiles.map(f => f.type);

    if (types.includes('package.json')) {
      // Check lock files
      for (const cf of configFiles) {
        const dir = path.dirname(cf.path);
        if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
        if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
        if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm';
      }
      return 'npm';
    }

    if (types.includes('requirements.txt')) return 'pip';
    if (types.includes('go.mod')) return 'go mod';
    if (types.includes('Cargo.toml')) return 'cargo';

    return undefined;
  }

  /**
   * Extract dependencies
   */
  private async extractDependencies(projectPath: string, type: ProjectType): Promise<string[]> {
    const deps: string[] = [];

    if (type === 'nodejs') {
      const pkgPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        deps.push(...Object.keys(pkg.dependencies || {}));
      }
    }

    return deps.slice(0, 20); // Limit count
  }

  /**
   * Extract scripts
   */
  private extractScripts(projectPath: string, type: ProjectType): { [key: string]: string } {
    if (type === 'nodejs') {
      const pkgPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return pkg.scripts || {};
      }
    }
    return {};
  }

  /**
   * Detect ports
   */
  private detectPorts(projectPath: string, configFiles: ConfigFile[]): number[] {
    const ports: number[] = [];
    const portRegex = /(?:PORT|port)[=:]\s*(\d+)/g;

    for (const cf of configFiles) {
      if (fs.existsSync(cf.path)) {
        const content = fs.readFileSync(cf.path, 'utf-8');
        let match;
        while ((match = portRegex.exec(content)) !== null) {
          ports.push(parseInt(match[1]));
        }
      }
    }

    return [...new Set(ports)];
  }

  /**
   * Extract environment variables
   */
  private extractEnvVars(projectPath: string): string[] {
    const envVars: string[] = [];
    const envFiles = ['.env.example', '.env.sample', '.env'];

    for (const envFile of envFiles) {
      const envPath = path.join(projectPath, envFile);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
          if (match) {
            envVars.push(match[1]);
          }
        }
        break;
      }
    }

    return envVars;
  }
}
