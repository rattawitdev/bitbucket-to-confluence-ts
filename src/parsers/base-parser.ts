import { CodeModule, ApiEndpoint, ClassInfo, FunctionInfo } from '../types';
import * as fs from 'fs-extra';
import * as path from 'path';
import logger from '../utils/logger';

export abstract class BaseParser {
  protected language: 'go' | 'java' | 'csharp';

  constructor(language: 'go' | 'java' | 'csharp') {
    this.language = language;
  }

  public async parseFile(filePath: string): Promise<CodeModule | null> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const stats = await fs.stat(filePath);
      
      const endpoints = await this.extractApiEndpoints(content, filePath);
      const classes = await this.extractClasses(content, filePath);
      const functions = await this.extractFunctions(content, filePath);

      return {
        filePath,
        language: this.language,
        endpoints,
        classes,
        functions,
        lastModified: stats.mtime
      };
    } catch (error) {
      logger.error(`Error parsing file ${filePath}:`, error);
      return null;
    }
  }

  public async parseDirectory(directoryPath: string): Promise<CodeModule[]> {
    const modules: CodeModule[] = [];
    
    try {
      const files = await this.getSourceFiles(directoryPath);
      
      for (const file of files) {
        const module = await this.parseFile(file);
        if (module) {
          modules.push(module);
        }
      }
    } catch (error) {
      logger.error(`Error parsing directory ${directoryPath}:`, error);
    }

    return modules;
  }

  protected async getSourceFiles(directoryPath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = this.getFileExtensions();

    const traverse = async (dir: string): Promise<void> => {
      const items = await fs.readdir(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          if (!this.shouldSkipDirectory(item)) {
            await traverse(itemPath);
          }
        } else if (stats.isFile()) {
          const ext = path.extname(item);
          if (extensions.includes(ext)) {
            files.push(itemPath);
          }
        }
      }
    };

    await traverse(directoryPath);
    return files;
  }

  protected shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = ['node_modules', '.git', 'dist', 'build', 'target', 'bin', 'obj'];
    return skipDirs.includes(dirName) || dirName.startsWith('.');
  }

  // Abstract methods to be implemented by language-specific parsers
  protected abstract getFileExtensions(): string[];
  protected abstract extractApiEndpoints(content: string, filePath: string): Promise<ApiEndpoint[]>;
  protected abstract extractClasses(content: string, filePath: string): Promise<ClassInfo[]>;
  protected abstract extractFunctions(content: string, filePath: string): Promise<FunctionInfo[]>;

  // Helper method to extract comments
  protected extractComments(content: string, lineNumber: number): string {
    const lines = content.split('\n');
    let description = '';
    
    // Look for comments above the line
    for (let i = lineNumber - 2; i >= 0; i--) {
      const line = lines[i]?.trim();
      if (!line) continue;
      
      if (this.isComment(line)) {
        description = this.cleanComment(line) + '\n' + description;
      } else {
        break;
      }
    }
    
    return description.trim();
  }

  protected abstract isComment(line: string): boolean;
  protected abstract cleanComment(line: string): string;

  // Helper method to find line number of text
  protected findLineNumber(content: string, searchText: string): number {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.includes(searchText)) {
        return i + 1;
      }
    }
    return 1;
  }
}
