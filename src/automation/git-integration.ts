import simpleGit, { SimpleGit, StatusResult, DiffResult } from 'simple-git';
import { GitHookEvent, GitCommit } from '../types';
import logger from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs-extra';

export class GitIntegration {
  private git: SimpleGit;
  private repositoryPath: string;

  constructor(repositoryPath: string = process.cwd()) {
    this.repositoryPath = repositoryPath;
    this.git = simpleGit(repositoryPath);
  }

  public async getModifiedFiles(since?: string): Promise<string[]> {
    try {
      let modifiedFiles: string[] = [];

      if (since) {
        // Get files modified since specific commit/time
        const diff = await this.git.diff([`${since}..HEAD`, '--name-only']);
        modifiedFiles = diff.split('\n').filter(file => file.trim() !== '');
      } else {
        // Get uncommitted changes
        const status = await this.git.status();
        modifiedFiles = [
          ...status.modified,
          ...status.created,
          ...status.staged
        ];
      }

      // Convert relative paths to absolute paths
      return modifiedFiles.map(file => path.resolve(this.repositoryPath, file));
    } catch (error) {
      logger.error('Error getting modified files from git:', error);
      throw error;
    }
  }

  public async getFileHistory(filePath: string, maxCount: number = 10): Promise<GitCommit[]> {
    try {
      const relativePath = path.relative(this.repositoryPath, filePath);
      const log = await this.git.log({
        file: relativePath,
        maxCount
      });

      return log.all.map(commit => ({
        id: commit.hash,
        message: commit.message,
        author: commit.author_name,
        timestamp: new Date(commit.date),
        modifiedFiles: [filePath] // Simplified - would need more analysis for actual modified files
      }));
    } catch (error) {
      logger.error(`Error getting file history for ${filePath}:`, error);
      return [];
    }
  }

  public async getLastCommitForFile(filePath: string): Promise<GitCommit | null> {
    try {
      const history = await this.getFileHistory(filePath, 1);
      return history.length > 0 ? history[0]! : null;
    } catch (error) {
      logger.error(`Error getting last commit for ${filePath}:`, error);
      return null;
    }
  }

  public async getCurrentBranch(): Promise<string> {
    try {
      const status = await this.git.status();
      return status.current || 'unknown';
    } catch (error) {
      logger.error('Error getting current branch:', error);
      return 'unknown';
    }
  }

  public async getRepositoryInfo(): Promise<{
    branch: string;
    remoteUrl?: string;
    lastCommit?: GitCommit;
    isClean: boolean;
  }> {
    try {
      const status = await this.git.status();
      const branch = status.current || 'unknown';
      const isClean = status.files.length === 0;

      // Get remote URL
      let remoteUrl: string | undefined;
      try {
        const remotes = await this.git.getRemotes(true);
        const origin = remotes.find(remote => remote.name === 'origin');
        remoteUrl = origin?.refs?.fetch;
      } catch {
        // Ignore if no remotes
      }

      // Get last commit
      let lastCommit: GitCommit | undefined;
      try {
        const log = await this.git.log({ maxCount: 1 });
        if (log.all.length > 0) {
          const commit = log.all[0]!;
          lastCommit = {
            id: commit.hash,
            message: commit.message,
            author: commit.author_name,
            timestamp: new Date(commit.date),
            modifiedFiles: []
          };
        }
      } catch {
        // Ignore if no commits
      }

      return { branch, remoteUrl, lastCommit, isClean };
    } catch (error) {
      logger.error('Error getting repository info:', error);
      throw error;
    }
  }

  public async createGitHookEvent(): Promise<GitHookEvent> {
    try {
      const repoInfo = await this.getRepositoryInfo();
      const modifiedFiles = await this.getModifiedFiles();

      // Get recent commits (for CI scenarios)
      const recentCommits: GitCommit[] = [];
      try {
        const log = await this.git.log({ maxCount: 5 });
        for (const commit of log.all) {
          recentCommits.push({
            id: commit.hash,
            message: commit.message,
            author: commit.author_name,
            timestamp: new Date(commit.date),
            modifiedFiles: [] // Would need additional analysis
          });
        }
      } catch {
        // Ignore if no commits
      }

      return {
        repository: repoInfo.remoteUrl || this.repositoryPath,
        branch: repoInfo.branch,
        commits: recentCommits,
        modifiedFiles
      };
    } catch (error) {
      logger.error('Error creating git hook event:', error);
      throw error;
    }
  }

  public async installHooks(hookTypes: ('pre-commit' | 'post-commit' | 'post-receive')[]): Promise<void> {
    try {
      const hooksDir = path.join(this.repositoryPath, '.git', 'hooks');
      await fs.ensureDir(hooksDir);

      for (const hookType of hookTypes) {
        await this.createHookScript(hooksDir, hookType);
      }

      logger.info(`Installed git hooks: ${hookTypes.join(', ')}`);
    } catch (error) {
      logger.error('Error installing git hooks:', error);
      throw error;
    }
  }

  private async createHookScript(hooksDir: string, hookType: string): Promise<void> {
    const hookPath = path.join(hooksDir, hookType);
    
    let scriptContent: string;
    
    switch (hookType) {
      case 'pre-commit':
        scriptContent = this.getPreCommitScript();
        break;
      case 'post-commit':
        scriptContent = this.getPostCommitScript();
        break;
      case 'post-receive':
        scriptContent = this.getPostReceiveScript();
        break;
      default:
        throw new Error(`Unsupported hook type: ${hookType}`);
    }

    await fs.writeFile(hookPath, scriptContent, { mode: 0o755 });
    logger.info(`Created ${hookType} hook at ${hookPath}`);
  }

  private getPreCommitScript(): string {
    return `#!/bin/bash
# Pre-commit hook for documentation pipeline
# This script runs before each commit to update documentation for staged files

echo "Running documentation pipeline pre-commit hook..."

# Get the directory of this script
REPO_ROOT=$(git rev-parse --show-toplevel)
NODE_CMD="node"

# Check if the pipeline script exists
if [ -f "$REPO_ROOT/dist/cli.js" ]; then
    $NODE_CMD "$REPO_ROOT/dist/cli.js" --staged-only --no-watch
    exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        echo "Documentation pipeline failed. Commit aborted."
        exit 1
    fi
    
    echo "Documentation pipeline completed successfully."
else
    echo "Documentation pipeline not found. Skipping..."
fi

exit 0
`;
  }

  private getPostCommitScript(): string {
    return `#!/bin/bash
# Post-commit hook for documentation pipeline
# This script runs after each commit to update documentation for committed files

echo "Running documentation pipeline post-commit hook..."

# Get the directory of this script
REPO_ROOT=$(git rev-parse --show-toplevel)
NODE_CMD="node"

# Check if the pipeline script exists
if [ -f "$REPO_ROOT/dist/cli.js" ]; then
    # Run in background to not slow down commit process
    ($NODE_CMD "$REPO_ROOT/dist/cli.js" --changed-only --no-watch > "$REPO_ROOT/pipeline.log" 2>&1 &)
    
    echo "Documentation pipeline started in background. Check pipeline.log for details."
else
    echo "Documentation pipeline not found. Skipping..."
fi

exit 0
`;
  }

  private getPostReceiveScript(): string {
    return `#!/bin/bash
# Post-receive hook for documentation pipeline
# This script runs when commits are pushed to the repository

echo "Running documentation pipeline post-receive hook..."

# Read the push information
while read oldrev newrev refname; do
    # Only process pushes to main/master branches
    if [[ $refname =~ refs/heads/(main|master)$ ]]; then
        echo "Processing push to $refname..."
        
        # Get the directory of this script
        REPO_ROOT=$(git rev-parse --show-toplevel)
        NODE_CMD="node"
        
        # Check if the pipeline script exists
        if [ -f "$REPO_ROOT/dist/cli.js" ]; then
            $NODE_CMD "$REPO_ROOT/dist/cli.js" --process-all --no-watch
            
            if [ $? -eq 0 ]; then
                echo "Documentation pipeline completed successfully."
            else
                echo "Documentation pipeline failed."
            fi
        else
            echo "Documentation pipeline not found. Skipping..."
        fi
    else
        echo "Ignoring push to $refname"
    fi
done

exit 0
`;
  }

  public async uninstallHooks(hookTypes: ('pre-commit' | 'post-commit' | 'post-receive')[]): Promise<void> {
    try {
      const hooksDir = path.join(this.repositoryPath, '.git', 'hooks');
      
      for (const hookType of hookTypes) {
        const hookPath = path.join(hooksDir, hookType);
        
        if (await fs.pathExists(hookPath)) {
          await fs.remove(hookPath);
          logger.info(`Removed ${hookType} hook`);
        }
      }

      logger.info(`Uninstalled git hooks: ${hookTypes.join(', ')}`);
    } catch (error) {
      logger.error('Error uninstalling git hooks:', error);
      throw error;
    }
  }

  public async getStagedFiles(): Promise<string[]> {
    try {
      const status = await this.git.status();
      const stagedFiles = [
        ...status.staged,
        ...status.created.filter(file => status.staged.includes(file))
      ];

      return stagedFiles.map(file => path.resolve(this.repositoryPath, file));
    } catch (error) {
      logger.error('Error getting staged files:', error);
      throw error;
    }
  }

  public async getChangedFilesSince(commitHash: string): Promise<string[]> {
    try {
      const diff = await this.git.diff([`${commitHash}..HEAD`, '--name-only']);
      const changedFiles = diff.split('\n').filter(file => file.trim() !== '');
      
      return changedFiles.map(file => path.resolve(this.repositoryPath, file));
    } catch (error) {
      logger.error(`Error getting changed files since ${commitHash}:`, error);
      throw error;
    }
  }

  public async isGitRepository(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  public async hasUncommittedChanges(): Promise<boolean> {
    try {
      const status = await this.git.status();
      return status.files.length > 0;
    } catch (error) {
      logger.error('Error checking for uncommitted changes:', error);
      return false;
    }
  }
}
