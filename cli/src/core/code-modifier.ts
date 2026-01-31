import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { Config } from '../types';
import { Logger } from '../utils/logger';

export interface CodeChange {
  file: string;
  description: string;
  oldCode: string;
  newCode: string;
  lineStart: number;
  lineEnd: number;
}

export interface CodeFixRequest {
  error: string;
  file?: string;
  context?: string;
  stackTrace?: string;
}

export class CodeModifier {
  private client: Anthropic;
  private model: string;

  constructor(private config: Config) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.model = config.model || 'claude-3-5-sonnet-20241022';
  }

  /**
   * Analyze error and suggest code fix
   */
  async analyzeAndSuggestFix(
    request: CodeFixRequest,
    projectPath: string
  ): Promise<CodeChange[]> {
    // Read related file
    let fileContent = '';
    if (request.file && fs.existsSync(request.file)) {
      fileContent = fs.readFileSync(request.file, 'utf-8');
    }

    const prompt = this.buildAnalysisPrompt(request, fileContent);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return [];
    }

    return this.parseCodeChanges(content.text);
  }

  private buildAnalysisPrompt(
    request: CodeFixRequest,
    fileContent: string
  ): string {
    return `You are a professional code debugging expert. Please analyze the following error and provide fix suggestions.

## Error Message
${request.error}

${request.stackTrace ? `## Stack Trace\n${request.stackTrace}` : ''}

${request.file ? `## Related File: ${request.file}` : ''}

${fileContent ? `## File Content\n\`\`\`\n${fileContent.substring(0, 5000)}\n\`\`\`` : ''}

${request.context ? `## Context\n${request.context}` : ''}

Please analyze the error cause and provide code fix suggestions. Return in JSON format:
{
  "analysis": "Error analysis",
  "changes": [
    {
      "file": "File path",
      "description": "Change description",
      "oldCode": "Original code snippet",
      "newCode": "Modified code",
      "lineStart": 10,
      "lineEnd": 15
    }
  ]
}

Important:
- Only modify necessary code
- Keep code style consistent
- Provide clear change descriptions`;
  }

  private parseCodeChanges(text: string): CodeChange[] {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.changes || [];
      }
    } catch (e) {}
    return [];
  }

  /**
   * Show code change preview
   */
  showChangePreview(change: CodeChange): void {
    Logger.info(`\nFile: ${change.file}`);
    Logger.info(`Description: ${change.description}`);
    console.log('\n--- Original Code ---');
    console.log('\x1b[31m' + change.oldCode + '\x1b[0m');
    console.log('\n--- New Code ---');
    console.log('\x1b[32m' + change.newCode + '\x1b[0m');
  }

  /**
   * Apply code change (requires user confirmation)
   */
  applyChange(change: CodeChange): boolean {
    if (!fs.existsSync(change.file)) {
      Logger.error(`File not found: ${change.file}`);
      return false;
    }

    // Backup original file
    const backupPath = change.file + '.bak';
    fs.copyFileSync(change.file, backupPath);

    try {
      const content = fs.readFileSync(change.file, 'utf-8');
      const newContent = content.replace(change.oldCode, change.newCode);

      if (content === newContent) {
        Logger.warning('No matching code snippet found');
        return false;
      }

      fs.writeFileSync(change.file, newContent);
      Logger.success(`Modified: ${change.file}`);

      // Delete backup
      fs.unlinkSync(backupPath);
      return true;
    } catch (e) {
      // Restore backup
      fs.copyFileSync(backupPath, change.file);
      fs.unlinkSync(backupPath);
      Logger.error(`Modification failed: ${(e as Error).message}`);
      return false;
    }
  }

  /**
   * Rollback changes
   */
  rollback(filePath: string): boolean {
    const backupPath = filePath + '.bak';
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, filePath);
      fs.unlinkSync(backupPath);
      Logger.success('Rolled back');
      return true;
    }
    Logger.error('No backup file');
    return false;
  }
}
