export interface CallbackRequest {
  message: string;
  signature: string;
  account: string;
  signatureType: string;
}

export interface TokenResponse {
  token: string;
  expiresIn: number;
}
