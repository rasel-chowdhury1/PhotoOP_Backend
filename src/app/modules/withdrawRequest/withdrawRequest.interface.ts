export interface ICreateWithdrawPayload {
  amount: number;
  paymentMethodId: string;
  notes?: string;
}

export interface IProcessWithdrawPayload {
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  transactionId?: string;
  failureReason?: string;
}
