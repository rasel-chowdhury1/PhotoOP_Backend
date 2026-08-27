import { PayoutMethodType } from "./payoutMethod.model";

export type TBankAccountDetails = {
  accountHolderName: string;
  accountNumber: string;
  bankName: string;
  routingNumber?: string;
  swiftCode?: string;
};

export type TPaypalAccountDetails = {
  paypalEmail: string;
};

export type TStripeAccountDetails = {
  stripeAccountId: string;
};

export type TPayoutAccountDetails =
  | TBankAccountDetails
  | TPaypalAccountDetails
  | TStripeAccountDetails;

export interface ICreatePayoutMethodPayload {
  type: PayoutMethodType;
  provider?: string;
  accountDetails: TPayoutAccountDetails;
  accountName?: string;
}

export interface IUpdatePayoutMethodPayload {
  provider?: string;
  accountDetails?: TPayoutAccountDetails;
  accountName?: string;
}

// what the API is actually allowed to return — accountDetails never leaves the server
export interface ISafePayoutMethod {
  _id: unknown;
  // populated (fullName/email/profileImage) for the admin listing, the bare id
  // otherwise — harmless either way since a snapper already knows their own id
  snapperId: unknown;
  type: PayoutMethodType;
  provider: string | null;
  last4: string | null;
  accountName: string | null;
  isDefault: boolean;
  isVerified: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
