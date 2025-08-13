// Main entry point for the documentation pipeline

export * from './types';
export * from './config';
export * from './parsers';
export * from './ai';
export * from './confluence';
export * from './automation';
export * from './utils/logger';

// Re-export main classes for convenience
export { Config } from './config';
export { ParserFactory } from './parsers';
export { ClaudeClient, DocumentationTransformer } from './ai';
export { ConfluenceClient, PageMappingService } from './confluence';
export { DocumentationPipeline, FileWatcher, GitIntegration } from './automation';

// Version info
export const VERSION = '1.0.0';
