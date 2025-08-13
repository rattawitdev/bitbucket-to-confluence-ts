# Backend Source Code to Confluence Documentation Pipeline

An automated TypeScript-based pipeline that transforms backend source code into comprehensive technical documentation using Claude 4.0 Sonnet (Anthropic) and publishes it to Confluence.

## 🚀 Features

- **Multi-language Support**: GoLang, Java Spring Boot, and C# ASP.NET Core
- **AI-Powered Documentation**: Uses Claude 4.0 Sonnet for human-readable documentation generation
- **Confluence Integration**: Automatically creates/updates Confluence pages via REST API
- **Repository URL Support**: Process any Git repository directly from URL (GitHub, GitLab, Bitbucket)
- **Private Repository Access**: Full authentication support with tokens and credentials
- **Real-time File Watching**: Monitors code changes and updates documentation automatically
- **Git Integration**: Supports git hooks and CI/CD pipeline integration
- **Smart Change Detection**: Only processes modified files to optimize performance
- **API Endpoint Extraction**: Automatically detects REST API endpoints with parameters and responses
- **Architecture Overview**: Generates comprehensive system architecture documentation

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- TypeScript
- Access to Claude API (Anthropic)
- Confluence Cloud/Server with API access
- Git repository (optional, for git hooks)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bitbucket-to-confluence-ts
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Set up environment variables**
   
   Copy the example environment file:
   ```bash
   cp config/env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Claude AI Configuration
   CLAUDE_API_KEY=your_claude_api_key_here
   CLAUDE_MODEL=claude-3-5-sonnet-20241022
   
   # Confluence Configuration
   CONFLUENCE_BASE_URL=https://your-domain.atlassian.net/wiki
   CONFLUENCE_USERNAME=your.email@domain.com
   CONFLUENCE_API_TOKEN=your_confluence_api_token
   CONFLUENCE_SPACE_KEY=YOUR_SPACE_KEY
   
   # Source Code Configuration
   SOURCE_DIRECTORIES=./src,./api,./services
   INCLUDE_LANGUAGES=go,java,csharp
   ```

## 🔑 Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CLAUDE_API_KEY` | Your Claude API key from Anthropic | `sk-ant-api03-...` |
| `CONFLUENCE_BASE_URL` | Your Confluence base URL | `https://company.atlassian.net/wiki` |
| `CONFLUENCE_USERNAME` | Your Confluence username/email | `user@company.com` |
| `CONFLUENCE_API_TOKEN` | Your Confluence API token | `ATATT3xFf...` |
| `CONFLUENCE_SPACE_KEY` | Target Confluence space key | `DEV` or `DOCS` |

### Optional Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SOURCE_DIRECTORIES` | Comma-separated source directories | `./src` |
| `INCLUDE_LANGUAGES` | Languages to process | `go,java,csharp` |
| `EXCLUDE_PATTERNS` | Patterns to exclude | `node_modules,.git,dist,build` |
| `WATCH_MODE` | Enable file watching | `false` |
| `DRY_RUN` | Run without making changes | `false` |
| `LOG_LEVEL` | Logging level | `info` |

### Getting API Keys and Tokens

#### Claude API Key
1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Create an account or sign in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key (starts with `sk-ant-api03-`)

#### Confluence API Token
1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Create an API token
3. Copy the token
4. Your username should be your email address

## 📖 Usage

### Command Line Interface

The pipeline provides a comprehensive CLI with multiple operation modes:

```bash
# Install globally for easier access
npm install -g .

# Or use npx
npx doc-pipeline [options]
```

### Basic Operations

**Process all files once:**
```bash
doc-pipeline --process-all
```

**Start in watch mode (monitors file changes):**
```bash
doc-pipeline --watch
```

**Process specific files:**
```bash
doc-pipeline --files src/api/user.go src/service/auth.java
```

**Process only changed files (since last commit):**
```bash
doc-pipeline --changed-only
```

**Process only staged files:**
```bash
doc-pipeline --staged-only
```

**Generate architecture overview:**
```bash
doc-pipeline --generate-overview
```

**Process remote repository:**
```bash
doc-pipeline --repository https://github.com/user/repo.git --process-all
```

**Process private repository with token:**
```bash
doc-pipeline --repo https://github.com/user/private-repo.git --token $GITHUB_TOKEN --process-all
```

**Validate repository access:**
```bash
doc-pipeline --repository https://github.com/user/repo.git --validate-repo
```

### Git Integration

**Install git hooks for automatic documentation updates:**
```bash
doc-pipeline --install-hooks
```

**Uninstall git hooks:**
```bash
doc-pipeline --uninstall-hooks
```

### Advanced Options

**Dry run (no changes to Confluence):**
```bash
doc-pipeline --process-all --dry-run
```

**Force update all files:**
```bash
doc-pipeline --process-all --force
```

**Custom log level:**
```bash
doc-pipeline --process-all --log-level debug
```

**Use custom config file:**
```bash
doc-pipeline --process-all --config ./my-config.json
```

### Repository Processing

**Process GitHub repository:**
```bash
doc-pipeline --repository https://github.com/owner/repo.git --process-all
```

**Process GitLab repository with specific branch:**
```bash
doc-pipeline --repo https://gitlab.com/owner/repo.git --branch develop --process-all
```

**Process Bitbucket repository:**
```bash
doc-pipeline --repository https://bitbucket.org/owner/repo.git --process-all
```

**Process private repository with authentication:**
```bash
# Using GitHub token
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
doc-pipeline --repository https://github.com/owner/private-repo.git --token $GITHUB_TOKEN --process-all

# Using username/password
doc-pipeline --repository https://gitlab.com/owner/private-repo.git --username myuser --password mypass --process-all
```

**Shallow clone for large repositories:**
```bash
doc-pipeline --repository https://github.com/owner/large-repo.git --depth 1 --process-all
```

**Validate repository before processing:**
```bash
doc-pipeline --repository https://github.com/owner/repo.git --validate-repo
```

## 🏗️ Supported Code Patterns

### Go (Golang)
- **Gin Framework**: `router.GET("/path", handler)`
- **Echo Framework**: `e.GET("/path", handler)`
- **Standard net/http**: `http.HandleFunc("/path", handler)`
- **Fiber Framework**: `app.Get("/path", handler)`
- **Struct definitions** with JSON tags
- **Function documentation** from comments

Example Go code:
```go
// GetUser retrieves user information by ID
// @Summary Get user by ID
// @Description Get user details from database
func (h *UserHandler) GetUser(c *gin.Context) {
    // Implementation
}
```

### Java Spring Boot
- **@RestController** and **@Controller** classes
- **@GetMapping, @PostMapping, @PutMapping, @DeleteMapping**
- **@RequestMapping** with method specification
- **@PathVariable, @RequestParam, @RequestBody** parameters
- **ResponseEntity** return types
- **Swagger/OpenAPI annotations**

Example Java code:
```java
@RestController
@RequestMapping("/api/users")
public class UserController {
    
    /**
     * Get user by ID
     * @param id User identifier
     * @return User details
     */
    @GetMapping("/{id}")
    public ResponseEntity<User> getUser(@PathVariable Long id) {
        // Implementation
    }
}
```

### C# ASP.NET Core
- **[ApiController]** and **Controller** classes
- **[HttpGet], [HttpPost], [HttpPut], [HttpDelete]** attributes
- **[Route]** attributes for custom routing
- **[FromBody], [FromRoute], [FromQuery]** parameters
- **IActionResult** and **ActionResult<T>** return types
- **Minimal APIs** (ASP.NET Core 6+)

Example C# code:
```csharp
[ApiController]
[Route("api/[controller]")]
public class UserController : ControllerBase
{
    /// <summary>
    /// Get user by ID
    /// </summary>
    /// <param name="id">User identifier</param>
    /// <returns>User details</returns>
    [HttpGet("{id}")]
    public async Task<ActionResult<User>> GetUser(int id)
    {
        // Implementation
    }
}
```

## 📄 Generated Documentation

The pipeline generates comprehensive documentation including:

### API Documentation
- **Endpoint descriptions** with business context
- **HTTP methods and paths**
- **Request parameters** (path, query, body) with types and validation
- **Response schemas** with example data
- **Status codes** and error handling
- **Authentication requirements**

### Code Documentation
- **Class and struct descriptions**
- **Method signatures** with parameter details
- **Business logic explanations**
- **Usage examples**
- **Integration points**

### Architecture Overview
- **System architecture** and service relationships
- **API design patterns**
- **Technology stack summary**
- **Development guidelines**

## 🔄 Automation & CI/CD

### Git Hooks

The pipeline can automatically install git hooks to update documentation:

- **Pre-commit hook**: Updates documentation for staged files before commit
- **Post-commit hook**: Updates documentation after successful commit

### GitHub Actions Integration

Create `.github/workflows/documentation.yml`:

```yaml
name: Update Documentation

on:
  push:
    branches: [main, develop]
    paths: ['src/**', 'api/**', 'services/**']

jobs:
  update-docs:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Build pipeline
      run: npm run build
      
    - name: Update documentation
      env:
        CLAUDE_API_KEY: ${{ secrets.CLAUDE_API_KEY }}
        CONFLUENCE_BASE_URL: ${{ secrets.CONFLUENCE_BASE_URL }}
        CONFLUENCE_USERNAME: ${{ secrets.CONFLUENCE_USERNAME }}
        CONFLUENCE_API_TOKEN: ${{ secrets.CONFLUENCE_API_TOKEN }}
        CONFLUENCE_SPACE_KEY: ${{ secrets.CONFLUENCE_SPACE_KEY }}
      run: npx doc-pipeline --changed-only
```

### GitLab CI Integration

Create `.gitlab-ci.yml`:

```yaml
stages:
  - documentation

update-documentation:
  stage: documentation
  image: node:18
  
  only:
    - main
    - develop
  
  changes:
    - src/**/*
    - api/**/*
    - services/**/*
  
  before_script:
    - npm ci
    - npm run build
    
  script:
    - npx doc-pipeline --changed-only
    
  variables:
    CLAUDE_API_KEY: $CLAUDE_API_KEY
    CONFLUENCE_BASE_URL: $CONFLUENCE_BASE_URL
    CONFLUENCE_USERNAME: $CONFLUENCE_USERNAME
    CONFLUENCE_API_TOKEN: $CONFLUENCE_API_TOKEN
    CONFLUENCE_SPACE_KEY: $CONFLUENCE_SPACE_KEY
```

### Jenkins Pipeline

Example `Jenkinsfile`:

```groovy
pipeline {
    agent any
    
    triggers {
        pollSCM('H/5 * * * *')
    }
    
    environment {
        CLAUDE_API_KEY = credentials('claude-api-key')
        CONFLUENCE_BASE_URL = credentials('confluence-base-url')
        CONFLUENCE_USERNAME = credentials('confluence-username')
        CONFLUENCE_API_TOKEN = credentials('confluence-api-token')
        CONFLUENCE_SPACE_KEY = 'DEV'
    }
    
    stages {
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }
        
        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }
        
        stage('Update Documentation') {
            when {
                anyOf {
                    changeset 'src/**'
                    changeset 'api/**'
                    changeset 'services/**'
                }
            }
            steps {
                sh 'npx doc-pipeline --changed-only'
            }
        }
    }
}
```

## 🛠️ Development

### Project Structure

```
src/
├── ai/                     # Claude AI integration
│   ├── claude-client.ts    # Claude API client
│   └── documentation-transformer.ts
├── automation/             # Pipeline automation
│   ├── file-watcher.ts     # File watching logic
│   ├── git-integration.ts  # Git hooks and integration
│   └── pipeline.ts         # Main pipeline orchestrator
├── confluence/             # Confluence integration
│   ├── confluence-client.ts # Confluence REST API
│   └── page-mapping.ts     # Page mapping service
├── parsers/                # Code parsers
│   ├── base-parser.ts      # Base parser class
│   ├── go-parser.ts        # Go language parser
│   ├── java-parser.ts      # Java Spring Boot parser
│   └── csharp-parser.ts    # C# ASP.NET Core parser
├── config/                 # Configuration management
├── types/                  # TypeScript type definitions
├── utils/                  # Utility functions
├── cli.ts                  # Command line interface
└── index.ts               # Main entry point
```

### Running in Development

```bash
# Start in development mode with auto-reload
npm run dev

# Watch for file changes and rebuild
npm run watch

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### Building for Production

```bash
# Build TypeScript to JavaScript
npm run build

# Start production build
npm start
```

## 🔍 Examples

### Example: GoLang API Service

**Input Code (`user_service.go`):**
```go
package api

import (
    "github.com/gin-gonic/gin"
    "net/http"
)

// UserService handles user-related operations
type UserService struct {
    db *Database
}

// GetUser retrieves a user by ID
// Returns user information including profile and preferences
func (s *UserService) GetUser(c *gin.Context) {
    userID := c.Param("id")
    // ... implementation
    c.JSON(http.StatusOK, user)
}

// CreateUser creates a new user account
// Validates input and stores user in database
func (s *UserService) CreateUser(c *gin.Context) {
    var req CreateUserRequest
    c.ShouldBindJSON(&req)
    // ... implementation
    c.JSON(http.StatusCreated, response)
}
```

**Generated Documentation:**
```markdown
# User Service API Documentation

## Overview
The User Service handles user-related operations including user retrieval, creation, and management.

## API Endpoints

### GET /users/{id}
**Purpose**: Retrieve a user by their unique identifier

**Parameters**:
- `id` (path, required): User identifier (string)

**Response Schemas**:
- **200 OK**: Returns user information including profile and preferences
  ```json
  {
    "id": "12345",
    "name": "John Doe",
    "email": "john@example.com",
    "profile": {...}
  }
  ```

### POST /users
**Purpose**: Create a new user account with validation

**Request Body**:
```json
{
  "name": "string",
  "email": "string", 
  "password": "string"
}
```

**Response Schemas**:
- **201 Created**: User account created successfully
- **400 Bad Request**: Invalid input data
```

### Example: Java Spring Boot Controller

**Input Code (`UserController.java`):**
```java
@RestController
@RequestMapping("/api/v1/users")
@Api(tags = "User Management")
public class UserController {
    
    @Autowired
    private UserService userService;
    
    /**
     * Get user by ID
     * @param id User identifier
     * @return User details with profile information
     */
    @GetMapping("/{id}")
    @ApiOperation("Retrieve user by ID")
    public ResponseEntity<UserDTO> getUser(@PathVariable Long id) {
        UserDTO user = userService.findById(id);
        return ResponseEntity.ok(user);
    }
    
    /**
     * Create new user
     * @param createUserRequest User creation data
     * @return Created user details
     */
    @PostMapping
    @ApiOperation("Create new user account")
    public ResponseEntity<UserDTO> createUser(@Valid @RequestBody CreateUserRequest createUserRequest) {
        UserDTO user = userService.createUser(createUserRequest);
        return ResponseEntity.status(HttpStatus.CREATED).body(user);
    }
}
```

**Generated Documentation includes:**
- Complete API endpoint documentation
- Request/response schemas with examples
- Business logic explanations
- Parameter validation details
- Error handling patterns

## 🐛 Troubleshooting

### Common Issues

**1. Claude API Rate Limiting**
```
Error: Rate limit exceeded
```
- **Solution**: Add delays between batch processing or reduce batch size
- **Configuration**: Set `DELAY_BETWEEN_BATCHES=2000` for 2-second delays

**2. Confluence Authentication Failed**
```
Error: 401 Unauthorized
```
- **Check**: Confluence base URL is correct (include `/wiki` for cloud)
- **Verify**: Username is your email address
- **Ensure**: API token is valid and not expired

**3. File Not Detected**
```
Warning: No supported files found
```
- **Check**: Source directories are correct
- **Verify**: File extensions match supported types (`.go`, `.java`, `.cs`)
- **Review**: Exclude patterns aren't too broad

**4. Git Hook Installation Failed**
```
Error: Not a git repository
```
- **Solution**: Run `git init` or ensure you're in a git repository
- **Check**: You have write permissions to `.git/hooks/`

### Debug Mode

Enable debug logging for detailed information:
```bash
doc-pipeline --process-all --log-level debug
```

### Dry Run Mode

Test the pipeline without making changes:
```bash
doc-pipeline --process-all --dry-run
```

## 📊 Performance Optimization

### Batch Processing
- **Default batch size**: 5 files
- **Recommended for large repos**: 3-5 files per batch
- **API rate limiting**: Add 1-2 second delays between batches

### File Filtering
- Use specific `SOURCE_DIRECTORIES` instead of scanning entire repository
- Add comprehensive `EXCLUDE_PATTERNS` to skip unnecessary files
- Process only changed files in CI/CD pipelines

### Confluence Optimization
- Use page mapping to avoid duplicate page lookups
- Enable caching for repeated API calls
- Update pages only when content actually changes

## 🔐 Security Considerations

### API Keys
- Store API keys in environment variables or secure key management systems
- Never commit API keys to version control
- Rotate API keys regularly

### Confluence Access
- Use dedicated service account with minimal required permissions
- Restrict API token scope to specific spaces
- Monitor API usage for unusual activity

### Network Security
- Use HTTPS for all API communications
- Consider VPN or private networks for enterprise deployments
- Implement proper firewall rules

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add JSDoc comments for public APIs
- Include unit tests for new features
- Update documentation for any changes
- Use conventional commit messages

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/repo/discussions)
- **Documentation**: [Wiki](https://github.com/your-org/repo/wiki)

## 🎉 Acknowledgments

- [Anthropic](https://www.anthropic.com/) for Claude AI
- [Atlassian](https://www.atlassian.com/) for Confluence API
- The TypeScript and Node.js communities
