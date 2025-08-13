import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import logger from '../utils/logger';

export interface RepositoryConfig {
  url: string;
  branch?: string;
  token?: string;
  username?: string;
  password?: string;
  sshKey?: string;
  tempDir?: string;
  depth?: number;
}

export interface CloneResult {
  localPath: string;
  repositoryInfo: {
    url: string;
    branch: string;
    lastCommit?: string;
    provider: 'github' | 'gitlab' | 'bitbucket' | 'other';
  };
  cleanup: () => Promise<void>;
}

export class RepositoryCloner {
  private tempDirectories: Set<string> = new Set();

  constructor() {
    // Cleanup temp directories on process exit
    process.on('exit', () => {
      this.cleanupAllTemp();
    });
    
    process.on('SIGINT', () => {
      this.cleanupAllTemp();
      process.exit(0);
    });
  }

  public async cloneRepository(config: RepositoryConfig): Promise<CloneResult> {
    const tempDir = config.tempDir || this.createTempDirectory();
    const git = simpleGit();
    
    try {
      logger.info(`Cloning repository: ${config.url}`);
      
      // Prepare clone options
      const cloneOptions: string[] = [];
      
      if (config.depth) {
        cloneOptions.push('--depth', config.depth.toString());
      }
      
      if (config.branch) {
        cloneOptions.push('--branch', config.branch);
      }

      // Handle authentication
      const authenticatedUrl = this.prepareAuthenticatedUrl(config);
      
      // Clone the repository
      await git.clone(authenticatedUrl, tempDir, cloneOptions);
      
      // Get repository information
      const repoGit = simpleGit(tempDir);
      const branch = config.branch || await repoGit.revparse(['--abbrev-ref', 'HEAD']);
      const lastCommit = await repoGit.revparse(['HEAD']);
      const provider = this.detectProvider(config.url);
      
      // Track temp directory for cleanup
      this.tempDirectories.add(tempDir);
      
      const result: CloneResult = {
        localPath: tempDir,
        repositoryInfo: {
          url: config.url,
          branch,
          lastCommit,
          provider
        },
        cleanup: async () => {
          await this.cleanupDirectory(tempDir);
        }
      };
      
      logger.info(`Repository cloned successfully to: ${tempDir}`);
      return result;
      
    } catch (error) {
      // Cleanup on error
      await this.cleanupDirectory(tempDir);
      logger.error(`Failed to clone repository ${config.url}:`, error);
      throw error;
    }
  }

  public async cloneAndProcessRepository(
    config: RepositoryConfig,
    processor: (localPath: string) => Promise<void>
  ): Promise<void> {
    const cloneResult = await this.cloneRepository(config);
    
    try {
      await processor(cloneResult.localPath);
    } finally {
      await cloneResult.cleanup();
    }
  }

  private prepareAuthenticatedUrl(config: RepositoryConfig): string {
    const url = new URL(config.url);
    
    // Handle different authentication methods
    if (config.token) {
      // Token-based authentication (GitHub, GitLab)
      if (url.hostname.includes('github.com')) {
        url.username = config.token;
        url.password = 'x-oauth-basic';
      } else if (url.hostname.includes('gitlab.com')) {
        url.username = 'oauth2';
        url.password = config.token;
      } else {
        // Generic token auth
        url.username = config.token;
        url.password = '';
      }
    } else if (config.username && config.password) {
      // Username/password authentication
      url.username = config.username;
      url.password = config.password;
    }
    
    return url.toString();
  }

  private detectProvider(repositoryUrl: string): 'github' | 'gitlab' | 'bitbucket' | 'other' {
    const url = repositoryUrl.toLowerCase();
    
    if (url.includes('github.com') || url.includes('github.')) {
      return 'github';
    } else if (url.includes('gitlab.com') || url.includes('gitlab.')) {
      return 'gitlab';
    } else if (url.includes('bitbucket.org') || url.includes('bitbucket.')) {
      return 'bitbucket';
    } else {
      return 'other';
    }
  }

  private createTempDirectory(): string {
    const tempBase = os.tmpdir();
    const tempName = `doc-pipeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return path.join(tempBase, tempName);
  }

  private async cleanupDirectory(dirPath: string): Promise<void> {
    try {
      if (await fs.pathExists(dirPath)) {
        await fs.remove(dirPath);
        logger.debug(`Cleaned up temporary directory: ${dirPath}`);
      }
      this.tempDirectories.delete(dirPath);
    } catch (error) {
      logger.warn(`Failed to cleanup directory ${dirPath}:`, error);
    }
  }

  private cleanupAllTemp(): void {
    for (const tempDir of this.tempDirectories) {
      try {
        fs.removeSync(tempDir);
        logger.debug(`Cleaned up temp directory: ${tempDir}`);
      } catch (error) {
        logger.warn(`Failed to cleanup temp directory ${tempDir}:`, error);
      }
    }
    this.tempDirectories.clear();
  }

  public async validateRepository(url: string, config?: Partial<RepositoryConfig>): Promise<boolean> {
    try {
      const git = simpleGit();
      
      // Test if repository is accessible
      const authenticatedUrl = config ? this.prepareAuthenticatedUrl({ url, ...config }) : url;
      
      // Try to get remote info (lightweight check)
      await git.listRemote([authenticatedUrl]);
      return true;
    } catch (error) {
      logger.debug(`Repository validation failed for ${url}:`, error);
      return false;
    }
  }

  public static parseRepositoryUrl(url: string): {
    provider: string;
    owner: string;
    repo: string;
    protocol: 'https' | 'ssh';
  } | null {
    // Handle different URL formats
    const patterns = [
      // HTTPS format: https://github.com/owner/repo.git
      /^https?:\/\/([^\/]+)\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/)?$/,
      // SSH format: git@github.com:owner/repo.git
      /^git@([^:]+):([^\/]+)\/([^\/]+?)(?:\.git)?$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const [, host, owner, repo] = match;
        return {
          provider: host!,
          owner: owner!,
          repo: repo!,
          protocol: url.startsWith('git@') ? 'ssh' : 'https'
        };
      }
    }

    return null;
  }

  public static buildRepositoryUrl(
    provider: string, 
    owner: string, 
    repo: string, 
    protocol: 'https' | 'ssh' = 'https'
  ): string {
    if (protocol === 'ssh') {
      return `git@${provider}:${owner}/${repo}.git`;
    } else {
      return `https://${provider}/${owner}/${repo}.git`;
    }
  }

  public async getRepositoryInfo(localPath: string): Promise<{
    remoteUrl?: string;
    currentBranch: string;
    lastCommit: string;
    lastCommitMessage: string;
    author: string;
    commitDate: Date;
  }> {
    const git = simpleGit(localPath);
    
    try {
      // Get remote URL
      let remoteUrl: string | undefined;
      try {
        const remotes = await git.getRemotes(true);
        const origin = remotes.find(r => r.name === 'origin');
        remoteUrl = origin?.refs?.fetch;
      } catch {
        // Ignore if no remote
      }

      // Get current branch
      const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
      
      // Get last commit info
      const log = await git.log({ maxCount: 1 });
      const lastCommit = log.latest!;
      
      return {
        remoteUrl,
        currentBranch,
        lastCommit: lastCommit.hash,
        lastCommitMessage: lastCommit.message,
        author: lastCommit.author_name,
        commitDate: new Date(lastCommit.date)
      };
    } catch (error) {
      logger.error(`Failed to get repository info from ${localPath}:`, error);
      throw error;
    }
  }

  public async getChangedFilesSince(
    localPath: string, 
    commitHash?: string, 
    branch?: string
  ): Promise<string[]> {
    const git = simpleGit(localPath);
    
    try {
      let diffCommand: string[];
      
      if (commitHash) {
        diffCommand = [`${commitHash}..HEAD`, '--name-only'];
      } else if (branch) {
        diffCommand = [`${branch}..HEAD`, '--name-only'];
      } else {
        // Get uncommitted changes
        const status = await git.status();
        return [
          ...status.modified,
          ...status.created,
          ...status.staged
        ];
      }
      
      const diff = await git.diff(diffCommand);
      return diff.split('\n').filter(file => file.trim() !== '');
    } catch (error) {
      logger.error(`Failed to get changed files from ${localPath}:`, error);
      return [];
    }
  }
}
