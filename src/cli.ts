#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { DocumentationPipeline, GitIntegration, RepositoryCloner } from './automation';
import { Config } from './config';
import { ParserFactory } from './parsers';
import logger from './utils/logger';
import * as path from 'path';
import * as fs from 'fs-extra';

interface CliOptions {
  watch: boolean;
  processAll: boolean;
  changedOnly: boolean;
  stagedOnly: boolean;
  files?: string[];
  dryRun: boolean;
  force: boolean;
  installHooks: boolean;
  uninstallHooks: boolean;
  generateOverview: boolean;
  configFile?: string;
  logLevel?: string;
  // Repository options
  repository?: string;
  branch?: string;
  token?: string;
  username?: string;
  password?: string;
  sshKey?: string;
  depth?: number;
  validateRepo: boolean;
  // Multi-file context options
  multiFileContext: boolean;
  serviceDocumentation: boolean;
  crossServiceDocumentation: boolean;
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName('doc-pipeline')
    .usage('$0 [options]')
    .version()
    .help()
    
    // Main actions
    .option('watch', {
      alias: 'w',
      type: 'boolean',
      default: false,
      description: 'Start in watch mode to monitor file changes'
    })
    .option('process-all', {
      alias: 'a',
      type: 'boolean',
      default: false,
      description: 'Process all supported files in source directories'
    })
    .option('changed-only', {
      alias: 'c',
      type: 'boolean',
      default: false,
      description: 'Process only files changed since last commit'
    })
    .option('staged-only', {
      alias: 's',
      type: 'boolean',
      default: false,
      description: 'Process only staged files (git add)'
    })
    .option('files', {
      alias: 'f',
      type: 'array',
      description: 'Specific files to process'
    })
    
    // Behavior options
    .option('dry-run', {
      alias: 'd',
      type: 'boolean',
      default: false,
      description: 'Run without making changes to Confluence'
    })
    .option('force', {
      type: 'boolean',
      default: false,
      description: 'Force update even if files haven\'t changed'
    })
    
    // Git integration
    .option('install-hooks', {
      type: 'boolean',
      default: false,
      description: 'Install git hooks for automatic documentation updates'
    })
    .option('uninstall-hooks', {
      type: 'boolean',
      default: false,
      description: 'Uninstall git hooks'
    })
    
    // Special actions
    .option('generate-overview', {
      alias: 'o',
      type: 'boolean',
      default: false,
      description: 'Generate architecture overview page'
    })
    
    // Configuration
    .option('config', {
      type: 'string',
      description: 'Path to configuration file'
    })
    .option('log-level', {
      type: 'string',
      choices: ['error', 'warn', 'info', 'debug'],
      default: 'info',
      description: 'Set logging level'
    })
    
    // Repository options
    .option('repository', {
      alias: 'repo',
      type: 'string',
      description: 'Git repository URL to clone and process'
    })
    .option('branch', {
      alias: 'b',
      type: 'string',
      description: 'Specific branch to checkout (default: main/master)'
    })
    .option('token', {
      alias: 't',
      type: 'string',
      description: 'Authentication token for private repositories'
    })
    .option('username', {
      alias: 'u',
      type: 'string',
      description: 'Username for repository authentication'
    })
    .option('password', {
      alias: 'p',
      type: 'string',
      description: 'Password for repository authentication'
    })
    .option('depth', {
      type: 'number',
      description: 'Shallow clone depth (for large repositories)'
    })
    .option('validate-repo', {
      type: 'boolean',
      default: false,
      description: 'Validate repository URL without processing'
    })
    
    // Multi-file context options
    .option('multi-file-context', {
      alias: 'mfc',
      type: 'boolean',
      default: false,
      description: 'Enable multi-file context analysis for comprehensive documentation'
    })
    .option('service-documentation', {
      alias: 'service-docs',
      type: 'boolean',
      default: true,
      description: 'Generate service-level documentation (enabled by default with multi-file context)'
    })
    .option('cross-service-documentation', {
      alias: 'cross-service',
      type: 'boolean',
      default: false,
      description: 'Generate cross-service architecture documentation'
    })
    
    .example('$0 --watch', 'Start watching for file changes')
    .example('$0 --process-all', 'Process all files once')
    .example('$0 --files src/api.go src/service.java', 'Process specific files')
    .example('$0 --changed-only', 'Process only changed files')
    .example('$0 --install-hooks', 'Install git hooks')
    .example('$0 --repository https://github.com/user/repo.git --process-all', 'Process repository from URL')
    .example('$0 --repo git@gitlab.com:user/repo.git --branch develop --token $TOKEN', 'Process private repository')
    .example('$0 --repository https://github.com/user/repo --validate-repo', 'Validate repository access')
    .example('$0 --process-all --multi-file-context', 'Process with multi-file context analysis')
    .example('$0 --process-all --mfc --cross-service', 'Generate cross-service documentation')
    .example('$0 --repository https://github.com/user/api.git --process-all --mfc', 'Repository with multi-file context')
    
    .check((argv) => {
      const actions = [argv.watch, argv.processAll, argv.changedOnly, argv.stagedOnly, argv.installHooks, argv.uninstallHooks, argv.generateOverview, argv.validateRepo];
      const activeActions = actions.filter(Boolean).length;
      
      if (activeActions === 0 && !argv.files && !argv.repository) {
        throw new Error('Please specify an action: --watch, --process-all, --changed-only, --staged-only, --files, --repository, --install-hooks, --uninstall-hooks, --validate-repo, or --generate-overview');
      }
      
      if (activeActions > 1) {
        throw new Error('Please specify only one main action at a time');
      }
      
      // Repository-specific validation
      if (argv.repository) {
        // Repository URL is provided, ensure we have a processing action
        const repoActions = [argv.processAll, argv.changedOnly, argv.generateOverview, argv.validateRepo];
        const activeRepoActions = repoActions.filter(Boolean).length;
        
        if (activeRepoActions === 0) {
          throw new Error('When using --repository, please specify what to do: --process-all, --changed-only, --generate-overview, or --validate-repo');
        }
        
        if (argv.watch) {
          throw new Error('Watch mode is not supported with repository URLs. Use local directory instead.');
        }
        
        if (argv.stagedOnly || argv.installHooks || argv.uninstallHooks) {
          throw new Error('Git-specific operations (--staged-only, --install-hooks, --uninstall-hooks) are not supported with repository URLs');
        }
      }
      
      // Authentication validation
      if ((argv.username && !argv.password) || (!argv.username && argv.password)) {
        throw new Error('Both --username and --password must be provided together');
      }
      
      if (argv.token && (argv.username || argv.password)) {
        throw new Error('Cannot use both token and username/password authentication. Choose one method.');
      }
      
      return true;
    })
    
    .parseAsync();

  const options = argv as unknown as CliOptions;

  // Set log level
  if (options.logLevel) {
    process.env.LOG_LEVEL = options.logLevel;
  }

  // Override environment variables if needed
  if (options.dryRun) {
    process.env.DRY_RUN = 'true';
  }

  // Load configuration file if specified
  if (options.configFile) {
    if (await fs.pathExists(options.configFile)) {
      const configData = await fs.readJson(options.configFile);
      for (const [key, value] of Object.entries(configData)) {
        if (typeof value === 'string') {
          process.env[key.toUpperCase()] = value;
        }
      }
      logger.info(`Loaded configuration from ${options.configFile}`);
    } else {
      logger.error(`Configuration file not found: ${options.configFile}`);
      process.exit(1);
    }
  }

  try {
    await executeAction(options);
  } catch (error) {
    logger.error('Pipeline execution failed:', error);
    process.exit(1);
  }
}

async function executeAction(options: CliOptions): Promise<void> {
  const pipeline = new DocumentationPipeline();
  const gitIntegration = new GitIntegration();
  const repositoryCloner = new RepositoryCloner();

  // Setup pipeline event listeners
  pipeline.on('started', (stats) => {
    logger.info('Pipeline started', stats);
  });

  pipeline.on('stopped', (stats) => {
    logger.info('Pipeline completed', stats);
    console.log('\n=== Pipeline Statistics ===');
    console.log(`Files Processed: ${stats.totalFilesProcessed}`);
    console.log(`Successful: ${stats.successfulProcesses}`);
    console.log(`Failed: ${stats.failedProcesses}`);
    console.log(`Pages Created: ${stats.pagesCreated}`);
    console.log(`Pages Updated: ${stats.pagesUpdated}`);
    console.log(`Total Time: ${Math.round(stats.totalProcessingTime / 1000)}s`);
    console.log(`Average Time: ${Math.round(stats.averageProcessingTime)}ms per file`);
  });

  pipeline.on('fileProcessed', (result) => {
    if (result.success) {
      logger.info(`✅ ${path.basename(result.filePath)} (${result.processingTime}ms)`);
    } else {
      logger.error(`❌ ${path.basename(result.filePath)}: ${result.error}`);
    }
  });

  pipeline.on('error', (error) => {
    logger.error('Pipeline error:', error);
  });

  // Handle repository validation
  if (options.validateRepo) {
    await handleValidateRepository(repositoryCloner, options);
    return;
  }

  // Handle repository-based processing
  if (options.repository) {
    await handleRepositoryProcessing(repositoryCloner, pipeline, options);
    return;
  }

  // Handle specific actions (local operations)
  if (options.installHooks) {
    await handleInstallHooks(gitIntegration);
    return;
  }

  if (options.uninstallHooks) {
    await handleUninstallHooks(gitIntegration);
    return;
  }

  if (options.generateOverview) {
    await pipeline.generateArchitectureOverview();
    logger.info('Architecture overview generated successfully');
    return;
  }

  // Main processing actions (local operations)
  if (options.watch) {
    await handleWatchMode(pipeline);
  } else if (options.processAll) {
    await handleProcessAll(pipeline, options);
  } else if (options.changedOnly) {
    await handleChangedOnly(pipeline, gitIntegration, options);
  } else if (options.stagedOnly) {
    await handleStagedOnly(pipeline, gitIntegration, options);
  } else if (options.files) {
    await handleSpecificFiles(pipeline, options);
  }
}

async function handleWatchMode(pipeline: DocumentationPipeline): Promise<void> {
  logger.info('Starting in watch mode...');
  
  await pipeline.start({ processAllFiles: false });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('\nReceived SIGINT, shutting down gracefully...');
    await pipeline.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('\nReceived SIGTERM, shutting down gracefully...');
    await pipeline.stop();
    process.exit(0);
  });

  // Keep the process running
  return new Promise(() => {
    // This will run indefinitely until interrupted
  });
}

async function handleProcessAll(pipeline: DocumentationPipeline, options: CliOptions): Promise<void> {
  logger.info('Processing all files...');
  
  await pipeline.start({
    processAllFiles: true,
    forceUpdate: options.force,
    skipUnchanged: !options.force,
    batchSize: 5,
    delayBetweenBatches: 1000
  });

  await pipeline.stop();
}

async function handleChangedOnly(
  pipeline: DocumentationPipeline,
  gitIntegration: GitIntegration,
  options: CliOptions
): Promise<void> {
  logger.info('Processing changed files only...');
  
  if (!(await gitIntegration.isGitRepository())) {
    throw new Error('Not a git repository. Cannot determine changed files.');
  }

  const modifiedFiles = await gitIntegration.getModifiedFiles();
  const supportedFiles = [];

  for (const file of modifiedFiles) {
    const parser = ParserFactory.getParserByFileExtension(file);
    if (parser) {
      supportedFiles.push(file);
    }
  }

  if (supportedFiles.length === 0) {
    logger.info('No supported files have been modified.');
    return;
  }

  logger.info(`Found ${supportedFiles.length} modified supported files`);
  
  await pipeline.start({ processAllFiles: false });
  await pipeline.processFiles(supportedFiles, {
    forceUpdate: options.force,
    skipUnchanged: !options.force,
    batchSize: 3
  });
  await pipeline.stop();
}

async function handleStagedOnly(
  pipeline: DocumentationPipeline,
  gitIntegration: GitIntegration,
  options: CliOptions
): Promise<void> {
  logger.info('Processing staged files only...');
  
  if (!(await gitIntegration.isGitRepository())) {
    throw new Error('Not a git repository. Cannot determine staged files.');
  }

  const stagedFiles = await gitIntegration.getStagedFiles();
  const supportedFiles = [];

  for (const file of stagedFiles) {
    const parser = ParserFactory.getParserByFileExtension(file);
    if (parser) {
      supportedFiles.push(file);
    }
  }

  if (supportedFiles.length === 0) {
    logger.info('No supported files are staged.');
    return;
  }

  logger.info(`Found ${supportedFiles.length} staged supported files`);
  
  await pipeline.start({ processAllFiles: false });
  await pipeline.processFiles(supportedFiles, {
    forceUpdate: options.force,
    skipUnchanged: !options.force,
    batchSize: 3
  });
  await pipeline.stop();
}

async function handleSpecificFiles(pipeline: DocumentationPipeline, options: CliOptions): Promise<void> {
  const files = options.files!;
  logger.info(`Processing ${files.length} specified files...`);
  
  const validFiles = [];
  for (const file of files) {
    const absolutePath = path.resolve(file);
    if (await fs.pathExists(absolutePath)) {
      const parser = ParserFactory.getParserByFileExtension(absolutePath);
      if (parser) {
        validFiles.push(absolutePath);
      } else {
        logger.warn(`Unsupported file type: ${file}`);
      }
    } else {
      logger.error(`File not found: ${file}`);
    }
  }

  if (validFiles.length === 0) {
    logger.error('No valid files to process.');
    process.exit(1);
  }

  await pipeline.start({ processAllFiles: false });
  await pipeline.processFiles(validFiles, {
    forceUpdate: options.force,
    skipUnchanged: !options.force,
    batchSize: 3
  });
  await pipeline.stop();
}

async function handleInstallHooks(gitIntegration: GitIntegration): Promise<void> {
  logger.info('Installing git hooks...');
  
  if (!(await gitIntegration.isGitRepository())) {
    throw new Error('Not a git repository. Cannot install hooks.');
  }

  await gitIntegration.installHooks(['pre-commit', 'post-commit']);
  logger.info('Git hooks installed successfully');
  logger.info('The pipeline will now run automatically on commits');
}

async function handleUninstallHooks(gitIntegration: GitIntegration): Promise<void> {
  logger.info('Uninstalling git hooks...');
  
  if (!(await gitIntegration.isGitRepository())) {
    throw new Error('Not a git repository. Cannot uninstall hooks.');
  }

  await gitIntegration.uninstallHooks(['pre-commit', 'post-commit']);
  logger.info('Git hooks uninstalled successfully');
}

async function handleValidateRepository(repositoryCloner: RepositoryCloner, options: CliOptions): Promise<void> {
  if (!options.repository) {
    throw new Error('Repository URL is required for validation');
  }

  logger.info(`Validating repository: ${options.repository}`);

  try {
    // Parse repository URL for display
    const repoInfo = RepositoryCloner.parseRepositoryUrl(options.repository);
    if (repoInfo) {
      logger.info(`Provider: ${repoInfo.provider}`);
      logger.info(`Owner: ${repoInfo.owner}`);
      logger.info(`Repository: ${repoInfo.repo}`);
      logger.info(`Protocol: ${repoInfo.protocol}`);
    }

    // Prepare repository config
    const repoConfig = {
      url: options.repository,
      branch: options.branch,
      token: options.token,
      username: options.username,
      password: options.password,
      depth: options.depth
    };

    // Validate repository access
    const isValid = await repositoryCloner.validateRepository(options.repository, repoConfig);
    
    if (isValid) {
      logger.info('✅ Repository is accessible and valid');
      
      // Try to get additional info by cloning (shallow)
      try {
        const cloneResult = await repositoryCloner.cloneRepository({
          ...repoConfig,
          depth: 1 // Minimal clone for info
        });

        const repoDetails = await repositoryCloner.getRepositoryInfo(cloneResult.localPath);
        logger.info(`Branch: ${repoDetails.currentBranch}`);
        logger.info(`Last commit: ${repoDetails.lastCommit.substring(0, 7)}`);
        logger.info(`Author: ${repoDetails.author}`);
        logger.info(`Date: ${repoDetails.commitDate.toISOString()}`);
        
        await cloneResult.cleanup();
      } catch (error) {
        logger.warn('Could not retrieve detailed repository information:', error);
      }
    } else {
      logger.error('❌ Repository is not accessible or invalid');
      logger.error('Please check:');
      logger.error('- Repository URL is correct');
      logger.error('- You have access permissions');
      logger.error('- Authentication credentials (if private repository)');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Repository validation failed:', error);
    process.exit(1);
  }
}

async function handleRepositoryProcessing(
  repositoryCloner: RepositoryCloner, 
  pipeline: DocumentationPipeline, 
  options: CliOptions
): Promise<void> {
  if (!options.repository) {
    throw new Error('Repository URL is required');
  }

  logger.info(`Processing repository: ${options.repository}`);

  try {
    // Prepare repository config
    const repoConfig = {
      url: options.repository,
      branch: options.branch,
      token: options.token,
      username: options.username,
      password: options.password,
      depth: options.depth
    };

    // Clone and process repository
    await repositoryCloner.cloneAndProcessRepository(repoConfig, async (localPath: string) => {
      logger.info(`Repository cloned to: ${localPath}`);
      
      // Get repository information
      const repoInfo = await repositoryCloner.getRepositoryInfo(localPath);
      logger.info(`Processing branch: ${repoInfo.currentBranch}`);
      logger.info(`Last commit: ${repoInfo.lastCommit.substring(0, 7)} by ${repoInfo.author}`);
      
      // Temporarily override source directories to point to cloned repository
      const originalSourceDirs = process.env.SOURCE_DIRECTORIES;
      process.env.SOURCE_DIRECTORIES = localPath;
      
      try {
        // Reinitialize config with new source directory
        const config = require('./config').Config.getInstance();
        config.config.sourceDirectories = [localPath];
        
        // Start pipeline with appropriate options
        await pipeline.start({ processAllFiles: false });
        
        if (options.processAll) {
          logger.info('Processing all files in repository...');
          await pipeline.processAllFiles({
            forceUpdate: options.force,
            skipUnchanged: !options.force,
            batchSize: 5,
            delayBetweenBatches: 1000
          });
        } else if (options.changedOnly) {
          logger.info('Processing changed files in repository...');
          
          // Get changed files (if any)
          const changedFiles = await repositoryCloner.getChangedFilesSince(localPath);
          const supportedFiles = [];

          for (const file of changedFiles) {
            const absolutePath = path.resolve(localPath, file);
            const parser = ParserFactory.getParserByFileExtension(absolutePath);
            if (parser) {
              supportedFiles.push(absolutePath);
            }
          }

          if (supportedFiles.length === 0) {
            logger.info('No supported changed files found in repository');
          } else {
            logger.info(`Found ${supportedFiles.length} changed supported files`);
            await pipeline.processFiles(supportedFiles, {
              forceUpdate: options.force,
              skipUnchanged: !options.force,
              batchSize: 3
            });
          }
        } else if (options.generateOverview) {
          logger.info('Generating architecture overview for repository...');
          await pipeline.generateArchitectureOverview();
        }
        
        await pipeline.stop();
        
      } finally {
        // Restore original source directories
        if (originalSourceDirs) {
          process.env.SOURCE_DIRECTORIES = originalSourceDirs;
        }
      }
    });

    logger.info('Repository processing completed successfully');

  } catch (error) {
    logger.error('Repository processing failed:', error);
    throw error;
  }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the CLI
if (require.main === module) {
  main();
}
