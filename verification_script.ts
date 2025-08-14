
// verification_script.ts - Run this to verify the fixes worked
// Usage: npx tsx verification_script.ts

import { getDb } from './server/storage.js';
import { invoices, lineItems, lineItemClassifications } from './shared/schema.js';
import { eq, sql } from 'drizzle-orm';

async function verifyInvoice41Fixes() {
  console.log('🔍 Verifying Invoice 41 Fixes...\n');

  try {
    const db = await getDb();

    // 1. Check invoice status
    console.log('1️⃣ Checking invoice status...');
    const invoice = await db.select()
      .from(invoices)
      .where(eq(invoices.id, 41))
      .limit(1);

    if (invoice.length > 0) {
      console.log(`   Invoice 41 Status: ${invoice[0].status}`);
      console.log(`   ✅ Expected: 'classified', Actual: '${invoice[0].status}'`);
      console.log(`   ${invoice[0].status === 'classified' ? '✅ FIXED' : '❌ STILL BROKEN'}\n`);
    } else {
      console.log('   ❌ Invoice 41 not found\n');
      return;
    }

    // 2. Check line items count (should be 4 after duplicate removal)
    console.log('2️⃣ Checking line items count...');
    const lineItemsResult = await db.select({ count: sql`count(*)` })
      .from(lineItems)
      .where(eq(lineItems.invoiceId, 41));

    const lineItemCount = Number(lineItemsResult[0]?.count || 0);
    console.log(`   Line Items Count: ${lineItemCount}`);
    console.log(`   ✅ Expected: 4 (after duplicate removal), Actual: ${lineItemCount}`);
    console.log(`   ${lineItemCount === 4 ? '✅ DUPLICATES REMOVED' : lineItemCount === 59 ? '❌ DUPLICATES STILL PRESENT' : '⚠️ UNEXPECTED COUNT'}\n`);

    // 3. Check classifications count
    console.log('3️⃣ Checking classifications count...');
    const classificationsResult = await db.select({ count: sql`count(*)` })
      .from(lineItemClassifications)
      .innerJoin(lineItems, eq(lineItemClassifications.lineItemId, lineItems.id))
      .where(eq(lineItems.invoiceId, 41));

    const classificationCount = Number(classificationsResult[0]?.count || 0);
    console.log(`   Classifications Count: ${classificationCount}`);
    console.log(`   ✅ Expected: 4, Actual: ${classificationCount}`);
    console.log(`   ${classificationCount === 4 ? '✅ ALL ITEMS CLASSIFIED' : '❌ MISSING CLASSIFICATIONS'}\n`);

    // 4. Show actual line items
    console.log('4️⃣ Showing actual line items...');
    const actualLineItems = await db.select({
      id: lineItems.id,
      description: lineItems.description,
      quantity: lineItems.quantity,
      unitPrice: lineItems.unitPrice,
      totalPrice: lineItems.totalPrice
    })
    .from(lineItems)
    .where(eq(lineItems.invoiceId, 41));

    console.log(`   Found ${actualLineItems.length} line items:`);
    actualLineItems.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.description} (Qty: ${item.quantity}, Price: $${item.totalPrice})`);
    });

    // 5. Check for duplicates
    console.log('\n5️⃣ Checking for duplicate descriptions...');
    const descriptions = actualLineItems.map(item => item.description);
    const uniqueDescriptions = [...new Set(descriptions)];
    
    console.log(`   Unique descriptions: ${uniqueDescriptions.length}`);
    console.log(`   Total line items: ${actualLineItems.length}`);
    
    if (uniqueDescriptions.length === actualLineItems.length) {
      console.log(`   ✅ NO DUPLICATES FOUND`);
    } else {
      console.log(`   ❌ DUPLICATES STILL PRESENT`);
      // Show which descriptions are duplicated
      const duplicates = descriptions.filter((desc, index) => descriptions.indexOf(desc) !== index);
      console.log(`   Duplicated descriptions:`, [...new Set(duplicates)]);
    }

    // 6. Show classifications
    console.log('\n6️⃣ Showing classifications...');
    const classifications = await db.select({
      lineItemId: lineItemClassifications.lineItemId,
      category: lineItemClassifications.category,
      matchedKeywords: lineItemClassifications.matchedKeywords,
      confidence: lineItemClassifications.confidence,
      method: lineItemClassifications.method
    })
    .from(lineItemClassifications)
    .innerJoin(lineItems, eq(lineItemClassifications.lineItemId, lineItems.id))
    .where(eq(lineItems.invoiceId, 41));

    classifications.forEach((classification, index) => {
      console.log(`   ${index + 1}. Category: ${classification.category}, Keywords: ${classification.matchedKeywords}, Method: ${classification.method || 'N/A'}`);
    });

    // 7. Summary
    console.log('\n📊 SUMMARY:');
    const statusFixed = invoice[0].status === 'classified';
    const duplicatesRemoved = lineItemCount <= 4;
    const allClassified = classificationCount === lineItemCount;
    
    console.log(`   Status Update Bug: ${statusFixed ? '✅ FIXED' : '❌ NOT FIXED'}`);
    console.log(`   Duplicate Removal: ${duplicatesRemoved ? '✅ FIXED' : '❌ NOT FIXED'}`);
    console.log(`   All Items Classified: ${allClassified ? '✅ FIXED' : '❌ NOT FIXED'}`);
    
    const allFixed = statusFixed && duplicatesRemoved && allClassified;
    console.log(`\n🎯 OVERALL STATUS: ${allFixed ? '✅ ALL FIXES WORKING' : '❌ SOME ISSUES REMAIN'}`);

  } catch (error) {
    console.error('❌ Error during verification:', error);
  }
}

// Run the verification
verifyInvoice41Fixes().then(() => {
  console.log('\n✅ Verification completed');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
