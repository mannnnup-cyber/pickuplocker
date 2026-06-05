import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { jwtVerify } from "jose"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

// One-time setup endpoint: seeds database
// Auth: either logged-in admin cookie OR ?key=CRON_SECRET/AUTH_SECRET
async function isAuthorized(request: NextRequest): Promise<boolean> {
  // Method 1: Check admin session cookie
  try {
    const secret = process.env.AUTH_SECRET
    if (secret) {
      const cookieStore = await cookies()
      const token = cookieStore.get("auth_token")?.value
      if (token) {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret))
        if (payload.role === "ADMIN") return true
      }
    }
  } catch {
    // Cookie auth failed, try key method
  }

  // Method 2: Check setup key
  const setupKey = request.nextUrl.searchParams.get("key")
  const cronSecret = process.env.CRON_SECRET || process.env.AUTH_SECRET
  if (cronSecret && setupKey === cronSecret) return true

  return false
}

export async function GET(request: NextRequest) {
  try {
    const authorized = await isAuthorized(request)
    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized. Log in as admin first, or provide ?key=YOUR_SECRET" },
        { status: 401 }
      )
    }

    const results: string[] = []

    // ============================================
    // Step 1: Create Device + Boxes
    // ============================================
    const bestwondDeviceId = process.env.BESTWOND_DEVICE_ID || "2100018247"
    const bestwondAppId = process.env.BESTWOND_APP_ID || ""
    const bestwondAppSecret = process.env.BESTWOND_APP_SECRET || ""

    const device1 = await db.device.upsert({
      where: { deviceId: bestwondDeviceId },
      update: {
        bestwondAppId: bestwondAppId || undefined,
        bestwondAppSecret: bestwondAppSecret || undefined,
      },
      create: {
        deviceId: bestwondDeviceId,
        name: "Pickup Locker - Jamaica",
        location: "Jamaica",
        description: "Primary smart locker in Jamaica",
        totalBoxes: 36,
        availableBoxes: 28,
        status: "ONLINE",
        bestwondAppId: bestwondAppId || null,
        bestwondAppSecret: bestwondAppSecret || null,
      },
    })
    results.push(`Device: ${device1.name} (${device1.deviceId})`)

    // Create 36 boxes
    let boxesCreated = 0
    for (let i = 1; i <= 36; i++) {
      const existing = await db.box.findFirst({
        where: { deviceId: device1.id, boxNumber: i },
      })
      if (!existing) {
        await db.box.create({
          data: {
            boxNumber: i,
            deviceId: device1.id,
            status: i <= 28 ? "AVAILABLE" : "OCCUPIED",
            size: i <= 10 ? "S" : i <= 20 ? "M" : i <= 30 ? "L" : "XL",
          },
        })
        boxesCreated++
      }
    }
    results.push(`Boxes: ${boxesCreated} created (36 total)`)

    // ============================================
    // Step 2: Create Admin + Staff Users
    // ============================================
    const SALT_ROUNDS = 10

    // Admin user
    const adminPassword = process.env.ADMIN_PASSWORD || "pickup2024"
    const adminPasswordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS)
    const adminPinHash = await bcrypt.hash("1234", SALT_ROUNDS)

    const admin = await db.user.upsert({
      where: { email: "admin@pickupja.com" },
      update: {
        passwordHash: adminPasswordHash,
        pinHash: adminPinHash,
      },
      create: {
        email: "admin@pickupja.com",
        username: "admin",
        name: "Admin User",
        passwordHash: adminPasswordHash,
        pinHash: adminPinHash,
        role: "ADMIN",
        isActive: true,
      },
    })
    results.push(`Admin: ${admin.username} / ${adminPassword} (PIN: 1234)`)

    // Staff user
    const staff1PinHash = await bcrypt.hash("1111", SALT_ROUNDS)
    const staff1 = await db.user.upsert({
      where: { email: "staff1@pickupja.com" },
      update: { pinHash: staff1PinHash },
      create: {
        email: "staff1@pickupja.com",
        username: "staff1",
        name: "Staff Member",
        pinHash: staff1PinHash,
        role: "OPERATOR",
        isActive: true,
      },
    })
    results.push(`Staff: ${staff1.username} (PIN: 1111)`)

    // Operator user
    const opPassword = process.env.OPERATOR_PASSWORD || "operator2024"
    const opPasswordHash = await bcrypt.hash(opPassword, SALT_ROUNDS)
    const opPinHash = await bcrypt.hash("5678", SALT_ROUNDS)

    const operator = await db.user.upsert({
      where: { email: "operator@pickupja.com" },
      update: {
        passwordHash: opPasswordHash,
        pinHash: opPinHash,
      },
      create: {
        email: "operator@pickupja.com",
        username: "operator",
        name: "Operator User",
        passwordHash: opPasswordHash,
        pinHash: opPinHash,
        role: "OPERATOR",
        isActive: true,
      },
    })
    results.push(`Operator: ${operator.username} / ${opPassword} (PIN: 5678)`)

    // ============================================
    // Step 3: Create Couriers
    // ============================================
    const courier1 = await db.courier.upsert({
      where: { code: "KE" },
      update: {},
      create: {
        name: "Knutsford Express",
        code: "KE",
        contactPerson: "John Smith",
        phone: "876-555-1000",
        email: "logistics@knutsford.com",
        address: "Kingston, Jamaica",
        status: "ACTIVE",
        balance: 5000,
        creditLimit: 10000,
        autoReload: true,
        autoReloadAmount: 2000,
        minBalance: 1000,
        totalDropOffs: 45,
        totalSpent: 15000,
      },
    })
    results.push(`Courier: ${courier1.name}`)

    const courier2 = await db.courier.upsert({
      where: { code: "ZM" },
      update: {},
      create: {
        name: "ZipMail",
        code: "ZM",
        contactPerson: "Jane Doe",
        phone: "876-555-2000",
        email: "support@zipmail.com",
        address: "New Kingston, Jamaica",
        status: "ACTIVE",
        balance: 2500,
        creditLimit: 5000,
        autoReload: false,
        totalDropOffs: 23,
        totalSpent: 8500,
      },
    })
    results.push(`Courier: ${courier2.name}`)

    const courier3 = await db.courier.upsert({
      where: { code: "DH" },
      update: {},
      create: {
        name: "Dirty Hand Designs",
        code: "DH",
        contactPerson: "Mark Brown",
        phone: "876-555-3000",
        email: "info@dirtyhanddesigns.com",
        address: "UTech Campus, Kingston",
        status: "ACTIVE",
        balance: 10000,
        creditLimit: 20000,
        autoReload: true,
        autoReloadAmount: 5000,
        minBalance: 2000,
        totalDropOffs: 120,
        totalSpent: 45000,
      },
    })
    results.push(`Courier: ${courier3.name}`)

    // ============================================
    // Step 4: Sample Customers + Orders
    // ============================================
    const customer1 = await db.user.upsert({
      where: { email: "john.brown@email.com" },
      update: {},
      create: {
        email: "john.brown@email.com",
        name: "John Brown",
        phone: "876-555-0101",
        role: "CUSTOMER",
      },
    })

    const customer2 = await db.user.upsert({
      where: { email: "sarah.jones@email.com" },
      update: {},
      create: {
        email: "sarah.jones@email.com",
        name: "Sarah Jones",
        phone: "876-555-0202",
        role: "CUSTOMER",
      },
    })

    const existingOrders = await db.order.count()
    if (existingOrders === 0) {
      await db.order.createMany({
        data: [
          {
            orderNumber: "DH-20250115-001",
            trackingCode: "123456",
            customerId: customer1.id,
            customerName: "John Brown",
            customerPhone: "876-555-0101",
            deviceId: device1.id,
            boxNumber: 5,
            status: "STORED",
            storageStartAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            storageDays: 2,
            storageFee: 0,
          },
          {
            orderNumber: "DH-20250114-003",
            trackingCode: "789012",
            customerId: customer2.id,
            customerName: "Sarah Jones",
            customerPhone: "876-555-0202",
            deviceId: device1.id,
            boxNumber: 12,
            status: "STORED",
            storageStartAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            storageDays: 5,
            storageFee: 200,
            courierName: "Knutsford Express",
            courierId: courier1.id,
          },
        ],
      })
      results.push("Sample orders: 2 created")
    } else {
      results.push(`Sample orders: skipped (${existingOrders} already exist)`)
    }

    // ============================================
    // Step 5: System Settings
    // ============================================
    const existingSettings = await db.setting.count()
    if (existingSettings === 0) {
      await db.setting.createMany({
        data: [
          { key: "free_storage_days", value: "3", description: "Number of free storage days" },
          { key: "tier1_fee", value: "100", description: "Daily fee for days 4-7 (JMD)" },
          { key: "tier2_fee", value: "150", description: "Daily fee for days 8-14 (JMD)" },
          { key: "tier3_fee", value: "200", description: "Daily fee for days 15-30 (JMD)" },
          { key: "max_storage_days", value: "30", description: "Maximum storage days before abandoned" },
          { key: "brand_name", value: "Pickup", description: "Brand name for display" },
          { key: "contact_phone", value: "876-XXX-XXXX", description: "Contact phone number" },
          { key: "contact_email", value: "support@pickupja.com", description: "Contact email address" },
        ],
      })
      results.push("Settings: 8 created")
    } else {
      results.push(`Settings: skipped (${existingSettings} already exist)`)
    }

    // ============================================
    // Step 6: SMS Templates
    // ============================================
    const existingSmsTemplates = await db.smsTemplate.count()
    if (existingSmsTemplates === 0) {
      await db.smsTemplate.createMany({
        data: [
          {
            key: "pickup_notification",
            name: "Pickup Notification",
            description: "Sent when a package is stored in the locker",
            template: "Hi {{customerName}}! Your package is ready for pickup.\n\nTracking Code: {{trackingCode}}\nLocation: {{location}}\nFree pickup until: {{expiryDate}}\n\nVisit pickupja.com and enter your code to collect.\n\n{{signature}}",
            variables: JSON.stringify(["customerName", "trackingCode", "location", "expiryDate", "signature"]),
            isActive: true,
          },
          {
            key: "pickup_confirmation",
            name: "Pickup Confirmation",
            description: "Sent when customer picks up their package",
            template: "Hi {{customerName}}! You have successfully picked up your package. Thank you for using Pickup!\n\n{{signature}}",
            variables: JSON.stringify(["customerName", "signature"]),
            isActive: true,
          },
          {
            key: "storage_fee",
            name: "Storage Fee Notice",
            description: "Sent when storage fee applies",
            template: "Hi {{customerName}}, your package has been stored for {{storageDays}} days. Storage fee: JMD ${{fee}}. Please pay when picking up.\n\n{{signature}}",
            variables: JSON.stringify(["customerName", "storageDays", "fee", "signature"]),
            isActive: true,
          },
          {
            key: "overdue_reminder",
            name: "Overdue Reminder",
            description: "Sent when package is approaching abandonment",
            template: "Hi {{customerName}}, your package has been stored for {{storageDays}} days. Total fee: JMD ${{totalFee}}. Please pick up within {{daysUntilAbandoned}} days to avoid abandonment. Contact {{supportPhone}} for help.\n\n{{signature}}",
            variables: JSON.stringify(["customerName", "storageDays", "totalFee", "daysUntilAbandoned", "supportPhone", "signature"]),
            isActive: true,
          },
        ],
      })
      results.push("SMS Templates: 4 created")
    } else {
      results.push(`SMS Templates: skipped (${existingSmsTemplates} already exist)`)
    }

    // Count total users
    const userCount = await db.user.count()
    const orderCount = await db.order.count()
    const boxCount = await db.box.count()

    return NextResponse.json({
      success: true,
      message: "Database setup complete!",
      results,
      stats: {
        users: userCount,
        orders: orderCount,
        boxes: boxCount,
      },
      loginCredentials: {
        admin: { username: "admin", password: "pickup2024", pin: "1234" },
        staff: { username: "staff1", pin: "1111" },
        operator: { username: "operator", password: "operator2024", pin: "5678" },
      },
    })
  } catch (error) {
    console.error("Setup error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Setup failed",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
