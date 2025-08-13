import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs-extra';
import { Config } from '../config';
import { ParserFactory } from '../parsers';
import logger from '../utils/logger';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  stats?: fs.Stats;
}

export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private config: Config;
  private watchedDirectories: string[] = [];
  private isWatching = false;

  constructor() {
    super();
    this.config = Config.getInstance();
  }

  public async start(): Promise<void> {
    if (this.isWatching) {
      logger.warn('File watcher is already running');
      return;
    }

    try {
      this.watchedDirectories = this.config.getSourceDirectories();
      const supportedExtensions = ParserFactory.getSupportedExtensions();
      const excludePatterns = this.config.getExcludePatterns();

      logger.info(`Starting file watcher for directories: ${this.watchedDirectories.join(', ')}`);
      logger.info(`Watching file extensions: ${supportedExtensions.join(', ')}`);
      logger.info(`Excluding patterns: ${excludePatterns.join(', ')}`);

      // Create glob patterns for supported file types
      const watchPatterns = this.watchedDirectories.flatMap(dir => 
        supportedExtensions.map(ext => path.join(dir, `**/*${ext}`))
      );

      this.watcher = chokidar.watch(watchPatterns, {
        ignored: this.createIgnoreFunction(excludePatterns),
        ignoreInitial: false,
        persistent: true,
        depth: 10,
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        }
      });

      this.setupEventListeners();
      this.isWatching = true;

      logger.info('File watcher started successfully');
    } catch (error) {
      logger.error('Error starting file watcher:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isWatching || !this.watcher) {
      return;
    }

    try {
      await this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
      logger.info('File watcher stopped');
    } catch (error) {
      logger.error('Error stopping file watcher:', error);
      throw error;
    }
  }

  public isRunning(): boolean {
    return this.isWatching;
  }

  public getWatchedDirectories(): string[] {
    return [...this.watchedDirectories];
  }

  private setupEventListeners(): void {
    if (!this.watcher) return;

    this.watcher
      .on('add', (filePath: string, stats?: fs.Stats) => {
        logger.debug(`File added: ${filePath}`);
        this.emit('fileChange', { type: 'add', filePath, stats });
      })
      .on('change', (filePath: string, stats?: fs.Stats) => {
        logger.debug(`File changed: ${filePath}`);
        this.emit('fileChange', { type: 'change', filePath, stats });
      })
      .on('unlink', (filePath: string) => {
        logger.debug(`File removed: ${filePath}`);
        this.emit('fileChange', { type: 'unlink', filePath });
      })
      .on('error', (error: Error) => {
        logger.error('File watcher error:', error);
        this.emit('error', error);
      })
      .on('ready', () => {
        logger.info('File watcher ready - initial scan complete');
        this.emit('ready');
      });
  }

  private createIgnoreFunction(excludePatterns: string[]): ((path: string) => boolean) {
    return (filePath: string) => {
      const normalizedPath = path.normalize(filePath);
      
      for (const pattern of excludePatterns) {
        // Handle different pattern types
        if (pattern.includes('*')) {
          // Use glob-like matching for patterns with wildcards
          const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
          
          const regex = new RegExp(regexPattern, 'i');
          if (regex.test(normalizedPath)) {
            return true;
          }
        } else {
          // Simple substring matching for exact patterns
          if (normalizedPath.includes(pattern)) {
            return true;
          }
        }
      }
      
      return false;
    };
  }

  public async scanDirectories(): Promise<string[]> {
    const allFiles: string[] = [];
    
    try {
      for (const directory of this.watchedDirectories) {
        const files = await this.scanDirectory(directory);
        allFiles.push(...files);
      }
      
      logger.info(`Found ${allFiles.length} files in watched directories`);
      return allFiles;
    } catch (error) {
      logger.error('Error scanning directories:', error);
      throw error;
    }
  }

  private async scanDirectory(directoryPath: string): Promise<string[]> {
    const files: string[] = [];
    const supportedExtensions = ParserFactory.getSupportedExtensions();
    const excludePatterns = this.config.getExcludePatterns();
    const ignoreFunc = this.createIgnoreFunction(excludePatterns);

    const traverse = async (dir: string): Promise<void> => {
      try {
        if (ignoreFunc(dir)) return;

        const items = await fs.readdir(dir);
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          
          if (ignoreFunc(itemPath)) continue;

          const stats = await fs.stat(itemPath);
          
          if (stats.isDirectory()) {
            await traverse(itemPath);
          } else if (stats.isFile()) {
            const ext = path.extname(item);
            if (supportedExtensions.includes(ext)) {
              files.push(itemPath);
            }
          }
        }
      } catch (error) {
        logger.warn(`Error scanning directory ${dir}:`, error);
      }
    };

    await traverse(directoryPath);
    return files;
  }

  public async getFileInfo(filePath: string): Promise<{
    exists: boolean;
    isSupported: boolean;
    language: 'go' | 'java' | 'csharp' | null;
    stats?: fs.Stats;
  }> {
    try {
      const exists = await fs.pathExists(filePath);
      if (!exists) {
        return { exists: false, isSupported: false, language: null };
      }

      const stats = await fs.stat(filePath);
      const parser = ParserFactory.getParserByFileExtension(filePath);
      const isSupported = parser !== null;
      
      let language: 'go' | 'java' | 'csharp' | null = null;
      if (isSupported) {
        const ext = path.extname(filePath);
        const extMap: Record<string, 'go' | 'java' | 'csharp'> = {
          '.go': 'go',
          '.java': 'java',
          '.cs': 'csharp'
        };
        language = extMap[ext] || null;
      }

      return { exists: true, isSupported, language, stats };
    } catch (error) {
      logger.error(`Error getting file info for ${filePath}:`, error);
      return { exists: false, isSupported: false, language: null };
    }
  }

  public addWatchDirectory(directory: string): void {
    if (!this.watchedDirectories.includes(directory)) {
      this.watchedDirectories.push(directory);
      
      if (this.watcher) {
        const supportedExtensions = ParserFactory.getSupportedExtensions();
        const watchPatterns = supportedExtensions.map(ext => 
          path.join(directory, `**/*${ext}`)
        );
        
        this.watcher.add(watchPatterns);
        logger.info(`Added watch directory: ${directory}`);
      }
    }
  }

  public removeWatchDirectory(directory: string): void {
    const index = this.watchedDirectories.indexOf(directory);
    if (index > -1) {
      this.watchedDirectories.splice(index, 1);
      
      if (this.watcher) {
        const supportedExtensions = ParserFactory.getSupportedExtensions();
        const watchPatterns = supportedExtensions.map(ext => 
          path.join(directory, `**/*${ext}`)
        );
        
        this.watcher.unwatch(watchPatterns);
        logger.info(`Removed watch directory: ${directory}`);
      }
    }
  }
}
