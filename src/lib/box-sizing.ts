/**
 * Box Size Recommendation System
 * 
 * Suggests appropriate box size based on package dimensions
 * Box sizes: S (Small), M (Medium), L (Large), XL (Extra Large)
 */

export interface PackageDimensions {
  length: number; // cm
  width: number;  // cm
  height: number; // cm
  weight?: number; // kg
}

export interface BoxSize {
  code: string;
  name: string;
  maxLength: number;
  maxWidth: number;
  maxHeight: number;
  maxWeight: number;
  price: number; // Base storage fee multiplier
  description: string;
}

// Define available box sizes (typical locker compartment sizes)
export const BOX_SIZES: BoxSize[] = [
  {
    code: 'S',
    name: 'Small',
    maxLength: 25,
    maxWidth: 20,
    maxHeight: 15,
    maxWeight: 2,
    price: 1.0,
    description: 'Letters, small packages, phones, jewelry',
  },
  {
    code: 'M',
    name: 'Medium',
    maxLength: 35,
    maxWidth: 30,
    maxHeight: 25,
    maxWeight: 5,
    price: 1.25,
    description: 'Shoes, clothing, books, small electronics',
  },
  {
    code: 'L',
    name: 'Large',
    maxLength: 50,
    maxWidth: 40,
    maxHeight: 35,
    maxWeight: 10,
    price: 1.5,
    description: 'Larger boxes, multiple items, appliances',
  },
  {
    code: 'XL',
    name: 'Extra Large',
    maxLength: 70,
    maxWidth: 50,
    maxHeight: 45,
    maxWeight: 20,
    price: 2.0,
    description: 'Bulky items, large boxes, suitcases',
  },
];

/**
 * Recommend box size based on package dimensions
 */
export function recommendBoxSize(dimensions: PackageDimensions): {
  recommended: BoxSize;
  fits: boolean;
  alternatives: BoxSize[];
  reason: string;
} {
  const { length, width, height, weight = 0 } = dimensions;
  
  // Sort box sizes from smallest to largest
  const sortedSizes = [...BOX_SIZES].sort((a, b) => 
    (a.maxLength * a.maxWidth * a.maxHeight) - (b.maxLength * b.maxWidth * b.maxHeight)
  );

  let recommended: BoxSize | null = null;
  const alternatives: BoxSize[] = [];

  for (const box of sortedSizes) {
    const fitsLength = length <= box.maxLength;
    const fitsWidth = width <= box.maxWidth;
    const fitsHeight = height <= box.maxHeight;
    const fitsWeight = weight <= box.maxWeight;

    if (fitsLength && fitsWidth && fitsHeight && fitsWeight) {
      if (!recommended) {
        recommended = box;
      } else {
        alternatives.push(box);
      }
    }
  }

  // If no box fits, recommend the largest
  if (!recommended) {
    const largest = sortedSizes[sortedSizes.length - 1];
    return {
      recommended: largest,
      fits: false,
      alternatives: [],
      reason: `Package exceeds largest box dimensions. Max: ${largest.maxLength}x${largest.maxWidth}x${largest.maxHeight}cm. Consider special handling.`,
    };
  }

  // Calculate utilization
  const packageVolume = length * width * height;
  const boxVolume = recommended.maxLength * recommended.maxWidth * recommended.maxHeight;
  const utilization = (packageVolume / boxVolume) * 100;

  let reason = `${recommended.name} box recommended. Space utilization: ${utilization.toFixed(0)}%.`;
  
  if (utilization < 30) {
    reason += ' Package is small for this box. Consider if a smaller size is available.';
  } else if (utilization > 80) {
    reason += ' Good fit! Package uses most of the box space.';
  }

  return {
    recommended,
    fits: true,
    alternatives,
    reason,
  };
}

/**
 * Calculate storage fee based on box size and days
 */
export function calculateStorageFee(
  boxSize: string,
  days: number,
  baseFee: number = 100, // Base fee per day after free period
  freeDays: number = 3
): number {
  const box = BOX_SIZES.find(b => b.code === boxSize);
  const priceMultiplier = box?.price || 1;
  
  if (days <= freeDays) {
    return 0;
  }

  const chargeableDays = days - freeDays;
  
  // Tiered pricing
  let fee = 0;
  if (chargeableDays <= 7) {
    // Days 4-10: Base rate
    fee = chargeableDays * baseFee * priceMultiplier;
  } else if (chargeableDays <= 14) {
    // Days 11-17: 1.5x rate
    fee = (7 * baseFee * priceMultiplier) + 
          ((chargeableDays - 7) * baseFee * 1.5 * priceMultiplier);
  } else {
    // Days 18+: 2x rate
    fee = (7 * baseFee * priceMultiplier) + 
          (7 * baseFee * 1.5 * priceMultiplier) +
          ((chargeableDays - 14) * baseFee * 2 * priceMultiplier);
  }

  return Math.round(fee);
}

/**
 * Estimate package dimensions from courier tracking
 * This is a placeholder - real implementation would integrate with courier APIs
 */
export function estimateFromCourierInfo(
  courierName: string,
  trackingNumber: string,
  packageType?: string
): PackageDimensions {
  // Default dimensions based on common package types
  const defaults: Record<string, PackageDimensions> = {
    'letter': { length: 25, width: 18, height: 2, weight: 0.5 },
    'document': { length: 35, width: 25, height: 5, weight: 1 },
    'small_parcel': { length: 30, width: 25, height: 15, weight: 2 },
    'medium_parcel': { length: 45, width: 35, height: 25, weight: 5 },
    'large_parcel': { length: 60, width: 45, height: 35, weight: 10 },
  };

  if (packageType && defaults[packageType.toLowerCase()]) {
    return defaults[packageType.toLowerCase()];
  }

  // Default to medium parcel
  return defaults['medium_parcel'];
}

/**
 * Format box size for display
 */
export function formatBoxSize(box: BoxSize): string {
  return `${box.code} (${box.maxLength}x${box.maxWidth}x${box.maxHeight}cm, up to ${box.maxWeight}kg)`;
}
