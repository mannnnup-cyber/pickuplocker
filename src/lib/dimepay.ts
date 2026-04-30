import crypto from 'crypto';
import QRCode from 'qrcode';

/**
 * DimePay Payment Gateway Client
 * 
 * Supports SDK/Web Widget integration with Client ID + Secret Key
 * Used for embedded payment widget with JWT authentication
 */

// DimePay uses same URL for both sandbox and live
const DIMEPAY_BASE_URL = 'https://api.dimepay.app';

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
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface SDKInitConfig {
  clientId: string;
  data: string; // JWT token
  test: boolean;
  onSuccess: string; // callback URL
  onClose: string; // callback URL
}

// Card tokenization request result
export interface CardTokenResult {
  cardToken: string;     // card_xxx token for future charges
  brand?: string;        // VISA, MASTERCARD, etc.
  last4?: string;        // Last 4 digits
  expiryMonth?: string;
  expiryYear?: string;
  holderName?: string;
  isVerified?: boolean;
}

// Charge result using a saved card token
export interface TokenChargeResult {
  chargeId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  amount: number;
  currency: string;
  authorizationCode?: string;
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
 * 
 * The JWT payload must include:
 * - id: order ID
 * - total: total amount in cents
 * - subtotal: amount before fees
 * - currency: currency code (JMD)
 * - description: payment description
 * - fulfilled: boolean
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
  
  // DimePay SDK expects this payload format
  // NOTE: DimePay expects total/subtotal in DOLLARS, not cents
  const amountInDollars = Math.round(paymentData.amount) / 100;
  const payload = {
    id: paymentData.reference,
    total: amountInDollars,
    subtotal: amountInDollars,
    description: paymentData.description || 'Drop-off Credit',
    currency: paymentData.currency || 'JMD',
    tax: 0,
    fees: [],
    items: [],
    fulfilled: true,
    webhookUrl: paymentData.webhookUrl || '',
    shippingPerson: {
      name: 'Pickup Customer',
      email: paymentData.customerEmail || '',
      street: '',
      city: 'Kingston',
      countryCode: 'JM',
      countryName: 'Jamaica',
      postalCode: '',
      stateOrProvinceCode: '',
      stateOrProvinceName: '',
      phone: paymentData.customerPhone || '',
    },
    billingPerson: {
      name: 'Pickup Customer',
      email: paymentData.customerEmail || '',
      street: '',
      city: 'Kingston',
      countryCode: 'JM',
      countryName: 'Jamaica',
      postalCode: '',
      stateOrProvinceCode: '',
      stateOrProvinceName: '',
      phone: paymentData.customerPhone || '',
    },
    // Include metadata if provided
    ...(paymentData.metadata || {}),
    iat: now,
    exp: now + 3600, // 1 hour expiry
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
  
  // Create signature using secret key
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
        webhookUrl: data.webhookUrl, // Pass webhookUrl directly for JWT payload
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

/**
 * Create payment - wrapper for SDK payment (for backwards compatibility)
 */
export async function createPayment(
  data: PaymentRequest,
  config?: DimePayConfig
): Promise<DimePayResponse<PaymentResult>> {
  // Convert DimePayConfig to DimePaySDKConfig
  const sdkConfig: DimePaySDKConfig = {
    clientId: config?.clientId || '',
    secretKey: config?.secretKey || '',
    sandboxMode: false,
    passFeeToCustomer: config?.passFeeToCustomer,
    passFeeToCourier: config?.passFeeToCourier,
    feePercentage: config?.feePercentage,
    fixedFee: config?.fixedFee,
  };

  const result = await createSDKPayment(data, sdkConfig);
  
  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error
    };
  }

  // Return without sdkConfig for backwards compatibility
  const { sdkConfig: _, ...paymentResult } = result.data;
  return {
    success: true,
    data: paymentResult
  };
}

/**
 * Get payment status - placeholder for SDK integration
 * With SDK integration, payment status is handled via webhooks
 */
export async function getPaymentStatus(
  paymentId: string,
  config?: DimePayConfig
): Promise<DimePayResponse<PaymentResult>> {
  // SDK integration relies on webhooks for status updates
  // This is a placeholder that returns pending status
  return {
    success: true,
    data: {
      paymentId,
      status: 'pending',
      amount: 0,
      currency: 'JMD',
      createdAt: new Date().toISOString(),
    }
  };
}

/**
 * List payments - placeholder for SDK integration
 * With SDK integration, payment history comes from your database
 */
export async function listPayments(
  filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  },
  config?: DimePayConfig
): Promise<DimePayResponse<PaymentResult[]>> {
  // SDK integration stores payments in your own database
  // Return empty array - actual data should come from database queries
  return {
    success: true,
    data: []
  };
}

// ============================================
// CARDS API — Tokenization & Future Charges
// ============================================

/**
 * Extract card token from DimePay webhook/payment response
 * DimePay returns card tokens in various formats depending on the API version
 */
export function extractCardTokenFromPayment(payment: Record<string, unknown>): CardTokenResult | null {
  // Try multiple possible locations where DimePay might include the card token
  const cardToken =
    (payment.card_token as string) ||
    (payment.cardToken as string) ||
    ((payment.payment_method as Record<string, unknown>)?.token as string) ||
    ((payment.source as Record<string, unknown>)?.id as string) ||
    ((payment.card as Record<string, unknown>)?.token as string) ||
    null;

  if (!cardToken) return null;

  // Extract card details if available
  const cardInfo = (payment.card as Record<string, unknown>) ||
    (payment.payment_method as Record<string, unknown>) ||
    (payment.source as Record<string, unknown>) ||
    {};

  return {
    cardToken,
    brand: (cardInfo.brand as string) || (cardInfo.card_type as string) || undefined,
    last4: (cardInfo.last4 as string) || (cardInfo.last_four as string) || undefined,
    expiryMonth: (cardInfo.exp_month as string) || (cardInfo.expiry_month as string) || undefined,
    expiryYear: (cardInfo.exp_year as string) || (cardInfo.expiry_year as string) || undefined,
    holderName: (cardInfo.holder_name as string) || (cardInfo.name as string) || undefined,
    isVerified: true, // If DimePay returned a token, the card was verified during payment
  };
}

/**
 * Charge a saved card token (server-to-server API call)
 * Used for one-tap payments on kiosk, storage fee auto-charges, etc.
 * 
 * DimePay Cards API: POST /api/v1/charges
 */
export async function chargeCardToken(
  data: {
    cardToken: string;
    amount: number;       // Amount in JMD (dollars, not cents)
    currency?: string;
    orderId: string;
    description: string;
    customerEmail?: string;
    customerPhone?: string;
    metadata?: Record<string, unknown>;
    authorizeOnly?: boolean; // If true, only authorize (hold funds) without capturing
  },
  config: DimePaySDKConfig
): Promise<DimePayResponse<TokenChargeResult>> {
  try {
    if (!config.clientId || !config.secretKey) {
      return { success: false, error: 'DimePay not configured.' };
    }

    const baseUrl = config.baseUrl || DIMEPAY_BASE_URL;
    const endpoint = data.authorizeOnly
      ? `${baseUrl}/api/v1/authorizations`
      : `${baseUrl}/api/v1/charges`;

    const payload = {
      token: data.cardToken,
      amount: Math.round(data.amount * 100), // Convert to cents
      currency: data.currency || 'JMD',
      order_id: data.orderId,
      description: data.description,
      capture: !data.authorizeOnly,
      metadata: {
        ...data.metadata,
        customer_email: data.customerEmail,
        customer_phone: data.customerPhone,
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.secretKey}`,
        'X-Client-Id': config.clientId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('DimePay charge error:', response.status, errorBody);
      return {
        success: false,
        error: `Charge failed (${response.status}): ${errorBody}`,
      };
    }

    const result = await response.json();

    return {
      success: true,
      data: {
        chargeId: result.id || result.charge_id || data.orderId,
        status: result.status || 'completed',
        amount: result.amount ? result.amount / 100 : data.amount,
        currency: result.currency || data.currency || 'JMD',
        authorizationCode: result.authorization_code || result.auth_code,
      },
    };
  } catch (error) {
    console.error('DimePay chargeCardToken error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Capture a previously authorized charge
 * DimePay API: POST /api/v1/charges/{chargeId}/capture
 */
export async function captureAuthorization(
  data: {
    chargeId: string;
    amount?: number; // If different from original auth amount
  },
  config: DimePaySDKConfig
): Promise<DimePayResponse<TokenChargeResult>> {
  try {
    if (!config.clientId || !config.secretKey) {
      return { success: false, error: 'DimePay not configured.' };
    }

    const baseUrl = config.baseUrl || DIMEPAY_BASE_URL;
    const endpoint = `${baseUrl}/api/v1/charges/${data.chargeId}/capture`;

    const payload: Record<string, unknown> = {};
    if (data.amount) {
      payload.amount = Math.round(data.amount * 100);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.secretKey}`,
        'X-Client-Id': config.clientId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        success: false,
        error: `Capture failed (${response.status}): ${errorBody}`,
      };
    }

    const result = await response.json();

    return {
      success: true,
      data: {
        chargeId: result.id || data.chargeId,
        status: result.status || 'completed',
        amount: result.amount ? result.amount / 100 : 0,
        currency: result.currency || 'JMD',
      },
    };
  } catch (error) {
    console.error('DimePay captureAuthorization error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create a tokenization request for a card (without immediate charge)
 * This does a $0 or $1 authorization to verify and tokenize a card
 * DimePay Cards API: POST /api/v1/cards/tokenize
 */
export async function tokenizeCard(
  data: {
    customerPhone: string;
    customerEmail?: string;
    customerName?: string;
  },
  config: DimePaySDKConfig
): Promise<DimePayResponse<{ paymentUrl: string; reference: string }>> {
  try {
    if (!config.clientId || !config.secretKey) {
      return { success: false, error: 'DimePay not configured.' };
    }

    const baseUrl = config.baseUrl || DIMEPAY_BASE_URL;
    const reference = `TOKENIZE-${Date.now()}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pickuplocker.vercel.app';

    // Create an SDK payment with tokenization flag
    // The QR page will include tokenize: true so DimePay returns a card token
    const sdkResult = await createSDKPayment({
      amount: 100, // $1.00 JMD authorization (will be voided)
      currency: 'JMD',
      orderId: reference,
      description: 'Card Verification - Pickup Jamaica',
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      redirectUrl: `${appUrl}/account?verified=true`,
      webhookUrl: `${appUrl}/api/webhooks/dimepay`,
      passFeeToCustomer: false,
      metadata: {
        type: 'card_tokenization',
        customerName: data.customerName,
        tokenize: true, // Flag for webhook to save token
      },
    }, config);

    if (!sdkResult.success || !sdkResult.data) {
      return { success: false, error: sdkResult.error || 'Failed to create tokenization request' };
    }

    return {
      success: true,
      data: {
        paymentUrl: `${appUrl}/pay/${reference}`,
        reference,
      },
    };
  } catch (error) {
    console.error('DimePay tokenizeCard error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Export default client
const DimePayClient = {
  createPayment,
  createSDKPayment,
  createStorageFeePayment,
  createCourierTopupPayment,
  createSDKJWT,
  getSDKInitConfig,
  getPaymentStatus,
  listPayments,
  verifyWebhookSignature,
  calculateDimePayFee,
  generateQRCode,
  // Cards API
  extractCardTokenFromPayment,
  chargeCardToken,
  captureAuthorization,
  tokenizeCard,
};

export default DimePayClient;
