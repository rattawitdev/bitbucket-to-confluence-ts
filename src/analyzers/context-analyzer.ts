import { CodeModule, ApiEndpoint, ClassInfo, FunctionInfo } from '../types';
import { ParserFactory } from '../parsers';
import * as path from 'path';
import * as fs from 'fs-extra';
import logger from '../utils/logger';

export interface FileRelationship {
  sourceFile: string;
  targetFile: string;
  relationType: 'import' | 'extends' | 'implements' | 'calls' | 'references' | 'config';
  details: string;
}

export interface ServiceContext {
  serviceName: string;
  rootPath: string;
  controllers: CodeModule[];
  services: CodeModule[];
  models: CodeModule[];
  repositories: CodeModule[];
  configurations: CodeModule[];
  utilities: CodeModule[];
  tests: CodeModule[];
  relationships: FileRelationship[];
  apiEndpoints: ApiEndpoint[];
  businessLogic: ClassInfo[];
  dataModels: ClassInfo[];
}

export interface CrossFileReference {
  fromFile: string;
  fromLocation: { line: number; column: number };
  toFile: string;
  toSymbol: string;
  referenceType: 'class' | 'function' | 'interface' | 'type' | 'constant';
}

export class ContextAnalyzer {
  private codeModules: Map<string, CodeModule> = new Map();
  private fileRelationships: FileRelationship[] = [];
  private crossReferences: CrossFileReference[] = [];

  public async analyzeDirectory(directoryPath: string): Promise<ServiceContext[]> {
    logger.info(`Analyzing directory with multi-file context: ${directoryPath}`);
    
    try {
      // 1. Parse all files and build module map
      await this.parseAllFiles(directoryPath);
      
      // 2. Analyze file relationships and dependencies
      await this.analyzeFileRelationships();
      
      // 3. Extract cross-file references
      await this.extractCrossFileReferences();
      
      // 4. Group files into service contexts
      const serviceContexts = await this.groupIntoServiceContexts(directoryPath);
      
      logger.info(`Found ${serviceContexts.length} service contexts with multi-file relationships`);
      return serviceContexts;
      
    } catch (error) {
      logger.error('Error in context analysis:', error);
      throw error;
    }
  }

  private async parseAllFiles(directoryPath: string): Promise<void> {
    const allFiles = await this.findAllSupportedFiles(directoryPath);
    
    logger.info(`Parsing ${allFiles.length} files for context analysis`);
    
    for (const filePath of allFiles) {
      const module = await ParserFactory.parseFile(filePath);
      if (module) {
        this.codeModules.set(filePath, module);
      }
    }
  }

  private async findAllSupportedFiles(directoryPath: string): Promise<string[]> {
    const files: string[] = [];
    const supportedExtensions = ParserFactory.getSupportedExtensions();
    
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
          if (supportedExtensions.includes(ext)) {
            files.push(itemPath);
          }
        }
      }
    };

    await traverse(directoryPath);
    return files;
  }

  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = [
      'node_modules', '.git', 'dist', 'build', 'target', 'bin', 'obj',
      '.idea', '.vscode', 'coverage', 'logs', 'tmp', 'temp'
    ];
    return skipDirs.includes(dirName) || dirName.startsWith('.');
  }

  private async analyzeFileRelationships(): Promise<void> {
    for (const [filePath, module] of this.codeModules.entries()) {
      await this.findRelationshipsForFile(filePath, module);
    }
  }

  private async findRelationshipsForFile(filePath: string, module: CodeModule): Promise<void> {
    const content = await fs.readFile(filePath, 'utf8');
    
    // Analyze imports/dependencies based on language
    switch (module.language) {
      case 'go':
        await this.analyzeGoRelationships(filePath, content);
        break;
      case 'java':
        await this.analyzeJavaRelationships(filePath, content);
        break;
      case 'csharp':
        await this.analyzeCSharpRelationships(filePath, content);
        break;
    }
  }

  private async analyzeGoRelationships(filePath: string, content: string): Promise<void> {
    // Go import analysis
    const importRegex = /import\s+(?:\(\s*([^)]+)\s*\)|"([^"]+)")/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const imports = match[1] || match[2];
      if (imports) {
        const importLines = imports.split('\n').filter(line => line.trim());
        
        for (const importLine of importLines) {
          const cleanImport = importLine.replace(/"/g, '').trim();
          if (cleanImport && !cleanImport.startsWith('//')) {
            // Try to resolve local imports
            const resolvedPath = await this.resolveGoImport(filePath, cleanImport);
            if (resolvedPath) {
              this.fileRelationships.push({
                sourceFile: filePath,
                targetFile: resolvedPath,
                relationType: 'import',
                details: cleanImport
              });
            }
          }
        }
      }
    }

    // Struct embedding analysis
    const structRegex = /type\s+(\w+)\s+struct\s*\{[^}]*(\w+)(?:\s+`[^`]*`)?[^}]*\}/g;
    while ((match = structRegex.exec(content)) !== null) {
      // Look for embedded types that might be from other files
      // This is a simplified analysis
    }
  }

  private async analyzeJavaRelationships(filePath: string, content: string): Promise<void> {
    // Java import analysis
    const importRegex = /import\s+(?:static\s+)?([^;]+);/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1]?.trim();
      if (importPath) {
        const resolvedPath = await this.resolveJavaImport(filePath, importPath);
        if (resolvedPath) {
          this.fileRelationships.push({
            sourceFile: filePath,
            targetFile: resolvedPath,
            relationType: 'import',
            details: importPath
          });
        }
      }
    }

    // Inheritance analysis
    const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g;
    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];
      const extendsClass = match[2];
      const implementsInterfaces = match[3];

      if (extendsClass) {
        const targetFile = await this.findClassDefinition(filePath, extendsClass);
        if (targetFile) {
          this.fileRelationships.push({
            sourceFile: filePath,
            targetFile,
            relationType: 'extends',
            details: `${className} extends ${extendsClass}`
          });
        }
      }

      if (implementsInterfaces) {
        const interfaces = implementsInterfaces.split(',').map(i => i.trim());
        for (const interfaceName of interfaces) {
          const targetFile = await this.findClassDefinition(filePath, interfaceName);
          if (targetFile) {
            this.fileRelationships.push({
              sourceFile: filePath,
              targetFile,
              relationType: 'implements',
              details: `${className} implements ${interfaceName}`
            });
          }
        }
      }
    }

    // Annotation analysis
    const annotationRegex = /@(\w+)(?:\([^)]*\))?/g;
    while ((match = annotationRegex.exec(content)) !== null) {
      const annotation = match[1];
      // Look for service/component relationships
      if (['Autowired', 'Inject', 'Service', 'Component', 'Repository'].includes(annotation)) {
        // Find related services/components
        await this.findServiceDependencies(filePath, content, annotation);
      }
    }
  }

  private async analyzeCSharpRelationships(filePath: string, content: string): Promise<void> {
    // C# using analysis
    const usingRegex = /using\s+([^;]+);/g;
    let match;

    while ((match = usingRegex.exec(content)) !== null) {
      const usingPath = match[1]?.trim();
      if (usingPath) {
        const resolvedPath = await this.resolveCSharpUsing(filePath, usingPath);
        if (resolvedPath) {
          this.fileRelationships.push({
            sourceFile: filePath,
            targetFile: resolvedPath,
            relationType: 'import',
            details: usingPath
          });
        }
      }
    }

    // Inheritance analysis
    const classRegex = /class\s+(\w+)(?:\s*:\s*([\w,\s<>]+))?/g;
    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];
      const baseTypes = match[2];

      if (baseTypes) {
        const types = baseTypes.split(',').map(t => t.trim());
        for (const baseType of types) {
          const cleanType = baseType.replace(/<.*>/, ''); // Remove generics
          const targetFile = await this.findClassDefinition(filePath, cleanType);
          if (targetFile) {
            this.fileRelationships.push({
              sourceFile: filePath,
              targetFile,
              relationType: 'extends',
              details: `${className} : ${baseType}`
            });
          }
        }
      }
    }

    // Dependency injection analysis
    const diRegex = /(?:private|protected|public)\s+readonly\s+I(\w+)\s+_(\w+);/g;
    while ((match = diRegex.exec(content)) !== null) {
      const interfaceName = `I${match[1]}`;
      const fieldName = match[2];
      
      const targetFile = await this.findClassDefinition(filePath, interfaceName);
      if (targetFile) {
        this.fileRelationships.push({
          sourceFile: filePath,
          targetFile,
          relationType: 'references',
          details: `Dependency injection: ${interfaceName}`
        });
      }
    }
  }

  private async resolveGoImport(filePath: string, importPath: string): Promise<string | null> {
    // Simple local import resolution for Go
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const basePath = path.dirname(filePath);
      const resolvedPath = path.resolve(basePath, importPath);
      
      // Look for .go files in the resolved directory
      if (await fs.pathExists(resolvedPath)) {
        const files = await fs.readdir(resolvedPath);
        const goFile = files.find(f => f.endsWith('.go'));
        if (goFile) {
          return path.join(resolvedPath, goFile);
        }
      }
    }
    return null;
  }

  private async resolveJavaImport(filePath: string, importPath: string): Promise<string | null> {
    // Convert Java package path to file path
    const relativePath = importPath.replace(/\./g, '/') + '.java';
    const projectRoot = await this.findProjectRoot(filePath);
    
    if (projectRoot) {
      const possiblePaths = [
        path.join(projectRoot, 'src', 'main', 'java', relativePath),
        path.join(projectRoot, 'src', relativePath),
        path.join(path.dirname(filePath), relativePath)
      ];

      for (const possiblePath of possiblePaths) {
        if (await fs.pathExists(possiblePath)) {
          return possiblePath;
        }
      }
    }
    return null;
  }

  private async resolveCSharpUsing(filePath: string, usingPath: string): Promise<string | null> {
    // Convert C# namespace to file path
    const relativePath = usingPath.replace(/\./g, '/') + '.cs';
    const projectRoot = await this.findProjectRoot(filePath);
    
    if (projectRoot) {
      const possiblePaths = [
        path.join(projectRoot, relativePath),
        path.join(path.dirname(filePath), relativePath)
      ];

      for (const possiblePath of possiblePaths) {
        if (await fs.pathExists(possiblePath)) {
          return possiblePath;
        }
      }
    }
    return null;
  }

  private async findClassDefinition(basePath: string, className: string): Promise<string | null> {
    // Search for class definition in known modules
    for (const [filePath, module] of this.codeModules.entries()) {
      const hasClass = module.classes.some(cls => cls.name === className);
      if (hasClass) {
        return filePath;
      }
    }
    return null;
  }

  private async findServiceDependencies(filePath: string, content: string, annotation: string): Promise<void> {
    // Look for field declarations with dependency injection
    const fieldRegex = /@Autowired\s+(?:private|protected|public)?\s*(\w+)\s+(\w+);/g;
    let match;

    while ((match = fieldRegex.exec(content)) !== null) {
      const serviceType = match[1];
      const fieldName = match[2];

      const targetFile = await this.findClassDefinition(filePath, serviceType);
      if (targetFile) {
        this.fileRelationships.push({
          sourceFile: filePath,
          targetFile,
          relationType: 'references',
          details: `@Autowired ${serviceType} ${fieldName}`
        });
      }
    }
  }

  private async findProjectRoot(filePath: string): Promise<string | null> {
    let currentPath = path.dirname(filePath);
    
    while (currentPath !== path.dirname(currentPath)) {
      const possibleMarkers = [
        'package.json', 'pom.xml', 'build.gradle', 
        'go.mod', '*.csproj', '*.sln', '.git'
      ];

      for (const marker of possibleMarkers) {
        if (marker === '.git') {
          if (await fs.pathExists(path.join(currentPath, marker))) {
            return currentPath;
          }
        } else if (marker.includes('*')) {
          const files = await fs.readdir(currentPath);
          const pattern = marker.replace('*', '');
          if (files.some(f => f.endsWith(pattern))) {
            return currentPath;
          }
        } else {
          if (await fs.pathExists(path.join(currentPath, marker))) {
            return currentPath;
          }
        }
      }
      
      currentPath = path.dirname(currentPath);
    }
    
    return null;
  }

  private async extractCrossFileReferences(): Promise<void> {
    // This would involve more sophisticated analysis
    // For now, we'll use the relationships we've found
    for (const relationship of this.fileRelationships) {
      // Convert relationships to cross-references
      // This is a simplified version
    }
  }

  private async groupIntoServiceContexts(basePath: string): Promise<ServiceContext[]> {
    const contexts: ServiceContext[] = [];
    const processedFiles = new Set<string>();

    // Group files by service/module patterns
    const serviceGroups = this.groupFilesByService();

    for (const [serviceName, files] of serviceGroups.entries()) {
      const context = await this.createServiceContext(serviceName, basePath, files);
      contexts.push(context);
      
      files.forEach(file => processedFiles.add(file));
    }

    // Handle ungrouped files
    const ungroupedFiles = Array.from(this.codeModules.keys())
      .filter(file => !processedFiles.has(file));

    if (ungroupedFiles.length > 0) {
      const context = await this.createServiceContext(
        'General', 
        basePath, 
        ungroupedFiles
      );
      contexts.push(context);
    }

    return contexts;
  }

  private groupFilesByService(): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const filePath of this.codeModules.keys()) {
      const serviceName = this.extractServiceName(filePath);
      
      if (!groups.has(serviceName)) {
        groups.set(serviceName, []);
      }
      groups.get(serviceName)!.push(filePath);
    }

    return groups;
  }

  private extractServiceName(filePath: string): string {
    const fileName = path.basename(filePath, path.extname(filePath));
    const dirName = path.basename(path.dirname(filePath));
    
    // Common service patterns
    const patterns = [
      /(.+)Controller$/i,
      /(.+)Service$/i,
      /(.+)Handler$/i,
      /(.+)Repository$/i,
      /(.+)Manager$/i,
      /(.+)Provider$/i,
      /(.+)Component$/i
    ];

    for (const pattern of patterns) {
      const match = fileName.match(pattern);
      if (match) {
        return match[1]!;
      }
    }

    // Use directory name if no pattern matches
    return dirName === '.' ? 'Root' : dirName;
  }

  private async createServiceContext(
    serviceName: string,
    rootPath: string,
    files: string[]
  ): Promise<ServiceContext> {
    const context: ServiceContext = {
      serviceName,
      rootPath,
      controllers: [],
      services: [],
      models: [],
      repositories: [],
      configurations: [],
      utilities: [],
      tests: [],
      relationships: [],
      apiEndpoints: [],
      businessLogic: [],
      dataModels: []
    };

    // Categorize files and collect their modules
    for (const filePath of files) {
      const module = this.codeModules.get(filePath);
      if (!module) continue;

      const fileType = this.categorizeFile(filePath);
      
      switch (fileType) {
        case 'controller':
          context.controllers.push(module);
          context.apiEndpoints.push(...module.endpoints);
          break;
        case 'service':
          context.services.push(module);
          context.businessLogic.push(...module.classes);
          break;
        case 'model':
          context.models.push(module);
          context.dataModels.push(...module.classes);
          break;
        case 'repository':
          context.repositories.push(module);
          break;
        case 'config':
          context.configurations.push(module);
          break;
        case 'utility':
          context.utilities.push(module);
          break;
        case 'test':
          context.tests.push(module);
          break;
        default:
          context.utilities.push(module);
      }
    }

    // Add relevant relationships
    context.relationships = this.fileRelationships.filter(rel =>
      files.includes(rel.sourceFile) || files.includes(rel.targetFile)
    );

    return context;
  }

  private categorizeFile(filePath: string): string {
    const fileName = path.basename(filePath).toLowerCase();
    const dirName = path.basename(path.dirname(filePath)).toLowerCase();

    // File name patterns
    if (fileName.includes('controller') || fileName.includes('handler') || fileName.includes('router')) {
      return 'controller';
    }
    if (fileName.includes('service') || fileName.includes('manager') || fileName.includes('provider')) {
      return 'service';
    }
    if (fileName.includes('model') || fileName.includes('entity') || fileName.includes('dto') || fileName.includes('domain')) {
      return 'model';
    }
    if (fileName.includes('repository') || fileName.includes('dao') || fileName.includes('data')) {
      return 'repository';
    }
    if (fileName.includes('config') || fileName.includes('setting') || fileName.includes('property')) {
      return 'config';
    }
    if (fileName.includes('util') || fileName.includes('helper') || fileName.includes('tool')) {
      return 'utility';
    }
    if (fileName.includes('test') || fileName.includes('spec')) {
      return 'test';
    }

    // Directory patterns
    if (['controller', 'controllers', 'handler', 'handlers'].includes(dirName)) {
      return 'controller';
    }
    if (['service', 'services', 'business', 'logic'].includes(dirName)) {
      return 'service';
    }
    if (['model', 'models', 'entity', 'entities', 'domain', 'dto'].includes(dirName)) {
      return 'model';
    }
    if (['repository', 'repositories', 'dao', 'data'].includes(dirName)) {
      return 'repository';
    }
    if (['config', 'configuration', 'settings'].includes(dirName)) {
      return 'config';
    }
    if (['util', 'utils', 'utility', 'utilities', 'helper', 'helpers'].includes(dirName)) {
      return 'utility';
    }
    if (['test', 'tests', 'spec', 'specs'].includes(dirName)) {
      return 'test';
    }

    return 'unknown';
  }

  public getFileRelationships(): FileRelationship[] {
    return this.fileRelationships;
  }

  public getCrossReferences(): CrossFileReference[] {
    return this.crossReferences;
  }

  public getServiceDependencyGraph(serviceName: string): { nodes: string[]; edges: Array<{ from: string; to: string; type: string }> } {
    const nodes = new Set<string>();
    const edges: Array<{ from: string; to: string; type: string }> = [];

    // Build dependency graph for the service
    for (const relationship of this.fileRelationships) {
      const sourceServiceName = this.extractServiceName(relationship.sourceFile);
      const targetServiceName = this.extractServiceName(relationship.targetFile);

      if (sourceServiceName === serviceName || targetServiceName === serviceName) {
        nodes.add(path.basename(relationship.sourceFile));
        nodes.add(path.basename(relationship.targetFile));
        
        edges.push({
          from: path.basename(relationship.sourceFile),
          to: path.basename(relationship.targetFile),
          type: relationship.relationType
        });
      }
    }

    return {
      nodes: Array.from(nodes),
      edges
    };
  }
}

