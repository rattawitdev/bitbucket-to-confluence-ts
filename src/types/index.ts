// Core types for the documentation pipeline

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Response[];
  tags: string[];
  fileName: string;
  lineNumber: number;
}

export interface Parameter {
  name: string;
  type: string;
  in: 'query' | 'path' | 'header' | 'body';
  required: boolean;
  description: string;
}

export interface RequestBody {
  contentType: string;
  schema: any;
  example?: any;
}

export interface Response {
  statusCode: number;
  description: string;
  schema?: any;
  example?: any;
}

export interface CodeModule {
  filePath: string;
  language: 'go' | 'java' | 'csharp';
  endpoints: ApiEndpoint[];
  classes: ClassInfo[];
  functions: FunctionInfo[];
  lastModified: Date;
}

export interface ClassInfo {
  name: string;
  description: string;
  methods: FunctionInfo[];
  properties: PropertyInfo[];
  annotations: string[];
  lineNumber: number;
}

export interface FunctionInfo {
  name: string;
  description: string;
  parameters: Parameter[];
  returnType: string;
  annotations: string[];
  lineNumber: number;
}

export interface PropertyInfo {
  name: string;
  type: string;
  description: string;
  annotations: string[];
}

export interface DocumentationPage {
  id: string;
  title: string;
  content: string;
  spaceKey: string;
  parentPageId?: string;
  version?: number;
  lastUpdated: Date;
}

export interface ConfluenceConfig {
  baseUrl: string;
  username: string;
  apiToken: string;
  spaceKey: string;
}

export interface ClaudeConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export interface PipelineConfig {
  sourceDirectories: string[];
  excludePatterns: string[];
  includeLanguages: ('go' | 'java' | 'csharp')[];
  confluence: ConfluenceConfig;
  claude: ClaudeConfig;
  watchMode: boolean;
  dryRun: boolean;
}

export interface ProcessingResult {
  filePath: string;
  success: boolean;
  documentation?: string;
  confluencePageId?: string;
  error?: string;
  processingTime: number;
}

export interface GitHookEvent {
  repository: string;
  branch: string;
  commits: GitCommit[];
  modifiedFiles: string[];
}

export interface GitCommit {
  id: string;
  message: string;
  author: string;
  timestamp: Date;
  modifiedFiles: string[];
}
