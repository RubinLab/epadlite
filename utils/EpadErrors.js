// based on https://rclayton.silvrback.com/custom-errors-in-node-js
class EpadError extends Error {
  constructor(message) {
    super(message);
    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name;
    // This clips the constructor invocation from the stack trace.
    // It's not absolutely essential, but it does make the stack trace a little nicer.
    //  @see Node.js reference (bottom)
    Error.captureStackTrace(this, this.constructor);
  }
}

class ResourceNotFoundError extends EpadError {
  constructor(resourceType, resourceId) {
    super(`${resourceType} ${resourceId} was not found.`);
    this.data = { resourceType, resourceId };
  }
}

class InternalError extends EpadError {
  constructor(reason, error) {
    super(`${reason}. Error: ${error.message}`);
    this.data = { error, reason };
  }
}

class BadRequestError extends EpadError {
  constructor(reason, error) {
    super(`${reason}. Error: ${error.message}`);
    this.data = { error, reason };
  }
}

class UnauthenticatedError extends EpadError {
  constructor(message) {
    super(message);
    this.data = { message };
  }
}

class UnauthorizedError extends EpadError {
  constructor(message) {
    super(message);
    this.data = { message };
  }
}

module.exports = {
  ResourceNotFoundError,
  InternalError,
  BadRequestError,
  UnauthenticatedError,
  UnauthorizedError,
};
