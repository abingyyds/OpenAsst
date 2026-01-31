import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface KnowledgeItem {
  id: string;
  title: string;
  keywords: string[];
  solution: string;
  commands: string[];
  category?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  description: string;
}

export interface KnowledgeIndex {
  version: string;
  lastUpdated: string;
  categories: KnowledgeCategory[];
  files: string[];
}

export class KnowledgeManager {
  private knowledgeDir: string;
  private repoDir: string;
  private githubToken?: string;
  private githubRepo?: string;

  constructor(repoDir: string, githubToken?: string, githubRepo?: string) {
    this.repoDir = repoDir;
    this.knowledgeDir = path.join(repoDir, 'knowledge');
    this.githubToken = githubToken;
    this.githubRepo = githubRepo;

    // Ensure knowledge directory exists
    if (!fs.existsSync(this.knowledgeDir)) {
      fs.mkdirSync(this.knowledgeDir, { recursive: true });
    }
  }

  // Get index
  getIndex(): KnowledgeIndex {
    const indexPath = path.join(this.knowledgeDir, 'index.json');
    if (fs.existsSync(indexPath)) {
      return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    }
    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      categories: [],
      files: []
    };
  }

  // Save index
  private saveIndex(index: KnowledgeIndex): void {
    index.lastUpdated = new Date().toISOString();
    const indexPath = path.join(this.knowledgeDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  // Get all items from a category
  getCategoryItems(categoryId: string): KnowledgeItem[] {
    const filePath = path.join(this.knowledgeDir, `${categoryId}.json`);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data.items || [];
    }
    return [];
  }

  // Get all items
  getAllItems(): KnowledgeItem[] {
    const index = this.getIndex();
    const allItems: KnowledgeItem[] = [];

    for (const file of index.files) {
      const filePath = path.join(this.knowledgeDir, file);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const items = (data.items || []).map((item: KnowledgeItem) => ({
          ...item,
          category: data.category
        }));
        allItems.push(...items);
      }
    }

    return allItems;
  }

  // Search knowledge base
  search(query: string): KnowledgeItem[] {
    const allItems = this.getAllItems();
    const queryLower = query.toLowerCase();

    return allItems.filter(item => {
      const titleMatch = item.title.toLowerCase().includes(queryLower);
      const keywordMatch = item.keywords.some(k => k.toLowerCase().includes(queryLower));
      const solutionMatch = item.solution.toLowerCase().includes(queryLower);
      return titleMatch || keywordMatch || solutionMatch;
    });
  }

  // Update index
  private updateIndex(categoryId: string): void {
    const index = this.getIndex();
    const fileName = `${categoryId}.json`;
    if (!index.files.includes(fileName)) {
      index.files.push(fileName);
    }
    this.saveIndex(index);
  }

  // Add item
  addItem(categoryId: string, item: Omit<KnowledgeItem, 'id'>): KnowledgeItem {
    const filePath = path.join(this.knowledgeDir, `${categoryId}.json`);
    let data = { category: categoryId, items: [] as KnowledgeItem[] };

    if (fs.existsSync(filePath)) {
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    const newItem: KnowledgeItem = {
      ...item,
      id: `${categoryId}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data.items.push(newItem);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    this.updateIndex(categoryId);
    return newItem;
  }

  // Delete item
  deleteItem(categoryId: string, itemId: string): boolean {
    const filePath = path.join(this.knowledgeDir, `${categoryId}.json`);
    if (!fs.existsSync(filePath)) return false;

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const index = data.items.findIndex((i: KnowledgeItem) => i.id === itemId);
    if (index === -1) return false;

    data.items.splice(index, 1);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  }

  // Sync to GitHub
  async syncToGitHub(): Promise<{ success: boolean; message: string }> {
    if (!this.githubToken || !this.githubRepo) {
      return { success: false, message: 'GitHub not configured' };
    }

    try {
      await execAsync(`cd ${this.repoDir} && git add knowledge/`);
      await execAsync(`cd ${this.repoDir} && git commit -m "Update knowledge base"`);
      await execAsync(`cd ${this.repoDir} && git push`);
      return { success: true, message: 'Synced to GitHub' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}