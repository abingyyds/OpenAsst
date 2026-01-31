import Anthropic from '@anthropic-ai/sdk';
import { AIAssistantRequest, ChatMessage, ExecutionLog } from './types';
import { SearchService, SearchResult } from './search-service';

export class ClaudeAssistant {
  private client: Anthropic;
  private model: string;
  private searchService?: SearchService;

  constructor(apiKey: string, baseURL?: string, model?: string, searchService?: SearchService) {
    this.client = new Anthropic({
      apiKey,
      baseURL: baseURL || undefined
    });
    this.model = model || 'claude-3-5-sonnet-20241022';
    this.searchService = searchService;
  }

  // Language instruction mapping
  private getLanguageInstruction(language?: string): string {
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
    return language ? languageInstructions[language] || '' : '';
  }

  async chat(
    userMessage: string,
    conversationHistory: ChatMessage[],
    commandHistory: ExecutionLog[],
    language?: string
  ): Promise<string> {
    try {
      const langInstruction = this.getLanguageInstruction(language);
      const systemPrompt = `You are a server operations assistant. ${langInstruction}

You can help users with:
1. Analyzing command execution errors and providing solutions
2. Explaining command functions and risks
3. Answering questions about server management

Current session command history:
${commandHistory.slice(-5).map(log =>
  `Command: ${log.command}\nOutput: ${log.output || log.error}\nExit code: ${log.exitCode}`
).join('\n\n')}`;

      const messages: Anthropic.MessageParam[] = conversationHistory
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }));

      messages.push({
        role: 'user',
        content: userMessage
      });

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages
      });

      const content = response.content[0];
      return content.type === 'text' ? content.text : '';
    } catch (error: any) {
      console.error('Claude API调用失败:', error);
      console.error('API配置 - baseURL:', this.client.baseURL);
      console.error('API配置 - model:', this.model);
      console.error('错误详情:', JSON.stringify(error, null, 2));

      // 提取有用的错误信息
      let errorMessage = 'AI服务暂时不可用';
      if (error.status === 503) {
        errorMessage = 'AI服务暂时不可用（503错误）。请检查API配置或稍后重试。';
      } else if (error.status === 401) {
        errorMessage = 'API密钥无效或已过期。请检查API配置。';
      } else if (error.message) {
        errorMessage = `AI服务错误: ${error.message}`;
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * 智能聊天：自动判断是否需要搜索
   */
  async chatWithSearch(
    userMessage: string,
    conversationHistory: ChatMessage[],
    commandHistory: ExecutionLog[],
    language?: string
  ): Promise<string> {
    try {
      // 如果没有配置搜索服务，使用普通聊天
      if (!this.searchService) {
        return this.chat(userMessage, conversationHistory, commandHistory, language);
      }

      // 第一步：让AI判断是否需要搜索
      const analysisPrompt = `分析用户的请求，判断是否需要搜索额外信息。

用户请求：${userMessage}

请回答：
1. 是否需要搜索？（是/否）
2. 如果需要，搜索关键词是什么？

只返回JSON格式：{"needSearch": true/false, "searchQuery": "关键词"}`;

      const analysisResponse = await this.client.messages.create({
        model: this.model,
        max_tokens: 200,
        messages: [{ role: 'user', content: analysisPrompt }]
      });

      const analysisText = analysisResponse.content[0].type === 'text'
        ? analysisResponse.content[0].text
        : '';

      let needSearch = false;
      let searchQuery = '';

      try {
        const analysis = JSON.parse(analysisText);
        needSearch = analysis.needSearch;
        searchQuery = analysis.searchQuery || userMessage;
      } catch {
        // 如果解析失败，使用简单的关键词检测
        const searchKeywords = ['如何', '怎么', '怎样', '什么', '为什么', '帮我'];
        needSearch = searchKeywords.some(keyword => userMessage.includes(keyword));
        searchQuery = userMessage;
      }

      // 第二步：如果需要搜索，执行搜索
      let searchContext = '';
      if (needSearch && searchQuery) {
        const searchResults = await this.searchService.searchAll(searchQuery);

        if (searchResults.length > 0) {
          searchContext = '\n\n【搜索到的相关信息】\n';
          searchResults.slice(0, 5).forEach((result, index) => {
            searchContext += `\n${index + 1}. [${result.source}] ${result.title}\n${result.content}\n`;
            if (result.commands && result.commands.length > 0) {
              searchContext += `相关命令：${result.commands.join(', ')}\n`;
            }
          });
        }
      }

      // 第三步：结合搜索结果生成回答
      return this.chat(userMessage + searchContext, conversationHistory, commandHistory, language);
    } catch (error: any) {
      console.error('智能聊天失败:', error);

      // 如果是API错误，尝试降级到普通聊天（不带搜索）
      if (error.message && error.message.includes('AI服务')) {
        throw error; // 直接抛出，让上层处理
      }

      // 其他错误，尝试降级
      console.log('尝试降级到普通聊天...');
      return this.chat(userMessage, conversationHistory, commandHistory, language);
    }
  }

  async *chatStream(
    userMessage: string,
    conversationHistory: ChatMessage[],
    commandHistory: ExecutionLog[],
    language?: string
  ): AsyncGenerator<string, void, unknown> {
    const langInstruction = this.getLanguageInstruction(language);
    const systemPrompt = `You are a server operations assistant. ${langInstruction}

You can help users with:
1. Analyzing command execution errors and providing solutions
2. Explaining command functions and risks
3. Answering questions about server management

Current session command history:
${commandHistory.slice(-5).map(log =>
  `Command: ${log.command}\nOutput: ${log.output || log.error}\nExit code: ${log.exitCode}`
).join('\n\n')}`;

    const messages: Anthropic.MessageParam[] = conversationHistory
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

    messages.push({
      role: 'user',
      content: userMessage
    });

    const stream = await this.client.messages.stream({
      model: this.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  }

  async getSolution(request: AIAssistantRequest): Promise<string> {
    const prompt = `You are a server administration assistant. A command execution has failed.

Error: ${request.error}

Context: ${request.context}

Previous commands executed:
${request.previousCommands.join('\n')}

Please analyze the error and provide:
1. What went wrong
2. Suggested fix or alternative command
3. Step-by-step instructions to resolve the issue

Keep your response concise and actionable.`;

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    return content.type === 'text' ? content.text : '';
  }

  async analyzeCommand(command: string, serverContext: string): Promise<string> {
    const prompt = `Analyze this server command and explain what it does:

Command: ${command}
Server context: ${serverContext}

Provide a brief explanation of:
1. What this command does
2. Potential risks or side effects
3. Whether it's safe to execute`;

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    return content.type === 'text' ? content.text : '';
  }
}
