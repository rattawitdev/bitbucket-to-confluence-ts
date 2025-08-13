import * as fs from 'fs-extra';
import * as path from 'path';
import { DocumentationPage } from '../types';
import logger from '../utils/logger';

interface PageMapping {
  filePath: string;
  confluencePageId: string;
  confluencePageTitle: string;
  lastUpdated: string;
  version: number;
}

interface PageMappingData {
  version: string;
  lastUpdated: string;
  mappings: PageMapping[];
}

export class PageMappingService {
  private mappingFile: string;
  private mappings: Map<string, PageMapping> = new Map();

  constructor(mappingFile: string = 'confluence-mapping.json') {
    this.mappingFile = mappingFile;
    this.loadMappings();
  }

  public async loadMappings(): Promise<void> {
    try {
      if (await fs.pathExists(this.mappingFile)) {
        const data = await fs.readJson(this.mappingFile) as PageMappingData;
        
        for (const mapping of data.mappings) {
          this.mappings.set(mapping.filePath, mapping);
        }
        
        logger.info(`Loaded ${data.mappings.length} page mappings from ${this.mappingFile}`);
      } else {
        logger.info(`No existing mapping file found at ${this.mappingFile}, starting fresh`);
      }
    } catch (error) {
      logger.error(`Error loading page mappings from ${this.mappingFile}:`, error);
      // Continue with empty mappings rather than failing
    }
  }

  public async saveMappings(): Promise<void> {
    try {
      const data: PageMappingData = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        mappings: Array.from(this.mappings.values())
      };

      await fs.writeJson(this.mappingFile, data, { spaces: 2 });
      logger.info(`Saved ${data.mappings.length} page mappings to ${this.mappingFile}`);
    } catch (error) {
      logger.error(`Error saving page mappings to ${this.mappingFile}:`, error);
      throw error;
    }
  }

  public addMapping(
    filePath: string, 
    confluencePageId: string, 
    confluencePageTitle: string, 
    version: number = 1
  ): void {
    const mapping: PageMapping = {
      filePath: path.resolve(filePath),
      confluencePageId,
      confluencePageTitle,
      lastUpdated: new Date().toISOString(),
      version
    };

    this.mappings.set(mapping.filePath, mapping);
    logger.debug(`Added mapping: ${filePath} -> ${confluencePageId}`);
  }

  public getMapping(filePath: string): PageMapping | null {
    const resolvedPath = path.resolve(filePath);
    return this.mappings.get(resolvedPath) || null;
  }

  public removeMapping(filePath: string): boolean {
    const resolvedPath = path.resolve(filePath);
    const removed = this.mappings.delete(resolvedPath);
    
    if (removed) {
      logger.debug(`Removed mapping for: ${filePath}`);
    }
    
    return removed;
  }

  public getPageIdForFile(filePath: string): string | null {
    const mapping = this.getMapping(filePath);
    return mapping ? mapping.confluencePageId : null;
  }

  public getFileForPageId(pageId: string): string | null {
    for (const mapping of this.mappings.values()) {
      if (mapping.confluencePageId === pageId) {
        return mapping.filePath;
      }
    }
    return null;
  }

  public getAllMappings(): PageMapping[] {
    return Array.from(this.mappings.values());
  }

  public getMappingsForDirectory(directoryPath: string): PageMapping[] {
    const resolvedDir = path.resolve(directoryPath);
    
    return Array.from(this.mappings.values()).filter(mapping => 
      mapping.filePath.startsWith(resolvedDir)
    );
  }

  public updateMappingVersion(filePath: string, version: number): boolean {
    const mapping = this.getMapping(filePath);
    if (mapping) {
      mapping.version = version;
      mapping.lastUpdated = new Date().toISOString();
      this.mappings.set(mapping.filePath, mapping);
      return true;
    }
    return false;
  }

  public hasMapping(filePath: string): boolean {
    return this.getMapping(filePath) !== null;
  }

  public getOutdatedMappings(maxAge: number = 24 * 60 * 60 * 1000): PageMapping[] {
    const cutoffDate = new Date(Date.now() - maxAge);
    
    return Array.from(this.mappings.values()).filter(mapping => {
      const lastUpdated = new Date(mapping.lastUpdated);
      return lastUpdated < cutoffDate;
    });
  }

  public cleanupOrphanedMappings(existingFiles: string[]): Promise<void> {
    const resolvedFiles = new Set(existingFiles.map(f => path.resolve(f)));
    const orphaned: string[] = [];

    for (const [filePath, mapping] of this.mappings.entries()) {
      if (!resolvedFiles.has(filePath)) {
        orphaned.push(filePath);
      }
    }

    for (const orphanPath of orphaned) {
      this.mappings.delete(orphanPath);
      logger.info(`Removed orphaned mapping: ${orphanPath}`);
    }

    if (orphaned.length > 0) {
      logger.info(`Cleaned up ${orphaned.length} orphaned mappings`);
      return this.saveMappings();
    }

    return Promise.resolve();
  }

  public async syncWithDocumentation(documentation: DocumentationPage, filePath: string): Promise<void> {
    const existing = this.getMapping(filePath);
    
    if (existing) {
      // Update existing mapping
      existing.confluencePageTitle = documentation.title;
      existing.lastUpdated = new Date().toISOString();
      if (documentation.version) {
        existing.version = documentation.version;
      }
      this.mappings.set(existing.filePath, existing);
    } else {
      // Create new mapping
      this.addMapping(
        filePath, 
        documentation.id, 
        documentation.title,
        documentation.version || 1
      );
    }

    await this.saveMappings();
  }

  public getStatistics(): {
    totalMappings: number;
    languages: Record<string, number>;
    oldestMapping: string | null;
    newestMapping: string | null;
  } {
    const mappings = this.getAllMappings();
    const languages: Record<string, number> = {};
    
    let oldest: PageMapping | null = null;
    let newest: PageMapping | null = null;

    for (const mapping of mappings) {
      // Count by file extension
      const ext = path.extname(mapping.filePath);
      languages[ext] = (languages[ext] || 0) + 1;

      // Track oldest and newest
      const updated = new Date(mapping.lastUpdated);
      if (!oldest || updated < new Date(oldest.lastUpdated)) {
        oldest = mapping;
      }
      if (!newest || updated > new Date(newest.lastUpdated)) {
        newest = mapping;
      }
    }

    return {
      totalMappings: mappings.length,
      languages,
      oldestMapping: oldest?.filePath || null,
      newestMapping: newest?.filePath || null
    };
  }

  public async backup(backupPath?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = backupPath || `${this.mappingFile}.backup.${timestamp}`;
    
    try {
      await fs.copy(this.mappingFile, backupFile);
      logger.info(`Created backup of page mappings: ${backupFile}`);
      return backupFile;
    } catch (error) {
      logger.error(`Error creating backup: ${error}`);
      throw error;
    }
  }

  public async restore(backupPath: string): Promise<void> {
    try {
      await fs.copy(backupPath, this.mappingFile);
      await this.loadMappings();
      logger.info(`Restored page mappings from backup: ${backupPath}`);
    } catch (error) {
      logger.error(`Error restoring from backup: ${error}`);
      throw error;
    }
  }
}
