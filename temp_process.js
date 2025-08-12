
const processInvoice = async () => {
  try {
    const { InvoiceProcessingService } = await import(./server/services/invoiceProcessingService.js);
    const service = new InvoiceProcessingService();
    
    console.log(Starting automatic processing for invoice 24...);
    const result = await service.processInvoiceAutomatically(24, test-user);
    console.log(Processing result:, result);
    
    // Check the results
    const { getDb } = await import(./server/storage.js);
    const { invoices, lineItems, lineItemClassifications } = await import(./shared/schema.js);
    const { eq } = await import(drizzle-orm);
    
    const db = await getDb();
    
    // Get invoice status
    const invoice = await db.select().from(invoices).where(eq(invoices.id, 24)).limit(1);
    console.log(Invoice status:, invoice[0]?.status, invoice[0]?.processingStatus);
    
    // Get line items
    const items = await db.select().from(lineItems).where(eq(lineItems.invoiceId, 24));
    console.log(Line items created:, items.length);
    
    // Get classifications
    for (const item of items) {
      const classifications = await db.select()
        .from(lineItemClassifications)
        .where(eq(lineItemClassifications.lineItemId, item.id));
      console.log(`Line item ${item.id} (${item.description.substring(0, 50)}...): ${classifications.length > 0 ? classifications[0].category : Not classified}`);
    }
    
  } catch (error) {
    console.error(Processing error:, error);
  }
};

processInvoice();

