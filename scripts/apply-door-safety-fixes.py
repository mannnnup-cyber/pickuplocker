#!/usr/bin/env python3
"""
Apply door-operation safety fixes to the PickupLocker codebase.
This script patches all the files that need migration to DoorOperationService.
"""

import re

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)
    print(f"  ✓ Wrote {path}")

# ============================================
# 1. Fix door-operation.ts idempotency
# ============================================
print("1. Fixing door-operation.ts idempotency...")

content = read_file('/home/z/my-project/src/lib/door-operation.ts')

# Replace checkIdempotency
old_check = '''async function checkIdempotency(
  idempotencyKey: string,
): Promise<DoorOperationResult | null> {
  try {
    const existing = await db.boxLog.findFirst({
      where: {
        metadata: { contains: idempotencyKey },
        action: 'DOOR_OPERATION',
      },
      orderBy: { occurredAt: 'desc' },
    });

    if (existing && existing.metadata) {
      try {
        const parsed = JSON.parse(existing.metadata);
        if (parsed.idempotencyKey === idempotencyKey && parsed.result) {
          return parsed.result as DoorOperationResult;
        }
      } catch {
        // Malformed metadata, ignore
      }
    }
  } catch (error) {
    // DB error during idempotency check — proceed with operation
    console.error('[DoorOp] Idempotency check failed:', error);
  }

  return null;
}'''

new_check = '''async function checkIdempotency(
  idempotencyKey: string,
): Promise<DoorOperationResult | null> {
  try {
    const existing = await db.doorOperationRecord.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      return {
        success: existing.success,
        confirmed: existing.confirmed,
        retryable: existing.retryable,
        operationId: existing.operationId,
        deviceId: existing.deviceId,
        boxId: existing.boxId,
        boxNumber: existing.boxNumber,
        lockAddress: existing.lockAddress,
        attempts: existing.attempts,
        errorType: existing.errorType as BestwondErrorType | undefined,
        message: existing.message || 'Previous operation result',
        providerCode: existing.providerCode ?? undefined,
        startedAt: existing.startedAt.toISOString(),
        completedAt: existing.completedAt.toISOString(),
        durationMs: existing.durationMs,
        apiCalls: existing.apiCalls,
        businessStateUpdated: existing.businessStateUpdated,
      };
    }
  } catch (error) {
    // DB error during idempotency check — proceed with operation
    console.error('[DoorOp] Idempotency check failed:', error);
  }

  return null;
}'''

content = content.replace(old_check, new_check)

# Replace recordOperation
old_record = '''async function recordOperation(
  result: DoorOperationResult,
  idempotencyKey: string,
): Promise<void> {
  try {
    await db.boxLog.create({
      data: {
        boxId: result.boxId || 'unknown',
        deviceId: result.deviceId,
        action: 'DOOR_OPERATION',
        orderNo: result.operationId,
        occurredAt: new Date(),
        metadata: JSON.stringify({
          idempotencyKey,
          result,
        }),
      },
    });
  } catch (error) {
    console.error('[DoorOp] Failed to record operation:', error);
  }
}'''

new_record = '''async function recordOperation(
  result: DoorOperationResult,
  idempotencyKey: string,
  options: DoorOperationOptions,
): Promise<void> {
  try {
    await db.doorOperationRecord.create({
      data: {
        idempotencyKey,
        operationId: result.operationId,
        action: options.action,
        orderId: options.orderId,
        deviceId: result.deviceId,
        boxId: result.boxId ?? null,
        boxNumber: result.boxNumber ?? null,
        lockAddress: result.lockAddress ?? null,
        success: result.success,
        confirmed: result.confirmed,
        retryable: result.retryable,
        errorType: result.errorType ?? null,
        startedAt: new Date(result.startedAt),
        completedAt: new Date(result.completedAt),
        durationMs: result.durationMs,
        apiCalls: result.apiCalls,
        attempts: result.attempts,
        businessStateUpdated: result.businessStateUpdated,
        providerCode: result.providerCode ?? null,
        message: result.message,
      },
    });
  } catch (error: unknown) {
    // Unique constraint violation = concurrent request already recorded
    if (error instanceof Error &&
        (error.message.includes('Unique constraint') ||
         error.message.includes('unique') ||
         error.message.includes('idempotencyKey'))) {
      logDoorOperation({
        operationId: result.operationId,
        action: options.action,
        orderId: options.orderId,
        deviceId: result.deviceId,
        result: 'success',
        message: 'Idempotency: concurrent request already recorded this operation',
        durationMs: 0,
        apiCalls: 0,
        businessStateUpdated: false,
      });
      return;
    }
    console.error('[DoorOp] Failed to record operation:', error);
  }
}'''

content = content.replace(old_record, new_record)

# Update recordOperation calls to pass options
content = content.replace(
    'await recordOperation(result, options.idempotencyKey);\n    return result;\n  }\n\n  if (!credentials.appId || !credentials.appSecret) {',
    'await recordOperation(result, options.idempotencyKey, options);\n    return result;\n  }\n\n  if (!credentials.appId || !credentials.appSecret) {'
)
content = content.replace(
    'await recordOperation(result, options.idempotencyKey);\n    return result;\n  }\n\n  // 3. Resolve lock address',
    'await recordOperation(result, options.idempotencyKey, options);\n    return result;\n  }\n\n  // 3. Resolve lock address'
)
content = content.replace(
    'await recordOperation(finalResult, options.idempotencyKey);',
    'await recordOperation(finalResult, options.idempotencyKey, options);'
)

write_file('/home/z/my-project/src/lib/door-operation.ts', content)

# ============================================
# 2. Fix pickup/route.ts
# ============================================
print("2. Fixing pickup/route.ts...")

content = read_file('/home/z/my-project/src/app/api/pickup/route.ts')

# Replace imports
content = content.replace(
    "import { openBoxWithCredentials, getCredentialsForDevice } from '@/lib/bestwond';",
    "import { executeDoorOperation, type DoorOperationResult } from '@/lib/door-operation';"
)

# Replace door-open + unconditional state update
old_pickup_door = '''    // Open the box using device-specific credentials
    if (order.device && order.boxNumber) {
      try {
        const credentials = await getCredentialsForDevice(order.device.id);
        const boxResult = await openBoxWithCredentials(order.device.deviceId, order.boxNumber, credentials);
        
        // Bestwond returns code 0 for success (not 200)
        if (boxResult.code !== 0) {
          console.error('Failed to open box:', boxResult);
          // Don't fail the whole operation - staff can open manually
        }
      } catch (boxError) {
        console.error('Error opening box:', boxError);
        // Don't fail the whole operation - staff can open manually
      }
    }

    // Update order status
    await db.order.update({
      where: { id: order.id },
      data: {
        status: 'PICKED_UP',
        pickUpAt: new Date(),
        pickUpBy: staffOverride || order.customerId,
        storageDays: storageCalc.totalDays,
        storageFee,
      },
    });'''

new_pickup_door = '''    // Open the box via DoorOperationService (safe: retry, fallback, verification)
    let doorResult: DoorOperationResult | null = null;
    if (order.device && order.boxNumber) {
      doorResult = await executeDoorOperation({
        orderId: order.id,
        orderNo: order.orderNumber,
        deviceId: order.device.id,
        deviceNumber: order.device.deviceId,
        boxId: order.boxId,
        boxNumber: order.boxNumber,
        action: 'pickup',
        actionCode: order.trackingCode,
        idempotencyKey: `pickup:${order.id}:${Date.now()}`,
        useExpressApi: true,
      });
    }

    // SAFETY: Only update business state after confirmed door opening
    const doorConfirmed = doorResult ? (doorResult.success && doorResult.confirmed) : false;

    if (!doorConfirmed && doorResult) {
      // Door failed — do NOT mark as picked up
      if (storageFee > 0 && paymentMethod) {
        await db.order.update({
          where: { id: order.id },
          data: { status: 'PAID_PENDING_DOOR_OPEN' },
        });
      }
      return NextResponse.json({
        success: false,
        error: doorResult.message || 'Could not open locker door. Please try again or contact staff.',
        retryable: doorResult.retryable,
        orderNumber: order.orderNumber,
        boxNumber: order.boxNumber,
      }, { status: 503 });
    }

    // Door confirmed open — update business state
    await db.order.update({
      where: { id: order.id },
      data: {
        status: 'PICKED_UP',
        pickUpAt: new Date(),
        pickUpBy: staffOverride || order.customerId,
        storageDays: storageCalc.totalDays,
        storageFee,
      },
    });'''

content = content.replace(old_pickup_door, new_pickup_door)
write_file('/home/z/my-project/src/app/api/pickup/route.ts', content)

# ============================================
# 3. Fix payments/manual/route.ts
# ============================================
print("3. Fixing payments/manual/route.ts...")

content = read_file('/home/z/my-project/src/app/api/payments/manual/route.ts')

content = content.replace(
    "import { openBoxWithCredentials, getCredentialsForDevice } from '@/lib/bestwond';",
    "import { executeDoorOperation, type DoorOperationResult } from '@/lib/door-operation';"
)

old_manual_door = '''    let boxOpened = false;

    // If openBoxNow, try to open the box via Bestwond API
    if (openBoxNow && order.device && order.boxNumber) {
      try {
        const credentials = await getCredentialsForDevice(order.device.id);
        if (credentials.appId && credentials.appSecret) {
          const result = await openBoxWithCredentials(
            order.device.deviceId,
            order.boxNumber,
            credentials
          );
          boxOpened = result.code === 0;
        }
      } catch (boxError) {
        console.error('[Manual Payment] Failed to open box:', boxError);
      }
    }'''

new_manual_door = '''    let boxOpened = false;
    let doorResult: DoorOperationResult | null = null;

    // If openBoxNow, try to open the box via DoorOperationService
    if (openBoxNow && order.device && order.boxNumber) {
      doorResult = await executeDoorOperation({
        orderId: order.id,
        orderNo: order.orderNumber,
        deviceId: order.device.id,
        deviceNumber: order.device.deviceId,
        boxId: order.boxId,
        boxNumber: order.boxNumber,
        action: 'pickup',
        actionCode: order.trackingCode,
        idempotencyKey: `manual-pay:${order.id}:${Date.now()}`,
        useExpressApi: true,
      });
      boxOpened = doorResult.success && doorResult.confirmed;
    }'''

content = content.replace(old_manual_door, new_manual_door)

# Fix PAID_PENDING_DOOR_OPEN
content = content.replace(
    '''    // If box was opened immediately, mark as picked up
    if (openBoxNow && boxOpened) {
      orderUpdateData.status = 'PICKED_UP';
      orderUpdateData.pickUpAt = now;
      orderUpdateData.pickUpBy = staffName;
    }''',
    '''    // If box was opened immediately, mark as picked up
    // If door was requested but failed, mark as PAID_PENDING_DOOR_OPEN (payment safe)
    if (openBoxNow && boxOpened) {
      orderUpdateData.status = 'PICKED_UP';
      orderUpdateData.pickUpAt = now;
      orderUpdateData.pickUpBy = staffName;
    } else if (openBoxNow && !boxOpened && doorResult) {
      // Door was requested but failed — payment is recorded but door not confirmed
      orderUpdateData.status = 'PAID_PENDING_DOOR_OPEN';
    }'''
)

write_file('/home/z/my-project/src/app/api/payments/manual/route.ts', content)

# ============================================
# 4. Fix cron/auto-charge/route.ts
# ============================================
print("4. Fixing cron/auto-charge/route.ts...")

content = read_file('/home/z/my-project/src/app/api/cron/auto-charge/route.ts')

content = content.replace(
    "import { openBoxWithCredentials, getCredentialsForDevice } from '@/lib/bestwond';",
    "import { executeDoorOperation } from '@/lib/door-operation';"
)

# Replace the dangerous section: charge → mark PICKED_UP → open box (wrong order)
# with: charge → open box → only mark PICKED_UP if door confirmed
old_autocharge = '''          // Create payment record
          await db.payment.create({
            data: {
              orderId: order.id,
              userId: order.customerId,
              type: 'STORAGE_FEE',
              amount: storageFee,
              method: 'CARD',
              status: 'COMPLETED',
              gatewayRef: chargeResult.data?.chargeId || `auto-${Date.now()}`,
              gatewayResponse: JSON.stringify(chargeResult.data),
              description: `Auto-charged storage fee for order ${order.orderNumber}`,
              paidAt: new Date(),
            },
          });

          // Update order status and storage fee
          await db.order.update({
            where: { id: order.id },
            data: {
              status: 'PICKED_UP',
              pickUpAt: new Date(),
              storageFee,
              storageDays: calc.totalDays,
            },
          });

          // Mark box as available
          if (order.boxId) {
            await db.box.update({
              where: { id: order.boxId },
              data: { status: 'AVAILABLE' },
            });
          }

          // Update device available count
          if (order.deviceId) {
            await db.device.update({
              where: { id: order.deviceId },
              data: { availableBoxes: { increment: 1 } },
            });
          }

          // Open the box for pickup
          if (order.device && order.boxNumber) {
            try {
              const credentials = await getCredentialsForDevice(order.device.id);
              if (credentials.appId && credentials.appSecret) {
                await openBoxWithCredentials(
                  order.device.deviceId,
                  order.boxNumber,
                  credentials
                );
                console.log(
                  `[Auto-Charge] Box ${order.boxNumber} opened for order ${order.orderNumber}`
                );
              }
            } catch (boxError) {
              console.error(
                `[Auto-Charge] Failed to open box for order ${order.orderNumber}:`,
                boxError
              );
            }
          }'''

new_autocharge = '''          // Create payment record
          await db.payment.create({
            data: {
              orderId: order.id,
              userId: order.customerId,
              type: 'STORAGE_FEE',
              amount: storageFee,
              method: 'CARD',
              status: 'COMPLETED',
              gatewayRef: chargeResult.data?.chargeId || `auto-${Date.now()}`,
              gatewayResponse: JSON.stringify(chargeResult.data),
              description: `Auto-charged storage fee for order ${order.orderNumber}`,
              paidAt: new Date(),
            },
          });

          // Open the box FIRST — only update business state after confirmed door opening
          let doorConfirmed = false;
          if (order.device && order.boxNumber) {
            try {
              const doorResult = await executeDoorOperation({
                orderId: order.id,
                orderNo: order.orderNumber,
                deviceId: order.device.id,
                deviceNumber: order.device.deviceId,
                boxId: order.boxId,
                boxNumber: order.boxNumber,
                action: 'pickup',
                actionCode: order.trackingCode,
                idempotencyKey: `auto-charge:${order.id}:${Date.now()}`,
                useExpressApi: true,
              });
              doorConfirmed = doorResult.success && doorResult.confirmed;
              if (!doorConfirmed) {
                console.error(`[Auto-Charge] Door not confirmed for order ${order.orderNumber}: ${doorResult.message}`);
              }
            } catch (doorError) {
              console.error(`[Auto-Charge] Failed to open box for order ${order.orderNumber}:`, doorError);
            }
          }

          // SAFETY: Only update business state after confirmed door opening
          if (doorConfirmed) {
            await db.order.update({
              where: { id: order.id },
              data: { status: 'PICKED_UP', pickUpAt: new Date(), storageFee, storageDays: calc.totalDays },
            });
            if (order.boxId) {
              await db.box.update({ where: { id: order.boxId }, data: { status: 'AVAILABLE' } });
            }
            if (order.deviceId) {
              await db.device.update({ where: { id: order.deviceId }, data: { availableBoxes: { increment: 1 } } });
            }
          } else {
            // Door didn't open — mark as PAID_PENDING_DOOR_OPEN to preserve payment
            await db.order.update({
              where: { id: order.id },
              data: { status: 'PAID_PENDING_DOOR_OPEN', storageFee, storageDays: calc.totalDays },
            });
            console.warn(`[Auto-Charge] Order ${order.orderNumber} marked PAID_PENDING_DOOR_OPEN — door did not confirm`);
          }'''

content = content.replace(old_autocharge, new_autocharge)
write_file('/home/z/my-project/src/app/api/cron/auto-charge/route.ts', content)

# ============================================
# 5. Fix kiosk/payment/route.ts
# ============================================
print("5. Fixing kiosk/payment/route.ts...")

content = read_file('/home/z/my-project/src/app/api/kiosk/payment/route.ts')

# Add import
if "executeDoorOperation" not in content:
    content = content.replace(
        "import QRCode from 'qrcode';",
        "import { executeDoorOperation, type DoorOperationResult } from '@/lib/door-operation';\nimport QRCode from 'qrcode';"
    )

# Fix boxName access
content = content.replace(
    "const boxName = box.boxName || box.boxNumber?.toString().padStart(2, '0') || '01';",
    "const boxName = box.boxNumber?.toString().padStart(2, '0') || '01';"
)

# Replace the door-open + pre-commit pattern
old_kpay = '''  // Create ExpressOrder
  const expressOrder = await db.expressOrder.create({
    data: {
      orderNo: orderNumber,
      deviceId: device.deviceId,
      boxName,
      boxSize,
      saveCode,
      pickCode,
      status: 'STORED',
      customerPhone,
      saveTime: new Date(),
    }
  });

  // Update box status
  await db.box.update({
    where: { id: box.id },
    data: { status: 'OCCUPIED', lastUsedAt: new Date() }
  });

  // Open the box via Bestwond
  let boxOpened = false;
  try {
    const { getCredentialsForDevice, expressSaveOrTakeWithCredentials } = await import('@/lib/bestwond');
    const credentials = await getCredentialsForDevice(device.id);
    const result = await expressSaveOrTakeWithCredentials(
      device.deviceId,
      boxSize as 'S' | 'M' | 'L' | 'XL',
      saveCode,
      'save',
      credentials
    );
    boxOpened = result.code === 0;
    console.log('[Kiosk Payment] Box open result:', result);
  } catch (error) {
    console.error('[Kiosk Payment] Failed to open box:', error);
  }'''

new_kpay = '''  // Create ExpressOrder (CREATED only — do NOT mark STORED until door opens)
  const expressOrder = await db.expressOrder.create({
    data: {
      orderNo: orderNumber,
      deviceId: device.deviceId,
      boxName,
      boxSize,
      saveCode,
      pickCode,
      status: 'CREATED',
      customerPhone,
    }
  });

  // Open the box via DoorOperationService (handles retry, fallback, verification)
  let boxOpened = false;
  let doorResult: DoorOperationResult | null = null;
  try {
    doorResult = await executeDoorOperation({
      orderId: `express:${expressOrder.id}`,
      orderNo: orderNumber,
      deviceId: device.id,
      deviceNumber: device.deviceId,
      boxId: box.id,
      boxNumber: parseInt(boxName),
      boxSize: boxSize as 'S' | 'M' | 'L' | 'XL',
      action: 'dropoff',
      actionCode: saveCode,
      idempotencyKey: `dropoff:${expressOrder.id}:${Date.now()}`,
      useExpressApi: true,
    });
    boxOpened = doorResult.success && doorResult.confirmed;
  } catch (error) {
    console.error('[Kiosk Payment] Failed to open box:', error);
  }

  // SAFETY: Only mark STORED + OCCUPIED after confirmed door opening
  if (boxOpened) {
    await db.expressOrder.update({
      where: { id: expressOrder.id },
      data: { status: 'STORED', saveTime: new Date() },
    });
    await db.box.update({
      where: { id: box.id },
      data: { status: 'OCCUPIED', lastUsedAt: new Date() }
    });
  } else {
    // Door didn't open — express order stays CREATED, box stays AVAILABLE
    await db.expressOrder.update({
      where: { id: expressOrder.id },
      data: { status: 'CREATED' },
    });
  }'''

content = content.replace(old_kpay, new_kpay)
write_file('/home/z/my-project/src/app/api/kiosk/payment/route.ts', content)

print("\n✅ All files patched successfully!")
print("Run 'git diff' to verify changes.")
