import crypto from 'crypto';
import QRCode from 'qrcode';

/**
 * DimePay Payment Gateway Client
 * 
 * Integration with DimePay for processing payments
 * Supports card payments, mobile money, and online transfers
 * Features:
 * - Storage fee collection
 * - QR code payment generation
 * - Courier prepaid account top-up
 * - Fee pass-through to customers
 */

// Default URLs - can be overridden by database settings
// Production: https://api.dimepay.app/dapi/v1
// Sandbox: https://sandbox.api.dimepay.app/dapi/v1
const DEFAULT_BASE_URL = 'https://api.dimepay.app/dapi/v1';
const SANDBOX_BASE_URL = 'https://sandbox.api.dimepay.app/dapi/v1';

// Types
export interface DimePayConfig {
  apiKey: string;
  merchantId: string;
  baseUrl: string;
  passFeeToCustomer?: boolean;
  passFeeToCourier?: boolean;
  feePercentage?: number;
  fixedFee?: number;
}

export interface DimePayResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaymentRequest {
  amount: number;
  currency: string;
  orderId: string;
  description: string;
  customerEmail?: string;
  customerPhone?: string;
  redirectUrl?: string;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
  passFeeToCustomer?: boolean; // If true, add DimePay fee to the amount
}

export interface PaymentResult {
  paymentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  amount: number;
  originalAmount?: number; // Before fee was added
  feeAmount?: number; // Fee charged
  currency: string;
  paymentUrl?: string;
  qrCodeDataUrl?: string; // Base64 QR code image
  paymentMethod?: string;
  createdAt: string;
  completedAt?: string;
}

export interface RefundRequest {
  paymentId: string;
  amount?: number; // Partial refund if specified
  reason: string;
}

export interface RefundResult {
  refundId: string;
  status: 'pending' | 'completed' | 'failed';
  amount: number;
}

export interface CourierTopupRequest {
  courierId: string;
  courierName: string;
  amount: number;
  customerEmail?: string;
  customerPhone?: string;
  passFeeToCourier?: boolean;
}

export interface StorageFeePaymentRequest {
  orderId: string;
  orderNumber: string;
  trackingCode: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  amount: number;
  passFeeToCustomer?: boolean;
}

/**
 * Calculate DimePay fee
 */
export function calculateDimePayFee(amount: number, config?: { feePercentage?: number; fixedFee?: number }): {
  fee: number;
  totalWithFee: number;
} {
  const feePercentage = config?.feePercentage ?? 2.5;
  const fixedFee = config?.fixedFee ?? 30;
  
  const percentageFee = amount * (feePercentage / 100);
  const fee = Math.round(percentageFee + fixedFee);
  const totalWithFee = amount + fee;
  
  return { fee, totalWithFee };
}

/**
 * Generate QR code as data URL
 */
export async function generateQRCode(data: string): Promise<string> {
  try {
    const qrDataUrl = await QRCode.toDataURL(data, {
      width: 300,
      margin: 2,
      color: {
        dark: '#111111',
        light: '#ffffff',
      },
    });
    return qrDataUrl;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    throw error;
  }
}

/**
 * Create a payment request
 */
export async function createPayment(
  data: PaymentRequest,
  config?: DimePayConfig
): Promise<DimePayResponse<PaymentResult>> {
  try {
    // Use provided config or fall back to defaults
    const apiKey = config?.apiKey || process.env.DIMEPAY_API_KEY || '';
    const merchantId = config?.merchantId || process.env.DIMEPAY_MERCHANT_ID || '';
    const baseUrl = config?.baseUrl || process.env.DIMEPAY_BASE_URL || DEFAULT_BASE_URL;
    
    if (!apiKey || !merchantId) {
      return {
        success: false,
        error: 'DimePay not configured. Please set API Key and Merchant ID in Settings.',
      };
    }
    
    let finalAmount = data.amount;
    let originalAmount = data.amount;
    let feeAmount = 0;

    // If passFeeToCustomer is true, add the fee to the amount
    if (data.passFeeToCustomer) {
      const feeCalc = calculateDimePayFee(data.amount / 100, config); // Convert from cents
      finalAmount = (feeCalc.totalWithFee) * 100; // Convert back to cents
      feeAmount = feeCalc.fee * 100;
    }

    const response = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Merchant-ID': merchantId,
      },
      body: JSON.stringify({
        amount: finalAmount,
        currency: data.currency || 'JMD',
        reference: data.orderId,
        description: data.description,
        customer: {
          email: data.customerEmail,
          phone: data.customerPhone,
        },
        redirect_url: data.redirectUrl,
        webhook_url: data.webhookUrl,
        metadata: {
          ...data.metadata,
          originalAmount: originalAmount,
          feeAmount: feeAmount,
          feePassedToCustomer: data.passFeeToCustomer || false,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.message || result.error || `API Error: ${response.status}`,
      };
    }

    // Generate QR code for the payment URL
    const paymentUrl = result.data?.payment_url || result.data?.checkoutUrl;
    let qrCodeDataUrl: string | undefined;
    
    if (paymentUrl) {
      try {
        qrCodeDataUrl = await generateQRCode(paymentUrl);
      } catch (qrError) {
        console.error('Failed to generate QR code:', qrError);
      }
    }

    return {
      success: true,
      data: {
        paymentId: result.data?.id || result.data?.paymentId,
        status: 'pending',
        amount: finalAmount / 100, // Convert from cents
        originalAmount: originalAmount / 100,
        feeAmount: feeAmount / 100,
        currency: data.currency || 'JMD',
        paymentUrl: paymentUrl,
        qrCodeDataUrl: qrCodeDataUrl,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('DimePay Create Payment Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create storage fee payment with QR code
 */
export async function createStorageFeePayment(
  data: StorageFeePaymentRequest,
  config?: DimePayConfig
): Promise<DimePayResponse<PaymentResult>> {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://pickuplocker.vercel.app';
  
  return createPayment({
    amount: Math.round(data.amount * 100), // Convert to cents
    currency: 'JMD',
    orderId: data.orderNumber,
    description: `Storage Fee - Order ${data.orderNumber}`,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone,
    redirectUrl: `${baseUrl}/dashboard?payment=success&order=${data.orderNumber}`,
    webhookUrl: `${baseUrl}/api/webhooks/dimepay`,
    passFeeToCustomer: data.passFeeToCustomer,
    metadata: {
      type: 'storage_fee',
      orderId: data.orderId,
      orderNumber: data.orderNumber,
      trackingCode: data.trackingCode,
      customerName: data.customerName,
    },
  }, config);
}

/**
 * Create courier top-up payment
 */
export async function createCourierTopupPayment(
  data: CourierTopupRequest,
  config?: DimePayConfig
): Promise<DimePayResponse<PaymentResult>> {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://pickuplocker.vercel.app';
  
  return createPayment({
    amount: Math.round(data.amount * 100), // Convert to cents
    currency: 'JMD',
    orderId: `TOPUP-${data.courierId}-${Date.now()}`,
    description: `Account Top-up - ${data.courierName}`,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone,
    redirectUrl: `${baseUrl}/dashboard?payment=success&courier=${data.courierId}`,
    webhookUrl: `${baseUrl}/api/webhooks/dimepay`,
    passFeeToCustomer: data.passFeeToCourier,
    metadata: {
      type: 'courier_topup',
      courierId: data.courierId,
      courierName: data.courierName,
    },
  }, config);
}

/**
 * Get payment status
 */
export async function getPaymentStatus(
  paymentId: string,
  config?: DimePayConfig
): Promise<DimePayResponse<PaymentResult>> {
  try {
    const apiKey = config?.apiKey || process.env.DIMEPAY_API_KEY || '';
    const merchantId = config?.merchantId || process.env.DIMEPAY_MERCHANT_ID || '';
    const baseUrl = config?.baseUrl || process.env.DIMEPAY_BASE_URL || DEFAULT_BASE_URL;
    
    const response = await fetch(`${baseUrl}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Merchant-ID': merchantId,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.message || 'Failed to get payment status',
      };
    }

    return {
      success: true,
      data: {
        paymentId: result.data?.id,
        status: result.data?.status,
        amount: result.data?.amount,
        currency: result.data?.currency,
        paymentMethod: result.data?.payment_method,
        createdAt: result.data?.created_at,
        completedAt: result.data?.completed_at,
      },
    };
  } catch (error) {
    console.error('DimePay Get Payment Status Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Process refund
 */
export async function processRefund(
  data: RefundRequest,
  config?: DimePayConfig
): Promise<DimePayResponse<RefundResult>> {
  try {
    const apiKey = config?.apiKey || process.env.DIMEPAY_API_KEY || '';
    const merchantId = config?.merchantId || process.env.DIMEPAY_MERCHANT_ID || '';
    const baseUrl = config?.baseUrl || process.env.DIMEPAY_BASE_URL || DEFAULT_BASE_URL;
    
    const response = await fetch(`${baseUrl}/payments/${data.paymentId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Merchant-ID': merchantId,
      },
      body: JSON.stringify({
        amount: data.amount,
        reason: data.reason,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.message || 'Failed to process refund',
      };
    }

    return {
      success: true,
      data: {
        refundId: result.data?.id,
        status: result.data?.status || 'pending',
        amount: data.amount || 0,
      },
    };
  } catch (error) {
    console.error('DimePay Refund Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  config?: DimePayConfig
): boolean {
  const apiKey = config?.apiKey || process.env.DIMEPAY_API_KEY || '';
  const expectedSignature = crypto
    .createHmac('sha256', apiKey)
    .update(payload)
    .digest('hex');
  return signature === expectedSignature;
}

/**
 * List payments with filtering
 */
export async function listPayments(filters?: {
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}, config?: DimePayConfig): Promise<DimePayResponse<PaymentResult[]>> {
  try {
    const apiKey = config?.apiKey || process.env.DIMEPAY_API_KEY || '';
    const merchantId = config?.merchantId || process.env.DIMEPAY_MERCHANT_ID || '';
    const baseUrl = config?.baseUrl || process.env.DIMEPAY_BASE_URL || DEFAULT_BASE_URL;
    
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('start_date', filters.startDate);
    if (filters?.endDate) params.append('end_date', filters.endDate);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));

    const response = await fetch(`${baseUrl}/payments?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Merchant-ID': merchantId,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.message || 'Failed to list payments',
      };
    }

    return {
      success: true,
      data: result.data?.payments || result.data || [],
    };
  } catch (error) {
    console.error('DimePay List Payments Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Export default client
const DimePayClient = {
  createPayment,
  createStorageFeePayment,
  createCourierTopupPayment,
  getPaymentStatus,
  processRefund,
  verifyWebhookSignature,
  listPayments,
  calculateDimePayFee,
  generateQRCode,
};

export default DimePayClient;
