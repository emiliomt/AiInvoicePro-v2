
const { drizzle } = require("drizzle-orm/postgres-js");
const postgres = require("postgres");
const { eq } = require("drizzle-orm");
const { lineItems, lineItemClassifications, invoices } = require("./shared/schema.js");

async function debugClassifications() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.error('DATABASE_URL not found');
      process.exit(1);
    }

    const sql = postgres(connectionString);
    const db = drizzle(sql);

    console.log('=== DEBUGGING CLASSIFICATION STATUS ===\n');

    // Get all invoices with their line items and classifications
    const invoiceData = await db
      .select({
        invoiceId: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        vendorName: invoices.vendorName,
        lineItemsCount: 0 // Will calculate separately
      })
      .from(invoices)
      .orderBy(invoices.createdAt)
      .limit(10);

    for (const invoice of invoiceData) {
      console.log(`\n--- Invoice ${invoice.invoiceNumber || invoice.invoiceId} (${invoice.vendorName}) ---`);
      
      // Get line items
      const items = await db
        .select()
        .from(lineItems)
        .where(eq(lineItems.invoiceId, invoice.invoiceId));
      
      console.log(`Line Items: ${items.length}`);
      
      // Get classifications for each line item
      let totalClassifications = 0;
      for (const item of items) {
        const classifications = await db
          .select()
          .from(lineItemClassifications)
          .where(eq(lineItemClassifications.lineItemId, item.id));
        
        if (classifications.length > 0) {
          console.log(`  Item ${item.id}: ${item.description.substring(0, 30)}... -> ${classifications[0].category}`);
          totalClassifications++;
        } else {
          console.log(`  Item ${item.id}: ${item.description.substring(0, 30)}... -> NOT CLASSIFIED`);
        }
      }
      
      console.log(`Total Classifications: ${totalClassifications}/${items.length}`);
      console.log(`Status: ${totalClassifications > 0 ? 'CLASSIFIED' : 'NOT CLASSIFIED'}`);
    }

    await sql.end();
  } catch (error) {
    console.error('Error:', error);
  }
}

debugClassifications();
