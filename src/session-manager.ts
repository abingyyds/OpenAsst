import { ServerSession, ChatMessage, ExecutionLog } from './types';
import * as fs from 'fs';
import * as path from 'path';

export class SessionManager {
  private sessions: Map<string, ServerSession> = new Map();
  private sessionsFile: string;

  constructor(dataDir: string = './data') {
    this.sessionsFile = path.join(dataDir, 'sessions.json');
    this.loadSessions();
  }

  private loadSessions(): void {
    try {
      if (fs.existsSync(this.sessionsFile)) {
        const data = fs.readFileSync(this.sessionsFile, 'utf-8');
        const sessionsArray = JSON.parse(data);
        this.sessions = new Map(sessionsArray.map((s: ServerSession) => [s.serverId, s]));
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  private saveSessions(): void {
    try {
      const sessionsArray = Array.from(this.sessions.values());
      fs.writeFileSync(this.sessionsFile, JSON.stringify(sessionsArray, null, 2));
    } catch (error) {
      console.error('Failed to save sessions:', error);
    }
  }

  getSession(serverId: string): ServerSession {
    if (!this.sessions.has(serverId)) {
      this.sessions.set(serverId, {
        serverId,
        messages: [],
        commandHistory: []
      });
    }
    return this.sessions.get(serverId)!;
  }

  addMessage(serverId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const session = this.getSession(serverId);
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      timestamp: new Date(),
      ...message
    };
    session.messages.push(newMessage);
    this.saveSessions();
    return newMessage;
  }

  addCommandLog(serverId: string, log: ExecutionLog): void {
    const session = this.getSession(serverId);
    session.commandHistory.push(log);
    this.saveSessions();
  }

  getMessages(serverId: string): ChatMessage[] {
    return this.getSession(serverId).messages;
  }

  getCommandHistory(serverId: string, limit: number = 20): ExecutionLog[] {
    const session = this.getSession(serverId);
    return session.commandHistory.slice(-limit);
  }

  getRecentSessionSummary(serverId: string): string {
    const session = this.getSession(serverId);
    const recentCommands = session.commandHistory.slice(-30);

    if (recentCommands.length === 0) {
      return '';
    }

    // Group commands by approximate task (based on time gaps)
    const tasks: string[] = [];
    let currentTask: string[] = [];
    let lastTime = 0;

    for (const log of recentCommands) {
      const logTime = log.timestamp ? new Date(log.timestamp).getTime() : Date.now();

      // If more than 5 minutes gap, consider it a new task
      if (lastTime > 0 && logTime - lastTime > 5 * 60 * 1000) {
        if (currentTask.length > 0) {
          tasks.push(currentTask.join('\n'));
          currentTask = [];
        }
      }

      // Only include successful commands or important ones
      if (log.exitCode === 0 || log.command.includes('install') || log.command.includes('which')) {
        const outputPreview = log.output?.substring(0, 100) || '';
        currentTask.push(`$ ${log.command}\n${outputPreview}`);
      }

      lastTime = logTime;
    }

    if (currentTask.length > 0) {
      tasks.push(currentTask.join('\n'));
    }

    // Return last 3 task summaries
    return tasks.slice(-3).join('\n\n---\n\n');
  }

  clearSession(serverId: string): void {
    this.sessions.delete(serverId);
  }
}
