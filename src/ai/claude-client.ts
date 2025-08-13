import Anthropic from '@anthropic-ai/sdk';
import { CodeModule, ApiEndpoint, ClassInfo, FunctionInfo } from '../types';
import { Config } from '../config';
import logger from '../utils/logger';

export class ClaudeClient {
  private client: Anthropic;
  private config: Config;

  constructor() {
    this.config = Config.getInstance();
    const claudeConfig = this.config.getClaudeConfig();
    
    this.client = new Anthropic({
      apiKey: claudeConfig.apiKey,
    });
  }

  public async generateDocumentation(codeModule: CodeModule): Promise<string> {
    try {
      logger.info(`Generating documentation for ${codeModule.filePath} using Claude`);
      
      const prompt = this.buildPrompt(codeModule);
      const claudeConfig = this.config.getClaudeConfig();

      const response = await this.client.messages.create({
        model: claudeConfig.model,
        max_tokens: claudeConfig.maxTokens,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      if (response.content && response.content.length > 0) {
        const textContent = response.content.find(block => block.type === 'text');
        if (textContent && 'text' in textContent) {
          return textContent.text;
        }
      }

      throw new Error('No valid response received from Claude');
    } catch (error) {
      logger.error(`Error generating documentation with Claude for ${codeModule.filePath}:`, error);
      throw error;
    }
  }

  public async generateApiDocumentation(endpoints: ApiEndpoint[], moduleInfo: { fileName: string; language: string }): Promise<string> {
    try {
      logger.info(`Generating API documentation for ${endpoints.length} endpoints in ${moduleInfo.fileName}`);
      
      const prompt = this.buildApiPrompt(endpoints, moduleInfo);
      const claudeConfig = this.config.getClaudeConfig();

      const response = await this.client.messages.create({
        model: claudeConfig.model,
        max_tokens: claudeConfig.maxTokens,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      if (response.content && response.content.length > 0) {
        const textContent = response.content.find(block => block.type === 'text');
        if (textContent && 'text' in textContent) {
          return textContent.text;
        }
      }

      throw new Error('No valid response received from Claude');
    } catch (error) {
      logger.error(`Error generating API documentation with Claude for ${moduleInfo.fileName}:`, error);
      throw error;
    }
  }

  private buildPrompt(codeModule: CodeModule): string {
    const { filePath, language, endpoints, classes, functions } = codeModule;
    
    let prompt = `You are a technical documentation expert. Given the following ${language} source code analysis from file "${filePath}", please generate comprehensive developer-facing documentation in Markdown format.

## Source Code Analysis:

### File Information:
- **File Path:** ${filePath}
- **Language:** ${language.toUpperCase()}
- **Last Modified:** ${codeModule.lastModified.toISOString()}

`;

    // Add API Endpoints section
    if (endpoints.length > 0) {
      prompt += `### API Endpoints (${endpoints.length}):
`;
      endpoints.forEach((endpoint, index) => {
        prompt += `
**${index + 1}. ${endpoint.method} ${endpoint.path}**
- Description: ${endpoint.description}
- File Location: Line ${endpoint.lineNumber}
- Tags: ${endpoint.tags.join(', ')}
- Parameters: ${JSON.stringify(endpoint.parameters, null, 2)}
- Responses: ${JSON.stringify(endpoint.responses, null, 2)}
${endpoint.requestBody ? `- Request Body: ${JSON.stringify(endpoint.requestBody, null, 2)}` : ''}
`;
      });
    }

    // Add Classes section
    if (classes.length > 0) {
      prompt += `
### Classes/Structs (${classes.length}):
`;
      classes.forEach((cls, index) => {
        prompt += `
**${index + 1}. ${cls.name}**
- Description: ${cls.description}
- Line: ${cls.lineNumber}
- Annotations/Attributes: ${cls.annotations.join(', ')}
- Methods: ${cls.methods.map(m => m.name).join(', ')}
- Properties: ${cls.properties.map(p => `${p.name}: ${p.type}`).join(', ')}
`;
      });
    }

    // Add Functions section
    if (functions.length > 0) {
      prompt += `
### Functions/Methods (${functions.length}):
`;
      functions.forEach((func, index) => {
        prompt += `
**${index + 1}. ${func.name}**
- Description: ${func.description}
- Line: ${func.lineNumber}
- Return Type: ${func.returnType}
- Parameters: ${func.parameters.map(p => `${p.name}: ${p.type}`).join(', ')}
- Annotations: ${func.annotations.join(', ')}
`;
      });
    }

    prompt += `

## Documentation Requirements:

Please generate comprehensive technical documentation that includes:

1. **Overview Section:**
   - Brief description of the module's purpose
   - Key functionality and responsibilities
   - Architecture context and relationships

2. **API Documentation** (if applicable):
   - Clear endpoint descriptions with business context
   - Request/response schemas with examples
   - Parameter details with validation rules
   - HTTP status codes and error handling
   - Authentication and authorization requirements

3. **Code Documentation:**
   - Class/struct descriptions with usage examples
   - Method descriptions with parameter details
   - Business logic explanations
   - Integration points and dependencies

4. **Examples Section:**
   - Practical usage examples
   - Common use cases
   - Request/response examples with realistic data

5. **Technical Notes:**
   - Performance considerations
   - Error handling patterns
   - Testing considerations
   - Known limitations or gotchas

## Output Format:
- Use proper Markdown formatting
- Include code blocks with appropriate syntax highlighting
- Use tables for structured data where appropriate
- Include clear headings and subheadings
- Provide practical, real-world examples
- Make it developer-friendly and actionable

Generate the documentation now:`;

    return prompt;
  }

  private buildApiPrompt(endpoints: ApiEndpoint[], moduleInfo: { fileName: string; language: string }): string {
    const prompt = `You are an API documentation specialist. Generate comprehensive REST API documentation for the following endpoints from ${moduleInfo.language} source code file "${moduleInfo.fileName}".

## API Endpoints to Document:

${endpoints.map((endpoint, index) => `
### ${index + 1}. ${endpoint.method} ${endpoint.path}

**Basic Info:**
- HTTP Method: ${endpoint.method}
- Path: ${endpoint.path}
- Description: ${endpoint.description}
- Source: ${endpoint.fileName}:${endpoint.lineNumber}
- Framework Tags: ${endpoint.tags.join(', ')}

**Parameters:**
${JSON.stringify(endpoint.parameters, null, 2)}

**Request Body:**
${endpoint.requestBody ? JSON.stringify(endpoint.requestBody, null, 2) : 'None'}

**Responses:**
${JSON.stringify(endpoint.responses, null, 2)}

---
`).join('\n')}

## Documentation Requirements:

Generate professional API documentation in Markdown format that includes:

### 1. API Overview
- Brief description of the API's purpose and scope
- Base URL and common patterns
- Authentication/authorization approach

### 2. Endpoint Documentation
For each endpoint, provide:
- **Purpose**: What the endpoint does in business terms
- **HTTP Method & Path**: Clear endpoint definition
- **Parameters**: Detailed parameter descriptions with:
  - Parameter location (path, query, header, body)
  - Data type and format
  - Required/optional status
  - Validation rules and constraints
  - Example values

### 3. Request Examples
- Realistic request examples with actual data
- Different scenarios (success cases, edge cases)
- Required headers and authentication
- Request body examples in JSON format

### 4. Response Documentation
- Response schema for each status code
- Success response examples with realistic data
- Error response examples with proper error messages
- Response headers and metadata

### 5. Business Context
- When to use each endpoint
- Common workflows and endpoint combinations
- Business rules and logic

### 6. Technical Details
- Error handling patterns
- Rate limiting (if applicable)
- Performance considerations
- Security considerations

## Output Format Requirements:
- Use proper Markdown syntax with clear headings
- Include syntax-highlighted code blocks
- Use tables for structured parameter information
- Provide realistic, production-like examples
- Make it actionable for frontend developers and API consumers

Generate the complete API documentation now:`;

    return prompt;
  }

  public async generateClassDocumentation(classes: ClassInfo[], moduleInfo: { fileName: string; language: string }): Promise<string> {
    try {
      const prompt = `You are a software architecture documentation expert. Create comprehensive documentation for the following ${moduleInfo.language} classes/structs from file "${moduleInfo.fileName}".

## Classes to Document:

${classes.map((cls, index) => `
### ${index + 1}. Class: ${cls.name}

**Basic Info:**
- Name: ${cls.name}
- Description: ${cls.description}
- Source Line: ${cls.lineNumber}
- Annotations/Attributes: ${cls.annotations.join(', ')}

**Methods:** ${cls.methods.length} methods
${cls.methods.map(method => `- ${method.name}(${method.parameters.map(p => `${p.name}: ${p.type}`).join(', ')}) -> ${method.returnType}`).join('\n')}

**Properties:** ${cls.properties.length} properties
${cls.properties.map(prop => `- ${prop.name}: ${prop.type} - ${prop.description}`).join('\n')}

---
`).join('\n')}

Generate detailed technical documentation in Markdown format that includes:

1. **Architecture Overview**: Purpose and role in the system
2. **Class Details**: Responsibilities, relationships, and patterns
3. **Method Documentation**: Purpose, parameters, return values, examples
4. **Property Documentation**: Purpose, types, validation rules
5. **Usage Examples**: Practical implementation examples
6. **Design Patterns**: Any patterns used (Builder, Factory, etc.)
7. **Integration Points**: How it integrates with other components

Make it comprehensive and developer-friendly:`;

      const claudeConfig = this.config.getClaudeConfig();
      
      const response = await this.client.messages.create({
        model: claudeConfig.model,
        max_tokens: claudeConfig.maxTokens,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }]
      });

      if (response.content && response.content.length > 0) {
        const textContent = response.content.find(block => block.type === 'text');
        if (textContent && 'text' in textContent) {
          return textContent.text;
        }
      }

      throw new Error('No valid response received from Claude');
    } catch (error) {
      logger.error(`Error generating class documentation with Claude:`, error);
      throw error;
    }
  }

  public async generateFunctionDocumentation(functions: FunctionInfo[], moduleInfo: { fileName: string; language: string }): Promise<string> {
    try {
      const prompt = `Generate detailed function/method documentation for the following ${moduleInfo.language} functions from file "${moduleInfo.fileName}":

${functions.map((func, index) => `
### ${index + 1}. Function: ${func.name}
- Description: ${func.description}
- Return Type: ${func.returnType}
- Parameters: ${func.parameters.map(p => `${p.name}: ${p.type}`).join(', ')}
- Annotations: ${func.annotations.join(', ')}
- Line: ${func.lineNumber}
`).join('\n')}

Create comprehensive Markdown documentation with:
1. Function purpose and behavior
2. Parameter details with examples
3. Return value documentation
4. Usage examples with realistic data
5. Error handling and edge cases
6. Performance considerations

Make it practical and actionable for developers:`;

      const claudeConfig = this.config.getClaudeConfig();
      
      const response = await this.client.messages.create({
        model: claudeConfig.model,
        max_tokens: claudeConfig.maxTokens,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }]
      });

      if (response.content && response.content.length > 0) {
        const textContent = response.content.find(block => block.type === 'text');
        if (textContent && 'text' in textContent) {
          return textContent.text;
        }
      }

      throw new Error('No valid response received from Claude');
    } catch (error) {
      logger.error(`Error generating function documentation with Claude:`, error);
      throw error;
    }
  }
}
