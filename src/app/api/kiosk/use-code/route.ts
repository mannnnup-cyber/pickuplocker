import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStorageCalculation } from '@/lib/storage';
import { executeDoorOperation, updateBusinessStateForDropoff, updateBusinessStateForPickup, getCustomerMessage, type DoorOperationResult } from '@/lib/door-operation';
import { sendPickupNotification, sendPickupConfirmation } from '@/lib/textbee';
import { logDoorOperation } from '@/lib/bestwond-safe';

/**
 * POST /api/kiosk/use-code - Use a save_code or pick_code
 *
 * CRITICAL SAFETY RULES:
 * 1. Business state (order/box/payment) is ONLY updated after confirmed door opening
 * 2. If door opening fails, NO state changes are made
 * 3. Customer gets accurate messages about what happened
 * 4. Operations are idempotent (duplicate-safe)
 *
 * TRACING:
 * Every request gets a requestRef (kiosk-xxxxxxxx) that is logged
 * server-side (Vercel logs) with privacy-safe diagnostics and returned
 * in the response body. This allows correlating a website failure with
 * server logs WITHOUT exposing pickup/save codes, phone numbers,
 * Bestwond secrets, or signatures.
 */

/** Generate a short, opaque request reference. Not a secret — just a
 *  correlation ID. Format: kiosk-xxxxxxxx (8 hex chars). */
function generateRequestRef(): string {
  const rand = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  return `kiosk-${rand}`;
}

/** Privacy-safe log of a kiosk use-code request.
 *
 *  NEVER log: pickup code, save code, customer phone, Bestwond secret,
 *  Bestwond signature, payment credentials.
 *
 *  This function is called at the end of every request (success or
 *  failure) with the structured result. It writes a single line to
 *  console.log (which Vercel captures as a serverless log entry).
 */
function logUseCodeRequest(ref: string, data: {
  route: string;
  codeType: 'save' | 'pick' | 'unknown';
  httpStatus: number;
  result: 'success' | 'client_error' | 'server_error' | 'door_failure';
  expressOrderFound: boolean;
  orderFound: boolean;
  deviceFound: boolean;
  boxNumber?: number | null;
  doorOperationStarted: boolean;
  operationRef?: string | null;
  doorResultSuccess?: boolean;
  doorResultConfirmed?: boolean;
  doorResultStatus?: string;
  doorResultErrorType?: string;
  doorResultProviderCode?: number | null;
  doorResultApiCalls?: number;
  durationMs: number;
  customerMessage?: string;
}) {
  // Build a single-line JSON log entry. Vercel parses these for search.
  const entry = {
    source: 'KioskUseCode',
    requestRef: ref,
    route: data.route,
    codeType: data.codeType,
    httpStatus: data.httpStatus,
    result: data.result,
    expressOrderFound: data.expressOrderFound,
    orderFound: data.orderFound,
    deviceFound: data.deviceFound,
    boxNumber: data.boxNumber ?? null,
    doorOperationStarted: data.doorOperationStarted,
    operationRef: data.operationRef ?? null,
    doorResult: {
      success: data.doorResultSuccess,
      confirmed: data.doorResultConfirmed,
      status: data.doorResultStatus,
      errorType: data.doorResultErrorType,
      providerCode: data.doorResultProviderCode,
      apiCalls: data.doorResultApiCalls,
    },
    durationMs: data.durationMs,
    // Only include customerMessage if it's a safe, non-sensitive string.
    // (We never log the actual pickup/save code or phone.)
    customerMessage: data.customerMessage,
  };
  console.log(JSON.stringify(entry));
}

export async function POST(request: NextRequest) {
  const ref = generateRequestRef();
  const startedAt = Date.now();
  let codeType: 'save' | 'pick' | 'unknown' = 'unknown';
  let route = 'use-code';

  try {
    const body = await request.json();
    const { code, codeType: ct, recipientPhone, paymentMethod } = body;
    codeType = (ct === 'save' || ct === 'pick') ? ct : 'unknown';

    // Validate code
    if (!code || code.length !== 6) {
      logUseCodeRequest(ref, {
        route, codeType, httpStatus: 400, result: 'client_error',
        expressOrderFound: false, orderFound: false, deviceFound: false,
        doorOperationStarted: false, durationMs: Date.now() - startedAt,
        customerMessage: 'Please enter a valid 6-digit code',
      });
      return NextResponse.json({
        success: false,
        error: 'Please enter a valid 6-digit code',
        requestRef: ref,
      }, { status: 400 });
    }

    // Validate code type
    if (!codeType || !['save', 'pick'].includes(codeType)) {
      logUseCodeRequest(ref, {
        route, codeType: 'unknown', httpStatus: 400, result: 'client_error',
        expressOrderFound: false, orderFound: false, deviceFound: false,
        doorOperationStarted: false, durationMs: Date.now() - startedAt,
        customerMessage: 'Invalid code type. Must be "save" or "pick"',
      });
      return NextResponse.json({
        success: false,
        error: 'Invalid code type. Must be "save" or "pick"',
        requestRef: ref,
      }, { status: 400 });
    }

    // Handle save_code (drop-off)
    if (codeType === 'save') {
      return await handleSaveCode(code, recipientPhone, ref, startedAt);
    }

    // Handle pick_code (pickup)
    if (codeType === 'pick') {
      return await handlePickCode(code, paymentMethod, ref, startedAt);
    }

    logUseCodeRequest(ref, {
      route, codeType, httpStatus: 400, result: 'client_error',
      expressOrderFound: false, orderFound: false, deviceFound: false,
      doorOperationStarted: false, durationMs: Date.now() - startedAt,
      customerMessage: 'Invalid request',
    });
    return NextResponse.json({
      success: false,
      error: 'Invalid request',
      requestRef: ref,
    }, { status: 400 });

  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Use code error:', message);

    logUseCodeRequest(ref, {
      route, codeType, httpStatus: 500, result: 'server_error',
      expressOrderFound: false, orderFound: false, deviceFound: false,
      doorOperationStarted: false, durationMs,
      customerMessage: 'An error occurred processing your code. Please try again.',
    });
    return NextResponse.json({
      success: false,
      error: 'An error occurred processing your code. Please try again.',
      requestRef: ref,
    }, { status: 500 });
  }
}

/**
 * Handle save_code for drop-off
 *
 * SAFETY: Only marks order STORED and box OCCUPIED after confirmed door opening.
 */
async function handleSaveCode(saveCode: string, recipientPhone: string | undefined, ref: string, startedAt: number) {
  // Find express order by save_code
  const expressOrder = await db.expressOrder.findFirst({
    where: { saveCode, status: 'CREATED' },
  });

  if (!expressOrder) {
    logUseCodeRequest(ref, {
      route: 'use-code/save', codeType: 'save', httpStatus: 404, result: 'client_error',
      expressOrderFound: false, orderFound: false, deviceFound: false,
      doorOperationStarted: false, durationMs: Date.now() - startedAt,
      customerMessage: 'Invalid or expired drop-off code',
    });
    return NextResponse.json({
      success: false,
      error: 'Invalid or expired drop-off code',
      requestRef: ref,
    }, { status: 404 });
  }

  // Check if recipient phone is provided
  if (!recipientPhone) {
    logUseCodeRequest(ref, {
      route: 'use-code/save', codeType: 'save', httpStatus: 200, result: 'success',
      expressOrderFound: true, orderFound: false, deviceFound: false,
      doorOperationStarted: false, durationMs: Date.now() - startedAt,
      customerMessage: 'Please enter recipient phone number',
    });
    return NextResponse.json({
      success: true,
      requiresPhone: true,
      message: 'Please enter recipient phone number',
      orderNo: expressOrder.orderNo,
      boxSize: expressOrder.boxSize,
      requestRef: ref,
    });
  }

  // Clean phone number
  const cleanPhone = recipientPhone.replace(/[^0-9+]/g, '');

  // Get device
  const device = await db.device.findFirst({
    where: { deviceId: expressOrder.deviceId },
  });

  if (!device) {
    logUseCodeRequest(ref, {
      route: 'use-code/save', codeType: 'save', httpStatus: 404, result: 'client_error',
      expressOrderFound: true, orderFound: false, deviceFound: false,
      doorOperationStarted: false, durationMs: Date.now() - startedAt,
      customerMessage: 'Locker device not found',
    });
    return NextResponse.json({
      success: false,
      error: 'Locker device not found',
      requestRef: ref,
    }, { status: 404 });
  }

  // Find the main order and box
  const order = await db.order.findFirst({
    where: { orderNumber: expressOrder.orderNo },
  });

  const boxNumber = parseInt(expressOrder.boxName || '1', 10);

  // Execute door operation through the centralized service
  const doorResult = await executeDoorOperation({
    orderId: order?.id || expressOrder.id,
    orderNo: expressOrder.orderNo,
    deviceId: device.id,
    deviceNumber: device.deviceId,
    boxId: order?.boxId,
    boxNumber,
    boxSize: expressOrder.boxSize as 'S' | 'M' | 'L' | 'XL',
    action: 'dropoff',
    actionCode: saveCode,
    idempotencyKey: `dropoff:${expressOrder.id}:${saveCode}`,
    useExpressApi: true,
  });

  // ============================================
  // CRITICAL: Only update business state if door opened
  // ============================================

  if (doorResult.success && doorResult.confirmed) {
    // Door confirmed open — safe to update business state
    try {
      await updateBusinessStateForDropoff({
        expressOrderId: expressOrder.id,
        orderId: order?.id,
        boxId: order?.boxId,
        deviceId: order?.deviceId,
        customerPhone: cleanPhone,
        boxName: expressOrder.boxName || String(boxNumber).padStart(2, '0'),
        saveCode,
        pickCode: expressOrder.pickCode,
        deviceLocation: device.location || undefined,
        customerName: expressOrder.customerName || undefined,
      });

      // Send pickup notification SMS (non-critical)
      try {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 3);
        await sendPickupNotification(
          cleanPhone,
          expressOrder.customerName || 'Customer',
          expressOrder.pickCode,
          device.location || 'Pickup Locker',
          expiryDate.toLocaleDateString()
        );
      } catch (smsError) {
        console.error('Failed to send pickup SMS:', smsError instanceof Error ? smsError.message : 'Unknown');
      }

      // Create activity log (non-critical, privacy-safe)
      if (order) {
        try {
          await db.activity.create({
            data: {
              userId: order.customerId,
              action: 'KIOSK_DROP_OFF',
              description: `Package stored. Box: ${expressOrder.boxName}, Order: ${expressOrder.orderNo}`,
              orderId: order.id,
            },
          });
        } catch (logError) {
          console.error('Failed to create activity log:', logError instanceof Error ? logError.message : 'Unknown');
        }
      }

      logDoorOperation({
        operationId: doorResult.operationId,
        action: 'dropoff',
        orderId: order?.id,
        deviceId: device.id,
        boxId: order?.boxId,
        boxNumber,
        result: 'success',
        durationMs: doorResult.durationMs,
        apiCalls: doorResult.apiCalls,
        businessStateUpdated: true,
        message: 'Door confirmed open, business state updated',
      });

      logUseCodeRequest(ref, {
        route: 'use-code/save', codeType: 'save', httpStatus: 200, result: 'success',
        expressOrderFound: true, orderFound: !!order, deviceFound: true,
        boxNumber,
        doorOperationStarted: true,
        operationRef: doorResult.operationId,
        doorResultSuccess: doorResult.success,
        doorResultConfirmed: doorResult.confirmed,
        doorResultStatus: doorResult.status,
        doorResultErrorType: doorResult.errorType,
        doorResultProviderCode: doorResult.providerCode,
        doorResultApiCalls: doorResult.apiCalls,
        durationMs: Date.now() - startedAt,
        customerMessage: 'Locker opened! Please place your package inside and close the door.',
      });

    } catch (stateError) {
      // Business state update failed AFTER physical door opened!
      // This is a critical condition — the door IS open but our records don't reflect it.
      console.error('[CRITICAL] Business state update failed after door opened:', stateError);
      logDoorOperation({
        operationId: doorResult.operationId,
        action: 'dropoff',
        orderId: order?.id,
        deviceId: device.id,
        result: 'success',
        message: 'Door opened but business state update FAILED — needs manual reconciliation',
        durationMs: doorResult.durationMs,
        apiCalls: doorResult.apiCalls,
        businessStateUpdated: false,
      });

      logUseCodeRequest(ref, {
        route: 'use-code/save', codeType: 'save', httpStatus: 200, result: 'success',
        expressOrderFound: true, orderFound: !!order, deviceFound: true,
        boxNumber,
        doorOperationStarted: true,
        operationRef: doorResult.operationId,
        doorResultSuccess: doorResult.success,
        doorResultConfirmed: doorResult.confirmed,
        doorResultStatus: doorResult.status,
        doorResultErrorType: doorResult.errorType,
        doorResultProviderCode: doorResult.providerCode,
        doorResultApiCalls: doorResult.apiCalls,
        durationMs: Date.now() - startedAt,
        customerMessage: 'Locker opened! Please place your package inside and close the door.',
      });

      // Still tell the customer the door is open
      return NextResponse.json({
        success: true,
        orderNo: expressOrder.orderNo,
        boxName: expressOrder.boxName,
        boxOpened: true,
        pickCode: expressOrder.pickCode,
        message: 'Locker opened! Please place your package inside and close the door.',
        _warning: 'Business state update pending — staff should verify records',
        requestRef: ref,
      });
    }

    return NextResponse.json({
      success: true,
      orderNo: expressOrder.orderNo,
      boxName: expressOrder.boxName,
      boxOpened: true,
      pickCode: expressOrder.pickCode,
      message: 'Locker opened! Please place your package inside and close the door.',
      requestRef: ref,
    });
  }

  // ============================================
  // Door did NOT open confirmed — NO business state changes
  // ============================================

  const customerMsg = getCustomerMessage(doorResult, 'dropoff');

  logDoorOperation({
    operationId: doorResult.operationId,
    action: 'dropoff',
    orderId: order?.id,
    deviceId: device.id,
    boxId: order?.boxId,
    boxNumber,
    result: doorResult.success ? 'unknown' : 'failure',
    errorType: doorResult.errorType,
    durationMs: doorResult.durationMs,
    apiCalls: doorResult.apiCalls,
    businessStateUpdated: false,
    message: `Door not confirmed. No business state changes made. ${doorResult.message}`,
  });

  const httpStatus = doorResult.retryable ? 503 : 400;
  logUseCodeRequest(ref, {
    route: 'use-code/save', codeType: 'save', httpStatus, result: 'door_failure',
    expressOrderFound: true, orderFound: !!order, deviceFound: true,
    boxNumber,
    doorOperationStarted: true,
    operationRef: doorResult.operationId,
    doorResultSuccess: doorResult.success,
    doorResultConfirmed: doorResult.confirmed,
    doorResultStatus: doorResult.status,
    doorResultErrorType: doorResult.errorType,
    doorResultProviderCode: doorResult.providerCode,
    doorResultApiCalls: doorResult.apiCalls,
    durationMs: Date.now() - startedAt,
    customerMessage: customerMsg.message,
  });

  return NextResponse.json({
    success: false,
    boxOpened: false,
    error: customerMsg.message,
    retryable: doorResult.retryable,
    showRetry: customerMsg.showRetry,
    showStaffAssist: customerMsg.showStaffAssist,
    operationRef: doorResult.operationId,
    requestRef: ref,
    // Include box info so customer can retry
    orderNo: expressOrder.orderNo,
    boxName: expressOrder.boxName,
    pickCode: expressOrder.pickCode,
  }, { status: httpStatus });
}

/**
 * Handle pick_code for pickup
 *
 * SAFETY: Only marks order PICKED_UP, box AVAILABLE, and records payment
 * after confirmed door opening.
 */
async function handlePickCode(pickCode: string, paymentMethod: string | undefined, ref: string, startedAt: number) {
  // Find express order by pick_code
  const expressOrder = await db.expressOrder.findFirst({
    where: { pickCode, status: 'STORED' },
  });

  // Also check main orders table
  const order = await db.order.findUnique({
    where: { trackingCode: pickCode },
    include: { device: true, box: true },
  });

  if (!expressOrder && !order) {
    logUseCodeRequest(ref, {
      route: 'use-code/pick', codeType: 'pick', httpStatus: 404, result: 'client_error',
      expressOrderFound: false, orderFound: false, deviceFound: false,
      doorOperationStarted: false, durationMs: Date.now() - startedAt,
      customerMessage: 'Invalid pickup code',
    });
    return NextResponse.json({
      success: false,
      error: 'Invalid pickup code',
      requestRef: ref,
    }, { status: 404 });
  }

  // Check if already picked up
  if (expressOrder?.status === 'PICKED_UP' || order?.status === 'PICKED_UP') {
    logUseCodeRequest(ref, {
      route: 'use-code/pick', codeType: 'pick', httpStatus: 400, result: 'client_error',
      expressOrderFound: !!expressOrder, orderFound: !!order, deviceFound: false,
      doorOperationStarted: false, durationMs: Date.now() - startedAt,
      customerMessage: 'This package has already been picked up',
    });
    return NextResponse.json({
      success: false,
      error: 'This package has already been picked up',
      requestRef: ref,
    }, { status: 400 });
  }

  // Get order details
  let deviceId = expressOrder?.deviceId || order?.device?.deviceId || '';
  let boxName = expressOrder?.boxName || (order?.boxNumber?.toString().padStart(2, '0')) || '01';
  let boxSize = expressOrder?.boxSize || order?.packageSize || 'M';
  const boxNumber = parseInt(boxName, 10);

  // Get device
  const device = await db.device.findFirst({
    where: { deviceId },
  });

  if (!device) {
    logUseCodeRequest(ref, {
      route: 'use-code/pick', codeType: 'pick', httpStatus: 404, result: 'client_error',
      expressOrderFound: !!expressOrder, orderFound: !!order, deviceFound: false,
      doorOperationStarted: false, durationMs: Date.now() - startedAt,
      customerMessage: 'Locker device not found',
    });
    return NextResponse.json({
      success: false,
      error: 'Locker device not found',
      requestRef: ref,
    }, { status: 404 });
  }

  // Calculate storage fee
  const storageStart = order?.storageStartAt || order?.dropOffAt || order?.createdAt || expressOrder?.createdAt;
  const storageCalc = getStorageCalculation(new Date(storageStart || new Date()));
  const storageFee = storageCalc.storageFee;

  // Check manual payment grace period
  let feeOwed = storageFee;
  let graceExpired = false;

  if (order?.manuallyPaidAt && order?.manualPaymentGraceUntil) {
    const now = new Date();
    const graceDeadline = new Date(order.manualPaymentGraceUntil);

    if (now <= graceDeadline) {
      feeOwed = 0;
    } else {
      graceExpired = true;
      const newFeeCalc = getStorageCalculation(new Date(order.manuallyPaidAt));
      feeOwed = newFeeCalc.storageFee;
    }
  }

  // Check if payment is required
  if (feeOwed > 0 && !paymentMethod) {
    logUseCodeRequest(ref, {
      route: 'use-code/pick', codeType: 'pick', httpStatus: 200, result: 'success',
      expressOrderFound: !!expressOrder, orderFound: !!order, deviceFound: true,
      boxNumber,
      doorOperationStarted: false, durationMs: Date.now() - startedAt,
      customerMessage: graceExpired
        ? `Grace period expired. Additional storage fee of JMD $${feeOwed} is required`
        : `Storage fee of JMD $${feeOwed} is required`,
    });
    return NextResponse.json({
      success: true,
      requiresPayment: true,
      orderNo: expressOrder?.orderNo || order?.orderNumber,
      boxName,
      storageFee: feeOwed,
      storageDays: storageCalc.totalDays,
      graceExpired,
      message: graceExpired
        ? `Grace period expired. Additional storage fee of JMD $${feeOwed} is required`
        : `Storage fee of JMD $${feeOwed} is required`,
      requestRef: ref,
    });
  }

  // ============================================
  // Execute door operation BEFORE any business state changes
  // ============================================

  const doorResult = await executeDoorOperation({
    orderId: order?.id || expressOrder?.id || 'unknown',
    orderNo: expressOrder?.orderNo || order?.orderNumber || 'unknown',
    deviceId: device.id,
    deviceNumber: device.deviceId,
    boxId: order?.boxId,
    boxNumber,
    boxSize: boxSize as 'S' | 'M' | 'L' | 'XL',
    action: 'pickup',
    actionCode: pickCode,
    idempotencyKey: `pickup:${order?.id || expressOrder?.id}:${pickCode}`,
    useExpressApi: true,
  });

  // ============================================
  // CRITICAL: Only update business state if door opened
  // ============================================

  if (doorResult.success && doorResult.confirmed) {
    // Door confirmed open — safe to update business state
    try {
      await updateBusinessStateForPickup({
        expressOrderId: expressOrder?.id,
        orderId: order?.id,
        boxId: order?.boxId,
        deviceId: order?.deviceId,
        storageDays: storageCalc.totalDays,
        storageFee,
        feeOwed,
        paymentMethod,
        customerPhone: order?.customerPhone,
        customerName: order?.customerName,
        boxName,
      });

      // Send confirmation SMS (non-critical)
      if (order?.customerPhone && order?.customerName) {
        try {
          await sendPickupConfirmation(order.customerPhone, order.customerName);
        } catch (smsError) {
          console.error('Failed to send pickup confirmation SMS:', smsError instanceof Error ? smsError.message : 'Unknown');
        }
      }

      // Create activity log (non-critical, privacy-safe)
      if (order) {
        try {
          await db.activity.create({
            data: {
              userId: order.customerId,
              action: 'KIOSK_PICKUP',
              description: `Package picked up. Box: ${boxName}, Days: ${storageCalc.totalDays}, Fee: JMD $${feeOwed > 0 ? feeOwed : storageFee}`,
              orderId: order.id,
            },
          });
        } catch (logError) {
          console.error('Failed to create activity log:', logError instanceof Error ? logError.message : 'Unknown');
        }
      }

      logDoorOperation({
        operationId: doorResult.operationId,
        action: 'pickup',
        orderId: order?.id,
        deviceId: device.id,
        boxId: order?.boxId,
        boxNumber,
        result: 'success',
        durationMs: doorResult.durationMs,
        apiCalls: doorResult.apiCalls,
        businessStateUpdated: true,
        message: 'Door confirmed open, business state updated',
      });

      logUseCodeRequest(ref, {
        route: 'use-code/pick', codeType: 'pick', httpStatus: 200, result: 'success',
        expressOrderFound: !!expressOrder, orderFound: !!order, deviceFound: true,
        boxNumber,
        doorOperationStarted: true,
        operationRef: doorResult.operationId,
        doorResultSuccess: doorResult.success,
        doorResultConfirmed: doorResult.confirmed,
        doorResultStatus: doorResult.status,
        doorResultErrorType: doorResult.errorType,
        doorResultProviderCode: doorResult.providerCode,
        doorResultApiCalls: doorResult.apiCalls,
        durationMs: Date.now() - startedAt,
        customerMessage: 'Locker opened! Please collect your package and close the door.',
      });

    } catch (stateError) {
      // Business state update failed AFTER physical door opened!
      console.error('[CRITICAL] Business state update failed after pickup door opened:', stateError);
      logDoorOperation({
        operationId: doorResult.operationId,
        action: 'pickup',
        orderId: order?.id,
        deviceId: device.id,
        result: 'success',
        message: 'Door opened but business state update FAILED — needs manual reconciliation',
        durationMs: doorResult.durationMs,
        apiCalls: doorResult.apiCalls,
        businessStateUpdated: false,
      });

      logUseCodeRequest(ref, {
        route: 'use-code/pick', codeType: 'pick', httpStatus: 200, result: 'success',
        expressOrderFound: !!expressOrder, orderFound: !!order, deviceFound: true,
        boxNumber,
        doorOperationStarted: true,
        operationRef: doorResult.operationId,
        doorResultSuccess: doorResult.success,
        doorResultConfirmed: doorResult.confirmed,
        doorResultStatus: doorResult.status,
        doorResultErrorType: doorResult.errorType,
        doorResultProviderCode: doorResult.providerCode,
        doorResultApiCalls: doorResult.apiCalls,
        durationMs: Date.now() - startedAt,
        customerMessage: 'Locker opened! Please collect your package and close the door.',
      });

      // Still tell the customer the door is open
      return NextResponse.json({
        success: true,
        orderNo: expressOrder?.orderNo || order?.orderNumber,
        boxName,
        boxOpened: true,
        storageFee,
        message: 'Locker opened! Please collect your package and close the door.',
        _warning: 'Business state update pending — staff should verify records',
        requestRef: ref,
      });
    }

    return NextResponse.json({
      success: true,
      orderNo: expressOrder?.orderNo || order?.orderNumber,
      boxName,
      boxOpened: true,
      storageFee,
      message: 'Locker opened! Please collect your package and close the door.',
      requestRef: ref,
    });
  }

  // ============================================
  // Door did NOT open confirmed — NO business state changes
  // No payment recorded, no order marked PICKED_UP, no box marked AVAILABLE
  // ============================================

  const customerMsg = getCustomerMessage(doorResult, 'pickup');

  logDoorOperation({
    operationId: doorResult.operationId,
    action: 'pickup',
    orderId: order?.id,
    deviceId: device.id,
    boxId: order?.boxId,
    boxNumber,
    result: doorResult.success ? 'unknown' : 'failure',
    errorType: doorResult.errorType,
    durationMs: doorResult.durationMs,
    apiCalls: doorResult.apiCalls,
    businessStateUpdated: false,
    message: `Door not confirmed. No business state changes. No payment recorded. ${doorResult.message}`,
  });

  const httpStatus = doorResult.retryable ? 503 : 400;
  logUseCodeRequest(ref, {
    route: 'use-code/pick', codeType: 'pick', httpStatus, result: 'door_failure',
    expressOrderFound: !!expressOrder, orderFound: !!order, deviceFound: true,
    boxNumber,
    doorOperationStarted: true,
    operationRef: doorResult.operationId,
    doorResultSuccess: doorResult.success,
    doorResultConfirmed: doorResult.confirmed,
    doorResultStatus: doorResult.status,
    doorResultErrorType: doorResult.errorType,
    doorResultProviderCode: doorResult.providerCode,
    doorResultApiCalls: doorResult.apiCalls,
    durationMs: Date.now() - startedAt,
    customerMessage: customerMsg.message,
  });

  return NextResponse.json({
    success: false,
    boxOpened: false,
    error: customerMsg.message,
    retryable: doorResult.retryable,
    showRetry: customerMsg.showRetry,
    showStaffAssist: customerMsg.showStaffAssist,
    operationRef: doorResult.operationId,
    requestRef: ref,
    // Preserve fee info so customer can retry payment
    orderNo: expressOrder?.orderNo || order?.orderNumber,
    boxName,
    storageFee: feeOwed > 0 ? feeOwed : storageFee,
    requiresPayment: feeOwed > 0,
  }, { status: httpStatus });
}
