// =============================================================================
// Typed domain errors.
//
// Every domain error carries an HTTP status and a *public* message that is safe
// to return to clients. Internal/DB details must never be placed in
// `publicMessage` — the central error handler relies on this contract.
// =============================================================================

export class AppError extends Error {
  public readonly httpStatus: number;
  public readonly publicMessage: string;

  constructor(httpStatus: number, publicMessage: string, internalMessage?: string) {
    super(internalMessage ?? publicMessage);
    this.name = new.target.name;
    this.httpStatus = httpStatus;
    this.publicMessage = publicMessage;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(publicMessage = 'Ресурс не найден.', internalMessage?: string) {
    super(404, publicMessage, internalMessage);
  }
}

export class ValidationError extends AppError {
  constructor(publicMessage = 'Некорректные данные запроса.', internalMessage?: string) {
    super(400, publicMessage, internalMessage);
  }
}

export class AuthError extends AppError {
  constructor(publicMessage = 'Требуется авторизация.', internalMessage?: string) {
    super(401, publicMessage, internalMessage);
  }
}

export class ForbiddenError extends AppError {
  constructor(publicMessage = 'Недостаточно прав для этого действия.', internalMessage?: string) {
    super(403, publicMessage, internalMessage);
  }
}

export class InsufficientStockError extends AppError {
  public readonly itemName: string;
  public readonly available: number;
  public readonly required: number;

  constructor(itemName: string, available: number, required: number) {
    super(
      409,
      `Недостаточно материала: ${itemName}. Остаток: ${available}. Требуется: ${required}.`,
      `Insufficient stock for "${itemName}": available=${available}, required=${required}`,
    );
    this.itemName = itemName;
    this.available = available;
    this.required = required;
  }
}
