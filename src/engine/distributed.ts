import { CRCNEngine } from './crcn';
import type { ProcessNode } from './crcn';
import { NexusTelemetry } from './telemetry';

export interface ClusterState {
  id: string;
  isOnline: boolean;
  localNodes: ProcessNode[];
  syncProgress: number; // 0 to 100
}

export class EdgeCluster {
  public engine: CRCNEngine;
  public id: string;
  public isOnline: boolean = true;
  private syncLog: ProcessNode[] = [];

  constructor(id: string, numSlots: number) {
    this.id = id;
    this.engine = new CRCNEngine(numSlots, 1);
  }

  public toggleConnectivity() {
    this.isOnline = !this.isOnline;
    return this.isOnline;
  }

  public processLocal(node: ProcessNode) {
    NexusTelemetry.emit('INGEST', node.id, this.id, { urgency: node.urgency });
    const result = this.engine.processRequest(node);
    
    if (result.action === 'SWAP' && result.ejected) {
      NexusTelemetry.emit('PREEMPT', result.ejected.id, this.id, { replacedBy: node.id });
    }
    
    if (!this.isOnline) {
      this.syncLog.push(node);
    }
    return result;
  }

  public getSyncPayload(): ProcessNode[] {
    const payload = [...this.syncLog];
    this.syncLog = [];
    return payload;
  }
}

export class GossipManager {
  private static clusters: EdgeCluster[] = [];

  public static registerCluster(cluster: EdgeCluster) {
    this.clusters.push(cluster);
  }

  public static async propagate() {
    // Simplified Gossip Protocol: Nodes sync with each other if online
    for (const cluster of this.clusters) {
      if (cluster.isOnline) {
        const payload = cluster.getSyncPayload();
        if (payload.length > 0) {
          NexusTelemetry.emit('SYNC', 'GLOBAL', cluster.id, { count: payload.length });
          // In a real system, this would use CRDTs to merge logs
          // Here we broadcast 'Consensus Achieved'
          console.log(`[GOSSIP] Cluster ${cluster.id} synchronized ${payload.length} events to Global Nexus.`);
        }
      }
    }
  }
}
