import { BaseParser } from './base-parser';
import { ApiEndpoint, ClassInfo, FunctionInfo, Parameter, Response, RequestBody } from '../types';
import logger from '../utils/logger';

export class CSharpParser extends BaseParser {
  constructor() {
    super('csharp');
  }

  protected getFileExtensions(): string[] {
    return ['.cs'];
  }

  protected async extractApiEndpoints(content: string, filePath: string): Promise<ApiEndpoint[]> {
    const endpoints: ApiEndpoint[] = [];
    
    try {
      // Extract ASP.NET Core Web API endpoints
      endpoints.push(...this.extractWebApiEndpoints(content, filePath));
      
      // Extract ASP.NET Core MVC endpoints
      endpoints.push(...this.extractMvcEndpoints(content, filePath));
      
      // Extract Minimal API endpoints (ASP.NET Core 6+)
      endpoints.push(...this.extractMinimalApiEndpoints(content, filePath));
      
    } catch (error) {
      logger.error(`Error extracting C# API endpoints from ${filePath}:`, error);
    }

    return endpoints;
  }

  private extractWebApiEndpoints(content: string, filePath: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    
    // Extract controller base route
    const routePrefix = this.extractRoutePrefix(content);
    
    // Extract HTTP method attributes
    const httpMethods = [
      { attribute: '[HttpGet]', method: 'GET' },
      { attribute: '[HttpPost]', method: 'POST' },
      { attribute: '[HttpPut]', method: 'PUT' },
      { attribute: '[HttpDelete]', method: 'DELETE' },
      { attribute: '[HttpPatch]', method: 'PATCH' }
    ];

    for (const httpMethod of httpMethods) {
      endpoints.push(...this.extractAttributeEndpoints(content, filePath, httpMethod, routePrefix));
    }

    return endpoints;
  }

  private extractRoutePrefix(content: string): string {
    // Look for [Route] or [ApiController] with [Route]
    const routeRegex = /\[Route\s*\(\s*["']([^"']+)["']\s*\)\]/;
    const match = routeRegex.exec(content);
    return match ? match[1]! : '';
  }

  private extractAttributeEndpoints(
    content: string,
    filePath: string,
    httpMethod: { attribute: string; method: string },
    routePrefix: string
  ): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    
    // Pattern to match attribute and method definition
    const attributeRegex = new RegExp(
      `\\${httpMethod.attribute}(?:\\s*\\(\\s*["']([^"']+)["']\\s*\\))?[\\s\\S]*?` +
      `(?:public|private|protected|internal)?\\s*(?:async\\s+)?(?:Task<\\w+>|\\w+|IActionResult)\\s+(\\w+)\\s*\\(([^)]*)\\)`,
      'g'
    );

    let match;
    while ((match = attributeRegex.exec(content)) !== null) {
      const [fullMatch, routePath, methodName, methodParams] = match;
      const lineNumber = this.findLineNumber(content, fullMatch);
      const description = this.extractComments(content, lineNumber);
      
      // Combine route prefix with method route
      const fullPath = this.combinePaths(routePrefix, routePath || methodName.toLowerCase());
      
      // Extract parameters
      const parameters = this.extractMethodParameters(methodParams, content);
      
      // Extract request body
      const requestBody = this.extractRequestBody(methodParams, content);
      
      // Extract responses
      const responses = this.extractCSharpResponses(content, methodName);

      endpoints.push({
        method: httpMethod.method as any,
        path: fullPath,
        description: description || `${httpMethod.method} ${fullPath}`,
        parameters,
        requestBody,
        responses,
        tags: ['asp.net-core', 'web-api'],
        fileName: filePath,
        lineNumber
      });
    }

    return endpoints;
  }

  private extractMvcEndpoints(content: string, filePath: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    
    // Look for ActionResult methods in controllers
    const actionRegex = /(?:public|protected)\s+(?:async\s+)?(?:Task<)?(?:ActionResult|IActionResult)>?\s+(\w+)\s*\(([^)]*)\)/g;
    
    let match;
    while ((match = actionRegex.exec(content)) !== null) {
      const [fullMatch, methodName, methodParams] = match;
      const lineNumber = this.findLineNumber(content, fullMatch);
      const description = this.extractComments(content, lineNumber);
      
      // Determine HTTP method based on method name conventions
      const httpMethod = this.inferHttpMethodFromName(methodName);
      const path = `/${methodName.toLowerCase()}`;
      
      endpoints.push({
        method: httpMethod as any,
        path,
        description: description || `${httpMethod} ${path}`,
        parameters: this.extractMethodParameters(methodParams, content),
        responses: this.extractCSharpResponses(content, methodName),
        tags: ['asp.net-core', 'mvc'],
        fileName: filePath,
        lineNumber
      });
    }

    return endpoints;
  }

  private extractMinimalApiEndpoints(content: string, filePath: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    
    // Extract Minimal API patterns like app.MapGet, app.MapPost, etc.
    const minimalApiMethods = ['MapGet', 'MapPost', 'MapPut', 'MapDelete', 'MapPatch'];
    
    for (const method of minimalApiMethods) {
      const httpMethod = method.replace('Map', '').toUpperCase();
      const regex = new RegExp(`\\w+\\.${method}\\s*\\(\\s*["']([^"']+)["']\\s*,\\s*([^)]+)\\)`, 'g');
      
      let match;
      while ((match = regex.exec(content)) !== null) {
        const [fullMatch, path, handler] = match;
        const lineNumber = this.findLineNumber(content, fullMatch);
        const description = this.extractComments(content, lineNumber);
        
        endpoints.push({
          method: httpMethod as any,
          path,
          description: description || `${httpMethod} ${path}`,
          parameters: this.extractPathParameters(path),
          responses: [{ statusCode: 200, description: 'Success' }],
          tags: ['minimal-api'],
          fileName: filePath,
          lineNumber
        });
      }
    }

    return endpoints;
  }

  private inferHttpMethodFromName(methodName: string): string {
    const name = methodName.toLowerCase();
    
    if (name.startsWith('get') || name.includes('list') || name.includes('find')) return 'GET';
    if (name.startsWith('post') || name.includes('create') || name.includes('add')) return 'POST';
    if (name.startsWith('put') || name.includes('update') || name.includes('edit')) return 'PUT';
    if (name.startsWith('delete') || name.includes('remove')) return 'DELETE';
    if (name.startsWith('patch')) return 'PATCH';
    
    return 'GET'; // Default
  }

  private combinePaths(basePath: string, methodPath: string): string {
    if (!basePath) basePath = '';
    if (!methodPath) methodPath = '';
    
    const cleanBase = basePath.replace(/\/+$/, '');
    const cleanMethod = methodPath.replace(/^\/+/, '');
    
    if (!cleanBase && !cleanMethod) return '/';
    if (!cleanBase) return `/${cleanMethod}`;
    if (!cleanMethod) return cleanBase;
    
    return `${cleanBase}/${cleanMethod}`;
  }

  private extractPathParameters(path: string): Parameter[] {
    const parameters: Parameter[] = [];
    
    // Extract {id} style parameters
    const paramRegex = /\{(\w+)(?::([^}]+))?\}/g;
    
    let match;
    while ((match = paramRegex.exec(path)) !== null) {
      const [, name, constraint] = match;
      
      parameters.push({
        name,
        type: this.mapConstraintToType(constraint),
        in: 'path',
        required: true,
        description: `Path parameter: ${name}`
      });
    }
    
    return parameters;
  }

  private mapConstraintToType(constraint?: string): string {
    if (!constraint) return 'string';
    
    const typeMap: Record<string, string> = {
      'int': 'integer',
      'long': 'integer',
      'double': 'number',
      'decimal': 'number',
      'bool': 'boolean',
      'datetime': 'string',
      'guid': 'string'
    };
    
    return typeMap[constraint] || 'string';
  }

  private extractMethodParameters(methodParams: string, content: string): Parameter[] {
    const parameters: Parameter[] = [];
    
    if (!methodParams.trim()) return parameters;

    // Split parameters and parse
    const paramParts = this.splitParameters(methodParams);
    
    for (const param of paramParts) {
      const parameter = this.parseParameter(param.trim());
      if (parameter) {
        parameters.push(parameter);
      }
    }

    return parameters;
  }

  private splitParameters(params: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < params.length; i++) {
      const char = params[i]!;
      
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar) {
        inString = false;
        stringChar = '';
      } else if (!inString) {
        if (char === '<' || char === '(') depth++;
        else if (char === '>' || char === ')') depth--;
        else if (char === ',' && depth === 0) {
          parts.push(current.trim());
          current = '';
          continue;
        }
      }
      
      current += char;
    }
    
    if (current.trim()) {
      parts.push(current.trim());
    }
    
    return parts;
  }

  private parseParameter(param: string): Parameter | null {
    // Remove default values and attributes
    const cleanParam = param.replace(/\s*=\s*[^,)]+/, '').replace(/\[[^\]]+\]/g, '');
    
    // Check for specific parameter types
    const fromBodyRegex = /\[FromBody\]/;
    const fromQueryRegex = /\[FromQuery\]/;
    const fromRouteRegex = /\[FromRoute\]/;
    const fromHeaderRegex = /\[FromHeader\]/;
    
    let paramIn: 'query' | 'path' | 'header' | 'body' = 'query';
    
    if (fromBodyRegex.test(param)) paramIn = 'body';
    else if (fromRouteRegex.test(param)) paramIn = 'path';
    else if (fromHeaderRegex.test(param)) paramIn = 'header';
    else if (fromQueryRegex.test(param)) paramIn = 'query';
    
    // Extract type and name
    const typeNameRegex = /(\w+(?:<[^>]+>)?(?:\[\])?)\s+(\w+)/;
    const match = typeNameRegex.exec(cleanParam);
    
    if (match) {
      const [, type, name] = match;
      
      return {
        name,
        type: this.mapCSharpType(type),
        in: paramIn,
        required: !param.includes('?') && !param.includes('= null'),
        description: `Parameter: ${name}`
      };
    }
    
    return null;
  }

  private mapCSharpType(csharpType: string): string {
    const typeMap: Record<string, string> = {
      'string': 'string',
      'int': 'integer',
      'long': 'integer',
      'double': 'number',
      'decimal': 'number',
      'float': 'number',
      'bool': 'boolean',
      'DateTime': 'string',
      'Guid': 'string'
    };
    
    // Handle arrays
    if (csharpType.includes('[]') || csharpType.includes('List<') || csharpType.includes('IEnumerable<')) {
      return 'array';
    }
    
    // Handle generic types
    if (csharpType.includes('<')) {
      const baseType = csharpType.split('<')[0];
      return typeMap[baseType!] || 'object';
    }
    
    return typeMap[csharpType] || csharpType;
  }

  private extractRequestBody(methodParams: string, content: string): RequestBody | undefined {
    const fromBodyRegex = /\[FromBody\]\s*(\w+(?:<[^>]+>)?)\s+(\w+)/;
    const match = fromBodyRegex.exec(methodParams);
    
    if (match) {
      const [, type] = match;
      return {
        contentType: 'application/json',
        schema: { type: 'object', className: type },
        example: this.generateExampleForType(type)
      };
    }
    
    return undefined;
  }

  private generateExampleForType(type: string): any {
    // Simple example generation based on common types
    if (type.includes('string')) return 'example';
    if (type.includes('User')) return { name: 'John Doe', email: 'john@example.com' };
    if (type.includes('Product')) return { name: 'Product Name', price: 99.99 };
    if (type.includes('List') || type.includes('IEnumerable')) return [{}];
    return {};
  }

  private extractCSharpResponses(content: string, methodName: string): Response[] {
    const responses: Response[] = [];
    
    // Find method body and look for return statements
    const methodRegex = new RegExp(`${methodName}\\s*\\([^\\)]*\\)[\\s\\S]*?\\{([^}]+\\{[^}]*\\})*[^}]*\\}`, 's');
    const match = methodRegex.exec(content);
    
    if (match) {
      const methodBody = match[0];
      
      // Look for return statements with status codes
      const returnPatterns = [
        /Ok\s*\([^)]*\)/g,
        /Created\s*\([^)]*\)/g,
        /NoContent\s*\(\s*\)/g,
        /BadRequest\s*\([^)]*\)/g,
        /NotFound\s*\([^)]*\)/g,
        /StatusCode\s*\(\s*(\d+)/g
      ];
      
      const statusMapping = {
        'Ok': 200,
        'Created': 201,
        'NoContent': 204,
        'BadRequest': 400,
        'NotFound': 404
      };
      
      for (const pattern of returnPatterns) {
        let returnMatch;
        while ((returnMatch = pattern.exec(methodBody)) !== null) {
          const methodCall = returnMatch[0];
          let statusCode = 200;
          
          for (const [method, code] of Object.entries(statusMapping)) {
            if (methodCall.includes(method)) {
              statusCode = code;
              break;
            }
          }
          
          // Handle StatusCode method
          if (methodCall.includes('StatusCode') && returnMatch[1]) {
            statusCode = parseInt(returnMatch[1]);
          }
          
          responses.push({
            statusCode,
            description: this.getStatusDescription(statusCode),
            schema: methodCall.includes('()') ? undefined : { type: 'object' }
          });
        }
      }
    }
    
    // Default success response
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

  protected async extractClasses(content: string, filePath: string): Promise<ClassInfo[]> {
    const classes: ClassInfo[] = [];
    
    const classRegex = /(?:public|private|protected|internal)?\s*(?:abstract\s+|sealed\s+)?class\s+(\w+)(?:\s*:\s*[\w,\s<>]+)?\s*\{/g;
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const [, name] = match;
      const lineNumber = this.findLineNumber(content, match[0]);
      const description = this.extractComments(content, lineNumber);
      
      // Extract class attributes
      const annotations = this.extractClassAttributes(content, lineNumber);
      
      classes.push({
        name,
        description: description || `Class: ${name}`,
        methods: [], // Would need more detailed parsing
        properties: [], // Would need more detailed parsing
        annotations,
        lineNumber
      });
    }
    
    return classes;
  }

  private extractClassAttributes(content: string, lineNumber: number): string[] {
    const attributes: string[] = [];
    const lines = content.split('\n');
    
    // Look for attributes above the class
    for (let i = lineNumber - 2; i >= 0; i--) {
      const line = lines[i]?.trim();
      if (!line) continue;
      
      if (line.startsWith('[') && line.endsWith(']')) {
        attributes.unshift(line);
      } else if (!this.isComment(line)) {
        break;
      }
    }
    
    return attributes;
  }

  protected async extractFunctions(content: string, filePath: string): Promise<FunctionInfo[]> {
    const functions: FunctionInfo[] = [];
    
    const methodRegex = /(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?(?:virtual\s+|override\s+)?(\w+(?:<[^>]+>)?|\w+)\s+(\w+)\s*\(([^)]*)\)/g;
    
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      const [, returnType, name, params] = match;
      
      // Skip constructors and properties
      if (returnType === name || returnType === 'get' || returnType === 'set') {
        continue;
      }
      
      const lineNumber = this.findLineNumber(content, match[0]);
      const description = this.extractComments(content, lineNumber);
      
      // Extract method attributes
      const annotations = this.extractMethodAttributes(content, lineNumber);
      
      functions.push({
        name,
        description: description || `Method: ${name}`,
        parameters: this.parseMethodParameters(params),
        returnType,
        annotations,
        lineNumber
      });
    }
    
    return functions;
  }

  private extractMethodAttributes(content: string, lineNumber: number): string[] {
    const attributes: string[] = [];
    const lines = content.split('\n');
    
    // Look for attributes above the method
    for (let i = lineNumber - 2; i >= 0; i--) {
      const line = lines[i]?.trim();
      if (!line) continue;
      
      if (line.startsWith('[') && line.endsWith(']')) {
        attributes.unshift(line);
      } else if (!this.isComment(line)) {
        break;
      }
    }
    
    return attributes;
  }

  private parseMethodParameters(params: string): Parameter[] {
    const parameters: Parameter[] = [];
    
    if (!params.trim()) return parameters;
    
    const paramParts = this.splitParameters(params);
    
    for (const param of paramParts) {
      const parts = param.trim().replace(/\[[^\]]+\]/g, '').split(/\s+/);
      if (parts.length >= 2) {
        const type = parts[parts.length - 2]!;
        const name = parts[parts.length - 1]!.replace(/[,\s]*$/, '');
        
        parameters.push({
          name,
          type: this.mapCSharpType(type),
          in: 'body',
          required: !param.includes('?'),
          description: `Parameter: ${name}`
        });
      }
    }
    
    return parameters;
  }

  protected isComment(line: string): boolean {
    return line.startsWith('//') || line.startsWith('/*') || line.includes('*/') || line.startsWith('///');
  }

  protected cleanComment(line: string): string {
    return line
      .replace(/^\s*\/\/\/??\s?/, '')
      .replace(/^\s*\/\*\*?\s?/, '')
      .replace(/\s?\*\/\s*$/, '')
      .replace(/^\s*\*\s?/, '')
      .trim();
  }
}
