import { BaseParser } from './base-parser';
import { ApiEndpoint, ClassInfo, FunctionInfo, Parameter, Response } from '../types';
import logger from '../utils/logger';

export class GoParser extends BaseParser {
  constructor() {
    super('go');
  }

  protected getFileExtensions(): string[] {
    return ['.go'];
  }

  protected async extractApiEndpoints(content: string, filePath: string): Promise<ApiEndpoint[]> {
    const endpoints: ApiEndpoint[] = [];
    
    try {
      // Extract Gin framework routes
      endpoints.push(...this.extractGinRoutes(content, filePath));
      
      // Extract Echo framework routes
      endpoints.push(...this.extractEchoRoutes(content, filePath));
      
      // Extract standard net/http routes
      endpoints.push(...this.extractNetHttpRoutes(content, filePath));
      
      // Extract Fiber framework routes
      endpoints.push(...this.extractFiberRoutes(content, filePath));
      
    } catch (error) {
      logger.error(`Error extracting Go API endpoints from ${filePath}:`, error);
    }

    return endpoints;
  }

  private extractGinRoutes(content: string, filePath: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const ginRouteRegex = /(\w+)\.(\w+)\(\s*["']([^"']+)["']\s*,\s*([^)]+)\)/g;
    
    let match;
    while ((match = ginRouteRegex.exec(content)) !== null) {
      const [, routerVar, method, path, handlerName] = match;
      const httpMethod = method.toUpperCase();
      
      if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(httpMethod)) {
        const lineNumber = this.findLineNumber(content, match[0]);
        const description = this.extractComments(content, lineNumber);
        
        endpoints.push({
          method: httpMethod as any,
          path,
          description: description || `${httpMethod} ${path}`,
          parameters: this.extractPathParameters(path),
          responses: this.extractGoResponses(content, handlerName),
          tags: ['gin'],
          fileName: filePath,
          lineNumber
        });
      }
    }
    
    return endpoints;
  }

  private extractEchoRoutes(content: string, filePath: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const echoRouteRegex = /(\w+)\.(\w+)\(\s*["']([^"']+)["']\s*,\s*([^)]+)\)/g;
    
    let match;
    while ((match = echoRouteRegex.exec(content)) !== null) {
      const [, echoVar, method, path, handlerName] = match;
      const httpMethod = method.toUpperCase();
      
      if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(httpMethod)) {
        const lineNumber = this.findLineNumber(content, match[0]);
        const description = this.extractComments(content, lineNumber);
        
        endpoints.push({
          method: httpMethod as any,
          path,
          description: description || `${httpMethod} ${path}`,
          parameters: this.extractPathParameters(path),
          responses: this.extractGoResponses(content, handlerName),
          tags: ['echo'],
          fileName: filePath,
          lineNumber
        });
      }
    }
    
    return endpoints;
  }

  private extractNetHttpRoutes(content: string, filePath: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const httpHandleFuncRegex = /http\.HandleFunc\(\s*["']([^"']+)["']\s*,\s*([^)]+)\)/g;
    
    let match;
    while ((match = httpHandleFuncRegex.exec(content)) !== null) {
      const [, path, handlerName] = match;
      const lineNumber = this.findLineNumber(content, match[0]);
      const description = this.extractComments(content, lineNumber);
      
      endpoints.push({
        method: 'GET', // Default, would need more analysis to determine actual method
        path,
        description: description || `Handle ${path}`,
        parameters: this.extractPathParameters(path),
        responses: this.extractGoResponses(content, handlerName),
        tags: ['net/http'],
        fileName: filePath,
        lineNumber
      });
    }
    
    return endpoints;
  }

  private extractFiberRoutes(content: string, filePath: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    const fiberRouteRegex = /(\w+)\.(\w+)\(\s*["']([^"']+)["']\s*,\s*([^)]+)\)/g;
    
    let match;
    while ((match = fiberRouteRegex.exec(content)) !== null) {
      const [, appVar, method, path, handlerName] = match;
      const httpMethod = method.toUpperCase();
      
      if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(httpMethod)) {
        const lineNumber = this.findLineNumber(content, match[0]);
        const description = this.extractComments(content, lineNumber);
        
        endpoints.push({
          method: httpMethod as any,
          path,
          description: description || `${httpMethod} ${path}`,
          parameters: this.extractPathParameters(path),
          responses: this.extractGoResponses(content, handlerName),
          tags: ['fiber'],
          fileName: filePath,
          lineNumber
        });
      }
    }
    
    return endpoints;
  }

  private extractPathParameters(path: string): Parameter[] {
    const parameters: Parameter[] = [];
    
    // Extract :param style parameters
    const colonParamRegex = /:(\w+)/g;
    let match;
    while ((match = colonParamRegex.exec(path)) !== null) {
      parameters.push({
        name: match[1]!,
        type: 'string',
        in: 'path',
        required: true,
        description: `Path parameter: ${match[1]}`
      });
    }
    
    // Extract {param} style parameters
    const braceParamRegex = /\{(\w+)\}/g;
    while ((match = braceParamRegex.exec(path)) !== null) {
      parameters.push({
        name: match[1]!,
        type: 'string',
        in: 'path',
        required: true,
        description: `Path parameter: ${match[1]}`
      });
    }
    
    return parameters;
  }

  private extractGoResponses(content: string, handlerName: string): Response[] {
    const responses: Response[] = [];
    
    // Find the handler function and extract JSON responses
    const funcRegex = new RegExp(`func\\s+${handlerName}[^{]*\\{([^}]+\\{[^}]*\\})*[^}]*\\}`, 's');
    const match = funcRegex.exec(content);
    
    if (match) {
      const funcBody = match[0];
      
      // Look for c.JSON, ctx.JSON, etc.
      const jsonResponseRegex = /\w+\.JSON\(\s*(\d+)\s*,\s*([^)]+)\)/g;
      let responseMatch;
      
      while ((responseMatch = jsonResponseRegex.exec(funcBody)) !== null) {
        const statusCode = parseInt(responseMatch[1]!);
        const responseData = responseMatch[2]!;
        
        responses.push({
          statusCode,
          description: this.getStatusDescription(statusCode),
          schema: this.extractResponseSchema(responseData)
        });
      }
    }
    
    // Default success response if none found
    if (responses.length === 0) {
      responses.push({
        statusCode: 200,
        description: 'Success'
      });
    }
    
    return responses;
  }

  private getStatusDescription(statusCode: number): string {
    const descriptions: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error'
    };
    
    return descriptions[statusCode] || 'Unknown Status';
  }

  private extractResponseSchema(responseData: string): any {
    // Simple schema extraction - could be enhanced with AST parsing
    if (responseData.includes('struct') || responseData.includes('map')) {
      return { type: 'object' };
    } else if (responseData.includes('[]')) {
      return { type: 'array' };
    } else if (responseData.includes('string')) {
      return { type: 'string' };
    } else if (responseData.includes('int') || responseData.includes('float')) {
      return { type: 'number' };
    } else if (responseData.includes('bool')) {
      return { type: 'boolean' };
    }
    
    return { type: 'object' };
  }

  protected async extractClasses(content: string, filePath: string): Promise<ClassInfo[]> {
    const classes: ClassInfo[] = [];
    
    // Go doesn't have classes, but we can extract struct types
    const structRegex = /type\s+(\w+)\s+struct\s*\{([^}]+)\}/g;
    
    let match;
    while ((match = structRegex.exec(content)) !== null) {
      const [, name, body] = match;
      const lineNumber = this.findLineNumber(content, match[0]);
      const description = this.extractComments(content, lineNumber);
      
      classes.push({
        name,
        description: description || `Struct: ${name}`,
        methods: [], // Go structs don't have methods in the same way
        properties: this.extractStructFields(body),
        annotations: [],
        lineNumber
      });
    }
    
    return classes;
  }

  private extractStructFields(body: string): any[] {
    const fields: any[] = [];
    const fieldRegex = /(\w+)\s+([^\s`]+)(?:\s*`([^`]+)`)?/g;
    
    let match;
    while ((match = fieldRegex.exec(body)) !== null) {
      const [, name, type, tag] = match;
      
      fields.push({
        name,
        type,
        description: tag ? `Tag: ${tag}` : '',
        annotations: tag ? [tag] : []
      });
    }
    
    return fields;
  }

  protected async extractFunctions(content: string, filePath: string): Promise<FunctionInfo[]> {
    const functions: FunctionInfo[] = [];
    
    // Extract function definitions
    const funcRegex = /func(?:\s+\(\w+\s+[^)]+\))?\s+(\w+)\s*\(([^)]*)\)\s*(?:\([^)]*\)|[\w\[\]]+)?\s*\{/g;
    
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      const [, name, params] = match;
      const lineNumber = this.findLineNumber(content, match[0]);
      const description = this.extractComments(content, lineNumber);
      
      functions.push({
        name,
        description: description || `Function: ${name}`,
        parameters: this.extractFunctionParameters(params),
        returnType: 'unknown', // Would need better parsing to extract return type
        annotations: [],
        lineNumber
      });
    }
    
    return functions;
  }

  private extractFunctionParameters(params: string): Parameter[] {
    const parameters: Parameter[] = [];
    
    if (!params.trim()) return parameters;
    
    const paramParts = params.split(',');
    
    for (const param of paramParts) {
      const trimmed = param.trim();
      const parts = trimmed.split(/\s+/);
      
      if (parts.length >= 2) {
        parameters.push({
          name: parts[0]!,
          type: parts[1]!,
          in: 'body',
          required: true,
          description: `Parameter: ${parts[0]}`
        });
      }
    }
    
    return parameters;
  }

  protected isComment(line: string): boolean {
    return line.startsWith('//') || line.startsWith('/*') || line.includes('*/');
  }

  protected cleanComment(line: string): string {
    return line
      .replace(/^\s*\/\/\s?/, '')
      .replace(/^\s*\/\*\s?/, '')
      .replace(/\s?\*\/\s*$/, '')
      .replace(/^\s*\*\s?/, '')
      .trim();
  }
}
