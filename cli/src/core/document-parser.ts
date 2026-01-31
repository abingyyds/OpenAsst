import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { DeploySource } from '../types';

export interface ParsedDocument {
  title: string;
  content: string;
  codeBlocks: CodeBlock[];
  sections: DocumentSection[];
}

export interface CodeBlock {
  language: string;
  code: string;
  context: string;  // Description text before code block
}

export interface DocumentSection {
  title: string;
  content: string;
  level: number;
}

export class DocumentParser {
  /**
   * Fetch document content from various sources
   */
  async fetchDocument(source: DeploySource): Promise<string> {
    switch (source.type) {
      case 'url':
      case 'github':
        return this.fetchFromUrl(source.content);
      case 'file':
        return this.readFromFile(source.content);
      case 'text':
        return source.content;
      default:
        throw new Error(`Unsupported document source type: ${source.type}`);
    }
  }

  /**
   * Fetch content from URL (supports GitHub raw links)
   */
  private async fetchFromUrl(url: string): Promise<string> {
    // Convert GitHub link to raw link
    const rawUrl = this.convertToRawUrl(url);

    return new Promise((resolve, reject) => {
      const protocol = rawUrl.startsWith('https') ? https : http;

      const request = protocol.get(rawUrl, {
        headers: {
          'User-Agent': 'OpenAsst-CLI/1.0',
          'Accept': 'text/plain, text/markdown, */*'
        }
      }, (response) => {
        // Handle redirect
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.fetchFromUrl(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP error: ${response.statusCode}`));
          return;
        }

        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
        response.on('error', reject);
      });

      request.on('error', reject);
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Convert GitHub link to raw link
   */
  private convertToRawUrl(url: string): string {
    // GitHub blob link to raw
    if (url.includes('github.com') && url.includes('/blob/')) {
      return url
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/');
    }

    // Gist link to raw
    if (url.includes('gist.github.com') && !url.includes('/raw/')) {
      return url + '/raw';
    }

    return url;
  }

  /**
   * Read content from file
   */
  private readFromFile(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  /**
   * Parse document content
   */
  parseDocument(content: string): ParsedDocument {
    const codeBlocks = this.extractCodeBlocks(content);
    const sections = this.extractSections(content);
    const title = this.extractTitle(content);

    return {
      title,
      content,
      codeBlocks,
      sections
    };
  }

  /**
   * Extract code blocks
   */
  private extractCodeBlocks(content: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;

    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const startIndex = match.index;
      const contextStart = Math.max(0, startIndex - 200);
      const context = content.substring(contextStart, startIndex).trim();

      blocks.push({
        language: match[1] || 'bash',
        code: match[2].trim(),
        context: context.split('\n').slice(-3).join('\n')
      });
    }

    return blocks;
  }

  /**
   * Extract sections
   */
  private extractSections(content: string): DocumentSection[] {
    const sections: DocumentSection[] = [];
    const sectionRegex = /^(#{1,6})\s+(.+)$/gm;

    let match;
    let lastIndex = 0;
    const matches: { level: number; title: string; index: number }[] = [];

    while ((match = sectionRegex.exec(content)) !== null) {
      matches.push({
        level: match[1].length,
        title: match[2].trim(),
        index: match.index
      });
    }

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const nextIndex = matches[i + 1]?.index || content.length;
      const sectionContent = content.substring(current.index, nextIndex).trim();

      sections.push({
        title: current.title,
        content: sectionContent,
        level: current.level
      });
    }

    return sections;
  }

  /**
   * Extract title
   */
  private extractTitle(content: string): string {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1].trim() : 'Untitled Document';
  }

  /**
   * Extract install/deploy related commands
   */
  extractDeployCommands(parsed: ParsedDocument): string[] {
    const commands: string[] = [];
    const deployKeywords = [
      'install', 'setup', 'deploy', 'build', 'start', 'run'
    ];

    for (const block of parsed.codeBlocks) {
      // Check code block language
      if (['bash', 'sh', 'shell', 'zsh', ''].includes(block.language)) {
        // Check if context contains deploy related keywords
        const contextLower = block.context.toLowerCase();
        const isDeployRelated = deployKeywords.some(kw =>
          contextLower.includes(kw)
        );

        if (isDeployRelated || block.language === 'bash') {
          // Split multi-line commands
          const lines = block.code.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));

          commands.push(...lines);
        }
      }
    }

    return commands;
  }
}
