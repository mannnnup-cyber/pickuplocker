import crypto from 'crypto';
import QRCode from 'qrcode';

/**
 * DimePay Payment Gateway Client
 * 
 * Supports SDK/Web Widget integration with Client ID + Secret Key
 * Used for embedded payment widget with JWT authentication
 */

// DimePay uses same URL for both sandbox and live
const DIMEPAY_BASE_URL = 'https://api.dimepay.com';

// Types
export interface DimePaySDKConfig {
  clientId: string;
  secretKey: string;
  sandboxMode?: boolean;
  baseUrl?: string;
  passFeeToCustomer?: boolean;
  passFeeToCourier?: boolean;
  feePercentage?: number;
  fixedFee?: number;
}

export interface DimePayConfig {
  apiKey?: string;
  merchantId?: string;
  clientId?: string;
  secretKey?: string;
  baseUrl?: string;
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
  passFeeToCustomer?: boolean;
}

export interface PaymentResult {
  paymentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  amount: number;
  originalAmount?: number;
  feeAmount?: number;
  currency: string;
  paymentUrl?: string;
  qrCodeDataUrl?: string;
  paymentMethod?: string;
  createdAt: string;
  completedAt?: string;
}

export interface SDKPaymentData {
  amount: number;
  currency: string;
  reference: string;
  description?: string;
  customerEmail?: string;
  customerPhone?: string;
  metadata?: Record<string, unknown>;
}

export interface SDKInitConfig {
  clientId: string;
  data: string; // JWT token
  test: boolean;
  onSuccess: string; // callback URL
  onClose: string; // callback URL
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
 * Create JWT token for DimePay SDK
 * This token is passed to the initPayment() function
 */
export function createSDKJWT(
  config: DimePaySDKConfig,
  paymentData: SDKPaymentData
): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.clientId,
    iat: now,
    exp: now + 3600, // 1 hour expiry
    amount: paymentData.amount,
    currency: paymentData.currency || 'JMD',
    reference: paymentData.reference,
    description: paymentData.description,
    customer_email: paymentData.customerEmail,
    customer_phone: paymentData.customerPhone,
    metadata: paymentData.metadata,
  };

  // Base64URL encode
  const base64UrlEncode = (obj: object) => {
    return Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  
  // Create signature
  const signature = crypto
    .createHmac('sha256', config.secretKey)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Get SDK initialization config for frontend
 * Returns everything needed to call initPayment()
 */
export function getSDKInitConfig(
  config: DimePaySDKConfig,
  paymentData: SDKPaymentData,
  callbacks: { onSuccess: string; onClose: string }
): SDKInitConfig {
  const jwt = createSDKJWT(config, paymentData);
  
  return {
    clientId: config.clientId,
    data: jwt,
    test: config.sandboxMode || false,
    onSuccess: callbacks.onSuccess,
    onClose: callbacks.onClose,
  };
}

/**
 * Create a payment request using SDK format
 */
export async function createSDKPayment(
  data: PaymentRequest,
  config: DimePaySDKConfig
): Promise<DimePayResponse<PaymentResult & { sdkConfig: SDKInitConfig }>> {
  try {
    if (!config.clientId || !config.secretKey) {
      return {
        success: false,
        error: 'DimePay not configured. Please set Client ID and Secret Key in Settings.',
      };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pickuplocker.vercel.app';
    
    let finalAmount = data.amount;
    let originalAmount = data.amount;
    let feeAmount = 0;

    // If passFeeToCustomer is true, add the fee to the amount
    if (data.passFeeToCustomer) {
      const feeCalc = calculateDimePayFee(data.amount / 100, config);
      finalAmount = feeCalc.totalWithFee * 100;
      feeAmount = feeCalc.fee * 100;
    }

    // Create SDK config
    const sdkConfig = getSDKInitConfig(
      config,
      {
        amount: finalAmount,
        currency: data.currency || 'JMD',
        reference: data.orderId,
        description: data.description,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        metadata: {
          ...data.metadata,
          originalAmount: originalAmount,
          feeAmount: feeAmount,
          feePassedToCustomer: data.passFeeToCustomer || false,
        },
      },
      {
        onSuccess: data.redirectUrl || `${baseUrl}/payment/success`,
        onClose: `${baseUrl}/payment/cancelled`,
      }
    );

    return {
      success: true,
      data: {
        paymentId: data.orderId, // Use order ID as reference
        status: 'pending',
        amount: finalAmount / 100,
        originalAmount: originalAmount / 100,
        feeAmount: feeAmount / 100,
        currency: data.currency || 'JMD',
        createdAt: new Date().toISOString(),
        sdkConfig: sdkConfig,
      },
    };
  } catch (error) {
    console.error('DimePay Create SDK Payment Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create storage fee payment with SDK
 */
export async function createStorageFeePayment(
  data: {
    orderId: string;
    orderNumber: string;
    trackingCode: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    amount: number;
    passFeeToCustomer?: boolean;
  },
  config: DimePaySDKConfig
): Promise<DimePayResponse<PaymentResult & { sdkConfig: SDKInitConfig }>> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pickuplocker.vercel.app';
  
  return createSDKPayment({
    amount: Math.round(data.amount * 100),
    currency: 'JMD',
    orderId: data.orderNumber,
    description: `Storage Fee - Order ${data.orderNumber}`,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone,
    redirectUrl: `${baseUrl}/payment/success?order=${data.orderNumber}`,
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
 * Create courier top-up payment with SDK
 */
export async function createCourierTopupPayment(
  data: {
    courierId: string;
    courierName: string;
    amount: number;
    customerEmail?: string;
    customerPhone?: string;
    passFeeToCourier?: boolean;
  },
  config: DimePaySDKConfig
): Promise<DimePayResponse<PaymentResult & { sdkConfig: SDKInitConfig }>> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pickuplocker.vercel.app';
  
  return createSDKPayment({
    amount: Math.round(data.amount * 100),
    currency: 'JMD',
    orderId: `TOPUP-${data.courierId}-${Date.now()}`,
    description: `Account Top-up - ${data.courierName}`,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone,
    redirectUrl: `${baseUrl}/payment/success?courier=${data.courierId}`,
    passFeeToCustomer: data.passFeeToCourier,
    metadata: {
      type: 'courier_topup',
      courierId: data.courierId,
      courierName: data.courierName,
    },
  }, config);
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secretKey: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(payload)
    .digest('hex');
  return signature === expectedSignature;
}

// Export default client
const DimePayClient = {
  createSDKPayment,
  createStorageFeePayment,
  createCourierTopupPayment,
  createSDKJWT,
  getSDKInitConfig,
  verifyWebhookSignature,
  calculateDimePayFee,
  generateQRCode,
};

export default DimePayClient;
