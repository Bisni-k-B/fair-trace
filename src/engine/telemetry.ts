export type SpanType = 'INGEST' | 'PREEMPT' | 'SYNC' | 'AGING' | 'RESOLVE' | 'LEASE_EXPIRE';

export type TelemetrySpan = {
  id: string;
  nodeId: string;
  type: SpanType;
  timestamp: number;
  sectorId: string;
  metadata: Record<string, any>;
};

export class NexusTelemetry {
  private static history: TelemetrySpan[] = [];
  private static MAX_HISTORY = 100;

  public static emit(type: SpanType, nodeId: string, sectorId: string, metadata: Record<string, any> = {}) {
    const span: TelemetrySpan = {
      id: Math.random().toString(36).substring(7),
      nodeId,
      type,
      timestamp: Date.now(),
      sectorId,
      metadata
    };
    
    this.history = [span, ...this.history].slice(0, this.MAX_HISTORY);
    return span;
  }

  public static getHistory() {
    return [...this.history];
  }

  public static getTrace(nodeId: string) {
    return this.history.filter(s => s.nodeId === nodeId).sort((a, b) => a.timestamp - b.timestamp);
  }
  
  public static clear() {
    this.history = [];
  }
}
