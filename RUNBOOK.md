# Invoice Processing Pipeline Orchestrator - Operations Runbook

## Overview

The Invoice Processing Pipeline Orchestrator is a production-grade system that coordinates the complete invoice processing workflow from import to notification. This runbook provides comprehensive instructions for operating, troubleshooting, and maintaining the orchestrator.

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Setup](#environment-setup)
- [Running the Orchestrator](#running-the-orchestrator)
- [Configuration](#configuration)
- [Command Line Interface](#command-line-interface)
- [Pipeline Stages](#pipeline-stages)
- [Monitoring & Metrics](#monitoring--metrics)
- [Troubleshooting](#troubleshooting)
- [Recovery Procedures](#recovery-procedures)
- [Production Deployment](#production-deployment)

## Quick Start

### Prerequisites

- Node.js 20+ installed
- PostgreSQL database (configured via DATABASE_URL)
- OpenAI API key for AI extraction
- ERP system credentials (SINCO or compatible)

### Basic Setup

1. **Install dependencies** (if not already installed):
   ```bash
   # Dependencies are automatically managed
   # uuid, pino, yaml, commander are already installed
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

3. **Run a test orchestration**:
   ```bash
   # Dry run to test configuration
   tsx server/orchestrator/orchestrator.ts run --dry-run
   
   # Or using npm (if scripts were added)
   npm run orchestrator run -- --dry-run
   ```

## Environment Setup

### Required Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Core settings
NODE_ENV=development
OPENAI_API_KEY=sk-your-openai-key-here

# Database
DATABASE_URL=postgresql://user:pass@host:5432/database

# ERP Credentials
SINCO_BASE_URL=https://your-sinco-instance.com
SINCO_USERNAME=your-username
SINCO_PASSWORD=your-password

# Optional: Override orchestrator settings
ORCHESTRATOR_MAX_WORKERS=4
ORCHESTRATOR_MAX_RETRIES=5
```

### Configuration Files

1. **config.yaml**: Main orchestration configuration
   - Stage timeouts and retry policies
   - Feature flags and tenant settings
   - Concurrency and circuit breaker settings

2. **Idempotency Store**: SQLite database at `.orchestrator/idempotency.db`
   - Automatically created on first run
   - Tracks stage completion for resume capability

## Running the Orchestrator

### Command Line Interface

The orchestrator provides a comprehensive CLI built with Commander.js:

```bash
# Basic syntax
tsx server/orchestrator/orchestrator.ts <command> [options]
```

### Core Commands

#### 1. Run Pipeline

```bash
# Full pipeline execution
tsx server/orchestrator/orchestrator.ts run

# With options
tsx server/orchestrator/orchestrator.ts run \
  --dry-run \
  --max-workers 2 \
  --tenant production \
  --config custom-config.yaml
```

**Available Options:**
- `--from-stage <stage>`: Start from specific stage
- `--to-stage <stage>`: End at specific stage  
- `--dry-run`: Perform dry run without making changes
- `--resume`: Resume from last checkpoint
- `--max-workers <number>`: Maximum concurrent workers (default: 4)
- `--config <path>`: Custom configuration file path
- `--tenant <id>`: Tenant ID (default: 'default')
- `--limit <number>`: Limit number of invoices to process

#### 2. Status and Monitoring

```bash
# Show previous runs and checkpoints
tsx server/orchestrator/orchestrator.ts status

# Print metrics counters and timers
tsx server/orchestrator/orchestrator.ts metrics

# Environment and dependency check
tsx server/orchestrator/orchestrator.ts doctor
```

#### 3. Recovery Operations

```bash
# Replay specific stage for an invoice
tsx server/orchestrator/orchestrator.ts replay \
  --stage ai_extract \
  --invoice INV-12345
```

## Pipeline Stages

The orchestrator manages 8 pipeline stages:

### Stage Flow

```
import_invoices → ocr_process → ai_extract ↘
                                          ↓
import_invoices → xml_parse ───────────→ validate → erp_post → reconcile → notify → done
```

### Stage Details

1. **import_invoices** (120s timeout)
   - Import invoices from ERP or external sources
   - Required for all invoices

2. **ocr_process** (180s timeout)  
   - Extract text content using Tesseract.js OCR
   - Skippable for XML files or pre-processed content

3. **ai_extract** (180s timeout)
   - Extract structured data using OpenAI GPT
   - Applied to OCR text content

4. **xml_parse** (120s timeout)
   - Parse XML invoice data for structured content
   - Alternative to OCR + AI extraction for XML files

5. **validate** (90s timeout)
   - Validate extracted data against business rules
   - Requires either ai_extract OR xml_parse completion

6. **erp_post** (180s timeout)
   - Post validated invoice data to ERP system
   - Skippable in sandbox mode

7. **reconcile** (120s timeout)
   - Reconcile posted data with ERP records
   - Ensures data consistency

8. **notify** (60s timeout)
   - Send completion notifications to stakeholders
   - WebSocket updates and logging

### Stage Skipping Logic

- **OCR**: Skipped for XML files or pre-structured data
- **XML Parsing**: Skipped for non-XML files
- **ERP Posting**: Skipped in sandbox mode or when disabled
- **Notifications**: Skipped when feature flag disabled

## Configuration

### Feature Flags

Control pipeline behavior via `config.yaml`:

```yaml
featureFlags:
  enable_import: true
  enable_ocr: true
  enable_ai_extract: true
  enable_xml_parse: true
  enable_validate: true
  enable_erp_post: true      # Set to false for sandbox mode
  enable_reconcile: true
  enable_notify: true
```

### Retry Configuration

```yaml
retries:
  strategy: exponential_backoff_jitter
  maxAttempts: 5
  initialDelaySeconds: 2
  maxDelaySeconds: 60
  retryOn:
    - NetworkError
    - RateLimitError  
    - TransientError
    - TimeoutError
```

### Tenant Configuration

```yaml
tenants:
  - tenant_id: production
    erp_system: SINCO
    use_sandbox: false
    rpa_profile: headless
    
  - tenant_id: development
    erp_system: SINCO
    use_sandbox: true
    rpa_profile: headless
```

## Monitoring & Metrics

### Audit Logs

All runs generate comprehensive audit logs:
- **Location**: `.orchestrator/audit/<runId>.jsonl`
- **Format**: JSON Lines with timestamps
- **Content**: Stage execution, errors, timing data

### Metrics

Metrics are collected per run:
- **Location**: `.orchestrator/metrics/<runId>.json`
- **Metrics**: Stage duration, success/failure counts, throughput

### Key Metrics

- `stage_duration_seconds`: Time spent in each stage
- `stage_success_total`: Successful stage completions
- `stage_failure_total`: Failed stage attempts
- `pipeline_throughput_invoices_per_min`: Processing rate
- `retry_attempts_total`: Total retry attempts

### Real-time Progress

The orchestrator provides real-time progress updates via:
- Console logging (development)
- WebSocket updates (via progressTracker)
- Structured JSON logging (production)

## Troubleshooting

### Common Issues

#### 1. Import Errors

```bash
# Symptoms: "Cannot find module" errors
# Solution: Check TypeScript module resolution
tsx server/orchestrator/orchestrator.ts doctor
```

#### 2. Database Connection Issues

```bash
# Symptoms: "database not found" or connection timeouts
# Check DATABASE_URL configuration
echo $DATABASE_URL

# Test database connectivity
tsx server/orchestrator/orchestrator.ts status
```

#### 3. API Key Issues

```bash
# Symptoms: OpenAI API errors or ERP authentication failures
# Verify environment variables
echo $OPENAI_API_KEY
echo $SINCO_USERNAME

# Test in dry-run mode first
tsx server/orchestrator/orchestrator.ts run --dry-run
```

#### 4. Stage Timeouts

```bash
# Symptoms: "Stage timed out" errors
# Check current timeout settings
tsx server/orchestrator/orchestrator.ts doctor

# Override via environment
export ORCHESTRATOR_TIMEOUT_AI=300  # 5 minutes
tsx server/orchestrator/orchestrator.ts run
```

#### 5. Concurrency Issues

```bash
# Symptoms: "Too many concurrent requests" or resource exhaustion
# Reduce worker count
tsx server/orchestrator/orchestrator.ts run --max-workers 2

# Or via environment
export ORCHESTRATOR_MAX_WORKERS=2
```

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
# Environment variables
export DEBUG_MODE=true
export VERBOSE_LOGGING=true
export LOG_LEVEL=debug

# Run with debug output
tsx server/orchestrator/orchestrator.ts run --dry-run
```

### Log Analysis

```bash
# Find recent errors
grep -r "ERROR" .orchestrator/audit/

# Check specific run
cat .orchestrator/audit/<runId>.jsonl | grep -E "(error|failed)"

# Analyze performance
jq '.summary.byStage' .orchestrator/metrics/<runId>.json
```

## Recovery Procedures

### Resume from Checkpoint

If a run is interrupted, resume from the last successful checkpoint:

```bash
tsx server/orchestrator/orchestrator.ts run --resume --tenant <tenant_id>
```

The orchestrator will:
1. Load idempotency records from SQLite store
2. Skip completed stages for each invoice
3. Continue from the next pending stage

### Manual Stage Retry

To retry a specific stage for an invoice:

```bash
# Clear stage completion record
tsx server/orchestrator/orchestrator.ts replay \
  --stage ai_extract \
  --invoice <invoice_fingerprint>
```

### Data Recovery

#### Export Idempotency Records

```bash
# Via programmatic access
const store = new IdempotencyStore();
await store.initialize();
const records = await store.exportRecords('backup.json');
```

#### Clean Up Old Records

```bash
# Remove records older than 30 days
const deletedCount = await store.cleanupOldRecords(30);
console.log(`Cleaned up ${deletedCount} old records`);
```

### Circuit Breaker Recovery

If circuit breaker is triggered:
1. Wait for cooldown period (default: 2 minutes)
2. Check underlying service health
3. Restart orchestration with reduced concurrency

```bash
tsx server/orchestrator/orchestrator.ts run --max-workers 1
```

## Production Deployment

### On Replit

1. **Environment Setup**:
   ```bash
   # Use Replit's Secrets tab for sensitive values
   # DATABASE_URL is automatically provided
   ```

2. **Run Command**:
   ```bash
   # Add to .replit or run directly
   node dist/index.js & npm run orchestrator --resume --max-workers 4
   ```

3. **Health Monitoring**:
   ```bash
   # Check orchestrator status
   tsx server/orchestrator/orchestrator.ts doctor
   
   # Monitor workflow logs
   tail -f .orchestrator/audit/*.jsonl
   ```

### Production Considerations

1. **Resource Limits**:
   - Monitor memory usage with high worker counts
   - Consider ERP API rate limits
   - Adjust timeouts for production latency

2. **Error Handling**:
   - Set up alerting on orchestrator failures
   - Monitor idempotency store growth
   - Regular cleanup of old audit logs

3. **Security**:
   - Use environment variables for all secrets
   - Regular credential rotation
   - Audit log access controls

### Scaling Guidelines

- **Small deployment**: 2-4 workers, 100-500 invoices/day
- **Medium deployment**: 4-8 workers, 500-2000 invoices/day  
- **Large deployment**: 8-16 workers, 2000+ invoices/day

Adjust concurrency based on:
- ERP system capacity
- OpenAI API limits
- Database performance
- Available memory/CPU

## Support and Maintenance

### Health Checks

Regular health verification:
```bash
# Weekly health check
tsx server/orchestrator/orchestrator.ts doctor

# Monthly cleanup
tsx server/orchestrator/orchestrator.ts cleanup --days 30

# Quarterly performance review
tsx server/orchestrator/orchestrator.ts metrics --summary
```

### Performance Tuning

1. **Timeout Optimization**: Adjust based on actual service latency
2. **Concurrency Tuning**: Balance throughput vs resource usage  
3. **Retry Policy**: Fine-tune based on error patterns
4. **Stage Skipping**: Optimize for your invoice types

### Backup Procedures

```bash
# Backup idempotency store
cp .orchestrator/idempotency.db backups/idempotency-$(date +%Y%m%d).db

# Archive audit logs
tar -czf backups/audit-$(date +%Y%m%d).tar.gz .orchestrator/audit/

# Export configuration
cp config.yaml backups/config-$(date +%Y%m%d).yaml
```

---

## Emergency Contacts

For critical issues:
1. Check this runbook for common solutions
2. Review audit logs and metrics
3. Test in dry-run mode to isolate issues
4. Use resume capability to minimize data loss

## Version Information

- **Orchestrator Version**: 1.0.0
- **Compatible Node.js**: 20+
- **Dependencies**: TypeScript, Commander.js, Pino, SQLite3
- **Last Updated**: September 2025