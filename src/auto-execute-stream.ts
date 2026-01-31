import { Response } from 'express';
import { ConnectionManager } from './connection-manager';
import { ClaudeAssistant } from './claude-assistant';
import { MarketplaceManager } from './marketplace-manager';
import { ServerConfig } from './types';

export class AutoExecuteStream {
  constructor(
    private connectionManager: ConnectionManager,
    private assistant: ClaudeAssistant,
    private res: Response,
    private marketplaceManager: MarketplaceManager
  ) {
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
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
      return { verified: true, output: '无法自动验证，假定完成' };
    }

    this.sendEvent('status', { message: '正在验证任务是否完成...' });

    try {
      const log = await executor.execute(verifyCmd);
      const success = log.exitCode === 0 && !log.output.includes('not found') && !log.output.includes('未安装');

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

  async execute(serverConfig: ServerConfig, task: string, systemInfo: any) {
    const MAX_ITERATIONS = 10;
    const executionHistory: any[] = [];
    let currentIteration = 0;
    let taskCompleted = false;
    let hasExecutedInstall = false; // 追踪是否执行过实际安装命令

    this.sendEvent('start', { task, message: '开始自动执行...' });

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

        // 第一轮后查询脚本库
        let relatedScripts: any[] = [];
        if (currentIteration === 2) {
          this.sendEvent('status', { message: '正在查询脚本库...' });
          const softwareName = task.replace(/安装|install|部署|deploy/gi, '').trim();
          relatedScripts = this.marketplaceManager.searchTemplates(softwareName);
          if (relatedScripts.length > 0) {
            this.sendEvent('status', { message: `找到 ${relatedScripts.length} 个相关脚本` });
          }
        }

        // AI分析
        this.sendEvent('status', { message: 'AI正在分析任务...' });

        const planPrompt = this.buildPrompt(
          task,
          systemInfo,
          historyContext,
          currentIteration,
          relatedScripts,
          executionHistory,
          hasExecutedInstall
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
              verification: verification.output
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
        for (const command of plan.commands) {
          this.sendEvent('command_start', { command });

          try {
            const log = await executor.execute(command);
            commandLogs.push(log);

            this.sendEvent('command_output', {
              command: log.command,
              output: log.output,
              exitCode: log.exitCode
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
              timestamp: new Date().toISOString()
            };
            commandLogs.push(errorLog);

            this.sendEvent('command_output', {
              command: errorLog.command,
              output: errorLog.output,
              exitCode: errorLog.exitCode
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
    hasExecutedInstall?: boolean
  ): string {
    const isFirstIteration = iteration === 1;

    // 提取软件名称（去掉"安装"等词）
    const softwareName = task.replace(/安装|install|部署|deploy/gi, '').trim();

    // 检查上一轮是否有失败的命令
    let hasErrors = false;
    let errorAnalysis = '';
    if (executionHistory && executionHistory.length > 0) {
      const lastExecution = executionHistory[executionHistory.length - 1];
      const failedCommands = lastExecution.commandLogs?.filter((log: any) => log.exitCode !== 0) || [];

      if (failedCommands.length > 0) {
        hasErrors = true;
        errorAnalysis = `\n\n## ⚠️ 上一轮执行失败，需要修复！\n\n`;
        errorAnalysis += `失败的命令：\n`;
        failedCommands.forEach((log: any) => {
          errorAnalysis += `- 命令: ${log.command}\n`;
          errorAnalysis += `  错误: ${log.output}\n`;
          errorAnalysis += `  退出码: ${log.exitCode}\n\n`;
        });
        errorAnalysis += `**你必须分析这些错误，并尝试不同的方法来解决问题。不要重复相同的失败命令！**\n`;
      }
    }

    // 构建脚本库信息
    let scriptContext = '';
    if (relatedScripts && relatedScripts.length > 0) {
      scriptContext = `\n\n## 脚本库中的相关脚本：\n\n`;
      relatedScripts.forEach((script, index) => {
        scriptContext += `### 脚本${index + 1}: ${script.name}\n`;
        scriptContext += `描述: ${script.description}\n`;
        scriptContext += `标签: ${script.tags.join(', ')}\n`;
        scriptContext += `命令步骤:\n`;
        script.commands.forEach((cmd: any, i: number) => {
          scriptContext += `  ${i + 1}. ${cmd.description || cmd.command}\n`;
        });
        scriptContext += `\n`;
      });
      scriptContext += `**优先考虑使用脚本库中的脚本，这些是经过验证的最佳实践。**\n`;
    }

    return `你是一个Linux系统管理专家。用户需要完成以下任务：

任务：${task}

系统信息：
${systemInfo.output}
${historyContext}
${errorAnalysis}
${scriptContext}

${hasErrors ? `
## 🔄 错误恢复模式

上一轮执行失败了！你需要：
1. **分析错误原因**：仔细阅读错误信息，理解为什么失败
2. **尝试不同的方法**：
   - 如果是权限问题，尝试使用sudo
   - 如果是包不存在，尝试其他包管理器或源
   - 如果是依赖问题，先安装依赖
   - 如果是网络问题，尝试其他下载源
3. **不要重复失败的命令**：必须改变策略
4. **考虑替代方案**：如果一种方法不行，尝试完全不同的方法

**常见错误恢复策略：**
- 权限错误 → 使用sudo
- 包不存在 → 更新包索引（apt update / yum update）或添加仓库
- 依赖缺失 → 先安装依赖包
- 命令不存在 → 先安装包含该命令的包
- 网络超时 → 更换镜像源或使用代理
` : isFirstIteration ? `
## 第一轮：检查系统状态

这是第一轮，你需要：
1. 使用你的知识判断如何安装/配置 ${softwareName}
2. 只执行必要的系统检查命令（检查是否已安装、系统版本等）
3. 不要执行搜索命令（不要curl GitHub/PyPI/npm等）

### 第一轮应该执行的命令示例：
- 检查软件是否已安装：which ${softwareName} || echo "未安装"
- 检查系统版本：cat /etc/os-release
- 检查包管理器：which yum || which apt-get

**重要**：
- 不要在服务器上执行搜索命令，直接使用你的知识决定安装方案
- 第一轮只做检查，**不要设置 is_final_step 为 true**
- 即使软件已安装，也应该在下一轮验证版本后再结束
` : `
## 后续轮次：执行安装/配置

**当前状态**: ${hasExecutedInstall ? '已执行过安装命令' : '尚未执行安装命令'}

根据之前的检查结果，你必须：
${hasExecutedInstall ? `
- 验证安装是否成功（运行版本检查命令）
- 如果验证成功，设置 is_final_step 为 true
- 如果验证失败，分析原因并修复
` : `
- **必须执行实际的安装命令**，不能只是分析
- 使用系统包管理器（yum/apt）或官方推荐的安装方式
- 如果需要添加仓库，先添加仓库再安装
- **禁止在未执行安装命令的情况下设置 is_final_step 为 true**
`}

### 重要规则：
1. **只有在以下情况才能设置 is_final_step 为 true**：
   - 软件在第一轮检查时就已经安装好了
   - 或者你已经执行了安装命令并且验证成功
2. **绝对不能**只是"分析"或"规划"就结束任务
3. 每一轮都必须返回要执行的命令，除非任务真正完成
`}

请以JSON格式返回：
{
  "reasoning": "详细说明你的分析过程和选择理由",
  "commands": ["命令1", "命令2"],
  "expected_outcome": "预期结果",
  "is_final_step": false
}

**关于 is_final_step 的严格规则**：
- 设为 true 的唯一条件：软件已安装且验证成功
- 设为 false 的情况：还需要执行安装、配置或验证命令
- **如果 commands 数组为空，系统会自动验证任务是否完成**

注意：
- 使用你的知识直接决定安装方案，不要生成搜索命令
- 第一轮只执行系统检查命令（检查是否已安装、系统版本等）
- 后续轮次执行实际的安装/配置命令
- 使用 && 连接多个命令，确保按顺序执行
- **重要：不要在命令中使用echo输出分析性内容，所有分析和说明都应该写在reasoning字段中**
- 命令应该只执行实际操作，不要包含用于显示的echo语句
- **必须执行实际操作才能完成任务，不能只是分析**`;
  }
}
