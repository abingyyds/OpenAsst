import axios from 'axios';

export interface RemoteKnowledgeItem {
  id: string;
  title: string;
  keywords: string[];
  solution: string;
  commands: string[];
  category?: string;
}

export interface RemoteKnowledgeIndex {
  version: string;
  lastUpdated: string;
  categories: { id: string; name: string; description: string }[];
  files: string[];
}

export class RemoteKnowledgeService {
  private baseUrl: string;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(repoOwner: string = 'abingyyds', repoName: string = 'OpenAsst') {
    this.baseUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/knowledge`;
  }

  // Fetch with cache
  private async fetchWithCache<T>(url: string): Promise<T | null> {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data as T;
    }
    try {
      const response = await axios.get(url, { timeout: 10000 });
      this.cache.set(url, { data: response.data, timestamp: Date.now() });
      return response.data;
    } catch {
      return null;
    }
  }

  // Get index
  async getIndex(): Promise<RemoteKnowledgeIndex | null> {
    return this.fetchWithCache<RemoteKnowledgeIndex>(`${this.baseUrl}/index.json`);
  }

  // Get all items
  async getAllItems(): Promise<RemoteKnowledgeItem[]> {
    const index = await this.getIndex();
    if (!index) return [];

    const allItems: RemoteKnowledgeItem[] = [];
    for (const file of index.files) {
      const data = await this.fetchWithCache<any>(`${this.baseUrl}/${file}`);
      if (data?.items) {
        allItems.push(...data.items.map((item: any) => ({ ...item, category: data.category })));
      }
    }
    return allItems;
  }

  // Search knowledge base
  async search(query: string): Promise<RemoteKnowledgeItem[]> {
    const items = await this.getAllItems();
    const queryLower = query.toLowerCase();

    return items.filter(item => {
      const titleMatch = item.title.toLowerCase().includes(queryLower);
      const keywordMatch = item.keywords.some(k => k.toLowerCase().includes(queryLower));
      const solutionMatch = item.solution.toLowerCase().includes(queryLower);
      return titleMatch || keywordMatch || solutionMatch;
    });
  }
}
