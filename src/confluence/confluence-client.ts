import axios, { AxiosInstance } from 'axios';
import { DocumentationPage, ConfluenceConfig } from '../types';
import { Config } from '../config';
import logger from '../utils/logger';

interface ConfluencePage {
  id: string;
  type: 'page';
  title: string;
  space: {
    key: string;
  };
  body: {
    storage: {
      value: string;
      representation: 'storage';
    };
  };
  version?: {
    number: number;
  };
  ancestors?: Array<{
    id: string;
  }>;
}

interface ConfluencePageResponse {
  id: string;
  type: string;
  title: string;
  space: {
    id: string;
    key: string;
    name: string;
  };
  version: {
    number: number;
    when: string;
  };
  body: {
    storage: {
      value: string;
      representation: string;
    };
  };
  _links: {
    webui: string;
    self: string;
  };
}

interface ConfluenceSearchResult {
  results: Array<{
    id: string;
    title: string;
    space: {
      key: string;
    };
    version: {
      number: number;
    };
  }>;
  size: number;
}

export class ConfluenceClient {
  private client: AxiosInstance;
  private config: ConfluenceConfig;
  private pageCache: Map<string, ConfluencePageResponse> = new Map();

  constructor() {
    const appConfig = Config.getInstance();
    this.config = appConfig.getConfluenceConfig();
    
    this.client = axios.create({
      baseURL: `${this.config.baseUrl}/rest/api`,
      auth: {
        username: this.config.username,
        password: this.config.apiToken
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Confluence API Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url
        });
        return Promise.reject(error);
      }
    );
  }

  public async createOrUpdatePage(documentation: DocumentationPage): Promise<ConfluencePageResponse> {
    try {
      logger.info(`Processing page: ${documentation.title} (${documentation.id})`);
      
      // Check if page already exists
      const existingPage = await this.findPageByTitle(documentation.title);
      
      if (existingPage) {
        logger.info(`Updating existing page: ${documentation.title}`);
        return await this.updatePage(existingPage.id, documentation);
      } else {
        logger.info(`Creating new page: ${documentation.title}`);
        return await this.createPage(documentation);
      }
    } catch (error) {
      logger.error(`Error creating/updating page ${documentation.title}:`, error);
      throw error;
    }
  }

  public async createPage(documentation: DocumentationPage): Promise<ConfluencePageResponse> {
    try {
      const pageData: ConfluencePage = {
        id: documentation.id,
        type: 'page',
        title: documentation.title,
        space: {
          key: documentation.spaceKey
        },
        body: {
          storage: {
            value: this.convertMarkdownToStorage(documentation.content),
            representation: 'storage'
          }
        }
      };

      // Add parent page if specified
      if (documentation.parentPageId) {
        pageData.ancestors = [{ id: documentation.parentPageId }];
      }

      const response = await this.client.post<ConfluencePageResponse>('/content', pageData);
      const createdPage = response.data;
      
      logger.info(`Created page: ${createdPage.title} (ID: ${createdPage.id})`);
      
      // Cache the page
      this.pageCache.set(documentation.title, createdPage);
      
      return createdPage;
    } catch (error) {
      logger.error(`Error creating page ${documentation.title}:`, error);
      throw error;
    }
  }

  public async updatePage(pageId: string, documentation: DocumentationPage): Promise<ConfluencePageResponse> {
    try {
      // Get current page version
      const currentPage = await this.getPage(pageId);
      const nextVersion = currentPage.version.number + 1;

      const updateData: ConfluencePage = {
        id: pageId,
        type: 'page',
        title: documentation.title,
        space: {
          key: documentation.spaceKey
        },
        body: {
          storage: {
            value: this.convertMarkdownToStorage(documentation.content),
            representation: 'storage'
          }
        },
        version: {
          number: nextVersion
        }
      };

      const response = await this.client.put<ConfluencePageResponse>(`/content/${pageId}`, updateData);
      const updatedPage = response.data;
      
      logger.info(`Updated page: ${updatedPage.title} (ID: ${updatedPage.id}, Version: ${updatedPage.version.number})`);
      
      // Update cache
      this.pageCache.set(documentation.title, updatedPage);
      
      return updatedPage;
    } catch (error) {
      logger.error(`Error updating page ${pageId}:`, error);
      throw error;
    }
  }

  public async getPage(pageId: string): Promise<ConfluencePageResponse> {
    try {
      const response = await this.client.get<ConfluencePageResponse>(`/content/${pageId}`, {
        params: {
          expand: 'body.storage,version,space'
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Error getting page ${pageId}:`, error);
      throw error;
    }
  }

  public async findPageByTitle(title: string): Promise<ConfluencePageResponse | null> {
    try {
      // Check cache first
      if (this.pageCache.has(title)) {
        const cachedPage = this.pageCache.get(title)!;
        // Verify the cached page still exists
        try {
          const currentPage = await this.getPage(cachedPage.id);
          return currentPage;
        } catch {
          // Page no longer exists, remove from cache
          this.pageCache.delete(title);
        }
      }

      const response = await this.client.get<ConfluenceSearchResult>('/content/search', {
        params: {
          cql: `space="${this.config.spaceKey}" AND title="${title}"`,
          expand: 'version,space'
        }
      });

      if (response.data.results.length > 0) {
        const page = response.data.results[0]!;
        const fullPage = await this.getPage(page.id);
        
        // Cache the result
        this.pageCache.set(title, fullPage);
        
        return fullPage;
      }

      return null;
    } catch (error) {
      logger.error(`Error finding page by title ${title}:`, error);
      return null;
    }
  }

  public async deletePage(pageId: string): Promise<void> {
    try {
      await this.client.delete(`/content/${pageId}`);
      logger.info(`Deleted page: ${pageId}`);
      
      // Remove from cache
      for (const [title, page] of this.pageCache.entries()) {
        if (page.id === pageId) {
          this.pageCache.delete(title);
          break;
        }
      }
    } catch (error) {
      logger.error(`Error deleting page ${pageId}:`, error);
      throw error;
    }
  }

  public async createPageHierarchy(pages: DocumentationPage[], parentPageTitle?: string): Promise<ConfluencePageResponse[]> {
    const createdPages: ConfluencePageResponse[] = [];
    
    try {
      let parentPageId: string | undefined;
      
      // Find parent page if specified
      if (parentPageTitle) {
        const parentPage = await this.findPageByTitle(parentPageTitle);
        if (parentPage) {
          parentPageId = parentPage.id;
        } else {
          logger.warn(`Parent page "${parentPageTitle}" not found, creating pages without parent`);
        }
      }

      // Create/update all pages
      for (const page of pages) {
        if (parentPageId) {
          page.parentPageId = parentPageId;
        }
        
        const createdPage = await this.createOrUpdatePage(page);
        createdPages.push(createdPage);
      }

      logger.info(`Created/updated ${createdPages.length} pages in hierarchy`);
      return createdPages;
    } catch (error) {
      logger.error('Error creating page hierarchy:', error);
      throw error;
    }
  }

  public async getSpaceInfo(): Promise<any> {
    try {
      const response = await this.client.get(`/space/${this.config.spaceKey}`, {
        params: {
          expand: 'description,homepage'
        }
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Error getting space info for ${this.config.spaceKey}:`, error);
      throw error;
    }
  }

  public async listPages(limit: number = 25): Promise<ConfluencePageResponse[]> {
    try {
      const response = await this.client.get<{ results: ConfluencePageResponse[] }>('/content', {
        params: {
          spaceKey: this.config.spaceKey,
          type: 'page',
          limit,
          expand: 'version,space'
        }
      });
      
      return response.data.results;
    } catch (error) {
      logger.error('Error listing pages:', error);
      throw error;
    }
  }

  private convertMarkdownToStorage(markdown: string): string {
    // Basic conversion from Markdown to Confluence Storage Format
    // This is a simplified converter - for production use, consider using a proper library
    
    let storage = markdown;
    
    // Convert headers
    storage = storage.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    storage = storage.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    storage = storage.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Convert bold and italic
    storage = storage.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    storage = storage.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Convert code blocks
    storage = storage.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
      const lang = language || 'text';
      return `<ac:structured-macro ac:name="code" ac:schema-version="1">
        <ac:parameter ac:name="language">${lang}</ac:parameter>
        <ac:plain-text-body><![CDATA[${code.trim()}]]></ac:plain-text-body>
      </ac:structured-macro>`;
    });
    
    // Convert inline code
    storage = storage.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Convert links
    storage = storage.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Convert lists (simplified)
    storage = storage.replace(/^- (.*$)/gim, '<li>$1</li>');
    storage = storage.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Convert tables (very basic)
    storage = storage.replace(/\|([^|]+)\|/g, '<td>$1</td>');
    
    // Convert line breaks
    storage = storage.replace(/\n\n/g, '</p><p>');
    storage = storage.replace(/^\s*(.+)/gm, '<p>$1</p>');
    
    // Clean up multiple paragraph tags
    storage = storage.replace(/<p>\s*<\/p>/g, '');
    storage = storage.replace(/<p>(<h[1-6]>)/g, '$1');
    storage = storage.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
    
    return storage;
  }

  public getPageUrl(pageId: string): string {
    return `${this.config.baseUrl}/pages/viewpage.action?pageId=${pageId}`;
  }

  public clearCache(): void {
    this.pageCache.clear();
    logger.info('Confluence page cache cleared');
  }
}
