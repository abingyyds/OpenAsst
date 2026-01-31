import Anthropic from '@anthropic-ai/sdk';
import { Config } from '../types';
import { SearchService, SearchResult } from './search-service';
import * as path from 'path';
import * as os from 'os';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TaskPlan {
  reasoning: string;
  commands: string[];
  is_complete?: boolean;
  verification?: string;
  rollback?: string[];
}

export interface GoalAnalysis {
  understood: boolean;
  goal: string;
  subGoals: string[];
  requirements: string[];
  risks: string[];
  estimatedSteps: number;
}

export class AIAssistant {
  private client: Anthropic;
  private model: string;
  private searchService?: SearchService;
  private conversationHistory: ConversationMessage[] = [];

  constructor(config: Config) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl
    });
    this.model = config.model || 'claude-3-5-sonnet-20241022';

    // Initialize search service
    const dataDir = path.join(os.homedir(), '.openasst-cli');
    this.searchService = new SearchService(
      dataDir,
      config.tavilyApiKey,
      config.serperApiKey
    );
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Add message to history
   */
  addToHistory(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });
    // Keep only last 20 messages
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }
  }

  async chat(message: string, systemInfo?: string): Promise<string> {
    const systemPrompt = `You are a helpful terminal assistant. Help users accomplish tasks by suggesting shell commands.
${systemInfo ? `\nSystem Information:\n${systemInfo}` : ''}

IMPORTANT:
- Provide clear, safe commands
- Explain what each command does
- Warn about potentially dangerous operations
- Consider the user's operating system`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: message
      }]
    });

    const content = response.content[0];
    return content.type === 'text' ? content.text : '';
  }

  async planTask(task: string, systemInfo: string): Promise<{ reasoning: string; commands: any[]; is_complete?: boolean; next_steps?: string }> {
    const prompt = `You are a professional Linux system administrator. Please analyze the following task and provide an execution plan.

Task: ${task}

System Info:
${systemInfo}

Please analyze the task and provide:
1. Your analysis and reasoning process
2. List of commands to execute with explanations
3. Whether the task is complete
4. If complete, suggest next steps for the user

Return in JSON format:
{
  "reasoning": "Brief analysis of current situation",
  "commands": [
    {"cmd": "actual command", "explanation": "What this command does and why"}
  ],
  "is_complete": false,
  "next_steps": "If task is complete, suggest what user might want to do next"
}

Important rules:
- Each command MUST have an explanation field
- Commands must be complete and directly executable
- Include sudo if needed
- If task is complete, set is_complete to true and provide next_steps
- Prefer system package manager`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      try {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch {
        return {
          reasoning: content.text,
          commands: []
        };
      }
    }

    return { reasoning: '', commands: [] };
  }

  /**
   * Smart task planning: auto search for relevant info
   */
  async planTaskWithSearch(task: string, systemInfo: string): Promise<{ reasoning: string; commands: string[] }> {
    if (!this.searchService) {
      return this.planTask(task, systemInfo);
    }

    // Step 1: Determine if search is needed
    const analysisPrompt = `Analyze the user's task and determine if additional search is needed.

Task: ${task}

Please answer:
1. Is search needed? (yes/no)
2. If yes, what are the search keywords?

Return JSON only: {"needSearch": true/false, "searchQuery": "keywords"}`;

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
      searchQuery = analysis.searchQuery || task;
    } catch {
      const searchKeywords = ['how', 'what', 'why', 'help', 'install', 'setup', 'configure'];
      needSearch = searchKeywords.some(keyword => task.toLowerCase().includes(keyword));
      searchQuery = task;
    }

    // Step 2: If search needed, execute search
    let searchContext = '';
    if (needSearch && searchQuery) {
      const searchResults = await this.searchService.searchAll(searchQuery);

      if (searchResults.length > 0) {
        searchContext = '\n\n【Related Search Results】\n';
        searchResults.slice(0, 5).forEach((result, index) => {
          searchContext += `\n${index + 1}. [${result.source}] ${result.title}\n${result.content}\n`;
          if (result.commands && result.commands.length > 0) {
            searchContext += `Related commands: ${result.commands.join(', ')}\n`;
          }
        });
      }
    }

    // Step 3: Generate execution plan with search results
    return this.planTask(task + searchContext, systemInfo);
  }

  /**
   * Analyze user's goal and break it down
   */
  async analyzeGoal(goal: string, systemInfo: string): Promise<GoalAnalysis> {
    const prompt = `Analyze the user's goal and break it down into actionable parts.

Goal: ${goal}

System Info:
${systemInfo}

Return JSON:
{
  "understood": true,
  "goal": "Clear statement of the goal",
  "subGoals": ["sub-goal 1", "sub-goal 2"],
  "requirements": ["requirement 1", "requirement 2"],
  "risks": ["potential risk 1"],
  "estimatedSteps": 5
}`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      try {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch {}
    }

    return {
      understood: false,
      goal: goal,
      subGoals: [],
      requirements: [],
      risks: [],
      estimatedSteps: 0
    };
  }

  /**
   * Verify if a task was completed successfully
   */
  async verifyTaskCompletion(
    goal: string,
    executionResults: string[],
    systemInfo: string
  ): Promise<{ completed: boolean; reason: string; nextSteps?: string[] }> {
    const prompt = `Verify if the task was completed successfully.

Original Goal: ${goal}

Execution Results:
${executionResults.join('\n')}

System Info:
${systemInfo}

Return JSON:
{
  "completed": true/false,
  "reason": "Why the task is/isn't complete",
  "nextSteps": ["next step if not complete"]
}`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      try {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch {}
    }

    return { completed: false, reason: 'Unable to verify' };
  }

  /**
   * Generate suggestions for next steps
   */
  async suggestNextSteps(
    completedTask: string,
    context: string
  ): Promise<string[]> {
    const prompt = `Based on the completed task, suggest logical next steps.

Completed Task: ${completedTask}
Context: ${context}

Return JSON array of suggestions:
["suggestion 1", "suggestion 2", "suggestion 3"]`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      try {
        const jsonMatch = content.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch {}
    }

    return [];
  }

  /**
   * Chat with conversation history
   */
  async chatWithHistory(
    message: string,
    systemInfo?: string
  ): Promise<string> {
    this.addToHistory('user', message);

    const systemPrompt = `You are an intelligent system assistant that helps users accomplish tasks.
${systemInfo ? `\nSystem Information:\n${systemInfo}` : ''}

You can help with:
- Installing and configuring software
- Managing files and directories
- System administration tasks
- Debugging and fixing errors
- Writing and modifying code

Always provide clear, safe, and executable commands.`;

    const messages = this.conversationHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages
    });

    const content = response.content[0];
    const reply = content.type === 'text' ? content.text : '';

    this.addToHistory('assistant', reply);
    return reply;
  }
}
