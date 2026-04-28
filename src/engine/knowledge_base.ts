export type HistoricalIncident = {
  id: string;
  summary: string;
  tacticalAdvice: string;
  requiredEquipment: string[];
  duration: number;
};

export const MOCK_VECTOR_STORE: HistoricalIncident[] = [
  {
    id: "H-2021-SEOUL",
    summary: "Large-scale industrial fire in Seoul (2021).",
    tacticalAdvice: "Focus on primary containment to prevent regional cascading. Use specialized O2 foam for chemical fuel fires.",
    requiredEquipment: ["Specialized O2 Foam", "Thermal Imaging Drone", "High-Pressure Monitors"],
    duration: 120
  },
  {
    id: "H-2018-SF",
    summary: "Structural collapse in San Francisco high-rise.",
    tacticalAdvice: "Acoustic sensor deployment is critical for finding survivors in sub-level debris. Stabilize primary load-bearing pillars first.",
    requiredEquipment: ["Acoustic Sensor", "Hydraulic Shoring", "K-9 Unit"],
    duration: 180
  },
  {
    id: "H-2023-TOK",
    summary: "Cyber-physical power grid failure in Tokyo.",
    tacticalAdvice: "Isolate sector nodes before applying cold-boot sequence. Manually override relay switches at substation 04.",
    requiredEquipment: ["Grid Stabilizer", "Cold-Boot Kit", "Insulated Toolkit"],
    duration: 45
  },
  {
    id: "H-2020-BER",
    summary: "Chemical spill in Berlin subway.",
    tacticalAdvice: "Establish negative pressure zone before entry. Neutralize acid pools with Class-B chemical retardant.",
    requiredEquipment: ["Class-B Retardant", "Negative Pressure Fan", "Hazmat Suit 4"],
    duration: 90
  }
];

export class SemanticRAG {
  public static async query(issue: string): Promise<HistoricalIncident | null> {
    // Simplified Semantic Search (Keyword based for mock)
    const text = issue.toLowerCase();
    
    if (text.includes('fire') || text.includes('smoke') || text.includes('chemical')) return MOCK_VECTOR_STORE[0];
    if (text.includes('collapse') || text.includes('structural')) return MOCK_VECTOR_STORE[1];
    if (text.includes('power') || text.includes('grid') || text.includes('failure')) return MOCK_VECTOR_STORE[2];
    if (text.includes('spill') || text.includes('leak')) return MOCK_VECTOR_STORE[3];
    
    return MOCK_VECTOR_STORE[Math.floor(Math.random() * MOCK_VECTOR_STORE.length)];
  }
}
