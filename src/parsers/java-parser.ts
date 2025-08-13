import { BaseParser } from './base-parser';
import { ApiEndpoint, ClassInfo, FunctionInfo, Parameter, Response, RequestBody } from '../types';
import logger from '../utils/logger';

export class JavaParser extends BaseParser {
  constructor() {
    super('java');
  }

  protected getFileExtensions(): string[] {
    return ['.java'];
  }

  protected async extractApiEndpoints(content: string, filePath: string): Promise<ApiEndpoint[]> {
    const endpoints: ApiEndpoint[] = [];
    
    try {
      // Extract Spring Boot REST endpoints
      endpoints.push(...this.extractSpringRestEndpoints(content, filePath));
      
      // Extract JAX-RS endpoints
      endpoints.push(...this.extractJaxRsEndpoints(content, filePath));
      
    } catch (error) {
      logger.error(`Error extracting Java API endpoints from ${filePath}:`, error);
    }

    return endpoints;
  }

  private extractSpringRestEndpoints(content: string, filePath: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    
    // Extract class-level @RequestMapping
    const classRequestMapping = this.extractClassRequestMapping(content);
    
    // Extract method-level mappings
    const methodMappings = [
      { annotation: '@GetMapping', method: 'GET' },
      { annotation: '@PostMapping', method: 'POST' },
      { annotation: '@PutMapping', method: 'PUT' },
      { annotation: '@DeleteMapping', method: 'DELETE' },
      { annotation: '@PatchMapping', method: 'PATCH' },
      { annotation: '@RequestMapping', method: 'GET' } // Default, needs method parsing
    ];

    for (const mapping of methodMappings) {
      endpoints.push(...this.extractMethodMappings(content, filePath, mapping, classRequestMapping));
    }

    return endpoints;
  }

  private extractClassRequestMapping(content: string): string {
    const classRequestMappingRegex = /@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/;
    const match = classRequestMappingRegex.exec(content);
    return match ? match[1]! : '';
  }

  private extractMethodMappings(
    content: string,
    filePath: string,
    mapping: { annotation: string; method: string },
    basePath: string
  ): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    
    // Pattern to match annotation followed by method definition
    const annotationRegex = new RegExp(
      `${mapping.annotation.replace('@', '\\@')}\\s*\\(([^)]*)\\)[\\s\\S]*?` +
      `(?:public|private|protected)?\\s*\\w+\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`,
      'g'
    );

    let match;
    while ((match = annotationRegex.exec(content)) !== null) {
      const [fullMatch, annotationParams, methodName, methodParams] = match;
      const lineNumber = this.findLineNumber(content, fullMatch);
      const description = this.extractComments(content, lineNumber);
      
      // Extract path from annotation
      let path = this.extractPathFromAnnotation(annotationParams);
      if (!path && mapping.annotation === '@RequestMapping') {
        path = this.extractValueFromAnnotation(annotationParams);
      }
      
      // Combine with base path
      const fullPath = this.combinePaths(basePath, path);
      
      // Extract HTTP method for @RequestMapping
      let httpMethod = mapping.method;
      if (mapping.annotation === '@RequestMapping') {
        httpMethod = this.extractMethodFromAnnotation(annotationParams) || 'GET';
      }

      // Extract parameters
      const parameters = this.extractMethodParameters(methodParams, content, methodName);
      
      // Extract request body
      const requestBody = this.extractRequestBody(methodParams, content);
      
      // Extract responses
      const responses = this.extractJavaResponses(content, methodName);

      endpoints.push({
        method: httpMethod as any,
        path: fullPath,
        description: description || `${httpMethod} ${fullPath}`,
        parameters,
        requestBody,
        responses,
        tags: ['spring-boot'],
        fileName: filePath,
        lineNumber
      });
    }

    return endpoints;
  }

  private extractPathFromAnnotation(params: string): string {
    // Match path = "...", value = "...", or just "..."
    const pathRegex = /(?:path|value)\s*=\s*["']([^"']+)["']|["']([^"']+)["']/;
    const match = pathRegex.exec(params);
    return match ? (match[1] || match[2] || '') : '';
  }

  private extractValueFromAnnotation(params: string): string {
    const valueRegex = /value\s*=\s*["']([^"']+)["']/;
    const match = valueRegex.exec(params);
    return match ? match[1]! : '';
  }

  private extractMethodFromAnnotation(params: string): string | null {
    const methodRegex = /method\s*=\s*RequestMethod\.(\w+)/;
    const match = methodRegex.exec(params);
    return match ? match[1]! : null;
  }

  private combinePaths(basePath: string, methodPath: string): string {
    const cleanBase = basePath.replace(/\/+$/, '');
    const cleanMethod = methodPath.replace(/^\/+/, '');
    
    if (!cleanBase && !cleanMethod) return '/';
    if (!cleanBase) return `/${cleanMethod}`;
    if (!cleanMethod) return cleanBase;
    
    return `${cleanBase}/${cleanMethod}`;
  }

  private extractMethodParameters(methodParams: string, content: string, methodName: string): Parameter[] {
    const parameters: Parameter[] = [];
    
    if (!methodParams.trim()) return parameters;

    // Split parameters and parse annotations
    const paramParts = this.splitParameters(methodParams);
    
    for (const param of paramParts) {
      const parameter = this.parseParameter(param);
      if (parameter) {
        parameters.push(parameter);
      }
    }

    return parameters;
  }

  private splitParameters(params: string): string[] {
    // Simple parameter splitting - could be improved for complex generics
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of params) {
      if (char === '<') depth++;
      else if (char === '>') depth--;
      else if (char === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    
    if (current.trim()) {
      parts.push(current.trim());
    }
    
    return parts;
  }

  private parseParameter(param: string): Parameter | null {
    // Parse annotations and parameter info
    const pathVarRegex = /@PathVariable(?:\s*\(\s*["']([^"']+)["']\s*\))?\s+\w+\s+(\w+)/;
    const requestParamRegex = /@RequestParam(?:\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["'](?:\s*,\s*required\s*=\s*(true|false))?\s*\))?\s+\w+\s+(\w+)/;
    const requestBodyRegex = /@RequestBody\s+(\w+(?:<[^>]+>)?)\s+(\w+)/;
    
    let match = pathVarRegex.exec(param);
    if (match) {
      const [, annotationName, paramName] = match;
      return {
        name: annotationName || paramName,
        type: 'string',
        in: 'path',
        required: true,
        description: `Path parameter: ${annotationName || paramName}`
      };
    }
    
    match = requestParamRegex.exec(param);
    if (match) {
      const [, annotationName, required, paramName] = match;
      return {
        name: annotationName || paramName,
        type: this.extractJavaType(param),
        in: 'query',
        required: required !== 'false',
        description: `Query parameter: ${annotationName || paramName}`
      };
    }
    
    match = requestBodyRegex.exec(param);
    if (match) {
      const [, type, paramName] = match;
      return {
        name: paramName,
        type: type,
        in: 'body',
        required: true,
        description: `Request body: ${type}`
      };
    }
    
    return null;
  }

  private extractJavaType(param: string): string {
    const typeRegex = /\b(String|Integer|int|Long|long|Double|double|Boolean|boolean|List<\w+>|Map<\w+,\s*\w+>|\w+)\b/;
    const match = typeRegex.exec(param);
    return match ? match[1]! : 'unknown';
  }

  private extractRequestBody(methodParams: string, content: string): RequestBody | undefined {
    const requestBodyRegex = /@RequestBody\s+(\w+(?:<[^>]+>)?)\s+(\w+)/;
    const match = requestBodyRegex.exec(methodParams);
    
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
    if (type.includes('String')) return { field: 'example' };
    if (type.includes('User')) return { name: 'John Doe', email: 'john@example.com' };
    if (type.includes('List')) return [{}];
    return {};
  }

  private extractJavaResponses(content: string, methodName: string): Response[] {
    const responses: Response[] = [];
    
    // Find method and look for ResponseEntity or @ResponseStatus
    const methodRegex = new RegExp(`${methodName}\\s*\\([^\\)]*\\)\\s*\\{([^}]+\\{[^}]*\\})*[^}]*\\}`, 's');
    const match = methodRegex.exec(content);
    
    if (match) {
      const methodBody = match[0];
      
      // Look for ResponseEntity.ok(), ResponseEntity.status(), etc.
      const responseEntityRegex = /ResponseEntity\.(\w+)\(([^)]*)\)/g;
      let responseMatch;
      
      while ((responseMatch = responseEntityRegex.exec(methodBody)) !== null) {
        const [, status, body] = responseMatch;
        const statusCode = this.mapSpringStatusToCode(status);
        
        responses.push({
          statusCode,
          description: this.getStatusDescription(statusCode),
          schema: body ? { type: 'object' } : undefined
        });
      }
      
      // Look for @ResponseStatus annotation
      const responseStatusRegex = /@ResponseStatus\s*\(\s*(?:value\s*=\s*)?HttpStatus\.(\w+)/;
      const statusMatch = responseStatusRegex.exec(content);
      if (statusMatch) {
        const statusCode = this.mapHttpStatusToCode(statusMatch[1]!);
        responses.push({
          statusCode,
          description: this.getStatusDescription(statusCode)
        });
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

  private mapSpringStatusToCode(status: string): number {
    const mapping: Record<string, number> = {
      'ok': 200,
      'created': 201,
      'noContent': 204,
      'badRequest': 400,
      'unauthorized': 401,
      'forbidden': 403,
      'notFound': 404,
      'internalServerError': 500
    };
    
    return mapping[status] || 200;
  }

  private mapHttpStatusToCode(status: string): number {
    const mapping: Record<string, number> = {
      'OK': 200,
      'CREATED': 201,
      'NO_CONTENT': 204,
      'BAD_REQUEST': 400,
      'UNAUTHORIZED': 401,
      'FORBIDDEN': 403,
      'NOT_FOUND': 404,
      'INTERNAL_SERVER_ERROR': 500
    };
    
    return mapping[status] || 200;
  }

  private extractJaxRsEndpoints(content: string, filePath: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    
    // Extract JAX-RS @Path and HTTP method annotations
    const jaxRsMethods = ['@GET', '@POST', '@PUT', '@DELETE', '@PATCH'];
    
    for (const method of jaxRsMethods) {
      const httpMethod = method.replace('@', '');
      const regex = new RegExp(`${method}[\\s\\S]*?@Path\\s*\\(\\s*["']([^"']+)["']\\s*\\)[\\s\\S]*?(?:public|private|protected)?\\s*\\w+\\s+(\\w+)\\s*\\([^)]*\\)`, 'g');
      
      let match;
      while ((match = regex.exec(content)) !== null) {
        const [fullMatch, path, methodName] = match;
        const lineNumber = this.findLineNumber(content, fullMatch);
        const description = this.extractComments(content, lineNumber);
        
        endpoints.push({
          method: httpMethod as any,
          path,
          description: description || `${httpMethod} ${path}`,
          parameters: [],
          responses: [{ statusCode: 200, description: 'Success' }],
          tags: ['jax-rs'],
          fileName: filePath,
          lineNumber
        });
      }
    }
    
    return endpoints;
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
    
    const classRegex = /(?:public|private|protected)?\s*class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{/g;
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      const [, name] = match;
      const lineNumber = this.findLineNumber(content, match[0]);
      const description = this.extractComments(content, lineNumber);
      
      // Extract class annotations
      const annotations = this.extractClassAnnotations(content, lineNumber);
      
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

  private extractClassAnnotations(content: string, lineNumber: number): string[] {
    const annotations: string[] = [];
    const lines = content.split('\n');
    
    // Look for annotations above the class
    for (let i = lineNumber - 2; i >= 0; i--) {
      const line = lines[i]?.trim();
      if (!line) continue;
      
      if (line.startsWith('@')) {
        annotations.unshift(line);
      } else if (!this.isComment(line)) {
        break;
      }
    }
    
    return annotations;
  }

  protected async extractFunctions(content: string, filePath: string): Promise<FunctionInfo[]> {
    const functions: FunctionInfo[] = [];
    
    const methodRegex = /(?:public|private|protected)?\s*(?:static\s+)?(\w+(?:<[^>]+>)?|\w+)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;
    
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
      const [, returnType, name, params] = match;
      const lineNumber = this.findLineNumber(content, match[0]);
      const description = this.extractComments(content, lineNumber);
      
      // Extract method annotations
      const annotations = this.extractMethodAnnotations(content, lineNumber);
      
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

  private extractMethodAnnotations(content: string, lineNumber: number): string[] {
    const annotations: string[] = [];
    const lines = content.split('\n');
    
    // Look for annotations above the method
    for (let i = lineNumber - 2; i >= 0; i--) {
      const line = lines[i]?.trim();
      if (!line) continue;
      
      if (line.startsWith('@')) {
        annotations.unshift(line);
      } else if (!this.isComment(line)) {
        break;
      }
    }
    
    return annotations;
  }

  private parseMethodParameters(params: string): Parameter[] {
    const parameters: Parameter[] = [];
    
    if (!params.trim()) return parameters;
    
    const paramParts = this.splitParameters(params);
    
    for (const param of paramParts) {
      const parts = param.trim().split(/\s+/);
      if (parts.length >= 2) {
        const type = parts[parts.length - 2]!;
        const name = parts[parts.length - 1]!;
        
        parameters.push({
          name,
          type,
          in: 'body',
          required: true,
          description: `Parameter: ${name}`
        });
      }
    }
    
    return parameters;
  }

  protected isComment(line: string): boolean {
    return line.startsWith('//') || line.startsWith('/*') || line.includes('*/') || line.startsWith('*');
  }

  protected cleanComment(line: string): string {
    return line
      .replace(/^\s*\/\/\s?/, '')
      .replace(/^\s*\/\*\*?\s?/, '')
      .replace(/\s?\*\/\s*$/, '')
      .replace(/^\s*\*\s?/, '')
      .trim();
  }
}
