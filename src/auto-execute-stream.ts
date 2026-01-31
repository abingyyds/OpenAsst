import { Response } from 'express';
import { ConnectionManager } from './connection-manager';
import { ClaudeAssistant } from './claude-assistant';
import { MarketplaceManager } from './marketplace-manager';
import { SearchService } from './search-service';
import { SessionManager } from './session-manager';
import { ServerConfig } from './types';
import axios from 'axios';

const KNOWLEDGE_BASE_URL = 'https://raw.githubusercontent.com/abingyyds/OpenAsst/main/knowledge';

export class AutoExecuteStream {
  private sessionManager?: SessionManager;

  constructor(
    private connectionManager: ConnectionManager,
    private assistant: ClaudeAssistant,
    private res: Response,
    private marketplaceManager: MarketplaceManager,
    private searchService?: SearchService,
    sessionManager?: SessionManager
  ) {
    this.sessionManager = sessionManager;
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  }

  // 从GitHub获取知识库
  private async fetchKnowledgeBase(query: string): Promise<any[]> {
    try {
      // 获取知识库索引
      const indexUrl = `${KNOWLEDGE_BASE_URL}/index.json`;
      const indexRes = await axios.get(indexUrl, { timeout: 5000 });
      const index = indexRes.data;

      const results: any[] = [];
      const queryLower = query.toLowerCase();

      // 遍历所有知识库文件
      for (const file of index.files || []) {
        try {
          const contentUrl = `${KNOWLEDGE_BASE_URL}/${file}`;
          const contentRes = await axios.get(contentUrl, { timeout: 5000 });
          const data = contentRes.data;

          // 搜索 items 数组中的匹配项
          for (const item of data.items || []) {
            const titleMatch = item.title?.toLowerCase().includes(queryLower);
            const keywordMatch = item.keywords?.some((k: string) =>
              k.toLowerCase().includes(queryLower) || queryLower.includes(k.toLowerCase())
            );
            const solutionMatch = item.solution?.toLowerCase().includes(queryLower);

            if (titleMatch || keywordMatch || solutionMatch) {
              results.push({
                name: item.title,
                content: item.solution,
                commands: item.commands || [],
                category: data.category
              });
            }
          }
        } catch (e) {
          console.error(`Failed to fetch ${file}:`, e);
        }
      }

      return results;
    } catch (error) {
      console.error('Failed to fetch knowledge base:', error);
      return [];
    }
  }

  private sendEvent(type: string, data: any) {
    this.res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  }

  // 根据任务类型生成验证命令
  private getVerificationCommand(task: string): string | null {
    const softwareName = task.replace(/安装|install|部署|deploy|配置|setup/gi, '').trim().toLowerCase();

    // 常见软件的验证命令映射
    const verificationMap: { [key: string]: string } = {
      'nodejs': 'node --version && npm --version',
      'node': 'node --version && npm --version',
      'node.js': 'node --version && npm --version',
      'python': 'python3 --version || python --version',
      'python3': 'python3 --version',
      'docker': 'docker --version',
      'nginx': 'nginx -v',
      'mysql': 'mysql --version',
      'redis': 'redis-server --version',
      'git': 'git --version',
      'java': 'java -version',
      'go': 'go version',
      'golang': 'go version',
      'php': 'php --version',
      'ruby': 'ruby --version',
      'rust': 'rustc --version',
      'postgresql': 'psql --version',
      'postgres': 'psql --version',
      'mongodb': 'mongod --version',
    };

    // 尝试匹配
    for (const [key, cmd] of Object.entries(verificationMap)) {
      if (softwareName.includes(key)) {
        return cmd;
      }
    }

    // 通用验证：尝试 which 命令
    const firstWord = softwareName.split(/\s+/)[0];
    if (firstWord && firstWord.length > 1) {
      return `which ${firstWord} && ${firstWord} --version 2>/dev/null || ${firstWord} -v 2>/dev/null || echo "已安装但无法获取版本"`;
    }

    return null;
  }

  // 判断任务是否真正完成
  private async verifyTaskCompletion(
    executor: any,
    task: string,
    plan: any
  ): Promise<{ verified: boolean; output: string }> {
    const verifyCmd = this.getVerificationCommand(task);

    if (!verifyCmd) {
      // Cannot auto-verify - do NOT assume complete, force AI to continue
      return { verified: false, output: 'Cannot auto-verify, task may not be complete' };
    }

    this.sendEvent('status', { message: 'Verifying task completion...' });

    try {
      const log = await executor.execute(verifyCmd);
      const success = log.exitCode === 0 &&
        !log.output.includes('not found') &&
        !log.output.includes('command not found') &&
        !log.output.includes('未安装');

      this.sendEvent('verification', {
        command: verifyCmd,
        output: log.output,
        success
      });

      return { verified: success, output: log.output };
    } catch (error) {
      return { verified: false, output: (error as Error).message };
    }
  }

  async execute(serverConfig: ServerConfig, task: string, systemInfo: any, language?: string) {
    const MAX_ITERATIONS = 20;  // 增加最大迭代次数
    const executionHistory: any[] = [];
    let currentIteration = 0;
    let taskCompleted = false;
    let hasExecutedInstall = false;

    // 追踪失败的方法，避免重复尝试
    const failedApproaches: string[] = [];
    // 缓存搜索结果
    let cachedScripts: any[] = [];
    let cachedKnowledge: any[] = [];
    let cachedInternet: any[] = [];

    this.sendEvent('start', { task, message: 'Starting intelligent execution...' });

    try {
      // 获取执行器
      const executor = await this.connectionManager.getExecutor(serverConfig);

      while (currentIteration < MAX_ITERATIONS && !taskCompleted) {
        currentIteration++;
        this.sendEvent('iteration_start', {
          iteration: currentIteration,
          message: `第 ${currentIteration} 轮分析`
        });

        // 构建历史记录 - 增加输出长度限制
        const historyContext = executionHistory.length > 0
          ? `\n\n之前的执行历史：\n${executionHistory.map((h, i) =>
              `第${i + 1}轮：\n命令：${h.commands?.join('; ') || '无'}\n结果：${h.summary?.substring(0, 500) || '无'}`
            ).join('\n\n')}`
          : '';

        // 提取搜索关键词
        let searchQuery = task
          .replace(/^Execute script:\s*/i, '')
          .replace(/^执行脚本:\s*/i, '')
          .replace(/安装教程|安装指南|installation guide/gi, '')
          .replace(/安装|install|部署|deploy/gi, '')
          .trim();

        // 从错误中提取关键词进行针对性搜索
        let errorKeywords: string[] = [];
        if (executionHistory.length > 0) {
          const lastExecution = executionHistory[executionHistory.length - 1];
          const failedLogs = lastExecution.commandLogs?.filter((log: any) => log.exitCode !== 0) || [];
          for (const log of failedLogs) {
            // 提取错误关键词
            const errorPatterns = [
              /GLIBC_(\d+\.\d+)/gi,
              /node.*version.*(\d+)/gi,
              /npm ERR! (.+)/gi,
              /Error: (.+)/gi,
              /command not found: (\w+)/gi,
              /No such file or directory: (.+)/gi,
              /Permission denied/gi,
            ];
            for (const pattern of errorPatterns) {
              const matches = log.output?.match(pattern);
              if (matches) {
                errorKeywords.push(...matches.slice(0, 2));
              }
            }
            // 记录失败的命令
            if (log.command && !failedApproaches.includes(log.command)) {
              failedApproaches.push(log.command);
            }
          }
        }

        // 每轮都搜索知识库（第一轮完整搜索，后续轮次针对错误搜索）
        let relatedScripts: any[] = cachedScripts;
        let knowledgeBaseResults: any[] = cachedKnowledge;
        let internetSearchResults: any[] = cachedInternet;

        if (currentIteration === 1) {
          // 第一轮：完整搜索
          this.sendEvent('status', { message: '🔍 Searching knowledge sources...' });

          // 搜索脚本市场
          relatedScripts = await this.marketplaceManager.searchTemplates(searchQuery);
          if (relatedScripts.length > 0) {
            this.sendEvent('status', { message: `📜 Found ${relatedScripts.length} scripts` });
          }
          cachedScripts = relatedScripts;

          // 搜索知识库
          knowledgeBaseResults = await this.fetchKnowledgeBase(searchQuery);
          if (knowledgeBaseResults.length > 0) {
            this.sendEvent('status', { message: `📚 Found ${knowledgeBaseResults.length} knowledge entries` });
          }
          cachedKnowledge = knowledgeBaseResults;

          // 搜索互联网
          if (this.searchService) {
            internetSearchResults = await this.searchService.searchInternet(task);
            if (internetSearchResults.length > 0) {
              this.sendEvent('status', { message: `🌐 Found ${internetSearchResults.length} internet results` });
            }
            cachedInternet = internetSearchResults;
          }
        } else if (errorKeywords.length > 0) {
          // 后续轮次：针对错误搜索解决方案
          this.sendEvent('status', { message: '🔍 Searching for error solutions...' });
          const errorQuery = errorKeywords.join(' ');

          // 搜索错误相关的知识
          const errorKnowledge = await this.fetchKnowledgeBase(errorQuery);
          if (errorKnowledge.length > 0) {
            knowledgeBaseResults = [...cachedKnowledge, ...errorKnowledge];
            this.sendEvent('status', { message: `📚 Found ${errorKnowledge.length} error solutions` });
          }

          // 搜索互联网获取错误解决方案
          if (this.searchService && errorKeywords.length > 0) {
            const errorInternetResults = await this.searchService.searchInternet(
              `${searchQuery} ${errorKeywords[0]} solution fix`
            );
            if (errorInternetResults.length > 0) {
              internetSearchResults = [...cachedInternet, ...errorInternetResults];
              this.sendEvent('status', { message: `🌐 Found ${errorInternetResults.length} error solutions online` });
            }
          }
        }

        // AI analysis with extended thinking
        this.sendEvent('status', { message: '🧠 AI deep thinking...' });

        const planPrompt = this.buildPrompt(
          task,
          systemInfo,
          historyContext,
          currentIteration,
          relatedScripts,
          executionHistory,
          hasExecutedInstall,
          internetSearchResults,
          knowledgeBaseResults,
          language,
          failedApproaches
        );
        const planResponse = await this.assistant.chat(planPrompt, [], []);

        // 解析AI响应
        let plan;
        try {
          const jsonMatch = planResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            plan = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('无法解析AI的执行计划');
          }
        } catch (error) {
          this.sendEvent('error', { message: '解析AI响应失败: ' + planResponse });
          break;
        }

        // 发送推理过程
        this.sendEvent('reasoning', {
          iteration: currentIteration,
          reasoning: plan.reasoning
        });

        // 检查AI是否声称任务完成
        if (plan.is_final_step || !plan.commands || plan.commands.length === 0) {
          // 验证任务是否真正完成
          const verification = await this.verifyTaskCompletion(executor, task, plan);

          if (verification.verified) {
            taskCompleted = true;
            this.sendEvent('complete', {
              message: '任务完成',
              reasoning: plan.reasoning,
              verification: verification.output,
              next_steps: plan.next_steps || 'Task completed successfully. You may want to verify the installation or configure additional settings.'
            });
            break;
          } else {
            // 任务未真正完成，强制继续
            this.sendEvent('status', {
              message: '验证失败，任务未完成，继续执行...',
              verification: verification.output
            });

            // 如果AI没有给命令但验证失败，需要重新规划
            if (!plan.commands || plan.commands.length === 0) {
              // 添加一个虚拟的失败记录，让AI知道需要继续
              executionHistory.push({
                iteration: currentIteration,
                reasoning: plan.reasoning,
                commands: [],
                commandLogs: [{
                  command: '验证命令',
                  output: `验证失败: ${verification.output}`,
                  exitCode: 1
                }],
                summary: `AI声称完成但验证失败: ${verification.output}`,
                verificationFailed: true
              });
              continue;
            }
          }
        }

        // 执行命令
        const commandLogs = [];
        for (const commandItem of plan.commands) {
          // Support both old format (string) and new format (object with cmd and explanation)
          const command = typeof commandItem === 'string' ? commandItem : commandItem.cmd;
          const explanation = typeof commandItem === 'object' ? commandItem.explanation : null;

          this.sendEvent('command_start', {
            command,
            explanation: explanation || 'Executing command...'
          });

          try {
            const log = await executor.execute(command);
            commandLogs.push({ ...log, explanation });

            // Truncate output for display (keep full in logs)
            const truncatedOutput = log.output.length > 500
              ? log.output.substring(0, 500) + '\n... (output truncated)'
              : log.output;

            this.sendEvent('command_output', {
              command: log.command,
              output: truncatedOutput,
              exitCode: log.exitCode,
              explanation
            });

            // 检测是否执行了安装命令
            if (this.isInstallCommand(command)) {
              hasExecutedInstall = true;
            }
          } catch (error) {
            const errorLog = {
              command,
              output: (error as Error).message,
              exitCode: 1,
              timestamp: new Date().toISOString(),
              explanation
            };
            commandLogs.push(errorLog);

            // Truncate error output for display
            const truncatedError = errorLog.output.length > 500
              ? errorLog.output.substring(0, 500) + '\n... (error truncated)'
              : errorLog.output;

            this.sendEvent('command_output', {
              command: errorLog.command,
              output: truncatedError,
              exitCode: errorLog.exitCode,
              explanation
            });
          }
        }

        // 保存历史 - 增加输出长度
        const resultSummary = commandLogs.map(log =>
          `命令: ${log.command}\n输出: ${log.output.substring(0, 500)}\n退出码: ${log.exitCode}`
        ).join('\n\n');

        executionHistory.push({
          iteration: currentIteration,
          reasoning: plan.reasoning,
          commands: plan.commands,
          commandLogs,
          summary: resultSummary
        });

        this.sendEvent('iteration_complete', {
          iteration: currentIteration
        });
      }

      // 发送最终总结
      // 保存执行历史到会话，让AI能记住发生了什么
      if (this.sessionManager) {
        // 生成执行摘要
        const executionSummary = executionHistory.map((h, i) => {
          const cmds = h.commands?.join('; ') || '无';
          const result = h.summary?.substring(0, 200) || '无';
          return `第${i + 1}轮: ${cmds} -> ${result}`;
        }).join('\n');

        // 添加系统消息记录执行过程
        this.sessionManager.addMessage(serverConfig.id, {
          role: 'assistant',
          content: `[自动执行任务: ${task}]\n\n执行了 ${currentIteration} 轮操作:\n${executionSummary}\n\n结果: ${taskCompleted ? '成功' : '未完成'}`
        });

        // 保存命令日志
        for (const history of executionHistory) {
          for (const log of history.commandLogs || []) {
            this.sessionManager.addCommandLog(serverConfig.id, {
              timestamp: new Date(),
              command: log.command,
              output: log.output?.substring(0, 500) || '',
              exitCode: log.exitCode || 0
            });
          }
        }
      }

      this.sendEvent('done', {
        success: taskCompleted,
        iterations: currentIteration,
        executionHistory
      });

    } catch (error) {
      this.sendEvent('error', { message: (error as Error).message });
    }

    this.res.end();
  }

  // 检测是否是安装命令
  private isInstallCommand(command: string): boolean {
    const installPatterns = [
      /yum\s+install/i,
      /apt(-get)?\s+install/i,
      /dnf\s+install/i,
      /brew\s+install/i,
      /npm\s+install\s+-g/i,
      /pip\s+install/i,
      /curl.*\|\s*(sudo\s+)?bash/i,
      /wget.*\|\s*(sudo\s+)?bash/i,
      /setup_\d+\.x/i,  // NodeSource setup script
    ];

    return installPatterns.some(pattern => pattern.test(command));
  }

  private buildPrompt(
    task: string,
    systemInfo: any,
    historyContext: string,
    iteration: number,
    relatedScripts?: any[],
    executionHistory?: any[],
    hasExecutedInstall?: boolean,
    internetSearchResults?: any[],
    knowledgeBaseResults?: any[],
    language?: string,
    failedApproaches?: string[]
  ): string {
    const isFirstIteration = iteration === 1;

    // 提取软件名称（去掉"安装"等词）
    const softwareName = task.replace(/安装|install|部署|deploy/gi, '').trim();

    // Check if last iteration had failed commands
    let hasErrors = false;
    let errorAnalysis = '';
    if (executionHistory && executionHistory.length > 0) {
      const lastExecution = executionHistory[executionHistory.length - 1];
      const failedCommands = lastExecution.commandLogs?.filter((log: any) => log.exitCode !== 0) || [];

      if (failedCommands.length > 0) {
        hasErrors = true;
        errorAnalysis = `\n\n## ⚠️ Previous iteration failed!\n\n`;
        errorAnalysis += `Failed commands:\n`;
        failedCommands.forEach((log: any) => {
          errorAnalysis += `- Command: ${log.command}\n`;
          errorAnalysis += `  Error: ${log.output?.substring(0, 300)}\n`;
          errorAnalysis += `  Exit code: ${log.exitCode}\n\n`;
        });
      }
    }

    // 添加已失败方法的上下文
    let failedApproachesContext = '';
    if (failedApproaches && failedApproaches.length > 0) {
      failedApproachesContext = `\n\n## 🚫 Already Failed Approaches (DO NOT REPEAT!):\n`;
      failedApproaches.slice(-10).forEach((cmd, i) => {
        failedApproachesContext += `${i + 1}. \`${cmd}\`\n`;
      });
      failedApproachesContext += `\n**You MUST try a COMPLETELY DIFFERENT approach!**\n`;
    }

    // Build script library context
    let scriptContext = '';
    if (relatedScripts && relatedScripts.length > 0) {
      scriptContext = `\n\n## 📜 Marketplace Scripts (FOLLOW THESE INSTRUCTIONS!):\n\n`;
      relatedScripts.forEach((script, index) => {
        scriptContext += `### Script ${index + 1}: ${script.name}\n`;
        scriptContext += `Description: ${script.description}\n`;
        if (script.tags && script.tags.length > 0) {
          scriptContext += `Tags: ${script.tags.join(', ')}\n`;
        }

        // Include document content if available (THIS IS THE MAIN GUIDE!)
        const docContent = script.documentContent || script.document_content;
        if (docContent) {
          scriptContext += `\n**📖 Installation Guide (MUST FOLLOW):**\n`;
          scriptContext += `\`\`\`\n${docContent}\n\`\`\`\n`;
        }

        // Include commands if available
        if (script.commands && script.commands.length > 0) {
          scriptContext += `\nCommands:\n`;
          script.commands.forEach((cmd: any, i: number) => {
            const cmdStr = typeof cmd === 'string' ? cmd : (cmd.command || cmd.description || cmd);
            scriptContext += `  ${i + 1}. ${cmdStr}\n`;
          });
        }
        scriptContext += `\n`;
      });
      scriptContext += `**⚠️ IMPORTANT: You MUST follow the installation guide above step by step! Do not improvise.**\n`;
    }

    // Build internet search results
    let internetContext = '';
    if (internetSearchResults && internetSearchResults.length > 0) {
      internetContext = `\n\n## 🌐 Internet Search Results:\n\n`;
      internetSearchResults.slice(0, 5).forEach((result, index) => {
        internetContext += `### ${index + 1}. ${result.title}\n`;
        internetContext += `${result.content?.substring(0, 500) || 'No content'}\n\n`;
      });
      internetContext += `**Use the search results above to complete the task.**\n`;
    }

    // Build knowledge base content
    let knowledgeContext = '';
    if (knowledgeBaseResults && knowledgeBaseResults.length > 0) {
      knowledgeContext = `\n\n## 📚 Knowledge Base Match (FOLLOW THIS GUIDE!):\n\n`;
      knowledgeBaseResults.forEach((kb, index) => {
        knowledgeContext += `### ${index + 1}. ${kb.name}\n`;
        // Include full content, not truncated
        const content = typeof kb.content === 'string' ? kb.content : JSON.stringify(kb.content);
        knowledgeContext += `**📖 Guide Content:**\n\`\`\`\n${content}\n\`\`\`\n\n`;
        if (kb.commands && kb.commands.length > 0) {
          knowledgeContext += `**Predefined Commands:**\n`;
          kb.commands.forEach((cmd: string, i: number) => {
            knowledgeContext += `${i + 1}. \`${cmd}\`\n`;
          });
          knowledgeContext += `\n`;
        }
      });
      knowledgeContext += `**⚠️ Follow the knowledge base steps and commands strictly!**\n`;
    }

    // Language instruction mapping
    const languageInstructions: { [key: string]: string } = {
      'en': 'Respond in English.',
      'zh': 'Respond in Chinese (中文回复).',
      'ja': 'Respond in Japanese (日本語で回答してください).',
      'ko': 'Respond in Korean (한국어로 답변해 주세요).',
      'es': 'Respond in Spanish (Responde en español).',
      'fr': 'Respond in French (Répondez en français).',
      'de': 'Respond in German (Antworten Sie auf Deutsch).',
      'ru': 'Respond in Russian (Отвечайте на русском языке).',
    };
    const langInstruction = language ? languageInstructions[language] || '' : '';

    return `You are a Linux system administration expert with deep thinking capabilities. ${langInstruction}

## 🎯 Task
${task}

## 💻 System Info
${systemInfo.output}
${historyContext}
${errorAnalysis}
${failedApproachesContext}
${scriptContext}
${knowledgeContext}
${internetContext}

${hasErrors ? `
## 🔄 Error Recovery Mode - KEEP TRYING!

Previous iteration failed! **DO NOT GIVE UP** - try a different approach:

1. **Analyze the error**: Read error messages carefully
2. **Try COMPLETELY DIFFERENT approaches**:
   - If official script fails → try manual installation
   - If package manager fails → try compiling from source
   - If version incompatible → try different version (e.g., Node.js 18 instead of 22)
   - If dependency missing → install compatible version or use alternative tool
   - If glibc/library error → downgrade software version or use container
3. **Do not repeat failed commands**: Change strategy completely
4. **Never set is_final_step to true if task is not actually complete**

**Common recovery strategies:**
- glibc/library version error → use older compatible version (e.g., nvm install 18 instead of 22)
- Permission error → use sudo
- Package not found → try alternative package managers (apt/yum/brew/snap)
- Dependency conflict → use version manager (nvm, pyenv, etc.)
- Build fails → check if pre-built binaries available
- Network timeout → try different mirrors or proxy

**IMPORTANT**: Keep trying until the task is ACTUALLY COMPLETE. Do not stop just because one approach failed.
` : isFirstIteration ? `
## First Iteration: Check System Status

This is the first iteration, you need to:
1. Use your knowledge to determine how to install/configure ${softwareName}
2. Only run necessary system check commands (check if installed, system version, etc.)
3. Do not run search commands (no curl to GitHub/PyPI/npm etc.)

### Example commands for first iteration:
- Check if software is installed: which ${softwareName} || echo "not installed"
- Check system version: cat /etc/os-release
- Check package manager: which yum || which apt-get

**Important**:
- Do not run search commands on server, use your knowledge directly
- First iteration only checks, **do not set is_final_step to true**
- Even if software is installed, verify version in next iteration before finishing
` : `
## Subsequent Iterations: Execute Installation/Configuration

**Current status**: ${hasExecutedInstall ? 'Install command has been executed' : 'Install command not yet executed'}

Based on previous check results, you must:
${hasExecutedInstall ? `
- Verify installation success (run version check command)
- If verification succeeds, set is_final_step to true
- If verification fails, analyze and fix
` : `
- **Must execute actual install commands**, not just analyze
- Use system package manager (yum/apt) or official recommended method
- If repository needs to be added, add it first then install
- **Do not set is_final_step to true without executing install commands**
`}

### Important Rules:
1. **Only set is_final_step to true when**:
   - Software was already installed in first iteration check
   - Or you have executed install commands and verification succeeded
2. **Never** just "analyze" or "plan" and end the task
3. Each iteration must return commands to execute, unless task is truly complete
4. **If previous approach failed, TRY A DIFFERENT APPROACH in the next iteration**
5. **EXECUTE the fix, don't just describe it**
`}

Return in JSON format:
{
  "thinking": "Deep analysis: 1) What is the current state? 2) What went wrong before? 3) What NEW approach should I try?",
  "reasoning": "Brief summary for user (1-2 sentences)",
  "commands": [
    {"cmd": "actual command", "explanation": "What this does"}
  ],
  "expected_outcome": "Expected result",
  "is_final_step": false,
  "next_steps": "Suggestions for user (only when complete)"
}

**CRITICAL RULES**:
1. ALWAYS provide commands - never just analyze
2. NEVER repeat failed commands - try completely different approaches
3. Use "thinking" field for deep analysis before deciding
4. Only set is_final_step=true when task is VERIFIED complete
5. If stuck after 3 failures, try: version managers (nvm/pyenv), containers, or alternative tools

Notes:
- Prioritize knowledge base and script library solutions
- First iteration: check system status only
- Subsequent iterations: execute actual commands
- Chain commands with && for sequential execution
- Put analysis in thinking/reasoning, not in echo commands`;
  }
}
