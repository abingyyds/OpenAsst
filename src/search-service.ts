import * as fs from 'fs';
import * as path from 'path';
import { CommandScript } from './types';
import axios from 'axios';

interface KnowledgeBaseItem {
  id: string;
  title: string;
  keywords: string[];
  solution: string;
  commands: string[];
  category: string;
}

interface SearchResult {
  source: 'marketplace' | 'knowledge-base' | 'internet';
  title: string;
  content: string;
  relevance: number;
  commands?: string[];
}

export class SearchService {
  private dataDir: string;
  private tavilyApiKey?: string;
  private serperApiKey?: string;

  constructor(dataDir: string, tavilyApiKey?: string, serperApiKey?: string) {
    this.dataDir = dataDir;
    this.tavilyApiKey = tavilyApiKey;
    this.serperApiKey = serperApiKey;
  }

  /**
   * 提取搜索关键词
   */
  private extractKeywords(query: string): string[] {
    let cleaned = query
      .replace(/^Execute script:\s*/i, '')
      .replace(/^执行脚本:\s*/i, '')
      .replace(/安装教程|安装指南|installation guide|tutorial/gi, '')
      .replace(/安装|install|部署|deploy|配置|setup/gi, '')
      .trim();

    const words = cleaned.split(/[\s,，、]+/).filter(w => w.length > 0);
    return [...new Set(words.map(w => w.toLowerCase()))];
  }

  /**
   * 搜索命令市场
   */
  async searchMarketplace(query: string): Promise<SearchResult[]> {
    const scriptsFile = path.join(this.dataDir, 'scripts.json');
    if (!fs.existsSync(scriptsFile)) {
      return [];
    }

    const scripts: CommandScript[] = JSON.parse(fs.readFileSync(scriptsFile, 'utf-8'));
    const queryLower = query.toLowerCase();
    const keywords = this.extractKeywords(query);
    const results: SearchResult[] = [];

    for (const script of scripts) {
      let relevance = 0;
      const nameLower = script.name.toLowerCase();
      const descLower = script.description.toLowerCase();
      const docLower = (script.documentContent || '').toLowerCase();

      // 直接查询匹配
      if (nameLower.includes(queryLower)) relevance += 5;
      if (descLower.includes(queryLower)) relevance += 3;
      if (docLower.includes(queryLower)) relevance += 2;

      // 关键词匹配
      for (const keyword of keywords) {
        if (nameLower === keyword) relevance += 10;
        else if (nameLower.includes(keyword)) relevance += 4;
        if (script.tags?.some(tag => tag.toLowerCase().includes(keyword))) relevance += 3;
        if (descLower.includes(keyword)) relevance += 2;
        if (docLower.includes(keyword)) relevance += 2;
      }

      if (relevance > 0) {
        results.push({
          source: 'marketplace',
          title: script.name,
          content: script.documentContent || script.commands.join('\n'),
          relevance,
          commands: script.commands
        });
      }
    }

    return results.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * 搜索知识库
   */
  async searchKnowledgeBase(query: string): Promise<SearchResult[]> {
    const kbFile = path.join(this.dataDir, 'knowledge-base.json');
    if (!fs.existsSync(kbFile)) {
      return [];
    }

    const knowledgeBase: KnowledgeBaseItem[] = JSON.parse(fs.readFileSync(kbFile, 'utf-8'));
    const queryLower = query.toLowerCase();
    const keywords = this.extractKeywords(query);
    const results: SearchResult[] = [];

    for (const item of knowledgeBase) {
      let relevance = 0;
      const titleLower = item.title.toLowerCase();
      const solutionLower = item.solution.toLowerCase();

      // 直接查询匹配
      if (titleLower.includes(queryLower)) relevance += 5;
      if (solutionLower.includes(queryLower)) relevance += 2;

      // 关键词匹配
      for (const keyword of keywords) {
        if (titleLower === keyword) relevance += 10;
        else if (titleLower.includes(keyword)) relevance += 4;
        if (item.keywords.some(k => k.toLowerCase().includes(keyword) || keyword.includes(k.toLowerCase()))) {
          relevance += 3;
        }
        if (solutionLower.includes(keyword)) relevance += 2;
      }

      if (relevance > 0) {
        results.push({
          source: 'knowledge-base',
          title: item.title,
          content: item.solution,
          relevance,
          commands: item.commands
        });
      }
    }

    return results.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Check if API key is valid (not a placeholder)
   */
  private isValidApiKey(key: string | undefined): boolean {
    if (!key) return false;
    const placeholders = [
      'your_tavily_api_key_here',
      'your_serper_api_key_here',
      'your_api_key_here',
      'placeholder',
      'xxx',
      'your-api-key',
    ];
    return !placeholders.includes(key.toLowerCase()) && key.length > 10;
  }

  /**
   * 使用Tavily API搜索互联网
   */
  private async searchWithTavily(query: string): Promise<SearchResult[]> {
    if (!this.isValidApiKey(this.tavilyApiKey)) {
      console.log('Tavily API key not configured or invalid, skipping internet search');
      return [];
    }

    try {
      const response = await axios.post('https://api.tavily.com/search', {
        api_key: this.tavilyApiKey,
        query: query,
        search_depth: 'basic',
        max_results: 5
      });

      return response.data.results.map((result: any) => ({
        source: 'internet' as const,
        title: result.title,
        content: result.content,
        relevance: result.score || 1,
        commands: []
      }));
    } catch (error) {
      console.error('Tavily search error:', error);
      return [];
    }
  }

  /**
   * 使用Serper API搜索互联网
   */
  private async searchWithSerper(query: string): Promise<SearchResult[]> {
    if (!this.isValidApiKey(this.serperApiKey)) {
      console.log('Serper API key not configured or invalid, skipping internet search');
      return [];
    }

    try {
      const response = await axios.post('https://google.serper.dev/search', {
        q: query,
        num: 5
      }, {
        headers: {
          'X-API-KEY': this.serperApiKey,
          'Content-Type': 'application/json'
        }
      });

      const results: SearchResult[] = [];
      if (response.data.organic) {
        for (const result of response.data.organic) {
          results.push({
            source: 'internet',
            title: result.title,
            content: result.snippet,
            relevance: 1,
            commands: []
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Serper search error:', error);
      return [];
    }
  }

  /**
   * 搜索互联网
   */
  async searchInternet(query: string): Promise<SearchResult[]> {
    if (this.isValidApiKey(this.tavilyApiKey)) {
      return await this.searchWithTavily(query);
    } else if (this.isValidApiKey(this.serperApiKey)) {
      return await this.searchWithSerper(query);
    }
    console.log('No valid internet search API key configured, skipping internet search');
    return [];
  }

  /**
   * 综合搜索：按优先级搜索所有来源
   */
  async searchAll(query: string): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];

    // 1. 先搜索命令市场
    const marketplaceResults = await this.searchMarketplace(query);
    allResults.push(...marketplaceResults);

    // 2. 搜索知识库
    const kbResults = await this.searchKnowledgeBase(query);
    allResults.push(...kbResults);

    // 3. 始终尝试搜索互联网（如果有有效的API key）
    const internetResults = await this.searchInternet(query);
    allResults.push(...internetResults);

    return allResults.sort((a, b) => b.relevance - a.relevance);
  }
}

export { SearchResult };
