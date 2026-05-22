import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tokenizeCard, DimePaySDKConfig } from '@/lib/dimepay';
import { getDimepayConfig } from '@/lib/settings';

/**
 * Add Card Without Payment API
 *
 * Creates a $1.00 JMD card verification payment via DimePay.
 * When the customer completes this payment, DimePay returns a card token
 * via the webhook, and the card is saved to SavedPaymentMethod automatically.
 *
 * POST /api/account/add-card
 * Body: { phone: string, email?: string, name?: string }
 *
 * Response: { success: true, data: { paymentUrl: string, reference: string } }
 * The paymentUrl should be opened in a new tab/WebView for the customer to enter card details.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, email, name } = body;

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 7) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    // Find or create the user
    let user = await db.user.findFirst({ where: { phone: cleanPhone } });

    if (!user) {
      // Auto-create customer account
      user = await db.user.create({
        data: {
          phone: cleanPhone,
          email: email || `${cleanPhone}@pickup.local`,
          name: name || 'Customer',
          role: 'CUSTOMER',
        },
      });
    } else if (email && user.email.includes('@pickup.local')) {
      // Update placeholder email with real one
      user = await db.user.update({
        where: { id: user.id },
        data: { email },
      });
    }

    // Check how many active cards the user already has (limit: 5)
    const activeCardCount = await db.savedPaymentMethod.count({
      where: { userId: user.id, isActive: true },
    });

    if (activeCardCount >= 5) {
      return NextResponse.json(
        { error: 'Maximum of 5 saved cards allowed. Please remove a card first.' },
        { status: 400 }
      );
    }

    // Get DimePay configuration
    const config = await getDimepayConfig();
    const effectiveClientId = config.sandboxMode
      ? config.sandboxClientId
      : config.liveClientId;
    const effectiveSecretKey = config.sandboxMode
      ? config.sandboxSecretKey
      : config.liveSecretKey;

    if (!effectiveClientId || !effectiveSecretKey) {
      return NextResponse.json(
        { error: 'Payment gateway not configured. Please try again later or add a card at the locker.' },
        { status: 503 }
      );
    }

    const sdkConfig: DimePaySDKConfig = {
      clientId: effectiveClientId,
      secretKey: effectiveSecretKey,
      sandboxMode: config.sandboxMode,
    };

    // Create tokenization payment
    const result = await tokenizeCard(
      {
        customerPhone: cleanPhone,
        customerEmail: email || user.email,
        customerName: name || user.name || undefined,
      },
      sdkConfig
    );

    if (!result.success || !result.data) {
      console.error('[Add Card] Tokenization failed:', result.error);
      return NextResponse.json(
        { error: result.error || 'Failed to create card verification. Please try again.' },
        { status: 500 }
      );
    }

    // Store the tokenization session in DB so the webhook can link it back to the user
    await db.setting.upsert({
      where: { key: `tokenize_${result.data.reference}` },
      create: {
        key: `tokenize_${result.data.reference}`,
        value: JSON.stringify({
          userId: user.id,
          phone: cleanPhone,
          email: email || user.email,
          type: 'card_tokenization',
          createdAt: Date.now(),
          status: 'PENDING',
        }),
        description: `Card Tokenization: ${result.data.reference}`,
      },
      update: {
        value: JSON.stringify({
          userId: user.id,
          phone: cleanPhone,
          email: email || user.email,
          type: 'card_tokenization',
          createdAt: Date.now(),
          status: 'PENDING',
        }),
      },
    });

    console.log(
      `[Add Card] Tokenization session created for user ${user.id}, reference: ${result.data.reference}`
    );

    return NextResponse.json({
      success: true,
      data: {
        paymentUrl: result.data.paymentUrl,
        reference: result.data.reference,
      },
    });
  } catch (error) {
    console.error('[Add Card] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add card' },
      { status: 500 }
    );
  }
}
