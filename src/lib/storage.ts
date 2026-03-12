/**
 * Storage Fee Calculator for Dirty Hand Designs
 * 
 * Storage Policy:
 * - Days 1-3: FREE
 * - Days 4-7: $100 JMD/day
 * - Days 8-14: $150 JMD/day
 * - Days 15-30: $200 JMD/day
 * - After 30 days: Considered ABANDONED
 */

// Fee tiers (in JMD)
const FEE_TIERS = {
  FREE_DAYS: parseInt(process.env.STORAGE_FREE_DAYS || '3'),
  TIER1_RATE: parseInt(process.env.STORAGE_FEE_TIER1 || '100'),  // Days 4-7
  TIER2_RATE: parseInt(process.env.STORAGE_FEE_TIER2 || '150'),  // Days 8-14
  TIER3_RATE: parseInt(process.env.STORAGE_FEE_TIER3 || '200'),  // Days 15-30
  ABANDONED_DAYS: parseInt(process.env.ABANDONED_DAYS || '30'),
};

export interface StorageCalculation {
  totalDays: number;
  chargeableDays: number;
  storageFee: number;
  tierBreakdown: {
    tier1: { days: number; rate: number; subtotal: number };
    tier2: { days: number; rate: number; subtotal: number };
    tier3: { days: number; rate: number; subtotal: number };
  };
  isAbandoned: boolean;
  daysUntilAbandoned: number;
}

/**
 * Calculate storage fee based on days stored
 */
export function calculateStorageFee(storageStartDate: Date | number, currentDate: Date = new Date()): StorageCalculation | number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  
  // If storageStartDate is a number, treat it as total days
  let totalDays: number;
  if (typeof storageStartDate === 'number') {
    totalDays = storageStartDate;
  } else {
    // Calculate total days stored from date
    const diffTime = Math.abs(currentDate.getTime() - storageStartDate.getTime());
    totalDays = Math.ceil(diffTime / MS_PER_DAY);
  }
  
  // Determine if abandoned
  const isAbandoned = totalDays > FEE_TIERS.ABANDONED_DAYS;
  const daysUntilAbandoned = Math.max(0, FEE_TIERS.ABANDONED_DAYS - totalDays);
  
  // Calculate chargeable days (after free period)
  const chargeableDays = Math.max(0, totalDays - FEE_TIERS.FREE_DAYS);
  
  // Tier breakdown
  const tierBreakdown = {
    tier1: { days: 0, rate: FEE_TIERS.TIER1_RATE, subtotal: 0 },
    tier2: { days: 0, rate: FEE_TIERS.TIER2_RATE, subtotal: 0 },
    tier3: { days: 0, rate: FEE_TIERS.TIER3_RATE, subtotal: 0 },
  };
  
  if (chargeableDays > 0) {
    // Tier 1: Days 4-7 (up to 4 days)
    const tier1Days = Math.min(chargeableDays, 4);
    tierBreakdown.tier1.days = tier1Days;
    tierBreakdown.tier1.subtotal = tier1Days * FEE_TIERS.TIER1_RATE;
    
    // Tier 2: Days 8-14 (up to 7 days)
    if (chargeableDays > 4) {
      const tier2Days = Math.min(chargeableDays - 4, 7);
      tierBreakdown.tier2.days = tier2Days;
      tierBreakdown.tier2.subtotal = tier2Days * FEE_TIERS.TIER2_RATE;
    }
    
    // Tier 3: Days 15-30 (up to 16 days)
    if (chargeableDays > 11) {
      const tier3Days = Math.min(chargeableDays - 11, 16);
      tierBreakdown.tier3.days = tier3Days;
      tierBreakdown.tier3.subtotal = tier3Days * FEE_TIERS.TIER3_RATE;
    }
  }
  
  // Total storage fee
  const storageFee = 
    tierBreakdown.tier1.subtotal + 
    tierBreakdown.tier2.subtotal + 
    tierBreakdown.tier3.subtotal;
  
  const result = {
    totalDays,
    chargeableDays,
    storageFee,
    tierBreakdown,
    isAbandoned,
    daysUntilAbandoned,
  };
  
  // Return just the fee number for backward compatibility
  return storageFee;
}

/**
 * Get full storage calculation details
 */
export function getStorageCalculation(storageStartDate: Date | number, currentDate: Date = new Date()): StorageCalculation {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  
  // If storageStartDate is a number, treat it as total days
  let totalDays: number;
  if (typeof storageStartDate === 'number') {
    totalDays = storageStartDate;
  } else {
    // Calculate total days stored from date
    const diffTime = Math.abs(currentDate.getTime() - storageStartDate.getTime());
    totalDays = Math.ceil(diffTime / MS_PER_DAY);
  }
  
  // Determine if abandoned
  const isAbandoned = totalDays > FEE_TIERS.ABANDONED_DAYS;
  const daysUntilAbandoned = Math.max(0, FEE_TIERS.ABANDONED_DAYS - totalDays);
  
  // Calculate chargeable days (after free period)
  const chargeableDays = Math.max(0, totalDays - FEE_TIERS.FREE_DAYS);
  
  // Tier breakdown
  const tierBreakdown = {
    tier1: { days: 0, rate: FEE_TIERS.TIER1_RATE, subtotal: 0 },
    tier2: { days: 0, rate: FEE_TIERS.TIER2_RATE, subtotal: 0 },
    tier3: { days: 0, rate: FEE_TIERS.TIER3_RATE, subtotal: 0 },
  };
  
  if (chargeableDays > 0) {
    // Tier 1: Days 4-7 (up to 4 days)
    const tier1Days = Math.min(chargeableDays, 4);
    tierBreakdown.tier1.days = tier1Days;
    tierBreakdown.tier1.subtotal = tier1Days * FEE_TIERS.TIER1_RATE;
    
    // Tier 2: Days 8-14 (up to 7 days)
    if (chargeableDays > 4) {
      const tier2Days = Math.min(chargeableDays - 4, 7);
      tierBreakdown.tier2.days = tier2Days;
      tierBreakdown.tier2.subtotal = tier2Days * FEE_TIERS.TIER2_RATE;
    }
    
    // Tier 3: Days 15-30 (up to 16 days)
    if (chargeableDays > 11) {
      const tier3Days = Math.min(chargeableDays - 11, 16);
      tierBreakdown.tier3.days = tier3Days;
      tierBreakdown.tier3.subtotal = tier3Days * FEE_TIERS.TIER3_RATE;
    }
  }
  
  // Total storage fee
  const storageFee = 
    tierBreakdown.tier1.subtotal + 
    tierBreakdown.tier2.subtotal + 
    tierBreakdown.tier3.subtotal;
  
  return {
    totalDays,
    chargeableDays,
    storageFee,
    tierBreakdown,
    isAbandoned,
    daysUntilAbandoned,
  };
}

/**
 * Generate a unique order number
 * Format: DH-YYYYMMDD-XXXX
 */
export function generateOrderNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `DH-${year}${month}${day}-${random}`;
}

/**
 * Generate a 6-digit tracking code for pickup
 */
export function generateTrackingCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Format currency in JMD
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-JM', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-JM', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Format date for display (short)
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-JM', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/**
 * Calculate time ago
 */
export function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
  ];
  
  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
    }
  }
  
  return 'Just now';
}

/**
 * Get status badge color
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    // Order status
    PENDING: 'bg-yellow-500',
    STORED: 'bg-blue-500',
    READY: 'bg-green-500',
    PICKED_UP: 'bg-gray-500',
    ABANDONED: 'bg-red-500',
    CANCELLED: 'bg-red-400',
    
    // Payment status
    COMPLETED: 'bg-green-500',
    FAILED: 'bg-red-500',
    REFUNDED: 'bg-orange-500',
    
    // Device status
    ONLINE: 'bg-green-500',
    OFFLINE: 'bg-red-500',
    MAINTENANCE: 'bg-orange-500',
    
    // Box status
    AVAILABLE: 'bg-green-500',
    OCCUPIED: 'bg-blue-500',
    RESERVED: 'bg-yellow-500',
  };
  
  return colors[status] || 'bg-gray-500';
}

export { FEE_TIERS };
