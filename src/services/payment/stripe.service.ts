// ============================================================================
// src/services/payment/stripe.service.ts
// ============================================================================
import Stripe from 'stripe';

export class StripeService {
    private stripe: Stripe;

    constructor() {
        this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: '2025-12-15.clover',
        });
    }

    async createPaymentLink(params: {
        amount: number; // in cents
        currency: string;
        description: string;
        customerEmail: string;
        metadata?: Record<string, string>;
    }) {
        const { amount, currency, description, customerEmail, metadata } = params;

        const paymentLink = await this.stripe.paymentLinks.create({
            line_items: [
                {
                    price_data: {
                        currency,
                        unit_amount: amount,
                        product_data: {
                            name: description,
                        },
                    },
                    quantity: 1,
                },
            ],
            after_completion: {
                type: 'redirect',
                redirect: {
                    url: `${process.env.FRONTEND_URL}/payment/success`,
                },
            },
            metadata,
        });

        return {
            paymentLinkId: paymentLink.id,
            url: paymentLink.url,
        };
    }

    async createInvoice(params: {
        customerId: string;
        amount: number;
        currency: string;
        description: string;
        dueDate?: Date;
    }) {
        const { customerId, amount, currency, description, dueDate } = params;

        const invoice = await this.stripe.invoices.create({
            customer: customerId,
            collection_method: 'send_invoice',
            days_until_due: dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 30,
            description,
        });

        await this.stripe.invoiceItems.create({
            customer: customerId,
            invoice: invoice.id,
            amount,
            currency,
            description,
        });

        const finalizedInvoice = await this.stripe.invoices.finalizeInvoice(invoice.id);

        return finalizedInvoice;
    }

    verifyWebhookSignature(body: string, signature: string) {
        return this.stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    }
}