import { BaseParser } from './base-parser';
import { GoParser } from './go-parser';
import { JavaParser } from './java-parser';
import { CSharpParser } from './csharp-parser';
import { CodeModule } from '../types';
import * as path from 'path';

export class ParserFactory {
  private static parsers: Map<string, BaseParser> = new Map([
    ['go', new GoParser()],
    ['java', new JavaParser()],
    ['csharp', new CSharpParser()]
  ]);

  public static getParser(language: 'go' | 'java' | 'csharp'): BaseParser | null {
    return this.parsers.get(language) || null;
  }

  public static getParserByFileExtension(filePath: string): BaseParser | null {
    const extension = path.extname(filePath).toLowerCase();
    
    const extensionMap: Record<string, 'go' | 'java' | 'csharp'> = {
      '.go': 'go',
      '.java': 'java',
      '.cs': 'csharp'
    };
    
    const language = extensionMap[extension];
    return language ? this.getParser(language) : null;
  }

  public static async parseFile(filePath: string): Promise<CodeModule | null> {
    const parser = this.getParserByFileExtension(filePath);
    if (!parser) {
      return null;
    }
    
    return parser.parseFile(filePath);
  }

  public static async parseDirectory(directoryPath: string, languages?: ('go' | 'java' | 'csharp')[]): Promise<CodeModule[]> {
    const modules: CodeModule[] = [];
    const parsersToUse = languages ? languages : ['go', 'java', 'csharp'];
    
    for (const language of parsersToUse) {
      const parser = this.getParser(language);
      if (parser) {
        const languageModules = await parser.parseDirectory(directoryPath);
        modules.push(...languageModules);
      }
    }
    
    return modules;
  }

  public static getSupportedLanguages(): ('go' | 'java' | 'csharp')[] {
    return Array.from(this.parsers.keys()) as ('go' | 'java' | 'csharp')[];
  }

  public static getSupportedExtensions(): string[] {
    return ['.go', '.java', '.cs'];
  }
}

export * from './base-parser';
export * from './go-parser';
export * from './java-parser';
export * from './csharp-parser';
