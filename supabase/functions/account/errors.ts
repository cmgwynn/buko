export class AccountError extends Error {
  constructor(message: string, public status = 503, public code = 'ACCOUNT_UNAVAILABLE') { super(message); }
}
