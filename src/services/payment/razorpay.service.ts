// ============================================================================
// src/services/payment/razorpay.service.ts
// ============================================================================
import Razorpay from 'razorpay';

export class RazorpayService {
  private client: Razorpay;

  constructor() {
    this.client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }

  async createPaymentLink(params: {
    amount: number; // in paise (INR * 100)
    currency: string;
    description: string;
    customerEmail: string;
    customerName: string;
    referenceId: string;
  }) {
    const { amount, currency, description, customerEmail, customerName, referenceId } = params;

    const paymentLink = await this.client.paymentLink.create({
      amount,
      currency,
      description,
      customer: {
        email: customerEmail,
        name: customerName,
      },
      reference_id: referenceId,
      callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
      callback_method: 'get',
    });

    return {
      paymentLinkId: paymentLink.id,
      shortUrl: paymentLink.short_url,
    };
  }

  async fetchPaymentLink(paymentLinkId: string) {
    return await this.client.paymentLink.fetch(paymentLinkId);
  }

  async verifyWebhookSignature(body: string, signature: string) {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(body)
      .digest('hex');
    
    return expectedSignature === signature;
  }
}