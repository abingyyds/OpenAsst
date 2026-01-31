import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { CommandScript } from '../types';
import { RemoteKnowledgeService } from './remote-knowledge';

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
  private remoteKnowledge: RemoteKnowledgeService;

  constructor(dataDir: string, tavilyApiKey?: string, serperApiKey?: string) {
    this.dataDir = dataDir;
    this.tavilyApiKey = tavilyApiKey;
    this.serperApiKey = serperApiKey;
    this.remoteKnowledge = new RemoteKnowledgeService();
  }

  /**
   * Search command marketplace
   */
  async searchMarketplace(query: string): Promise<SearchResult[]> {
    const scriptsFile = path.join(this.dataDir, 'scripts.json');
    if (!fs.existsSync(scriptsFile)) {
      return [];
    }

    const scripts: CommandScript[] = JSON.parse(fs.readFileSync(scriptsFile, 'utf-8'));
    const queryLower = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const script of scripts) {
      let relevance = 0;

      if (script.name.toLowerCase().includes(queryLower)) {
        relevance += 3;
      }

      if (script.description.toLowerCase().includes(queryLower)) {
        relevance += 2;
      }

      if (script.tags?.some(tag => tag.toLowerCase().includes(queryLower))) {
        relevance += 2;
      }

      if (script.documentContent?.toLowerCase().includes(queryLower)) {
        relevance += 1;
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
   * Search knowledge base
   */
  async searchKnowledgeBase(query: string): Promise<SearchResult[]> {
    const kbFile = path.join(this.dataDir, 'knowledge-base.json');
    if (!fs.existsSync(kbFile)) {
      return [];
    }

    const knowledgeBase: KnowledgeBaseItem[] = JSON.parse(fs.readFileSync(kbFile, 'utf-8'));
    const queryLower = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const item of knowledgeBase) {
      let relevance = 0;

      if (item.title.toLowerCase().includes(queryLower)) {
        relevance += 3;
      }

      if (item.keywords.some(keyword => keyword.toLowerCase().includes(queryLower))) {
        relevance += 2;
      }

      if (item.solution.toLowerCase().includes(queryLower)) {
        relevance += 1;
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
   * Search remote knowledge base (GitHub)
   */
  async searchRemoteKnowledge(query: string): Promise<SearchResult[]> {
    try {
      const items = await this.remoteKnowledge.search(query);
      return items.map(item => ({
        source: 'knowledge-base' as const,
        title: item.title,
        content: item.solution,
        relevance: 2,
        commands: item.commands
      }));
    } catch {
      return [];
    }
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
   * Search internet using Tavily API
   */
  private async searchWithTavily(query: string): Promise<SearchResult[]> {
    if (!this.isValidApiKey(this.tavilyApiKey)) {
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
      return [];
    }
  }

  /**
   * Search internet using Serper API
   */
  private async searchWithSerper(query: string): Promise<SearchResult[]> {
    if (!this.isValidApiKey(this.serperApiKey)) {
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
      return [];
    }
  }

  /**
   * Search internet
   */
  async searchInternet(query: string): Promise<SearchResult[]> {
    if (this.isValidApiKey(this.tavilyApiKey)) {
      return await this.searchWithTavily(query);
    } else if (this.isValidApiKey(this.serperApiKey)) {
      return await this.searchWithSerper(query);
    }
    return [];
  }

  /**
   * Comprehensive search
   */
  async searchAll(query: string): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];

    // Search local marketplace
    const marketplaceResults = await this.searchMarketplace(query);
    allResults.push(...marketplaceResults);

    // Search local knowledge base
    const kbResults = await this.searchKnowledgeBase(query);
    allResults.push(...kbResults);

    // Search remote knowledge base (GitHub)
    const remoteResults = await this.searchRemoteKnowledge(query);
    allResults.push(...remoteResults);

    // Search internet if not enough results
    if (allResults.length < 3) {
      const internetResults = await this.searchInternet(query);
      allResults.push(...internetResults);
    }

    return allResults.sort((a, b) => b.relevance - a.relevance);
  }
}

export { SearchResult };
