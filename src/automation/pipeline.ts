import { EventEmitter } from 'events';
import { FileWatcher, FileChangeEvent } from './file-watcher';
import { ParserFactory } from '../parsers';
import { DocumentationTransformer, MultiFileTransformer } from '../ai';
import { ContextAnalyzer, ServiceContext } from '../analyzers/context-analyzer';
import { ConfluenceClient, PageMappingService } from '../confluence';
import { Config } from '../config';
import { ProcessingResult, CodeModule } from '../types';
import logger from '../utils/logger';
import * as path from 'path';

export interface PipelineOptions {
  processAllFiles?: boolean;
  forceUpdate?: boolean;
  skipUnchanged?: boolean;
  batchSize?: number;
  delayBetweenBatches?: number;
  enableMultiFileContext?: boolean;
  generateServiceDocumentation?: boolean;
  generateCrossServiceDocumentation?: boolean;
}

export interface PipelineStatistics {
  totalFilesProcessed: number;
  successfulProcesses: number;
  failedProcesses: number;
  pagesCreated: number;
  pagesUpdated: number;
  totalProcessingTime: number;
  averageProcessingTime: number;
  servicesAnalyzed?: number;
  serviceDocumentationGenerated?: number;
  crossReferencesFound?: number;
}

export class DocumentationPipeline extends EventEmitter {
  private config: Config;
  private fileWatcher: FileWatcher;
  private documentationTransformer: DocumentationTransformer;
  private multiFileTransformer: MultiFileTransformer;
  private contextAnalyzer: ContextAnalyzer;
  private confluenceClient: ConfluenceClient;
  private pageMappingService: PageMappingService;
  
  private isRunning = false;
  private processingQueue: string[] = [];
  private currentlyProcessing = new Set<string>();
  private statistics: PipelineStatistics = {
    totalFilesProcessed: 0,
    successfulProcesses: 0,
    failedProcesses: 0,
    pagesCreated: 0,
    pagesUpdated: 0,
    totalProcessingTime: 0,
    averageProcessingTime: 0
  };

  constructor() {
    super();
    this.config = Config.getInstance();
    this.fileWatcher = new FileWatcher();
    this.documentationTransformer = new DocumentationTransformer();
    this.multiFileTransformer = new MultiFileTransformer();
    this.contextAnalyzer = new ContextAnalyzer();
    this.confluenceClient = new ConfluenceClient();
    this.pageMappingService = new PageMappingService();

    this.setupEventListeners();
  }

  public async start(options: PipelineOptions = {}): Promise<void> {
    if (this.isRunning) {
      logger.warn('Pipeline is already running');
      return;
    }

    try {
      logger.info('Starting documentation pipeline...');
      this.isRunning = true;
      this.resetStatistics();

      // Start file watcher if in watch mode
      if (this.config.isWatchMode()) {
        await this.fileWatcher.start();
      }

      // Process all files if requested
      if (options.processAllFiles) {
        await this.processAllFiles(options);
      }

      logger.info('Documentation pipeline started successfully');
      this.emit('started', this.statistics);
    } catch (error) {
      this.isRunning = false;
      logger.error('Error starting pipeline:', error);
      this.emit('error', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('Stopping documentation pipeline...');
      this.isRunning = false;

      // Stop file watcher
      await this.fileWatcher.stop();

      // Wait for current processing to complete
      while (this.currentlyProcessing.size > 0) {
        logger.info(`Waiting for ${this.currentlyProcessing.size} files to finish processing...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.info('Documentation pipeline stopped');
      this.emit('stopped', this.statistics);
    } catch (error) {
      logger.error('Error stopping pipeline:', error);
      throw error;
    }
  }

  public async processFile(filePath: string, options: PipelineOptions = {}): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`Processing file: ${filePath}`);
      
      // Check if file is already being processed
      if (this.currentlyProcessing.has(filePath)) {
        logger.warn(`File ${filePath} is already being processed`);
        return {
          filePath,
          success: false,
          error: 'File is already being processed',
          processingTime: 0
        };
      }

      this.currentlyProcessing.add(filePath);

      // Skip if unchanged and skipUnchanged is true
      if (options.skipUnchanged && !options.forceUpdate) {
        const mapping = this.pageMappingService.getMapping(filePath);
        if (mapping) {
          const fileInfo = await this.fileWatcher.getFileInfo(filePath);
          if (fileInfo.exists && fileInfo.stats) {
            const fileModified = fileInfo.stats.mtime;
            const lastProcessed = new Date(mapping.lastUpdated);
            
            if (fileModified <= lastProcessed) {
              logger.debug(`Skipping unchanged file: ${filePath}`);
              this.currentlyProcessing.delete(filePath);
              return {
                filePath,
                success: true,
                processingTime: Date.now() - startTime
              };
            }
          }
        }
      }

      // Parse the file
      const codeModule = await ParserFactory.parseFile(filePath);
      if (!codeModule) {
        throw new Error('Unable to parse file or file not supported');
      }

      // Transform to documentation
      const documentationPage = await this.documentationTransformer.transformCodeToDocumentation(codeModule);

      // Update or create Confluence page
      let confluencePageId: string;
      let wasUpdated = false;

      if (this.config.isDryRun()) {
        logger.info(`[DRY RUN] Would create/update page: ${documentationPage.title}`);
        confluencePageId = `dry-run-${documentationPage.id}`;
      } else {
        const existingMapping = this.pageMappingService.getMapping(filePath);
        if (existingMapping) {
          // Update existing page
          const updatedPage = await this.confluenceClient.updatePage(existingMapping.confluencePageId, documentationPage);
          confluencePageId = updatedPage.id;
          wasUpdated = true;
          this.statistics.pagesUpdated++;
        } else {
          // Create new page
          const createdPage = await this.confluenceClient.createPage(documentationPage);
          confluencePageId = createdPage.id;
          this.statistics.pagesCreated++;
        }

        // Update mapping
        await this.pageMappingService.syncWithDocumentation(documentationPage, filePath);
      }

      const processingTime = Date.now() - startTime;
      this.updateStatistics(processingTime, true);

      const result: ProcessingResult = {
        filePath,
        success: true,
        documentation: documentationPage.content,
        confluencePageId,
        processingTime
      };

      logger.info(`Successfully processed ${filePath} in ${processingTime}ms (${wasUpdated ? 'updated' : 'created'})`);
      this.emit('fileProcessed', result);
      
      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStatistics(processingTime, false);

      const result: ProcessingResult = {
        filePath,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      };

      logger.error(`Failed to process ${filePath}:`, error);
      this.emit('fileProcessed', result);
      
      return result;
    } finally {
      this.currentlyProcessing.delete(filePath);
    }
  }

  public async processFiles(filePaths: string[], options: PipelineOptions = {}): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    const batchSize = options.batchSize || 5;
    const delayBetweenBatches = options.delayBetweenBatches || 1000;

    logger.info(`Processing ${filePaths.length} files in batches of ${batchSize}`);

    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      logger.info(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(filePaths.length / batchSize)}`);
      
      const batchPromises = batch.map(filePath => this.processFile(filePath, options));
      const batchResults = await Promise.all(batchPromises);
      
      results.push(...batchResults);

      // Delay between batches to avoid overwhelming APIs
      if (i + batchSize < filePaths.length && delayBetweenBatches > 0) {
        logger.debug(`Waiting ${delayBetweenBatches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return results;
  }

  public async processAllFiles(options: PipelineOptions = {}): Promise<ProcessingResult[]> {
    try {
      logger.info('Processing all files in watched directories');
      
      const allFiles = await this.fileWatcher.scanDirectories();
      const supportedFiles = [];

      for (const filePath of allFiles) {
        const fileInfo = await this.fileWatcher.getFileInfo(filePath);
        if (fileInfo.isSupported) {
          supportedFiles.push(filePath);
        }
      }

      logger.info(`Found ${supportedFiles.length} supported files to process`);
      
      return await this.processFiles(supportedFiles, options);
    } catch (error) {
      logger.error('Error processing all files:', error);
      throw error;
    }
  }

  public async generateArchitectureOverview(): Promise<void> {
    try {
      logger.info('Generating architecture overview...');
      
      const allFiles = await this.fileWatcher.scanDirectories();
      const codeModules: CodeModule[] = [];

      // Parse all supported files
      for (const filePath of allFiles) {
        const module = await ParserFactory.parseFile(filePath);
        if (module) {
          codeModules.push(module);
        }
      }

      if (codeModules.length === 0) {
        logger.warn('No code modules found for architecture overview');
        return;
      }

      // Generate overview documentation
      const overviewPage = await this.documentationTransformer.generateArchitectureOverview(codeModules);

      // Create or update the overview page
      if (!this.config.isDryRun()) {
        await this.confluenceClient.createOrUpdatePage(overviewPage);
        logger.info('Architecture overview created/updated successfully');
      } else {
        logger.info('[DRY RUN] Would create/update architecture overview page');
      }

    } catch (error) {
      logger.error('Error generating architecture overview:', error);
      throw error;
    }
  }

  public async processWithMultiFileContext(options: PipelineOptions = {}): Promise<ProcessingResult[]> {
    if (!options.enableMultiFileContext) {
      logger.warn('Multi-file context is disabled, falling back to single-file processing');
      return this.processAllFiles(options);
    }

    const startTime = Date.now();
    const results: ProcessingResult[] = [];

    try {
      logger.info('Starting multi-file context analysis and documentation generation');

      // Get all source directories
      const allFiles = await this.fileWatcher.scanDirectories();
      if (allFiles.length === 0) {
        logger.warn('No files found for processing');
        return results;
      }

      // Perform context analysis
      const sourceDirectories = this.config.getSourceDirectories();
      const serviceContexts: ServiceContext[] = [];

      for (const directory of sourceDirectories) {
        const contexts = await this.contextAnalyzer.analyzeDirectory(directory);
        serviceContexts.push(...contexts);
      }

      if (serviceContexts.length === 0) {
        logger.warn('No service contexts found, falling back to single-file processing');
        return this.processAllFiles(options);
      }

      logger.info(`Found ${serviceContexts.length} service contexts for multi-file processing`);

      // Update statistics
      this.statistics.servicesAnalyzed = serviceContexts.length;
      this.statistics.crossReferencesFound = serviceContexts.reduce(
        (sum, ctx) => sum + ctx.relationships.length, 0
      );

      // Generate service documentation for each context
      if (options.generateServiceDocumentation !== false) {
        for (const serviceContext of serviceContexts) {
          const serviceResult = await this.processServiceContext(serviceContext);
          results.push(...serviceResult);
        }
      }

      // Generate cross-service documentation if requested
      if (options.generateCrossServiceDocumentation && serviceContexts.length > 1) {
        const crossServiceResult = await this.processCrossServiceDocumentation(serviceContexts);
        if (crossServiceResult) {
          results.push(crossServiceResult);
        }
      }

      const totalTime = Date.now() - startTime;
      this.statistics.serviceDocumentationGenerated = results.length;
      
      logger.info(`Multi-file context processing completed in ${totalTime}ms`);
      logger.info(`Generated ${results.length} documentation pages from ${serviceContexts.length} services`);

      return results;

    } catch (error) {
      logger.error('Error in multi-file context processing:', error);
      throw error;
    }
  }

  private async processServiceContext(serviceContext: ServiceContext): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    const startTime = Date.now();

    try {
      logger.info(`Processing service context: ${serviceContext.serviceName}`);

      // Generate comprehensive service documentation
      const serviceDocumentation = await this.multiFileTransformer.generateServiceDocumentation(serviceContext);

      // Process each documentation page
      const pages = [
        serviceDocumentation.overviewPage,
        serviceDocumentation.apiDocumentationPage,
        serviceDocumentation.architecturePage
      ];

      // Add optional pages if they exist
      if (serviceDocumentation.businessLogicPage) {
        pages.push(serviceDocumentation.businessLogicPage);
      }
      if (serviceDocumentation.dataModelsPage) {
        pages.push(serviceDocumentation.dataModelsPage);
      }

      // Create/update pages in Confluence
      for (const page of pages) {
        const processingTime = Date.now() - startTime;
        
        try {
          let confluencePageId: string;
          
          if (this.config.isDryRun()) {
            logger.info(`[DRY RUN] Would create/update page: ${page.title}`);
            confluencePageId = `dry-run-${page.id}`;
          } else {
            const confluencePage = await this.confluenceClient.createOrUpdatePage(page);
            confluencePageId = confluencePage.id;
            
            // Update mapping
            await this.pageMappingService.syncWithDocumentation(page, serviceContext.rootPath);
          }

          results.push({
            filePath: serviceContext.rootPath,
            success: true,
            documentation: page.content,
            confluencePageId,
            processingTime
          });

          this.statistics.pagesCreated++;

        } catch (error) {
          const processingTime = Date.now() - startTime;
          results.push({
            filePath: serviceContext.rootPath,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            processingTime
          });

          logger.error(`Failed to process page ${page.title}:`, error);
        }
      }

      logger.info(`Service ${serviceContext.serviceName} processed: ${results.filter(r => r.success).length}/${results.length} pages successful`);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      results.push({
        filePath: serviceContext.rootPath,
        success: false,
        error: error instanceof Error ? error.message : 'Service processing failed',
        processingTime
      });

      logger.error(`Error processing service context ${serviceContext.serviceName}:`, error);
    }

    return results;
  }

  private async processCrossServiceDocumentation(serviceContexts: ServiceContext[]): Promise<ProcessingResult | null> {
    const startTime = Date.now();

    try {
      logger.info('Generating cross-service documentation');

      const crossServicePage = await this.multiFileTransformer.generateCrossServiceDocumentation(serviceContexts);
      
      const processingTime = Date.now() - startTime;

      if (this.config.isDryRun()) {
        logger.info(`[DRY RUN] Would create/update cross-service documentation`);
        return {
          filePath: 'cross-service',
          success: true,
          documentation: crossServicePage.content,
          confluencePageId: `dry-run-${crossServicePage.id}`,
          processingTime
        };
      } else {
        const confluencePage = await this.confluenceClient.createOrUpdatePage(crossServicePage);
        
        return {
          filePath: 'cross-service',
          success: true,
          documentation: crossServicePage.content,
          confluencePageId: confluencePage.id,
          processingTime
        };
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error generating cross-service documentation:', error);
      
      return {
        filePath: 'cross-service',
        success: false,
        error: error instanceof Error ? error.message : 'Cross-service documentation failed',
        processingTime
      };
    }
  }

  public getStatistics(): PipelineStatistics {
    return { ...this.statistics };
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  public getQueueLength(): number {
    return this.processingQueue.length;
  }

  public getCurrentlyProcessing(): string[] {
    return Array.from(this.currentlyProcessing);
  }

  private setupEventListeners(): void {
    this.fileWatcher.on('fileChange', (event: FileChangeEvent) => {
      if (!this.isRunning) return;

      this.handleFileChange(event);
    });

    this.fileWatcher.on('error', (error: Error) => {
      logger.error('File watcher error:', error);
      this.emit('error', error);
    });
  }

  private async handleFileChange(event: FileChangeEvent): Promise<void> {
    try {
      logger.debug(`File change detected: ${event.type} - ${event.filePath}`);

      switch (event.type) {
        case 'add':
        case 'change':
          // Queue file for processing
          if (!this.processingQueue.includes(event.filePath)) {
            this.processingQueue.push(event.filePath);
            this.processQueue();
          }
          break;
          
        case 'unlink':
          // Remove from queue if pending
          const index = this.processingQueue.indexOf(event.filePath);
          if (index > -1) {
            this.processingQueue.splice(index, 1);
          }
          
          // Remove mapping
          this.pageMappingService.removeMapping(event.filePath);
          break;
      }
    } catch (error) {
      logger.error(`Error handling file change for ${event.filePath}:`, error);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue.length === 0) return;

    // Process files from queue with some delay to batch changes
    setTimeout(async () => {
      const filesToProcess = this.processingQueue.splice(0);
      if (filesToProcess.length > 0) {
        logger.info(`Processing ${filesToProcess.length} files from queue`);
        await this.processFiles(filesToProcess, { skipUnchanged: true });
      }
    }, 2000); // 2 second delay to batch rapid changes
  }

  private resetStatistics(): void {
    this.statistics = {
      totalFilesProcessed: 0,
      successfulProcesses: 0,
      failedProcesses: 0,
      pagesCreated: 0,
      pagesUpdated: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0
    };
  }

  private updateStatistics(processingTime: number, success: boolean): void {
    this.statistics.totalFilesProcessed++;
    this.statistics.totalProcessingTime += processingTime;
    
    if (success) {
      this.statistics.successfulProcesses++;
    } else {
      this.statistics.failedProcesses++;
    }
    
    this.statistics.averageProcessingTime = 
      this.statistics.totalProcessingTime / this.statistics.totalFilesProcessed;
  }
}
