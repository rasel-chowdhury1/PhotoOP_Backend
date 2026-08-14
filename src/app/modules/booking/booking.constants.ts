import { AddOnKey } from "./booking.interface";

// server-side source of truth for add-on title/price, so a booking can't be created
// with a client-supplied (and therefore tamperable) price for a selected add-on.
// PLACEHOLDER PRICES — replace with real figures.
export const ADD_ON_CATALOG: Record<AddOnKey, { title: string; price: number }> = {
  [AddOnKey.EXTRA_RETOUCHING]: { title: "Extra Retouching", price: 25 },
  [AddOnKey.RUSH_DELIVERY]: { title: "Rush Delivery (24h)", price: 40 },
  [AddOnKey.EXTRA_EDITED_PHOTOS]: { title: "Extra Edited Photos (+10 photos)", price: 30 },
  [AddOnKey.RAW_FILES]: { title: "RAW Files", price: 50 },
  [AddOnKey.DRONE_SHOTS]: { title: "Drone Shots", price: 75 },
};

export const DEFAULT_SERVICE_FEE_PERCENTAGE = 5;
