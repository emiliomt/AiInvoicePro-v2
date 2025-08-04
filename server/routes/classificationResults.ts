
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { invoiceLineItems } from '../../shared/schema';
import { eq, and, like, desc } from 'drizzle-orm';

const router = Router();

// Sample data for demonstration
const sampleClassifiedItems = [
  {
    id: 1,
    invoiceId: "FVE753",
    vendor: "ALUTEMP SAS",
    description: "Mezcla de concreto 25MPa - 50 metros cúbicos",
    aiCategory: "MATERIALS",
    confidence: 0.94,
    amount: 2500000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["concreto", "mezcla", "metros"],
    timestamp: "2025-08-02T10:30:00Z"
  },
  {
    id: 2,
    invoiceId: "BIO1399",
    vendor: "BOMAGRO INGENIERIA S.A.S.",
    description: "Mano de obra especializada - albañilería 80 horas",
    aiCategory: "LABOR",
    confidence: 0.89,
    amount: 1600000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["mano", "obra", "horas"],
    timestamp: "2025-08-02T10:32:00Z"
  },
  {
    id: 3,
    invoiceId: "CON456",
    vendor: "CONSTRUCCIONES MODERNAS",
    description: "Alquiler retroexcavadora CAT 320D - 5 días",
    aiCategory: "EQUIPMENT",
    confidence: 0.92,
    amount: 750000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["alquiler", "retroexcavadora", "días"],
    timestamp: "2025-08-02T11:15:00Z"
  },
  {
    id: 4,
    invoiceId: "MAT789",
    vendor: "FERRETERIAS UNIDAS",
    description: "Varillas de acero corrugado 12mm - 2 toneladas",
    aiCategory: "MATERIALS",
    confidence: 0.88,
    amount: 3200000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["varillas", "acero", "toneladas"],
    timestamp: "2025-08-02T11:45:00Z"
  },
  {
    id: 5,
    invoiceId: "SER321",
    vendor: "SOLDADURAS PROFESIONALES",
    description: "Servicios de soldadura estructural - 40 horas",
    aiCategory: "SERVICES",
    confidence: 0.76,
    amount: 800000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["servicios", "soldadura", "horas"],
    timestamp: "2025-08-02T12:00:00Z"
  },
  {
    id: 6,
    invoiceId: "CEM654",
    vendor: "CEMENTOS ARGOS",
    description: "Cemento Portland tipo I - 100 sacos de 50kg",
    aiCategory: "MATERIALS",
    confidence: 0.96,
    amount: 450000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["cemento", "portland", "sacos"],
    timestamp: "2025-08-02T12:30:00Z"
  },
  {
    id: 7,
    invoiceId: "HER987",
    vendor: "HERRAMIENTAS Y MAS",
    description: "Herramientas menores de construcción - lote",
    aiCategory: "EQUIPMENT",
    confidence: 0.71,
    amount: 320000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["herramientas", "construcción"],
    timestamp: "2025-08-02T13:15:00Z"
  },
  {
    id: 8,
    invoiceId: "TRA123",
    vendor: "TRANSPORTES UNIDOS",
    description: "Transporte de materiales - 5 viajes",
    aiCategory: "SERVICES",
    confidence: 0.82,
    amount: 250000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["transporte", "materiales", "viajes"],
    timestamp: "2025-08-02T14:00:00Z"
  },
  {
    id: 9,
    invoiceId: "ELE456",
    vendor: "ELECTRICIDAD TOTAL",
    description: "Instalación eléctrica - materiales y mano de obra",
    aiCategory: "SERVICES",
    confidence: 0.68,
    amount: 1800000.00,
    currency: "COP",
    status: "needs_review" as const,
    keywordsMatched: ["instalación", "eléctrica", "obra"],
    timestamp: "2025-08-02T14:30:00Z"
  },
  {
    id: 10,
    invoiceId: "BLO789",
    vendor: "BLOQUES Y LADRILLOS",
    description: "Bloques de concreto 15x20x40 - 1000 unidades",
    aiCategory: "MATERIALS",
    confidence: 0.93,
    amount: 680000.00,
    currency: "COP",
    status: "auto_approved" as const,
    keywordsMatched: ["bloques", "concreto", "unidades"],
    timestamp: "2025-08-02T15:00:00Z"
  }
];

// Get all classification results
router.get('/', async (req, res) => {
  try {
    // For now, return sample data
    // In production, you would query your actual database
    res.json(sampleClassifiedItems);
  } catch (error) {
    console.error('Error fetching classification results:', error);
    res.status(500).json({ error: 'Failed to fetch classification results' });
  }
});

// Get classification statistics
router.get('/stats', async (req, res) => {
  try {
    const items = sampleClassifiedItems;
    const totalItems = items.length;
    const autoApproved = items.filter(item => item.status === 'auto_approved').length;
    const needingReview = items.filter(item => item.status === 'needs_review').length;
    const totalConfidence = items.reduce((sum, item) => sum + item.confidence, 0);
    
    const categoryCounts = items.reduce((acc, item) => {
      acc[item.aiCategory] = (acc[item.aiCategory] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const stats = {
      totalItems,
      autoApprovalRate: Math.round((autoApproved / totalItems) * 100),
      itemsNeedingReview: needingReview,
      averageConfidence: Math.round((totalConfidence / totalItems) * 100),
      categoryCounts
    };

    res.json(stats);
  } catch (error) {
    console.error('Error calculating classification stats:', error);
    res.status(500).json({ error: 'Failed to calculate classification statistics' });
  }
});

// Update a classification result
const updateClassificationSchema = z.object({
  category: z.string(),
  overrideReason: z.string(),
  status: z.enum(['auto_approved', 'needs_review', 'manual_override', 'rejected'])
});

router.patch('/:id', async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const { category, overrideReason, status } = updateClassificationSchema.parse(req.body);

    // For demo purposes, simulate successful update
    // In production, you would update your database
    console.log(`Updating classification ${itemId}:`, {
      category,
      overrideReason,
      status,
      updatedBy: req.user?.email || 'system',
      updatedAt: new Date().toISOString()
    });

    res.json({ 
      success: true, 
      message: 'Classification updated successfully',
      id: itemId
    });
  } catch (error) {
    console.error('Error updating classification:', error);
    res.status(500).json({ error: 'Failed to update classification' });
  }
});

// Bulk approve classifications
const bulkApproveSchema = z.object({
  itemIds: z.array(z.number())
});

router.post('/bulk-approve', async (req, res) => {
  try {
    const { itemIds } = bulkApproveSchema.parse(req.body);

    // For demo purposes, simulate successful bulk approval
    // In production, you would update your database
    console.log(`Bulk approving ${itemIds.length} items:`, itemIds);

    res.json({ 
      success: true, 
      message: `Successfully approved ${itemIds.length} items`,
      approvedCount: itemIds.length
    });
  } catch (error) {
    console.error('Error bulk approving items:', error);
    res.status(500).json({ error: 'Failed to bulk approve items' });
  }
});

// Export classification results
router.post('/export', async (req, res) => {
  try {
    const { itemIds, format = 'csv' } = req.body;
    
    // Get items to export
    let itemsToExport = sampleClassifiedItems;
    if (itemIds && itemIds.length > 0) {
      itemsToExport = sampleClassifiedItems.filter(item => itemIds.includes(item.id));
    }

    if (format === 'csv') {
      // Generate CSV
      const headers = [
        'Invoice ID',
        'Vendor',
        'Description', 
        'AI Category',
        'Confidence',
        'Amount',
        'Currency',
        'Status',
        'Keywords Matched',
        'Timestamp'
      ];

      const csvContent = [
        headers.join(','),
        ...itemsToExport.map(item => [
          item.invoiceId,
          `"${item.vendor}"`,
          `"${item.description}"`,
          item.aiCategory,
          (item.confidence * 100).toFixed(1) + '%',
          item.amount,
          item.currency,
          item.status,
          `"${item.keywordsMatched.join(', ')}"`,
          item.timestamp
        ].join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="classification-results.csv"');
      res.send(csvContent);
    } else {
      // For Excel export, you would typically use a library like exceljs
      // For now, return CSV format
      res.status(400).json({ error: 'Excel export not implemented yet' });
    }
  } catch (error) {
    console.error('Error exporting classification results:', error);
    res.status(500).json({ error: 'Failed to export classification results' });
  }
});

export default router;
// This file ensures the routes directory exists
