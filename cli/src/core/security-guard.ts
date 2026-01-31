import * as path from 'path';
import * as os from 'os';

export interface SecurityCheck {
  safe: boolean;
  risk: 'low' | 'medium' | 'high' | 'critical';
  reason?: string;
  suggestion?: string;
}

export class SecurityGuard {
  // Dangerous command patterns
  private dangerousPatterns = [
    { pattern: /rm\s+-rf\s+\/(?!\w)/, risk: 'critical' as const, reason: 'Deleting root filesystem' },
    { pattern: /rm\s+-rf\s+~/, risk: 'critical' as const, reason: 'Deleting home directory' },
    { pattern: /rm\s+-rf\s+\*/, risk: 'high' as const, reason: 'Recursive delete with wildcard' },
    { pattern: /mkfs/, risk: 'critical' as const, reason: 'Formatting filesystem' },
    { pattern: /dd\s+if=.*of=\/dev\//, risk: 'critical' as const, reason: 'Writing directly to device' },
    { pattern: />\s*\/dev\/sd[a-z]/, risk: 'critical' as const, reason: 'Writing to disk device' },
    { pattern: /chmod\s+-R\s+777\s+\//, risk: 'high' as const, reason: 'Setting insecure permissions on root' },
    { pattern: /chown\s+-R.*:.*\s+\/(?!\w)/, risk: 'high' as const, reason: 'Changing ownership of root' },
    { pattern: /:(){ :|:& };:/, risk: 'critical' as const, reason: 'Fork bomb detected' },
    { pattern: /curl.*\|\s*sh/, risk: 'high' as const, reason: 'Piping remote script to shell' },
    { pattern: /wget.*\|\s*sh/, risk: 'high' as const, reason: 'Piping remote script to shell' },
    { pattern: /eval\s+\$\(/, risk: 'medium' as const, reason: 'Dynamic code execution' },
    { pattern: />\s*\/etc\/passwd/, risk: 'critical' as const, reason: 'Modifying passwd file' },
    { pattern: />\s*\/etc\/shadow/, risk: 'critical' as const, reason: 'Modifying shadow file' },
    { pattern: /shutdown/, risk: 'high' as const, reason: 'System shutdown command' },
    { pattern: /reboot/, risk: 'high' as const, reason: 'System reboot command' },
    { pattern: /init\s+0/, risk: 'high' as const, reason: 'System halt command' },
    { pattern: /systemctl\s+stop\s+sshd/, risk: 'high' as const, reason: 'Stopping SSH service' },
  ];

  // Sensitive paths that need extra caution
  private sensitivePaths = [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/sudoers',
    '/etc/ssh',
    '/root',
    '/boot',
    '/sys',
    '/proc',
  ];

  /**
   * Check if a command is safe to execute
   */
  checkCommand(command: string): SecurityCheck {
    const commandLower = command.toLowerCase();

    // Check against dangerous patterns
    for (const { pattern, risk, reason } of this.dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          safe: risk !== 'critical',
          risk,
          reason,
          suggestion: this.getSuggestion(reason)
        };
      }
    }

    // Check for sensitive path access
    for (const sensitivePath of this.sensitivePaths) {
      if (command.includes(sensitivePath)) {
        return {
          safe: true,
          risk: 'medium',
          reason: `Accessing sensitive path: ${sensitivePath}`,
          suggestion: 'Ensure you have proper authorization'
        };
      }
    }

    // Check for sudo usage
    if (commandLower.startsWith('sudo ')) {
      return {
        safe: true,
        risk: 'medium',
        reason: 'Command requires elevated privileges',
        suggestion: 'Verify the command before execution'
      };
    }

    return { safe: true, risk: 'low' };
  }

  /**
   * Check if a file path is safe to modify
   */
  checkFilePath(filePath: string): SecurityCheck {
    const resolved = path.resolve(filePath);
    const homeDir = os.homedir();

    // Check if it's a system file
    if (resolved.startsWith('/etc/') ||
        resolved.startsWith('/sys/') ||
        resolved.startsWith('/proc/') ||
        resolved.startsWith('/boot/')) {
      return {
        safe: false,
        risk: 'high',
        reason: 'Modifying system files',
        suggestion: 'Use sudo and verify the changes'
      };
    }

    // Check if it's outside home directory
    if (!resolved.startsWith(homeDir) && !resolved.startsWith('/tmp/')) {
      return {
        safe: true,
        risk: 'medium',
        reason: 'File is outside home directory',
        suggestion: 'Ensure you have write permissions'
      };
    }

    return { safe: true, risk: 'low' };
  }

  /**
   * Sanitize user input for shell commands
   */
  sanitizeInput(input: string): string {
    // Remove or escape dangerous characters
    return input
      .replace(/[;&|`$(){}[\]<>]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'");
  }

  /**
   * Check if a URL is safe
   */
  checkUrl(url: string): SecurityCheck {
    try {
      const parsed = new URL(url);

      // Check for suspicious protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return {
          safe: false,
          risk: 'high',
          reason: `Suspicious protocol: ${parsed.protocol}`,
          suggestion: 'Only use http or https URLs'
        };
      }

      // Check for IP addresses (could be internal)
      if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
        return {
          safe: true,
          risk: 'medium',
          reason: 'URL uses IP address instead of domain',
          suggestion: 'Verify the IP address is trusted'
        };
      }

      return { safe: true, risk: 'low' };
    } catch {
      return {
        safe: false,
        risk: 'medium',
        reason: 'Invalid URL format',
        suggestion: 'Check the URL syntax'
      };
    }
  }

  private getSuggestion(reason: string): string {
    const suggestions: { [key: string]: string } = {
      'Deleting root filesystem': 'Never run rm -rf on root. Specify exact paths.',
      'Deleting home directory': 'Be very careful when deleting home directory contents.',
      'Recursive delete with wildcard': 'Specify exact files instead of using wildcards.',
      'Formatting filesystem': 'Double-check the device before formatting.',
      'Writing directly to device': 'Verify the target device is correct.',
      'Fork bomb detected': 'This command will crash your system. Do not run.',
      'Piping remote script to shell': 'Download and review the script first.',
      'System shutdown command': 'Ensure all work is saved before shutdown.',
      'System reboot command': 'Ensure all work is saved before reboot.',
    };

    return suggestions[reason] || 'Proceed with caution.';
  }
}
