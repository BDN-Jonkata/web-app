export class AIError extends Error {
  constructor(status,code,message,retryAfter) {
    super(message);
    this.name='AIError';
    this.status=status;
    this.code=code;
    this.retryAfter=retryAfter;
  }
}
