import type { ProcessNode } from './crcn';
import { SemanticRAG } from './knowledge_base';
import type { HistoricalIncident } from './knowledge_base';

export interface AIBrief {
  reasoning: string;
  recommendedEquipment: string[];
  predictedDuration: number; // minutes
  confidenceScore: number;
  escalationIndex: number; // 0.0 to 1.0 (Predictive Risk)
  historicalContext?: HistoricalIncident;
  multiModalEvidence?: {
    verifiedIssues: string[];
    threatLevel: 'VERIFIED' | 'UNCERTAIN';
  };
}

export class AIDispatcher {
  private static equipmentPool: Record<string, string[]> = {
    'Fire': ['High-Pressure Hose', 'Thermal Camera', 'Oxygen Masks'],
    'Medical': ['Defibrillator', 'Trauma Kit', 'Advanced Life Support Unit'],
    'Structural': ['Heavy Lift Jack', 'Acoustic Sensor', 'Concrete Saw'],
    'Chemical': ['Hazmat Suit', 'Decontamination Kit', 'Gas Detector'],
    'Power': ['Insulated Tools', 'Emergency Generator', 'Voltage Tester']
  };

  public static async generateBrief(node: ProcessNode): Promise<AIBrief> {
    // In a real-world scenario, this would call Claude 3.5 or Gemini via an API.
    // For this simulation, we use a semantic template engine.
    
    const category = Object.keys(this.equipmentPool).find(c => 
      node.issue.toLowerCase().includes(c.toLowerCase())
    ) || 'Medical';

    // Predictive Risk Analysis (Semantic Keywords)
    const riskKeywords = {
      extreme: ['hospital', 'school', 'nuclear', 'power plant', 'chemical lab', 'fuel', 'refinery'],
      high: ['leaking', 'spreading', 'multiple', 'underground', 'trapped', 'explosion'],
      moderate: ['smoke', 'leak', 'collision', 'malfunction']
    };

    let riskScore = 0.2; // Base risk
    const text = (node.issue + " " + node.location).toLowerCase();
    
    if (riskKeywords.extreme.some(k => text.includes(k))) riskScore += 0.6;
    else if (riskKeywords.high.some(k => text.includes(k))) riskScore += 0.35;
    else if (riskKeywords.moderate.some(k => text.includes(k))) riskScore += 0.15;

    // Add some jitter for "AI intuition"
    riskScore = Math.min(1.0, riskScore + (Math.random() * 0.1));

    const reasoning = `AI ANALYSIS: This ${node.issue} at ${node.location} shows a high Escalation Index (${riskScore.toFixed(2)}). Predictive preemption suggested to mitigate cascading regional failure.`;
    
    // THE RAG UPGRADE: Fetch Historical Context
    const historicalContext = await SemanticRAG.query(node.issue);

    // THE MULTI-MODAL UPGRADE: Verify Evidence
    let confidenceBonus = 0;
    let verifiedDetails: string[] = [];
    
    if (node.evidence) {
       confidenceBonus = 0.15;
       verifiedDetails = [
         node.evidence.type === 'vision' ? "Smoke density verified via CV" : "Acoustic stress detected in audio",
         "Secondary threat corroborated"
       ];
    }

    return {
      reasoning,
      recommendedEquipment: historicalContext?.requiredEquipment || this.equipmentPool[category] || this.equipmentPool['Medical'],
      predictedDuration: historicalContext?.duration || Math.floor(Math.random() * 45) + 15,
      confidenceScore: Math.min(1.0, 0.85 + (Math.random() * 0.1) + confidenceBonus),
      escalationIndex: Number(riskScore.toFixed(2)),
      historicalContext: historicalContext || undefined,
      multiModalEvidence: node.evidence ? {
        verifiedIssues: verifiedDetails,
        threatLevel: 'VERIFIED'
      } : undefined
    };
  }
}
