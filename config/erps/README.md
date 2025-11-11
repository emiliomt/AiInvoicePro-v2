# ERP Configuration Files

This directory contains configuration files for ERP system integrations.

## File Structure

Each ERP system requires two configuration files:

1. **RPA Configuration** (`{erp_name}.yaml`) - Defines browser automation flows
2. **Mapping Configuration** (`{erp_name}_mapping.yaml`) - Maps ERP fields to canonical schema

## Example: SINCO ERP

### sinco.yaml
Defines login steps and automation workflows for downloading invoices from SINCO.

**Key sections**:
- `login`: Login flow with selectors and credentials
- `flows.download_invoices`: Main workflow for invoice download
- `browser`: Browser configuration (headless mode, download path, etc.)
- `error_handling`: Retry policies and error capture settings

**Template variables** (replaced at runtime):
- `{{erpUrl}}` - ERP system URL
- `{{headless}}` - Headless browser mode
- `{{downloadPath}}` - Download directory
- `{{zipDownloadTimeout}}` - Timeout for ZIP downloads

### sinco_mapping.yaml
Maps SINCO-specific field names to the canonical invoice schema.

**Key sections**:
- `xml_mappings.invoice`: XPath-like selectors for XML fields
- `csv_mappings.invoice`: Column name mappings for CSV/Excel
- `filename_patterns`: Regex patterns for extracting data from filenames
- `transformations`: Data normalization rules (dates, currency, amounts)
- `validation`: Required fields and constraints

## Adding a New ERP

1. Copy `sinco.yaml` as a template for your new ERP
2. Update selectors, URLs, and workflow steps
3. Create corresponding mapping file based on your ERP's data structure
4. Test the configuration with sample data
5. Register the connector in `server/connectors/index.ts`

## Configuration Hot-Reload

Config files are loaded fresh on each run, so you can:
- Update selectors without redeploying
- Adjust timeout values on the fly
- Fix field mappings immediately

Changes take effect on the next import run.

## Troubleshooting

**Invalid YAML syntax**:
- Check indentation (use spaces, not tabs)
- Verify quote matching
- Test with a YAML validator

**Selector not found**:
- Inspect ERP page to verify selectors
- Check for dynamic IDs or classes
- Use more specific selectors (e.g., XPath)

**Mapping errors**:
- Verify XML/CSV structure matches selectors
- Check for namespace issues in XML
- Test with sample files

## Best Practices

1. **Use descriptive step descriptions** - Helps with debugging
2. **Add wait_after delays** - Allows page elements to load
3. **Provide selector fallbacks** - Multiple selectors increase robustness
4. **Set appropriate timeouts** - Balance speed vs reliability
5. **Document custom steps** - Explain complex logic
6. **Version your configs** - Track changes over time
