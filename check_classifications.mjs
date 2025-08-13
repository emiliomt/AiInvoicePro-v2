
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { lineItems, lineItemClassifications, invoices } from "./shared/schema.js";

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

async function checkClassifications() {
  try {
    console.log("=== CHECKING CLASSIFICATION DATA ===\n");
    
    // Check line items for invoice 41
    const lineItemsData = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, 41));
    
    console.log(`Found ${lineItemsData.length} line items for invoice 41:`);
    lineItemsData.forEach(item => {
      console.log(`- Line Item ${item.id}: ${item.description}`);
    });
    
    // Check classifications
    const classifications = await db
      .select()
      .from(lineItemClassifications)
      .innerJoin(lineItems, eq(lineItemClassifications.lineItemId, lineItems.id))
      .where(eq(lineItems.invoiceId, 41));
    
    console.log(`\nFound ${classifications.length} classifications for invoice 41:`);
    classifications.forEach(cls => {
      console.log(`- Line Item ${cls.line_item_classifications.lineItemId}: ${cls.line_item_classifications.category}`);
    });
    
    console.log(`\nCLASSIFICATION STATUS: ${classifications.length > 0 ? 'CLASSIFIED' : 'NOT CLASSIFIED'}`);
    
  } catch (error) {
    console.error("Error checking classifications:", error);
  } finally {
    await client.end();
  }
}

checkClassifications();
