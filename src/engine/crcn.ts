import type { AIBrief } from './ai_dispatcher';

export type Urgency = 1 | 2 | 3; // 1: Medium, 2: High, 3: Critical

export type ProcessNode = {
  id: string;
  location: string;
  issue: string;
  urgency: Urgency;
  timestamp: number;
  waitingSince?: number; // timestamp when entered waiting pool
  aiBrief?: AIBrief;
  governanceScore?: number;
  source: 'web' | 'whatsapp' | 'telegram' | 'instagram';
  evidence?: {
    type: 'vision' | 'voice';
    url: string;
    isVerified: boolean;
  };
};

export type ResourceType = 'MEDICAL' | 'FIRE' | 'STRUCTURAL' | 'LOGISTICS';

export type Resource = {
  id: string;
  type: ResourceType;
  status: 'IDLE' | 'BUSY' | 'MAINTENANCE';
  currentTask?: string;
  capabilities: string[];
};

export type SlotInfo = {
  node: ProcessNode | null;
  resource?: Resource;
  leaseExpiry: number; // timestamp
};

export class WinningStrategy {
  public static AGING_FACTOR = 0.5; // weight for wait time
  public static URGENCY_WEIGHT = [0, 15, 35, 60]; // Medium, High, Critical
  public static AI_CONFIDENCE_WEIGHT = 20;
  public static RISK_WEIGHT = 50; // Heavy weight for Predictive Risk

  public static calculate(node: ProcessNode): number {
    const now = Date.now();
    const waitTimeSec = node.waitingSince ? (now - node.waitingSince) / 1000 : 0;
    
    let score = this.URGENCY_WEIGHT[node.urgency] || 0;
    score += waitTimeSec * this.AGING_FACTOR;
    
    if (node.aiBrief) {
      score += node.aiBrief.confidenceScore * this.AI_CONFIDENCE_WEIGHT;
      // THE AI INNOVATION: Escalation Index (Risk Score)
      score += node.aiBrief.escalationIndex * this.RISK_WEIGHT;
    }
    
    return Number(score.toFixed(2));
  }
}

export class CRCNQueue {
  private items: ProcessNode[] = [];

  public id: string;
  constructor(id: string) {
    this.id = id;
  }

  push(node: ProcessNode) {
    this.items.push(node);
    this.items.sort((a, b) => b.urgency - a.urgency || a.timestamp - b.timestamp);
  }

  pop(): ProcessNode | undefined {
    return this.items.shift();
  }

  remove(id: string) {
    this.items = this.items.filter(item => item.id !== id);
  }

  get nodes() { return [...this.items]; }
  get length() { return this.items.length; }
}

export class CRCNWaitingPool {
  private items: ProcessNode[] = [];
  public agingRate = 0.05; // points per second

  private calculateScore(node: ProcessNode, now: number): number {
    if (!node.waitingSince) return node.urgency;
    const ticksWaited = (now - node.waitingSince) / 1000;
    return node.urgency + (this.agingRate * ticksWaited);
  }

  offer(node: ProcessNode) {
    if (!node.waitingSince) node.waitingSince = Date.now();
    this.items.push(node);
    this.sortPool();
  }

  sortPool() {
    this.items.sort((a, b) => WinningStrategy.calculate(b) - WinningStrategy.calculate(a));
  }

  poll(): ProcessNode | undefined {
    const node = this.items.shift();
    if (node) delete node.waitingSince;
    return node;
  }

  get nodes() { return [...this.items]; }
  get length() { return this.items.length; }

  getEffectiveScores() {
    const now = Date.now();
    return this.items.map(n => ({ id: n.id, score: this.calculateScore(n, now) }));
  }
}

export class CRCNEngine {
  public slots: SlotInfo[];
  public queues: CRCNQueue[];
  public waitingPool: CRCNWaitingPool;
  public n: number;
  public LEASE_TTL = 10000; // 10 seconds

  constructor(n: number, numQueues: number) {
    this.n = n;
    const resourceTypes: ResourceType[] = ['FIRE', 'MEDICAL', 'STRUCTURAL', 'LOGISTICS'];
    this.slots = Array.from({ length: n }, (_, i) => ({
      node: null,
      resource: {
        id: `RES-${i + 1}`,
        type: resourceTypes[i % resourceTypes.length],
        status: 'IDLE',
        capabilities: ['Standard response']
      },
      leaseExpiry: 0
    }));
    this.queues = Array.from({ length: numQueues }, (_, i) => new CRCNQueue(`Queue-${i}`));
    this.waitingPool = new CRCNWaitingPool();
  }

  private findWeakestSlotIndex(): number {
    let minScore = Infinity;
    let weakestIdx = -1;
    for (let i = 0; i < this.n; i++) {
        const node = this.slots[i].node;
        if (node) {
            const score = WinningStrategy.calculate(node);
            if (score < minScore) {
                minScore = score;
                weakestIdx = i;
            }
        }
    }
    return weakestIdx;
  }

  private findLeastLoadedQueue(): CRCNQueue {
    return this.queues.reduce((prev, curr) => prev.length <= curr.length ? prev : curr);
  }

  private roundRobinIdx = 0;
  private getRoundRobinQueue(): CRCNQueue {
    const q = this.queues[this.roundRobinIdx];
    this.roundRobinIdx = (this.roundRobinIdx + 1) % this.queues.length;
    return q;
  }

  private assignToSlot(idx: number, node: ProcessNode) {
    const slot = this.slots[idx];
    slot.node = node;
    slot.leaseExpiry = Date.now() + this.LEASE_TTL;
    if (slot.resource) {
        slot.resource.status = 'BUSY';
        slot.resource.currentTask = node.id;
    }
    const targetQueue = node.urgency >= 2 ? this.findLeastLoadedQueue() : this.getRoundRobinQueue();
    targetQueue.push(node);
  }

  private findBestSlotForRequest(node: ProcessNode): number {
    // Logic: Find IDLE slot matching resource type if possible
    const issueMap: Record<string, ResourceType> = {
        'Fire': 'FIRE',
        'Medical': 'MEDICAL',
        'Structural': 'STRUCTURAL',
        'Collapse': 'STRUCTURAL',
        'Chemical': 'FIRE',
        'Power': 'LOGISTICS'
    };

    const preferredType = Object.entries(issueMap).find(([k]) => node.issue.includes(k))?.[1];
    
    // First pass: Find IDLE slot with preferred type
    let bestIdx = this.slots.findIndex(s => s.node === null && s.resource?.type === preferredType);
    
    // Second pass: Any IDLE slot
    if (bestIdx === -1) {
        bestIdx = this.slots.findIndex(s => s.node === null);
    }
    
    return bestIdx;
  }

  public heartbeat(idx: number) {
    if (this.slots[idx].node) {
      this.slots[idx].leaseExpiry = Date.now() + this.LEASE_TTL;
    }
  }

  public checkLeases(): number[] {
    const now = Date.now();
    const expiredIndices: number[] = [];
    for (let i = 0; i < this.n; i++) {
        const slot = this.slots[i];
        if (slot.node && now > slot.leaseExpiry) {
            expiredIndices.push(i);
            const expiredNode = slot.node;
            // Re-queue the node
            this.waitingPool.offer(expiredNode);
            // Free the slot
            this.queues.forEach(q => q.remove(expiredNode.id));
            slot.node = null;
            slot.leaseExpiry = 0;
            
            // Immediately fill if possible
            this.drainWaitingPool(i);
        }
    }
    return expiredIndices;
  }

  private drainWaitingPool(idx: number) {
    const next = this.waitingPool.poll();
    if (next) {
        this.assignToSlot(idx, next);
    }
  }

  public processRequest(request: ProcessNode): { action: 'CONNECT' | 'SWAP' | 'WAIT'; ejected?: ProcessNode | null } {
    // 1. Check for best/free slot
    const bestSlotIdx = this.findBestSlotForRequest(request);
    if (bestSlotIdx !== -1) {
      this.assignToSlot(bestSlotIdx, request);
      return { action: 'CONNECT' };
    }

    // 2. Check for preemption (Predictive Winning Strategy)
    const weakestIdx = this.findWeakestSlotIndex();
    if (weakestIdx !== -1) {
        const weakestNode = this.slots[weakestIdx].node;
        if (weakestNode) {
            const requestScore = WinningStrategy.calculate(request);
            const weakestScore = WinningStrategy.calculate(weakestNode);
            
            // PREEMPTION LOGIC: Factor in the Predictive Risk Score
            if (requestScore > weakestScore * 1.5 || (request.urgency > weakestNode.urgency && requestScore > weakestScore)) {
                this.queues.forEach(q => q.remove(weakestNode.id));
                this.waitingPool.offer(weakestNode);
                this.assignToSlot(weakestIdx, request);
                return { action: 'SWAP', ejected: weakestNode };
            }
        }
    }

    // 3. Go to waiting pool
    this.waitingPool.offer(request);
    return { action: 'WAIT' };
  }

  public releaseSlot(index: number) {
    const slot = this.slots[index];
    const completedNode = slot.node;
    if (completedNode) {
        this.queues.forEach(q => q.remove(completedNode.id));
        slot.node = null;
        slot.leaseExpiry = 0;
        if (slot.resource) {
            slot.resource.status = 'IDLE';
            slot.resource.currentTask = undefined;
        }
        this.drainWaitingPool(index);
    }
  }
}
