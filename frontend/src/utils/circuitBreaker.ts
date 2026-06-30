/**
 * Circuit Breaker pattern for backend IPC calls.
 * 
 * Prevents infinite retries when the backend is in a FATAL state.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail immediately
 * - HALF-OPEN: After timeout, allow one request to test recovery
 * 
 * Usage:
 *   const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30000 });
 *   const result = await breaker.execute(() => ipcCall());
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF-OPEN';

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms to wait before trying HALF-OPEN */
  resetTimeoutMs: number;
  /** Number of successful calls in HALF-OPEN to close the circuit */
  halfOpenSuccessThreshold?: number;
  /** Callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalRejected: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalRequests = 0;
  private totalFailures = 0;
  private totalRejected = 0;
  private readonly config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: config.failureThreshold,
      resetTimeoutMs: config.resetTimeoutMs,
      halfOpenSuccessThreshold: config.halfOpenSuccessThreshold ?? 1,
      onStateChange: config.onStateChange ?? (() => {}),
    };
  }

  /**
   * Get current circuit state.
   */
  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF-OPEN
    if (this.state === 'OPEN' && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.transitionTo('HALF-OPEN');
      }
    }
    return this.state;
  }

  /**
   * Get circuit statistics.
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalRejected: this.totalRejected,
    };
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitBrokenError if circuit is OPEN.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit is OPEN
    if (this.getState() === 'OPEN') {
      this.totalRejected++;
      throw new CircuitBrokenError(
        `Circuit breaker is OPEN. Backend unavailable. Retry after ${this.getRetryAfterMs()}ms.`,
        this.getRetryAfterMs(),
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record a successful call.
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.successCount++;

    if (this.state === 'HALF-OPEN') {
      if (this.successCount >= this.config.halfOpenSuccessThreshold) {
        this.transitionTo('CLOSED');
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed call.
   */
  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;
    this.totalFailures++;

    if (this.state === 'HALF-OPEN') {
      // Failure in HALF-OPEN goes back to OPEN
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED') {
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo('OPEN');
      }
    }
  }

  /**
   * Transition to a new state.
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    this.config.onStateChange(oldState, newState);

    // Reset counters on state transition
    if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === 'HALF-OPEN') {
      this.successCount = 0;
    } else if (newState === 'OPEN') {
      this.successCount = 0;
    }
  }

  /**
   * Get time in ms until circuit allows HALF-OPEN attempt.
   */
  getRetryAfterMs(): number {
    if (this.state !== 'OPEN' || !this.lastFailureTime) return 0;
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.config.resetTimeoutMs - elapsed);
  }

  /**
   * Manually reset the circuit to CLOSED state.
   */
  reset(): void {
    this.transitionTo('CLOSED');
  }

  /**
   * Manually trip the circuit to OPEN state.
   */
  trip(): void {
    this.transitionTo('OPEN');
    this.lastFailureTime = Date.now();
  }
}

/**
 * Error thrown when circuit is OPEN.
 */
export class CircuitBrokenError extends Error {
  public readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'CircuitBrokenError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Create a circuit breaker with default settings for ANTARES backend.
 */
export function createBackendCircuitBreaker(
  onStateChange?: (from: CircuitState, to: CircuitState) => void,
): CircuitBreaker {
  return new CircuitBreaker({
    failureThreshold: 3,           // Open after 3 consecutive failures
    resetTimeoutMs: 30_000,        // Try HALF-OPEN after 30 seconds
    halfOpenSuccessThreshold: 1,   // Close after 1 successful call
    onStateChange: (from, to) => {
      console.log(`[CircuitBreaker] ${from} → ${to}`);
      onStateChange?.(from, to);
    },
  });
}
