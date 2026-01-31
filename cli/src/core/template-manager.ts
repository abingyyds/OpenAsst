import { DeployPlan, DeployStep } from '../types';

export interface DeployTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  plan: DeployPlan;
}

export class TemplateManager {
  private templates: DeployTemplate[] = [
    this.nodejsTemplate(),
    this.pythonTemplate(),
    this.dockerTemplate(),
    this.nginxTemplate(),
    this.mysqlTemplate(),
    this.redisTemplate(),
    this.nextjsTemplate(),
  ];

  getAll(): DeployTemplate[] {
    return this.templates;
  }

  search(keyword: string): DeployTemplate[] {
    const kw = keyword.toLowerCase();
    return this.templates.filter(t =>
      t.name.toLowerCase().includes(kw) ||
      t.tags.some(tag => tag.includes(kw))
    );
  }

  getById(id: string): DeployTemplate | undefined {
    return this.templates.find(t => t.id === id);
  }

  private nodejsTemplate(): DeployTemplate {
    return {
      id: 'nodejs',
      name: 'Node.js Project Deploy',
      description: 'Deploy standard Node.js project',
      tags: ['nodejs', 'npm', 'javascript'],
      plan: {
        projectName: 'Node.js Project',
        description: 'Install dependencies and start Node.js application',
        prerequisites: ['node', 'npm'],
        steps: [
          { description: 'Install dependencies', command: 'npm install' },
          { description: 'Build project', command: 'npm run build', optional: true },
          { description: 'Start application', command: 'npm start' }
        ],
        verifyCommand: 'curl -s http://localhost:3000 || echo "Service not responding"'
      }
    };
  }

  private pythonTemplate(): DeployTemplate {
    return {
      id: 'python',
      name: 'Python Project Deploy',
      description: 'Deploy Python project (Flask/Django/FastAPI)',
      tags: ['python', 'pip', 'flask', 'django'],
      plan: {
        projectName: 'Python Project',
        description: 'Create virtual environment and install dependencies',
        prerequisites: ['python3', 'pip'],
        steps: [
          { description: 'Create virtual environment', command: 'python3 -m venv venv' },
          { description: 'Activate and install dependencies', command: './venv/bin/pip install -r requirements.txt' },
          { description: 'Start application', command: './venv/bin/python app.py' }
        ]
      }
    };
  }

  private dockerTemplate(): DeployTemplate {
    return {
      id: 'docker',
      name: 'Docker Container Deploy',
      description: 'Deploy application using Docker',
      tags: ['docker', 'container'],
      plan: {
        projectName: 'Docker Project',
        description: 'Build and run Docker container',
        prerequisites: ['docker'],
        steps: [
          { description: 'Build image', command: 'docker build -t myapp .' },
          { description: 'Stop old container', command: 'docker stop myapp 2>/dev/null || true', optional: true },
          { description: 'Remove old container', command: 'docker rm myapp 2>/dev/null || true', optional: true },
          { description: 'Start container', command: 'docker run -d --name myapp -p 3000:3000 myapp' }
        ],
        verifyCommand: 'docker ps | grep myapp'
      }
    };
  }

  private nginxTemplate(): DeployTemplate {
    return {
      id: 'nginx',
      name: 'Nginx Reverse Proxy',
      description: 'Configure Nginx reverse proxy',
      tags: ['nginx', 'proxy', 'web'],
      plan: {
        projectName: 'Nginx Config',
        description: 'Install and configure Nginx',
        prerequisites: [],
        steps: [
          { description: 'Install Nginx', command: 'sudo apt-get install -y nginx || sudo yum install -y nginx' },
          { description: 'Start Nginx', command: 'sudo systemctl start nginx' },
          { description: 'Enable auto start', command: 'sudo systemctl enable nginx' }
        ],
        verifyCommand: 'curl -s http://localhost'
      }
    };
  }

  private mysqlTemplate(): DeployTemplate {
    return {
      id: 'mysql',
      name: 'MySQL Database',
      description: 'Install MySQL database',
      tags: ['mysql', 'database', 'db'],
      plan: {
        projectName: 'MySQL',
        description: 'Install and configure MySQL',
        prerequisites: [],
        steps: [
          { description: 'Install MySQL', command: 'sudo apt-get install -y mysql-server || sudo yum install -y mysql-server' },
          { description: 'Start service', command: 'sudo systemctl start mysqld || sudo systemctl start mysql' },
          { description: 'Enable auto start', command: 'sudo systemctl enable mysqld || sudo systemctl enable mysql' }
        ],
        verifyCommand: 'mysql --version'
      }
    };
  }

  private redisTemplate(): DeployTemplate {
    return {
      id: 'redis',
      name: 'Redis Cache',
      description: 'Install Redis cache service',
      tags: ['redis', 'cache', 'database'],
      plan: {
        projectName: 'Redis',
        description: 'Install and start Redis',
        prerequisites: [],
        steps: [
          { description: 'Install Redis', command: 'sudo apt-get install -y redis-server || sudo yum install -y redis' },
          { description: 'Start service', command: 'sudo systemctl start redis || sudo systemctl start redis-server' },
          { description: 'Enable auto start', command: 'sudo systemctl enable redis || sudo systemctl enable redis-server' }
        ],
        verifyCommand: 'redis-cli ping'
      }
    };
  }

  private nextjsTemplate(): DeployTemplate {
    return {
      id: 'nextjs',
      name: 'Next.js Project',
      description: 'Deploy Next.js application',
      tags: ['nextjs', 'react', 'nodejs'],
      plan: {
        projectName: 'Next.js',
        description: 'Build and start Next.js application',
        prerequisites: ['node', 'npm'],
        steps: [
          { description: 'Install dependencies', command: 'npm install' },
          { description: 'Build project', command: 'npm run build' },
          { description: 'Start production server', command: 'npm start' }
        ],
        verifyCommand: 'curl -s http://localhost:3000'
      }
    };
  }
}
