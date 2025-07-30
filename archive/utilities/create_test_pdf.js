import PDFDocument from 'pdfkit';
import fs from 'fs';

// Create a test PDF for FEPG793514_900570964_ULTRACEM_S_A_S.pdf
const doc = new PDFDocument();
const outputPath = 'uploads/FEPG793514_900570964_ULTRACEM_S_A_S.pdf';

// Pipe the PDF to a file
doc.pipe(fs.createWriteStream(outputPath));

// Add content to the PDF
doc.fontSize(20).text('ULTRACEM S.A.S', 100, 100);
doc.fontSize(16).text('FACTURA ELECTRÓNICA', 100, 140);
doc.fontSize(14).text('Número: FEPG793514', 100, 180);
doc.fontSize(12).text('NIT: 900570964', 100, 200);

doc.text('Este es un PDF de prueba para demostrar la funcionalidad', 100, 240);
doc.text('de vista previa de archivos PDF vinculados a facturas XML.', 100, 260);

doc.text('En producción, este sería el archivo PDF real', 100, 300);
doc.text('descargado por el sistema RPA junto con el XML.', 100, 320);

// Add some invoice-like content
doc.fontSize(14).text('Detalles de la Factura:', 100, 360);
doc.fontSize(12).text('Fecha: 2025-01-29', 100, 380);
doc.text('Cliente: Cliente de Prueba', 100, 400);
doc.text('Total: $1,500,000 COP', 100, 420);

// Finalize the PDF
doc.end();

console.log(`Created test PDF: ${outputPath}`);