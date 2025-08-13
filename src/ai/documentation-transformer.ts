import { ClaudeClient } from './claude-client';
import { CodeModule, DocumentationPage } from '../types';
import { Config } from '../config';
import logger from '../utils/logger';
import * as path from 'path';

export class DocumentationTransformer {
  private claudeClient: ClaudeClient;
  private config: Config;

  constructor() {
    this.claudeClient = new ClaudeClient();
    this.config = Config.getInstance();
  }

  public async transformCodeToDocumentation(codeModule: CodeModule): Promise<DocumentationPage> {
    try {
      logger.info(`Transforming code module ${codeModule.filePath} to documentation`);
      
      const startTime = Date.now();
      
      // Generate comprehensive documentation using Claude
      const documentation = await this.claudeClient.generateDocumentation(codeModule);
      
      const processingTime = Date.now() - startTime;
      logger.info(`Documentation generation completed in ${processingTime}ms`);

      // Create documentation page
      const page: DocumentationPage = {
        id: this.generatePageId(codeModule.filePath),
        title: this.generatePageTitle(codeModule),
        content: documentation,
        spaceKey: this.config.getConfluenceConfig().spaceKey,
        lastUpdated: new Date()
      };

      return page;
    } catch (error) {
      logger.error(`Error transforming code to documentation for ${codeModule.filePath}:`, error);
      throw error;
    }
  }

  public async transformApiDocumentation(codeModules: CodeModule[]): Promise<DocumentationPage[]> {
    const pages: DocumentationPage[] = [];
    
    try {
      // Group modules by service/controller for better organization
      const moduleGroups = this.groupModulesByService(codeModules);
      
      for (const [groupName, modules] of Object.entries(moduleGroups)) {
        // Extract all endpoints from modules in this group
        const allEndpoints = modules.flatMap(module => module.endpoints);
        
        if (allEndpoints.length === 0) continue;

        logger.info(`Generating API documentation for ${groupName} (${allEndpoints.length} endpoints)`);
        
        const apiDocumentation = await this.claudeClient.generateApiDocumentation(
          allEndpoints,
          {
            fileName: groupName,
            language: modules[0]?.language || 'unknown'
          }
        );

        const page: DocumentationPage = {
          id: this.generateApiPageId(groupName),
          title: `${this.formatGroupName(groupName)} API Documentation`,
          content: apiDocumentation,
          spaceKey: this.config.getConfluenceConfig().spaceKey,
          lastUpdated: new Date()
        };

        pages.push(page);
      }
    } catch (error) {
      logger.error('Error transforming API documentation:', error);
      throw error;
    }

    return pages;
  }

  public async transformClassDocumentation(codeModules: CodeModule[]): Promise<DocumentationPage[]> {
    const pages: DocumentationPage[] = [];
    
    try {
      for (const module of codeModules) {
        if (module.classes.length === 0) continue;

        logger.info(`Generating class documentation for ${module.filePath}`);
        
        const classDocumentation = await this.claudeClient.generateClassDocumentation(
          module.classes,
          {
            fileName: path.basename(module.filePath),
            language: module.language
          }
        );

        const page: DocumentationPage = {
          id: this.generateClassPageId(module.filePath),
          title: `${path.basename(module.filePath, path.extname(module.filePath))} - Classes`,
          content: classDocumentation,
          spaceKey: this.config.getConfluenceConfig().spaceKey,
          lastUpdated: new Date()
        };

        pages.push(page);
      }
    } catch (error) {
      logger.error('Error transforming class documentation:', error);
      throw error;
    }

    return pages;
  }

  public async transformFunctionDocumentation(codeModules: CodeModule[]): Promise<DocumentationPage[]> {
    const pages: DocumentationPage[] = [];
    
    try {
      for (const module of codeModules) {
        if (module.functions.length === 0) continue;

        logger.info(`Generating function documentation for ${module.filePath}`);
        
        const functionDocumentation = await this.claudeClient.generateFunctionDocumentation(
          module.functions,
          {
            fileName: path.basename(module.filePath),
            language: module.language
          }
        );

        const page: DocumentationPage = {
          id: this.generateFunctionPageId(module.filePath),
          title: `${path.basename(module.filePath, path.extname(module.filePath))} - Functions`,
          content: functionDocumentation,
          spaceKey: this.config.getConfluenceConfig().spaceKey,
          lastUpdated: new Date()
        };

        pages.push(page);
      }
    } catch (error) {
      logger.error('Error transforming function documentation:', error);
      throw error;
    }

    return pages;
  }

  public async generateArchitectureOverview(codeModules: CodeModule[]): Promise<DocumentationPage> {
    try {
      logger.info('Generating architecture overview documentation');
      
      const overviewPrompt = this.buildArchitecturePrompt(codeModules);
      const claudeConfig = this.config.getClaudeConfig();

      const response = await this.claudeClient['client'].messages.create({
        model: claudeConfig.model,
        max_tokens: claudeConfig.maxTokens,
        temperature: 0.2,
        messages: [{ role: 'user', content: overviewPrompt }]
      });

      let architectureDoc = '';
      if (response.content && response.content.length > 0) {
        const textContent = response.content.find(block => block.type === 'text');
        if (textContent && 'text' in textContent) {
          architectureDoc = textContent.text;
        }
      }

      const page: DocumentationPage = {
        id: 'architecture-overview',
        title: 'Architecture Overview',
        content: architectureDoc,
        spaceKey: this.config.getConfluenceConfig().spaceKey,
        lastUpdated: new Date()
      };

      return page;
    } catch (error) {
      logger.error('Error generating architecture overview:', error);
      throw error;
    }
  }

  private groupModulesByService(codeModules: CodeModule[]): Record<string, CodeModule[]> {
    const groups: Record<string, CodeModule[]> = {};
    
    for (const module of codeModules) {
      let groupName = this.extractServiceName(module.filePath);
      
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      
      groups[groupName]!.push(module);
    }
    
    return groups;
  }

  private extractServiceName(filePath: string): string {
    const fileName = path.basename(filePath, path.extname(filePath));
    
    // Common patterns for service/controller naming
    const patterns = [
      /(.+)Controller$/i,
      /(.+)Service$/i,
      /(.+)Handler$/i,
      /(.+)Router$/i,
      /(.+)Routes$/i,
      /(.+)Api$/i
    ];
    
    for (const pattern of patterns) {
      const match = fileName.match(pattern);
      if (match) {
        return match[1]!;
      }
    }
    
    return fileName;
  }

  private formatGroupName(groupName: string): string {
    // Convert camelCase/PascalCase to Title Case
    return groupName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  private generatePageId(filePath: string): string {
    // Create a unique, URL-safe ID based on file path
    return path.basename(filePath, path.extname(filePath))
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private generateApiPageId(groupName: string): string {
    return `api-${groupName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  }

  private generateClassPageId(filePath: string): string {
    return `classes-${this.generatePageId(filePath)}`;
  }

  private generateFunctionPageId(filePath: string): string {
    return `functions-${this.generatePageId(filePath)}`;
  }

  private generatePageTitle(codeModule: CodeModule): string {
    const fileName = path.basename(codeModule.filePath, path.extname(codeModule.filePath));
    const language = codeModule.language.toUpperCase();
    
    let title = `${fileName} (${language})`;
    
    // Add context based on content
    const parts = [];
    if (codeModule.endpoints.length > 0) {
      parts.push(`${codeModule.endpoints.length} API${codeModule.endpoints.length > 1 ? 's' : ''}`);
    }
    if (codeModule.classes.length > 0) {
      parts.push(`${codeModule.classes.length} Class${codeModule.classes.length > 1 ? 'es' : ''}`);
    }
    if (codeModule.functions.length > 0) {
      parts.push(`${codeModule.functions.length} Function${codeModule.functions.length > 1 ? 's' : ''}`);
    }
    
    if (parts.length > 0) {
      title += ` - ${parts.join(', ')}`;
    }
    
    return title;
  }

  private buildArchitecturePrompt(codeModules: CodeModule[]): string {
    const stats = {
      totalFiles: codeModules.length,
      languages: [...new Set(codeModules.map(m => m.language))],
      totalEndpoints: codeModules.reduce((sum, m) => sum + m.endpoints.length, 0),
      totalClasses: codeModules.reduce((sum, m) => sum + m.classes.length, 0),
      totalFunctions: codeModules.reduce((sum, m) => sum + m.functions.length, 0)
    };

    const serviceGroups = this.groupModulesByService(codeModules);
    const services = Object.keys(serviceGroups);

    return `You are a software architect creating comprehensive system documentation. Based on the analysis of ${stats.totalFiles} source code files across ${stats.languages.join(', ')} languages, generate an Architecture Overview document.

## System Statistics:
- **Total Files:** ${stats.totalFiles}
- **Languages:** ${stats.languages.join(', ')}
- **API Endpoints:** ${stats.totalEndpoints}
- **Classes/Structs:** ${stats.totalClasses}
- **Functions/Methods:** ${stats.totalFunctions}

## Identified Services/Components:
${services.map(service => `- ${this.formatGroupName(service)}`).join('\n')}

## Service Details:
${Object.entries(serviceGroups).map(([service, modules]) => `
### ${this.formatGroupName(service)}
- Files: ${modules.map(m => path.basename(m.filePath)).join(', ')}
- API Endpoints: ${modules.reduce((sum, m) => sum + m.endpoints.length, 0)}
- Languages: ${[...new Set(modules.map(m => m.language))].join(', ')}
`).join('\n')}

## Documentation Requirements:

Generate a comprehensive Architecture Overview in Markdown format that includes:

### 1. System Overview
- High-level system purpose and scope
- Key business capabilities
- Technology stack summary

### 2. Service Architecture
- Service breakdown and responsibilities  
- Inter-service communication patterns
- Data flow between components

### 3. API Architecture
- REST API design patterns
- Authentication and authorization approach
- API versioning strategy

### 4. Technology Stack
- Programming languages and frameworks
- Infrastructure and deployment considerations
- Key libraries and dependencies

### 5. Architecture Patterns
- Design patterns identified in the codebase
- Architectural principles followed
- Code organization structure

### 6. Integration Points
- External system integrations
- Database interactions
- Third-party service dependencies

### 7. Development Guidelines
- Code structure conventions
- API design standards
- Testing and deployment practices

Make it comprehensive, actionable, and valuable for both technical and non-technical stakeholders.`;
  }
}

export * from './claude-client';
