import * as dotenv from 'dotenv';
import { PipelineConfig } from '../types';

// Load environment variables
dotenv.config();

export class Config {
  private static instance: Config;
  public readonly config: PipelineConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  private loadConfig(): PipelineConfig {
    // Validate required environment variables
    const requiredVars = [
      'CLAUDE_API_KEY',
      'CONFLUENCE_BASE_URL',
      'CONFLUENCE_USERNAME',
      'CONFLUENCE_API_TOKEN',
      'CONFLUENCE_SPACE_KEY'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    return {
      sourceDirectories: process.env.SOURCE_DIRECTORIES?.split(',') || ['./src'],
      excludePatterns: process.env.EXCLUDE_PATTERNS?.split(',') || [
        'node_modules',
        '.git',
        'dist',
        'build',
        '*.test.*',
        '*.spec.*'
      ],
      includeLanguages: (process.env.INCLUDE_LANGUAGES?.split(',') as ('go' | 'java' | 'csharp')[]) || ['go', 'java', 'csharp'],
      
      confluence: {
        baseUrl: process.env.CONFLUENCE_BASE_URL!,
        username: process.env.CONFLUENCE_USERNAME!,
        apiToken: process.env.CONFLUENCE_API_TOKEN!,
        spaceKey: process.env.CONFLUENCE_SPACE_KEY!
      },
      
      claude: {
        apiKey: process.env.CLAUDE_API_KEY!,
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '4000')
      },
      
      watchMode: process.env.WATCH_MODE === 'true',
      dryRun: process.env.DRY_RUN === 'true'
    };
  }

  public getSourceDirectories(): string[] {
    return this.config.sourceDirectories;
  }

  public getExcludePatterns(): string[] {
    return this.config.excludePatterns;
  }

  public getIncludeLanguages(): ('go' | 'java' | 'csharp')[] {
    return this.config.includeLanguages;
  }

  public getConfluenceConfig() {
    return this.config.confluence;
  }

  public getClaudeConfig() {
    return this.config.claude;
  }

  public isWatchMode(): boolean {
    return this.config.watchMode;
  }

  public isDryRun(): boolean {
    return this.config.dryRun;
  }
}
