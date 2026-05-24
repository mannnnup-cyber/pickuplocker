import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/dimepay";
import { getDimepayConfig } from "@/lib/settings";

interface DimePayWebhookData {
  id: string;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  card_token?: string;
  card?: {
    brand: string;
    last4: string;
  };
}

interface DimePayWebhookPayload {
  event: "payment.completed" | "payment.failed" | "payment.refunded";
  data: DimePayWebhookData;
}

export async function POST(request: NextRequest) {
  try {
    // Read raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("X-DimePay-Signature");

    if (!signature) {
      console.error("[DimePay Webhook] Missing signature header");
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 400 }
      );
    }

    // Get the DimePay config (contains the secret key)
    const config = await getDimepayConfig();

    // Determine which secret key to use based on sandbox mode
    const secretKey = config.sandboxMode
      ? config.sandboxSecretKey
      : config.secretKey;

    if (!secretKey) {
      console.error("[DimePay Webhook] DimePay secret key not configured");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 }
      );
    }

    // Verify the webhook signature
    const isValid = verifyWebhookSignature(rawBody, signature, secretKey);

    if (!isValid) {
      console.error("[DimePay Webhook] Invalid signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      );
    }

    // Parse the payload
    let payload: DimePayWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error("[DimePay Webhook] Malformed JSON payload");
      return NextResponse.json(
        { error: "Malformed payload" },
        { status: 400 }
      );
    }

    const { event, data } = payload;

    if (!event || !data?.id || !data?.reference) {
      console.error("[DimePay Webhook] Missing required fields", { payload });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Log the event
    console.log(`[DimePay Webhook] Event: ${event}`, {
      paymentId: data.id,
      reference: data.reference,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
    });

    // Determine the new status based on the event
    let newStatus: string;
    switch (event) {
      case "payment.completed":
        newStatus = "COMPLETED";
        break;
      case "payment.failed":
        newStatus = "FAILED";
        break;
      case "payment.refunded":
        newStatus = "REFUNDED";
        break;
      default:
        console.warn(`[DimePay Webhook] Unhandled event type: ${event}`);
        return NextResponse.json({ received: true });
    }

    // Update the payment session in the Settings table
    // The key format is: sdk_payment_${reference}
    const settingsKey = `sdk_payment_${data.reference}`;

    try {
      const existing = await db.setting.findUnique({
        where: { key: settingsKey },
      });

      if (existing) {
        const existingValue = JSON.parse(existing.value);
        await db.setting.update({
          where: { key: settingsKey },
          data: {
            value: JSON.stringify({
              ...existingValue,
              status: newStatus,
              dimepayPaymentId: data.id,
              updatedAt: new Date().toISOString(),
              ...(data.card_token ? { cardToken: data.card_token } : {}),
              ...(data.card
                ? {
                    cardBrand: data.card.brand,
                    cardLast4: data.card.last4,
                  }
                : {}),
            }),
          },
        });
        console.log(`[DimePay Webhook] Updated payment ${data.reference} → ${newStatus}`);
      } else {
        console.warn(`[DimePay Webhook] No payment session found for ${data.reference}`);
        // Still return 200 so DimePay doesn't keep retrying
      }
    } catch (dbError) {
      console.error("[DimePay Webhook] Error updating payment session:", dbError);
      // Still return 200 so DimePay doesn't retry indefinitely
    }

    // Save card token to SavedPaymentMethod if present
    // Requires a userId from the payment metadata
    if (data.card_token && event === "payment.completed") {
      try {
        // Try to find the customer from the payment session
        const paymentSession = await db.setting.findUnique({
          where: { key: settingsKey },
        });

        if (paymentSession) {
          const sessionData = JSON.parse(paymentSession.value);
          const customerId = sessionData.metadata?.customerId;

          if (customerId) {
            // Check if this card is already saved
            const existingMethod = await db.savedPaymentMethod.findFirst({
              where: { cardToken: data.card_token },
            });

            if (!existingMethod) {
              await db.savedPaymentMethod.create({
                data: {
                  userId: customerId,
                  cardToken: data.card_token,
                  brand: data.card?.brand ?? "UNKNOWN",
                  last4: data.card?.last4 ?? "****",
                },
              });
              console.log(`[DimePay Webhook] Saved payment method for user ${customerId}`);
            }
          }
        }
      } catch (cardError) {
        console.error("[DimePay Webhook] Error saving payment method:", cardError);
      }
    }

    // Log activity
    try {
      await db.activity.create({
        data: {
          action: `PAYMENT_${newStatus}`,
          metadata: JSON.stringify({
            paymentId: data.id,
            reference: data.reference,
            amount: data.amount,
            currency: data.currency,
            event,
          }),
        },
      });
    } catch (activityError) {
      console.error("[DimePay Webhook] Error logging activity:", activityError);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[DimePay Webhook] Unhandled error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
