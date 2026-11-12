import PDFDocument from 'pdfkit';
import fs from 'node:fs';
fs.mkdirSync('test-docs', { recursive: true });
const base = ['Order reference: ORD-1025','Customer: John Doe','Ship-to: 2211 N First St, San Jose, CA 95131','Item: Northstar Goods Test Item, quantity 1','Amount paid: 25.00 USD','PayPal transaction reference: 8S085786MG495963S','Order date: 2026-11-11'];
function make(file, title, lines) {
  const d = new PDFDocument({ size: 'A4', margin: 56 });
  d.pipe(fs.createWriteStream('test-docs/' + file));
  d.fontSize(20).text('Test Store');
  d.moveDown(0.3).fontSize(16).text(title);
  d.moveDown().fontSize(11);
  for (const l of lines) d.text(l).moveDown(0.4);
  d.moveDown(2).fontSize(9).fillColor('gray').text('TEST DOCUMENT - NOT PAYPAL DATA', { align: 'center' });
  d.end();
}
make('demo_order_confirmation.pdf', 'Order Confirmation', [...base, 'Status: Order received and paid.']);
make('demo_shipping_confirmation.pdf', 'Shipping Confirmation', [...base, 'Carrier: Example Carrier', 'Tracking number: TRK-10026', 'Shipped on: 2026-11-11', 'Shipment status: In transit', 'Delivery date: not available']);
