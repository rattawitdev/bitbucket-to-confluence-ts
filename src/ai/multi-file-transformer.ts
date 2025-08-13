import { ClaudeClient } from './claude-client';
import { ServiceContext, FileRelationship } from '../analyzers/context-analyzer';
import { DocumentationPage, CodeModule, ApiEndpoint, ClassInfo } from '../types';
import { Config } from '../config';
import logger from '../utils/logger';
import * as path from 'path';

export interface ServiceDocumentationResult {
  overviewPage: DocumentationPage;
  apiDocumentationPage: DocumentationPage;
  architecturePage: DocumentationPage;
  businessLogicPage?: DocumentationPage;
  dataModelsPage?: DocumentationPage;
  dependencyDiagram: string;
}

export class MultiFileTransformer {
  private claudeClient: ClaudeClient;
  private config: Config;

  constructor() {
    this.claudeClient = new ClaudeClient();
    this.config = Config.getInstance();
  }

  public async generateServiceDocumentation(serviceContext: ServiceContext): Promise<ServiceDocumentationResult> {
    try {
      logger.info(`Generating multi-file documentation for service: ${serviceContext.serviceName}`);
      
      const result: ServiceDocumentationResult = {
        overviewPage: await this.generateServiceOverview(serviceContext),
        apiDocumentationPage: await this.generateApiDocumentation(serviceContext),
        architecturePage: await this.generateServiceArchitecture(serviceContext),
        dependencyDiagram: this.generateDependencyDiagram(serviceContext)
      };

      // Generate additional pages if content exists
      if (serviceContext.businessLogic.length > 0) {
        result.businessLogicPage = await this.generateBusinessLogicDocumentation(serviceContext);
      }

      if (serviceContext.dataModels.length > 0) {
        result.dataModelsPage = await this.generateDataModelsDocumentation(serviceContext);
      }

      logger.info(`Multi-file documentation generated successfully for ${serviceContext.serviceName}`);
      return result;

    } catch (error) {
      logger.error(`Error generating multi-file documentation for ${serviceContext.serviceName}:`, error);
      throw error;
    }
  }

  private async generateServiceOverview(serviceContext: ServiceContext): Promise<DocumentationPage> {
    const prompt = this.buildServiceOverviewPrompt(serviceContext);
    const claudeConfig = this.config.getClaudeConfig();

    const response = await this.claudeClient['client'].messages.create({
      model: claudeConfig.model,
      max_tokens: claudeConfig.maxTokens,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }]
    });

    let documentation = '';
    if (response.content && response.content.length > 0) {
      const textContent = response.content.find(block => block.type === 'text');
      if (textContent && 'text' in textContent) {
        documentation = textContent.text;
      }
    }

    return {
      id: `service-${serviceContext.serviceName.toLowerCase()}-overview`,
      title: `${serviceContext.serviceName} Service - Overview`,
      content: documentation,
      spaceKey: this.config.getConfluenceConfig().spaceKey,
      lastUpdated: new Date()
    };
  }

  private async generateApiDocumentation(serviceContext: ServiceContext): Promise<DocumentationPage> {
    const prompt = this.buildApiDocumentationPrompt(serviceContext);
    const claudeConfig = this.config.getClaudeConfig();

    const response = await this.claudeClient['client'].messages.create({
      model: claudeConfig.model,
      max_tokens: claudeConfig.maxTokens,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }]
    });

    let documentation = '';
    if (response.content && response.content.length > 0) {
      const textContent = response.content.find(block => block.type === 'text');
      if (textContent && 'text' in textContent) {
        documentation = textContent.text;
      }
    }

    return {
      id: `service-${serviceContext.serviceName.toLowerCase()}-api`,
      title: `${serviceContext.serviceName} Service - API Documentation`,
      content: documentation,
      spaceKey: this.config.getConfluenceConfig().spaceKey,
      lastUpdated: new Date()
    };
  }

  private async generateServiceArchitecture(serviceContext: ServiceContext): Promise<DocumentationPage> {
    const prompt = this.buildArchitecturePrompt(serviceContext);
    const claudeConfig = this.config.getClaudeConfig();

    const response = await this.claudeClient['client'].messages.create({
      model: claudeConfig.model,
      max_tokens: claudeConfig.maxTokens,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }]
    });

    let documentation = '';
    if (response.content && response.content.length > 0) {
      const textContent = response.content.find(block => block.type === 'text');
      if (textContent && 'text' in textContent) {
        documentation = textContent.text;
      }
    }

    return {
      id: `service-${serviceContext.serviceName.toLowerCase()}-architecture`,
      title: `${serviceContext.serviceName} Service - Architecture`,
      content: documentation,
      spaceKey: this.config.getConfluenceConfig().spaceKey,
      lastUpdated: new Date()
    };
  }

  private async generateBusinessLogicDocumentation(serviceContext: ServiceContext): Promise<DocumentationPage> {
    const prompt = this.buildBusinessLogicPrompt(serviceContext);
    const claudeConfig = this.config.getClaudeConfig();

    const response = await this.claudeClient['client'].messages.create({
      model: claudeConfig.model,
      max_tokens: claudeConfig.maxTokens,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }]
    });

    let documentation = '';
    if (response.content && response.content.length > 0) {
      const textContent = response.content.find(block => block.type === 'text');
      if (textContent && 'text' in textContent) {
        documentation = textContent.text;
      }
    }

    return {
      id: `service-${serviceContext.serviceName.toLowerCase()}-business-logic`,
      title: `${serviceContext.serviceName} Service - Business Logic`,
      content: documentation,
      spaceKey: this.config.getConfluenceConfig().spaceKey,
      lastUpdated: new Date()
    };
  }

  private async generateDataModelsDocumentation(serviceContext: ServiceContext): Promise<DocumentationPage> {
    const prompt = this.buildDataModelsPrompt(serviceContext);
    const claudeConfig = this.config.getClaudeConfig();

    const response = await this.claudeClient['client'].messages.create({
      model: claudeConfig.model,
      max_tokens: claudeConfig.maxTokens,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }]
    });

    let documentation = '';
    if (response.content && response.content.length > 0) {
      const textContent = response.content.find(block => block.type === 'text');
      if (textContent && 'text' in textContent) {
        documentation = textContent.text;
      }
    }

    return {
      id: `service-${serviceContext.serviceName.toLowerCase()}-data-models`,
      title: `${serviceContext.serviceName} Service - Data Models`,
      content: documentation,
      spaceKey: this.config.getConfluenceConfig().spaceKey,
      lastUpdated: new Date()
    };
  }

  private buildServiceOverviewPrompt(serviceContext: ServiceContext): string {
    return `You are a senior software architect creating comprehensive service documentation. Generate a detailed service overview for the "${serviceContext.serviceName}" service with multi-file context analysis.

## Service Context Analysis:

### Service Structure:
- **Service Name:** ${serviceContext.serviceName}
- **Root Path:** ${serviceContext.rootPath}
- **Controllers:** ${serviceContext.controllers.length} files
- **Services:** ${serviceContext.services.length} files
- **Models:** ${serviceContext.models.length} files
- **Repositories:** ${serviceContext.repositories.length} files
- **Configurations:** ${serviceContext.configurations.length} files
- **Utilities:** ${serviceContext.utilities.length} files

### API Endpoints Overview:
${serviceContext.apiEndpoints.map((endpoint, i) => `
${i + 1}. **${endpoint.method} ${endpoint.path}**
   - File: ${path.basename(endpoint.fileName)}
   - Description: ${endpoint.description}
   - Parameters: ${endpoint.parameters.length}
   - Tags: ${endpoint.tags.join(', ')}
`).join('')}

### File Relationships (${serviceContext.relationships.length} relationships):
${serviceContext.relationships.slice(0, 10).map(rel => `
- **${rel.relationType.toUpperCase()}**: ${path.basename(rel.sourceFile)} → ${path.basename(rel.targetFile)}
  - Details: ${rel.details}
`).join('')}

### Business Logic Components:
${serviceContext.businessLogic.slice(0, 5).map(cls => `
- **${cls.name}** (${path.basename(serviceContext.services.find(s => s.classes.includes(cls))?.filePath || '')})
  - Methods: ${cls.methods.map(m => m.name).join(', ')}
  - Description: ${cls.description}
`).join('')}

### Data Models:
${serviceContext.dataModels.slice(0, 5).map(model => `
- **${model.name}** (${path.basename(serviceContext.models.find(m => m.classes.includes(model))?.filePath || '')})
  - Properties: ${model.properties.map(p => `${p.name}: ${p.type}`).join(', ')}
  - Description: ${model.description}
`).join('')}

## Documentation Requirements:

Generate a comprehensive service overview in Markdown format that includes:

### 1. Service Summary
- Clear description of the service's purpose and business domain
- Key responsibilities and capabilities
- Service boundaries and scope

### 2. Service Architecture
- High-level architectural overview
- Component relationships and interactions
- Data flow and processing patterns

### 3. API Interface
- Overview of all API endpoints with groupings
- Common request/response patterns
- Authentication and authorization approach

### 4. Business Logic
- Core business rules and workflows
- Key service classes and their responsibilities
- Inter-service dependencies

### 5. Data Management
- Data models and their relationships
- Storage patterns and data access
- Data validation and business rules

### 6. Integration Points
- Dependencies on other services
- External API integrations
- Configuration and environment dependencies

### 7. Technical Considerations
- Performance characteristics
- Scalability considerations
- Error handling and resilience patterns

Make it comprehensive, accurate, and valuable for both developers and stakeholders. Focus on the multi-file relationships and how components work together.`;
  }

  private buildApiDocumentationPrompt(serviceContext: ServiceContext): string {
    const controllersInfo = serviceContext.controllers.map(controller => `
### Controller: ${path.basename(controller.filePath)}
**Classes:** ${controller.classes.map(c => c.name).join(', ')}
**Endpoints:** ${controller.endpoints.length}

${controller.endpoints.map(endpoint => `
#### ${endpoint.method} ${endpoint.path}
- **Description:** ${endpoint.description}
- **Parameters:** ${JSON.stringify(endpoint.parameters, null, 2)}
- **Request Body:** ${endpoint.requestBody ? JSON.stringify(endpoint.requestBody, null, 2) : 'None'}
- **Responses:** ${JSON.stringify(endpoint.responses, null, 2)}
- **Source Location:** Line ${endpoint.lineNumber}
`).join('')}
`).join('');

    const relatedServices = serviceContext.relationships
      .filter(rel => rel.relationType === 'references' || rel.relationType === 'calls')
      .map(rel => `- ${path.basename(rel.sourceFile)} → ${path.basename(rel.targetFile)}: ${rel.details}`)
      .join('\n');

    return `You are an API documentation specialist creating comprehensive REST API documentation with multi-file context. Generate complete API documentation for the "${serviceContext.serviceName}" service.

## Multi-File API Context:

${controllersInfo}

### Service Dependencies:
${relatedServices}

### Related Business Logic:
${serviceContext.businessLogic.slice(0, 5).map(logic => `
- **${logic.name}:** ${logic.description}
  - Methods: ${logic.methods.map(m => `${m.name}(${m.parameters.map(p => p.name).join(', ')})`).join(', ')}
`).join('')}

### Data Models Used:
${serviceContext.dataModels.slice(0, 5).map(model => `
- **${model.name}:** ${model.description}
  - Properties: ${model.properties.map(p => `${p.name}: ${p.type}`).join(', ')}
`).join('')}

## Documentation Requirements:

Generate comprehensive API documentation in Markdown format with:

### 1. API Overview
- Service purpose and API scope
- Base URL and versioning
- Authentication and authorization requirements
- Common response formats and error handling

### 2. Endpoint Groups
- Logical grouping of related endpoints
- Group-level descriptions and purposes
- Common parameters and behaviors

### 3. Detailed Endpoint Documentation
For each endpoint provide:
- **Purpose:** Clear business purpose and use case
- **HTTP Method & Path:** Complete endpoint definition
- **Parameters:** Detailed parameter documentation with:
  - Parameter location (path, query, header, body)
  - Data type, format, and constraints
  - Required/optional status with default values
  - Business validation rules
  - Realistic example values

### 4. Request Examples
- Complete request examples with headers
- Different scenarios (success, edge cases, error cases)
- Realistic data examples
- cURL examples for testing

### 5. Response Documentation
- Success response schemas with examples
- Error response formats and codes
- Response headers and metadata
- Pagination details (if applicable)

### 6. Business Context
- How endpoints relate to business workflows
- Typical usage patterns and sequences
- Integration with other services
- Business rules and constraints

### 7. Implementation Details
- Controller and service layer relationships
- Data models used in requests/responses
- Validation and error handling patterns
- Performance considerations

Make it production-ready, developer-friendly, and include the multi-file context to show how the API implementation spans across different components.`;
  }

  private buildArchitecturePrompt(serviceContext: ServiceContext): string {
    const fileStructure = [
      ...serviceContext.controllers.map(c => `Controller: ${path.basename(c.filePath)}`),
      ...serviceContext.services.map(s => `Service: ${path.basename(s.filePath)}`),
      ...serviceContext.models.map(m => `Model: ${path.basename(m.filePath)}`),
      ...serviceContext.repositories.map(r => `Repository: ${path.basename(r.filePath)}`),
      ...serviceContext.configurations.map(c => `Config: ${path.basename(c.filePath)}`),
      ...serviceContext.utilities.map(u => `Utility: ${path.basename(u.filePath)}`)
    ].join('\n- ');

    return `You are a software architect documenting service architecture with multi-file analysis. Create comprehensive architecture documentation for the "${serviceContext.serviceName}" service.

## Service Architecture Context:

### File Structure:
- ${fileStructure}

### Component Relationships (${serviceContext.relationships.length} total):
${serviceContext.relationships.map(rel => `
- **${rel.relationType.toUpperCase()}:** ${path.basename(rel.sourceFile)} → ${path.basename(rel.targetFile)}
  - ${rel.details}
`).join('')}

### Layer Distribution:
- **Presentation Layer:** ${serviceContext.controllers.length} controllers
- **Business Layer:** ${serviceContext.services.length} services  
- **Data Layer:** ${serviceContext.repositories.length} repositories
- **Model Layer:** ${serviceContext.models.length} models
- **Configuration:** ${serviceContext.configurations.length} config files
- **Utilities:** ${serviceContext.utilities.length} utility files

## Generate architectural documentation with:

### 1. Architecture Overview
- Service architecture pattern (MVC, Clean Architecture, etc.)
- Layer separation and responsibilities
- Component interaction patterns

### 2. Component Design
- Detailed component breakdown by layer
- Responsibilities and boundaries
- Design patterns used

### 3. Data Flow
- Request/response flow through layers
- Data transformation points
- Error handling flow

### 4. Dependencies and Relationships
- Inter-component dependencies
- External service dependencies
- Configuration dependencies

### 5. Design Principles
- Architectural principles followed
- Separation of concerns
- Dependency injection patterns

### 6. Quality Attributes
- Maintainability considerations
- Testability design
- Performance implications
- Scalability design

Focus on how the multi-file structure supports good architectural practices and maintainability.`;
  }

  private buildBusinessLogicPrompt(serviceContext: ServiceContext): string {
    return `Generate detailed business logic documentation for the "${serviceContext.serviceName}" service based on multi-file analysis.

## Business Logic Components:

${serviceContext.businessLogic.map(logic => `
### ${logic.name}
- **Source:** ${path.basename(serviceContext.services.find(s => s.classes.includes(logic))?.filePath || '')}
- **Description:** ${logic.description}
- **Methods:** ${logic.methods.map(m => `${m.name}(${m.parameters.map(p => p.name).join(', ')}): ${m.returnType}`).join(', ')}
- **Annotations:** ${logic.annotations.join(', ')}
`).join('')}

## Cross-Component Relationships:
${serviceContext.relationships
  .filter(rel => rel.relationType === 'references' || rel.relationType === 'calls')
  .map(rel => `- ${path.basename(rel.sourceFile)} uses ${path.basename(rel.targetFile)}: ${rel.details}`)
  .join('\n')}

Create comprehensive business logic documentation including:
1. Business rules and workflows
2. Service interactions and dependencies  
3. Data validation and processing
4. Error handling and business exceptions
5. Integration patterns with other components`;
  }

  private buildDataModelsPrompt(serviceContext: ServiceContext): string {
    return `Generate detailed data model documentation for the "${serviceContext.serviceName}" service.

## Data Models:

${serviceContext.dataModels.map(model => `
### ${model.name}
- **Source:** ${path.basename(serviceContext.models.find(m => m.classes.includes(model))?.filePath || '')}
- **Description:** ${model.description}
- **Properties:** ${model.properties.map(p => `${p.name}: ${p.type} - ${p.description}`).join(', ')}
- **Annotations:** ${model.annotations.join(', ')}
`).join('')}

## Model Relationships:
${serviceContext.relationships
  .filter(rel => rel.relationType === 'extends' || rel.relationType === 'implements')
  .map(rel => `- ${path.basename(rel.sourceFile)} ${rel.relationType} ${path.basename(rel.targetFile)}: ${rel.details}`)
  .join('\n')}

Create detailed data model documentation including:
1. Entity relationships and hierarchies
2. Data validation rules and constraints
3. Serialization/deserialization patterns
4. Database mapping (if applicable)
5. Usage across different service layers`;
  }

  private generateDependencyDiagram(serviceContext: ServiceContext): string {
    const nodes = new Set<string>();
    const edges: string[] = [];

    // Add all files as nodes
    [
      ...serviceContext.controllers,
      ...serviceContext.services,
      ...serviceContext.models,
      ...serviceContext.repositories
    ].forEach(module => {
      nodes.add(path.basename(module.filePath, path.extname(module.filePath)));
    });

    // Add relationships as edges
    serviceContext.relationships.forEach(rel => {
      const source = path.basename(rel.sourceFile, path.extname(rel.sourceFile));
      const target = path.basename(rel.targetFile, path.extname(rel.targetFile));
      
      if (nodes.has(source) && nodes.has(target)) {
        edges.push(`${source} --> ${target} : ${rel.relationType}`);
      }
    });

    return `
\`\`\`mermaid
graph TD
${Array.from(nodes).map(node => `    ${node}[${node}]`).join('\n')}
    
${edges.join('\n    ')}
\`\`\``;
  }

  public async generateCrossServiceDocumentation(serviceContexts: ServiceContext[]): Promise<DocumentationPage> {
    const prompt = `Generate comprehensive cross-service documentation for ${serviceContexts.length} services: ${serviceContexts.map(s => s.serviceName).join(', ')}.

## Services Overview:
${serviceContexts.map(service => `
### ${service.serviceName}
- API Endpoints: ${service.apiEndpoints.length}
- Components: ${service.controllers.length + service.services.length + service.models.length}
- Key APIs: ${service.apiEndpoints.slice(0, 3).map(api => `${api.method} ${api.path}`).join(', ')}
`).join('')}

Create documentation covering:
1. Service interaction patterns
2. Cross-service API dependencies  
3. Data flow between services
4. Integration architecture
5. Service mesh and communication patterns`;

    const claudeConfig = this.config.getClaudeConfig();

    const response = await this.claudeClient['client'].messages.create({
      model: claudeConfig.model,
      max_tokens: claudeConfig.maxTokens,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }]
    });

    let documentation = '';
    if (response.content && response.content.length > 0) {
      const textContent = response.content.find(block => block.type === 'text');
      if (textContent && 'text' in textContent) {
        documentation = textContent.text;
      }
    }

    return {
      id: 'cross-service-architecture',
      title: 'Cross-Service Architecture Documentation',
      content: documentation,
      spaceKey: this.config.getConfluenceConfig().spaceKey,
      lastUpdated: new Date()
    };
  }
}

