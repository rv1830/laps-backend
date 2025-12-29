// ============================================================================
// src/controllers/invoice.controller.ts
// ============================================================================
import { Response } from 'express';
import { prisma } from '../app';
import { AuthRequest } from '../middleware/auth.middleware';
import { RazorpayService } from '../services/payment/razorpay.service';
import { StripeService } from '../services/payment/stripe.service';

export class InvoiceController {
    async createInvoice(req: AuthRequest, res: Response) {
        try {
            const { workspaceId } = req;
            const {
                leadId,
                proposalId,
                lineItems,
                subtotal,
                tax,
                total,
                currency,
                dueDate,
            } = req.body;

            // Generate invoice number
            const count = await prisma.invoice.count({
                where: { workspaceId: workspaceId! },
            });
            const invoiceNumber = `INV-${String(count + 1).padStart(6, '0')}`;

            const invoice = await prisma.invoice.create({
                data: {
                    workspaceId: workspaceId!,
                    leadId,
                    proposalId,
                    invoiceNumber,
                    lineItems: lineItems || [],
                    subtotal,
                    tax: tax || 0,
                    total,
                    currency: currency || 'USD',
                    status: 'draft',
                    dueDate: dueDate ? new Date(dueDate) : undefined,
                },
            });

            res.status(201).json(invoice);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async generatePaymentLink(req: AuthRequest, res: Response) {
        try {
            const { invoiceId } = req.params;
            const { provider } = req.body; // 'razorpay' or 'stripe'

            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
                include: { lead: true },
            });

            if (!invoice) {
                return res.status(404).json({ error: 'Invoice not found' });
            }

            let paymentLink;

            if (provider === 'razorpay') {
                const razorpay = new RazorpayService();
                const result = await razorpay.createPaymentLink({
                    amount: Math.round(invoice.total * 100), // Convert to paise
                    currency: invoice.currency,
                    description: `Invoice ${invoice.invoiceNumber}`,
                    customerEmail: invoice.lead.email!,
                    customerName: invoice.lead.fullName,
                    referenceId: invoice.id,
                });
                paymentLink = result.shortUrl;
            } else if (provider === 'stripe') {
                const stripe = new StripeService();
                const result = await stripe.createPaymentLink({
                    amount: Math.round(invoice.total * 100), // Convert to cents
                    currency: invoice.currency.toLowerCase(),
                    description: `Invoice ${invoice.invoiceNumber}`,
                    customerEmail: invoice.lead.email!,
                    metadata: { invoiceId: invoice.id },
                });
                paymentLink = result.url;
            }

            const updated = await prisma.invoice.update({
                where: { id: invoiceId },
                data: {
                    paymentLink,
                    paymentProvider: provider,
                },
            });

            res.json(updated);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}