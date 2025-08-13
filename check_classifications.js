
#!/usr/bin/env node

const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { eq, and } = require('drizzle-orm');
const { lineItemClassifications, lineItems, invoices } = require('./shared/schema.ts');

async function checkClassifications() {
  try {
    // Connect to database
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.error('DATABASE_URL not found in environment variables');
      process.exit(1);
    }

    const sql = postgres(connectionString);
    const db = drizzle(sql);

    console.log('🔍 Checking line item classifications for invoice 41...\n');

    // Query to get classifications for invoice 41
    const results = await db
      .select({
        classificationId: lineItemClassifications.id,
        lineItemId: lineItemClassifications.lineItemId,
        invoiceId: lineItems.invoiceId,
        invoiceNumber: invoices.invoiceNumber,
        vendorName: invoices.vendorName,
        lineItemDescription: lineItems.description,
        category: lineItemClassifications.category,
        subcategory: lineItemClassifications.subcategory,
        confidence: lineItemClassifications.confidence,
        method: lineItemClassifications.method,
        reasoning: lineItemClassifications.reasoning,
        matchedKeywords: lineItemClassifications.matchedKeywords,
        classifiedAt: lineItemClassifications.classifiedAt,
        isUserVerified: lineItemClassifications.isUserVerified,
        quantity: lineItems.quantity,
        unitPrice: lineItems.unitPrice,
        totalPrice: lineItems.totalPrice
      })
      .from(lineItemClassifications)
      .innerJoin(lineItems, eq(lineItemClassifications.lineItemId, lineItems.id))
      .innerJoin(invoices, eq(lineItems.invoiceId, invoices.id))
      .where(eq(lineItems.invoiceId, 41));

    if (results.length === 0) {
      console.log('❌ No classifications found for invoice 41');
      
      // Check if the invoice exists
      const invoiceExists = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, 41));

      if (invoiceExists.length === 0) {
        console.log('❌ Invoice 41 does not exist');
      } else {
        console.log('✅ Invoice 41 exists');
        console.log('Invoice details:', invoiceExists[0]);

        // Check if line items exist for this invoice
        const lineItemsForInvoice = await db
          .select()
          .from(lineItems)
          .where(eq(lineItems.invoiceId, 41));

        console.log(`\n📋 Found ${lineItemsForInvoice.length} line items for invoice 41:`);
        lineItemsForInvoice.forEach((item, index) => {
          console.log(`  ${index + 1}. ID: ${item.id}, Description: ${item.description}`);
        });

        if (lineItemsForInvoice.length === 0) {
          console.log('⚠️  No line items found for invoice 41 - this might be why no classifications exist');
        }
      }
    } else {
      console.log(`✅ Found ${results.length} classification(s) for invoice 41:\n`);
      
      results.forEach((result, index) => {
        console.log(`Classification ${index + 1}:`);
        console.log(`  Line Item ID: ${result.lineItemId}`);
        console.log(`  Description: ${result.lineItemDescription}`);
        console.log(`  Category: ${result.category}`);
        console.log(`  Subcategory: ${result.subcategory || 'None'}`);
        console.log(`  Confidence: ${result.confidence}`);
        console.log(`  Method: ${result.method}`);
        console.log(`  Reasoning: ${result.reasoning || 'None'}`);
        console.log(`  Keywords: ${result.matchedKeywords?.join(', ') || 'None'}`);
        console.log(`  Classified At: ${result.classifiedAt}`);
        console.log(`  User Verified: ${result.isUserVerified}`);
        console.log(`  Amount: ${result.totalPrice || 'N/A'}`);
        console.log('---');
      });

      // Summary
      const categories = [...new Set(results.map(r => r.category))];
      const avgConfidence = results.reduce((sum, r) => sum + (parseFloat(r.confidence) || 0), 0) / results.length;
      
      console.log('\n📊 Summary:');
      console.log(`  Total Classifications: ${results.length}`);
      console.log(`  Categories Found: ${categories.join(', ')}`);
      console.log(`  Average Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
      console.log(`  Invoice: ${results[0].invoiceNumber} (${results[0].vendorName})`);
    }

    await sql.end();
    
  } catch (error) {
    console.error('❌ Error checking classifications:', error);
    process.exit(1);
  }
}

checkClassifications();
