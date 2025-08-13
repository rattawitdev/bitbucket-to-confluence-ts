pipeline {
    agent any
    
    triggers {
        // Poll SCM every 5 minutes for changes
        pollSCM('H/5 * * * *')
        
        // Also trigger on webhook (recommended for better performance)
        // Configure webhook in your Git provider to call:
        // http://jenkins-server/generic-webhook-trigger/invoke
    }
    
    environment {
        // Node.js version
        NODE_VERSION = '18'
        
        // Pipeline configuration
        LOG_LEVEL = 'info'
        
        // Credentials (store these in Jenkins credentials)
        CLAUDE_API_KEY = credentials('claude-api-key')
        CONFLUENCE_BASE_URL = credentials('confluence-base-url')
        CONFLUENCE_USERNAME = credentials('confluence-username')
        CONFLUENCE_API_TOKEN = credentials('confluence-api-token')
        CONFLUENCE_SPACE_KEY = credentials('confluence-space-key')
    }
    
    parameters {
        booleanParam(
            name: 'PROCESS_ALL_FILES',
            defaultValue: false,
            description: 'Process all files instead of just changed ones'
        )
        booleanParam(
            name: 'GENERATE_OVERVIEW',
            defaultValue: false,
            description: 'Generate architecture overview'
        )
        booleanParam(
            name: 'DRY_RUN',
            defaultValue: false,
            description: 'Run pipeline without making changes to Confluence'
        )
        choice(
            name: 'LOG_LEVEL',
            choices: ['info', 'debug', 'warn', 'error'],
            description: 'Logging level for pipeline execution'
        )
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo "Checking out code from ${env.BRANCH_NAME}"
                checkout scm
                
                script {
                    // Get list of changed files for optimization
                    env.CHANGED_FILES = sh(
                        script: "git diff --name-only HEAD~1 HEAD || echo ''",
                        returnStdout: true
                    ).trim()
                    
                    echo "Changed files: ${env.CHANGED_FILES}"
                }
            }
        }
        
        stage('Setup Environment') {
            steps {
                echo "Setting up Node.js ${NODE_VERSION} environment"
                
                // Using Node.js plugin or nvm
                sh '''
                    # Install Node.js using nvm (if not using Jenkins Node.js plugin)
                    if ! command -v node &> /dev/null; then
                        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
                        export NVM_DIR="$HOME/.nvm"
                        [ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"
                        nvm install ${NODE_VERSION}
                        nvm use ${NODE_VERSION}
                    fi
                    
                    # Verify Node.js installation
                    node --version
                    npm --version
                '''
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo 'Installing project dependencies'
                
                sh '''
                    # Clean install for production builds
                    if [ "${BRANCH_NAME}" = "main" ] || [ "${BRANCH_NAME}" = "master" ]; then
                        npm ci --only=production
                    else
                        npm ci
                    fi
                '''
            }
        }
        
        stage('Build Project') {
            steps {
                echo 'Building TypeScript project'
                
                sh '''
                    npm run build
                    
                    # Verify build output
                    if [ ! -f "dist/cli.js" ]; then
                        echo "Build failed: cli.js not found"
                        exit 1
                    fi
                    
                    echo "Build completed successfully"
                '''
            }
        }
        
        stage('Run Tests') {
            when {
                not { 
                    anyOf {
                        branch 'main'
                        branch 'master'
                    }
                }
            }
            
            steps {
                echo 'Running tests and linting'
                
                sh '''
                    # Run linter
                    npm run lint
                    
                    # Run tests (if available)
                    if npm run | grep -q "test"; then
                        npm test
                    else
                        echo "No tests configured, skipping..."
                    fi
                '''
            }
        }
        
        stage('Update Documentation') {
            when {
                anyOf {
                    // Run on main/master branches
                    branch 'main'
                    branch 'master'
                    
                    // Run on develop branch
                    branch 'develop'
                    
                    // Run when manually triggered with parameters
                    expression { params.PROCESS_ALL_FILES || params.GENERATE_OVERVIEW }
                    
                    // Run when documentation-related files changed
                    changeset pattern: "src/**", caseSensitive: true
                    changeset pattern: "api/**", caseSensitive: true
                    changeset pattern: "services/**", caseSensitive: true
                    changeset pattern: "**/*.go", caseSensitive: true
                    changeset pattern: "**/*.java", caseSensitive: true
                    changeset pattern: "**/*.cs", caseSensitive: true
                }
            }
            
            steps {
                echo "Updating documentation for branch: ${env.BRANCH_NAME}"
                
                script {
                    // Set environment variables based on parameters
                    if (params.DRY_RUN) {
                        env.DRY_RUN = 'true'
                    }
                    
                    env.LOG_LEVEL = params.LOG_LEVEL
                    
                    // Determine which pipeline command to run
                    def pipelineCommand = ""
                    
                    if (params.PROCESS_ALL_FILES) {
                        pipelineCommand = "node dist/cli.js --process-all"
                        if (params.DRY_RUN) {
                            pipelineCommand += " --dry-run"
                        }
                    } else if (params.GENERATE_OVERVIEW) {
                        pipelineCommand = "node dist/cli.js --generate-overview"
                        if (params.DRY_RUN) {
                            pipelineCommand += " --dry-run"
                        }
                    } else {
                        // Default: process only changed files
                        pipelineCommand = "node dist/cli.js --changed-only"
                    }
                    
                    pipelineCommand += " --log-level ${params.LOG_LEVEL}"
                    
                    echo "Executing: ${pipelineCommand}"
                    
                    // Execute the documentation pipeline
                    sh """
                        export LOG_LEVEL='${params.LOG_LEVEL}'
                        
                        # Run the documentation pipeline
                        timeout 600 ${pipelineCommand} || {
                            echo "Pipeline execution failed or timed out"
                            exit 1
                        }
                        
                        echo "Documentation pipeline completed successfully"
                    """
                }
            }
            
            post {
                always {
                    // Archive pipeline logs
                    archiveArtifacts(
                        artifacts: 'logs/**/*.log, *.log, confluence-mapping.json',
                        allowEmptyArchive: true,
                        fingerprint: true
                    )
                }
                
                success {
                    echo "Documentation updated successfully"
                    
                    // Send notification on success (configure based on your needs)
                    script {
                        if (env.BRANCH_NAME == 'main' || env.BRANCH_NAME == 'master') {
                            // Send success notification for main branch
                            echo "Documentation updated for production branch"
                        }
                    }
                }
                
                failure {
                    echo "Documentation update failed"
                    
                    // Send failure notification
                    script {
                        echo "Documentation pipeline failed for branch: ${env.BRANCH_NAME}"
                        // Add email or Slack notification here
                    }
                }
            }
        }
        
        stage('Generate Architecture Overview') {
            when {
                anyOf {
                    // Generate overview for main branch releases
                    allOf {
                        branch 'main'
                        not { changeset pattern: "docs/**" }
                    }
                    
                    // Manual trigger
                    expression { params.GENERATE_OVERVIEW }
                    
                    // Weekly schedule (configure cron trigger)
                    triggeredBy 'TimerTrigger'
                }
            }
            
            steps {
                echo 'Generating architecture overview'
                
                sh """
                    export LOG_LEVEL='${params.LOG_LEVEL}'
                    
                    # Generate architecture overview
                    timeout 300 node dist/cli.js --generate-overview --log-level ${params.LOG_LEVEL} || {
                        echo "Architecture overview generation failed"
                        exit 1
                    }
                    
                    echo "Architecture overview generated successfully"
                """
            }
        }
    }
    
    post {
        always {
            echo "Pipeline completed for ${env.BRANCH_NAME}"
            
            // Clean up workspace if needed
            script {
                if (env.BRANCH_NAME != 'main' && env.BRANCH_NAME != 'master') {
                    cleanWs()
                }
            }
        }
        
        success {
            echo "Pipeline succeeded"
            
            // Archive important artifacts
            archiveArtifacts(
                artifacts: 'dist/**, confluence-mapping.json',
                allowEmptyArchive: true
            )
        }
        
        failure {
            echo "Pipeline failed"
            
            // Archive logs for debugging
            archiveArtifacts(
                artifacts: 'logs/**/*.log, *.log',
                allowEmptyArchive: true
            )
            
            // Send failure notification (configure based on your setup)
            // emailext(
            //     to: "${env.CHANGE_AUTHOR_EMAIL}",
            //     subject: "Documentation Pipeline Failed: ${env.JOB_NAME} - ${env.BUILD_NUMBER}",
            //     body: "The documentation pipeline failed for branch ${env.BRANCH_NAME}. Check the logs for details."
            // )
        }
        
        changed {
            echo "Pipeline status changed"
        }
    }
}
