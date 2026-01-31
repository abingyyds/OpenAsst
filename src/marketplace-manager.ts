import { ScriptTemplate, ScriptParameter } from './marketplace-types';
import { officialTemplates } from './script-templates';
import * as fs from 'fs';
import * as path from 'path';

export class MarketplaceManager {
  private templates: Map<string, ScriptTemplate> = new Map();
  private dataFile: string;

  constructor(dataDir: string) {
    this.dataFile = path.join(dataDir, 'marketplace.json');
    this.loadTemplates();
  }

  private loadTemplates(): void {
    // 加载官方模板
    officialTemplates.forEach(template => {
      this.templates.set(template.id, template);
    });

    // 加载用户自定义模板
    if (fs.existsSync(this.dataFile)) {
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf-8'));
      data.forEach((template: ScriptTemplate) => {
        this.templates.set(template.id, template);
      });
    }
  }

  private saveTemplates(): void {
    const userTemplates = Array.from(this.templates.values())
      .filter(t => !t.isOfficial);
    fs.writeFileSync(this.dataFile, JSON.stringify(userTemplates, null, 2));
  }

  getAllTemplates(): ScriptTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplate(id: string): ScriptTemplate | undefined {
    return this.templates.get(id);
  }

  searchTemplates(query: string, category?: string): ScriptTemplate[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.templates.values()).filter(template => {
      const matchesQuery =
        template.name.toLowerCase().includes(lowerQuery) ||
        template.description.toLowerCase().includes(lowerQuery) ||
        template.tags.some(tag => tag.toLowerCase().includes(lowerQuery));

      const matchesCategory = !category || template.category === category;

      return matchesQuery && matchesCategory && template.isPublic;
    });
  }
}
