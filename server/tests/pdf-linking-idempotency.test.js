/**
 * PDF Linking Idempotency Test
 * 
 * Tests that consecutive RPA triggers for the same invoice/PDF:
 * 1. Create exactly one link in the database
 * 2. Return correct status on first vs subsequent calls
 * 3. Handle retries safely without duplicates
 */

import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const PDF_TEST_PAYLOAD = {
  filename: 'TEST_INVOICE_12345.pdf',
  fileSize: 100000,
  documentNumber: 'TEST12345',
  emisor: 'Test Vendor',
  totalValue: '50000',
  fileType: 'pdf',
  source: 'python_rpa',
  configId: 5
};

const XML_TEST_PAYLOAD = {
  filename: 'TEST_INVOICE_12345.xml',
  fileSize: 5000,
  documentNumber: 'TEST12345',
  emisor: 'Test Vendor',
  totalValue: '50000',
  fileType: 'xml',
  source: 'python_rpa',
  configId: 5
};

async function createTestFiles() {
  const fs = await import('fs');
  const path = await import('path');
  
  // Create test XML file
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <Number>${XML_TEST_PAYLOAD.documentNumber}</Number>
  <Vendor>${XML_TEST_PAYLOAD.emisor}</Vendor>
  <Amount>${XML_TEST_PAYLOAD.totalValue}</Amount>
</Invoice>`;
  
  fs.writeFileSync(path.join('uploads', XML_TEST_PAYLOAD.filename), xmlContent);
  
  // Create test PDF file (dummy content)
  fs.writeFileSync(path.join('uploads', PDF_TEST_PAYLOAD.filename), 'dummy pdf content for testing');
}

async function cleanupTestFiles() {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    fs.unlinkSync(path.join('uploads', XML_TEST_PAYLOAD.filename));
  } catch (e) { /* ignore */ }
  
  try {
    fs.unlinkSync(path.join('uploads', PDF_TEST_PAYLOAD.filename));
  } catch (e) { /* ignore */ }
}

async function cleanupTestData() {
  const dbClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await dbClient.connect();
  
  // Clean up test data
  await dbClient.query(`
    DELETE FROM imported_invoices 
    WHERE original_file_name IN ($1, $2)
  `, [XML_TEST_PAYLOAD.filename, PDF_TEST_PAYLOAD.filename]);
  
  await dbClient.query(`
    DELETE FROM invoices 
    WHERE file_name IN ($1, $2)
  `, [XML_TEST_PAYLOAD.filename, PDF_TEST_PAYLOAD.filename]);
  
  await dbClient.end();
}

async function getDbLinkCount(invoiceId, filename) {
  const dbClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await dbClient.connect();
  
  const result = await dbClient.query(`
    SELECT COUNT(*) as count 
    FROM imported_invoices 
    WHERE linked_invoice_id = $1 AND original_file_name = $2
  `, [invoiceId, filename]);
  
  await dbClient.end();
  return parseInt(result.rows[0].count);
}

test.describe('PDF Linking Idempotency', () => {
  
  test.beforeEach(async () => {
    await cleanupTestData();
    await cleanupTestFiles();
    await createTestFiles();
  });
  
  test.afterEach(async () => {
    await cleanupTestData();
    await cleanupTestFiles();
  });

  test('should create invoice and link PDF exactly once across multiple attempts', async ({ request }) => {
    console.log('🧪 Testing PDF linking idempotency...');
    
    // Step 1: Create invoice via XML processing
    console.log('📄 Creating invoice from XML...');
    const xmlResponse = await request.post('/api/rpa/process-xml', {
      data: XML_TEST_PAYLOAD
    });
    
    expect(xmlResponse.status()).toBe(200);
    const xmlResult = await xmlResponse.json();
    expect(xmlResult.success).toBe(true);
    expect(xmlResult.invoiceId).toBeDefined();
    
    const invoiceId = xmlResult.invoiceId;
    console.log(`✅ Created invoice ${invoiceId}`);
    
    // Step 2: First PDF link attempt
    console.log('🔗 First PDF linking attempt...');
    const firstPdfResponse = await request.post('/api/rpa/process-pdf', {
      data: PDF_TEST_PAYLOAD
    });
    
    expect(firstPdfResponse.status()).toBe(200);
    const firstPdfResult = await firstPdfResponse.json();
    expect(firstPdfResult.success).toBe(true);
    expect(firstPdfResult.invoiceId).toBe(invoiceId);
    expect(firstPdfResult.linkedToExisting).toBe(true);
    expect(firstPdfResult.alreadyLinked).toBeUndefined(); // Should be newly linked
    
    console.log(`✅ First attempt: ${firstPdfResult.message}`);
    
    // Verify exactly one link exists in database
    let linkCount = await getDbLinkCount(invoiceId, PDF_TEST_PAYLOAD.filename);
    expect(linkCount).toBe(1);
    console.log(`✅ Database shows exactly 1 link after first attempt`);
    
    // Step 3: Second PDF link attempt (should be idempotent)
    console.log('🔗 Second PDF linking attempt (should be idempotent)...');
    const secondPdfResponse = await request.post('/api/rpa/process-pdf', {
      data: PDF_TEST_PAYLOAD
    });
    
    expect(secondPdfResponse.status()).toBe(200);
    const secondPdfResult = await secondPdfResponse.json();
    expect(secondPdfResult.success).toBe(true);
    expect(secondPdfResult.invoiceId).toBe(invoiceId);
    expect(secondPdfResult.linkedToExisting).toBe(true);
    expect(secondPdfResult.alreadyLinked).toBe(true); // Should indicate already linked
    
    console.log(`✅ Second attempt: ${secondPdfResult.message}`);
    
    // Verify still exactly one link exists in database
    linkCount = await getDbLinkCount(invoiceId, PDF_TEST_PAYLOAD.filename);
    expect(linkCount).toBe(1);
    console.log(`✅ Database still shows exactly 1 link after second attempt`);
    
    // Step 4: Third PDF link attempt (additional safety check)
    console.log('🔗 Third PDF linking attempt (additional safety check)...');
    const thirdPdfResponse = await request.post('/api/rpa/process-pdf', {
      data: PDF_TEST_PAYLOAD
    });
    
    expect(thirdPdfResponse.status()).toBe(200);
    const thirdPdfResult = await thirdPdfResponse.json();
    expect(thirdPdfResult.success).toBe(true);
    expect(thirdPdfResult.alreadyLinked).toBe(true);
    
    // Final verification: still exactly one link
    linkCount = await getDbLinkCount(invoiceId, PDF_TEST_PAYLOAD.filename);
    expect(linkCount).toBe(1);
    console.log(`✅ Database still shows exactly 1 link after third attempt`);
    
    console.log('🎉 PDF linking idempotency test passed!');
  });
  
  test('should handle concurrent linking attempts safely', async ({ request }) => {
    console.log('🧪 Testing concurrent PDF linking safety...');
    
    // Create invoice first
    const xmlResponse = await request.post('/api/rpa/process-xml', {
      data: XML_TEST_PAYLOAD
    });
    const xmlResult = await xmlResponse.json();
    const invoiceId = xmlResult.invoiceId;
    
    // Make multiple concurrent PDF linking requests
    console.log('🔗 Making 5 concurrent PDF linking attempts...');
    const concurrentPromises = [];
    for (let i = 0; i < 5; i++) {
      concurrentPromises.push(
        request.post('/api/rpa/process-pdf', {
          data: PDF_TEST_PAYLOAD
        })
      );
    }
    
    const results = await Promise.all(concurrentPromises);
    
    // All should succeed
    for (let i = 0; i < results.length; i++) {
      expect(results[i].status()).toBe(200);
      const result = await results[i].json();
      expect(result.success).toBe(true);
      expect(result.invoiceId).toBe(invoiceId);
    }
    
    // Verify exactly one link exists despite concurrent attempts
    const linkCount = await getDbLinkCount(invoiceId, PDF_TEST_PAYLOAD.filename);
    expect(linkCount).toBe(1);
    console.log(`✅ Database shows exactly 1 link after 5 concurrent attempts`);
    
    console.log('🎉 Concurrent linking safety test passed!');
  });
});