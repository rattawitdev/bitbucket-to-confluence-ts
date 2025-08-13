# Repository URL Usage Examples

This document provides examples of how to use the documentation pipeline with remote repositories.

## Basic Repository Processing

### GitHub Repository (Public)
```bash
# Process all files in a public GitHub repository
doc-pipeline --repository https://github.com/gin-gonic/gin.git --process-all

# Process specific branch
doc-pipeline --repository https://github.com/gin-gonic/gin.git --branch v1.9.1 --process-all

# Generate architecture overview only
doc-pipeline --repository https://github.com/gin-gonic/gin.git --generate-overview
```

### GitLab Repository (Public)
```bash
# Process GitLab repository
doc-pipeline --repository https://gitlab.com/gitlab-org/gitlab-foss.git --process-all

# Process with shallow clone (for large repositories)
doc-pipeline --repository https://gitlab.com/gitlab-org/gitlab-foss.git --depth 1 --process-all
```

### Bitbucket Repository (Public)
```bash
# Process Bitbucket repository
doc-pipeline --repository https://bitbucket.org/atlassian/rest-api-browser.git --process-all
```

## Private Repository Access

### Using Personal Access Tokens

#### GitHub with Token
```bash
# Export your GitHub token
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# Process private GitHub repository
doc-pipeline \
  --repository https://github.com/company/private-api.git \
  --token $GITHUB_TOKEN \
  --process-all

# Process specific branch
doc-pipeline \
  --repository https://github.com/company/private-api.git \
  --branch develop \
  --token $GITHUB_TOKEN \
  --process-all
```

#### GitLab with Token
```bash
# Export your GitLab token
export GITLAB_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx"

# Process private GitLab repository
doc-pipeline \
  --repository https://gitlab.com/company/private-service.git \
  --token $GITLAB_TOKEN \
  --process-all
```

#### Bitbucket with App Password
```bash
# Export your Bitbucket app password
export BITBUCKET_TOKEN="ATBBxxxxxxxxxxxxxxxxxx"

# Process private Bitbucket repository
doc-pipeline \
  --repository https://bitbucket.org/company/private-backend.git \
  --token $BITBUCKET_TOKEN \
  --process-all
```

### Using Username and Password
```bash
# For repositories that support basic authentication
doc-pipeline \
  --repository https://gitlab.company.com/team/backend-service.git \
  --username myusername \
  --password mypassword \
  --process-all
```

## Repository Validation

Before processing a repository, you can validate access:

```bash
# Validate public repository
doc-pipeline --repository https://github.com/user/repo.git --validate-repo

# Validate private repository with token
doc-pipeline \
  --repository https://github.com/company/private-repo.git \
  --token $GITHUB_TOKEN \
  --validate-repo

# Validate with custom branch
doc-pipeline \
  --repository https://github.com/user/repo.git \
  --branch feature/new-api \
  --validate-repo
```

## Advanced Usage

### Multiple Repository Processing Script
```bash
#!/bin/bash
# process-multiple-repos.sh

REPOS=(
  "https://github.com/company/api-gateway.git"
  "https://github.com/company/user-service.git"
  "https://github.com/company/payment-service.git"
)

for repo in "${REPOS[@]}"; do
  echo "Processing $repo..."
  doc-pipeline \
    --repository "$repo" \
    --token $GITHUB_TOKEN \
    --process-all \
    --log-level info
  
  echo "Completed $repo"
  echo "---"
done

# Generate combined architecture overview
doc-pipeline --generate-overview
```

### SSH Repository Access
```bash
# For repositories configured with SSH keys
doc-pipeline \
  --repository git@github.com:company/private-repo.git \
  --process-all
```

### Large Repository Optimization
```bash
# For large repositories, use shallow cloning
doc-pipeline \
  --repository https://github.com/large-org/massive-monorepo.git \
  --depth 1 \
  --process-all \
  --log-level debug
```

## Environment Variables

You can set repository credentials as environment variables:

```bash
# .env file or environment
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
export GITLAB_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx" 
export BITBUCKET_TOKEN="ATBBxxxxxxxxxxxxxxxxxx"

# Then use without specifying token inline
doc-pipeline --repository https://github.com/company/repo.git --token $GITHUB_TOKEN --process-all
```

## CI/CD Integration Examples

### GitHub Actions with Repository URL
```yaml
- name: Process External Repository
  run: |
    doc-pipeline \
      --repository https://github.com/external/microservice.git \
      --token ${{ secrets.EXTERNAL_REPO_TOKEN }} \
      --process-all
```

### GitLab CI with Multiple Repositories
```yaml
process_external_docs:
  script:
    - |
      for repo in "repo1" "repo2" "repo3"; do
        doc-pipeline \
          --repository https://gitlab.com/company/$repo.git \
          --token $GITLAB_TOKEN \
          --process-all
      done
```

## Dry Run Examples

Always test with dry run first:

```bash
# Test repository processing without making changes to Confluence
doc-pipeline \
  --repository https://github.com/company/api.git \
  --token $GITHUB_TOKEN \
  --process-all \
  --dry-run

# Validate and dry run
doc-pipeline \
  --repository https://github.com/company/api.git \
  --token $GITHUB_TOKEN \
  --validate-repo

doc-pipeline \
  --repository https://github.com/company/api.git \
  --token $GITHUB_TOKEN \
  --process-all \
  --dry-run
```

## Common Issues and Solutions

### Authentication Issues
```bash
# Test repository access first
git ls-remote https://github.com/company/private-repo.git

# If using token, test with curl
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/company/private-repo
```

### Large Repository Handling
```bash
# Use shallow clone for initial processing
doc-pipeline \
  --repository https://github.com/large/repo.git \
  --depth 1 \
  --process-all

# Process only recent changes
doc-pipeline \
  --repository https://github.com/large/repo.git \
  --depth 10 \
  --changed-only
```

### Network Issues
```bash
# Add timeout and retry logic
timeout 600 doc-pipeline \
  --repository https://slow-server.com/repo.git \
  --token $TOKEN \
  --process-all \
  --log-level debug
```

## Best Practices

1. **Always validate repository access first**
2. **Use shallow cloning for large repositories**
3. **Test with dry-run before production**
4. **Set appropriate log levels for debugging**
5. **Use environment variables for sensitive tokens**
6. **Consider rate limiting for multiple repositories**
7. **Clean up temporary files after processing**
