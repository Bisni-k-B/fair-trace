import React, { useState, useEffect, useCallback } from 'react';
import { CRCNEngine, WinningStrategy } from './engine/crcn';
import type { ProcessNode, Urgency } from './engine/crcn';
import { AIDispatcher } from './engine/ai_dispatcher';
import { EdgeCluster, GossipManager } from './engine/distributed';
import { NexusTelemetry } from './engine/telemetry';
import type { TelemetrySpan } from './engine/telemetry';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  ShieldAlert, 
  Truck, 
  MapPin, 
  Plus, 
  Zap, 
  Layers,
  CheckCircle2,
  Clock,
  Send,
  RefreshCw,
  LayoutDashboard,
  Bomb,
  Heart,
  Bot,
  BrainCircuit,
  Wrench,
  Timer,
  BookOpen,
  Info,
  Camera,
  Mic,
  Image as ImageIcon,
  MessageSquare,
  SendHorizontal,
  Smartphone,
  Instagram,
  Settings2,
  Filter
} from 'lucide-react';

export const initialClusters = [
  new EdgeCluster('SECTOR_ALPHA', 2),
  new EdgeCluster('SECTOR_BETA', 2),
  new EdgeCluster('SECTOR_GAMMA', 2)
];

initialClusters.forEach(c => GossipManager.registerCluster(c));

const App: React.FC = () => {
  const [clusters, setClusters] = useState(initialClusters);
  const [activeClusterIdx, setActiveClusterIdx] = useState(0);
  const [isGossipSyncing, setIsGossipSyncing] = useState(false);
  const [waitingPool, setWaitingPool] = useState<ProcessNode[]>([]);
  const [spans, setSpans] = useState<TelemetrySpan[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'warn' | 'success'}[]>([]);
  const [evidenceType, setEvidenceType] = useState<'vision' | 'voice' | null>(null);
  const [isSituationRoom, setIsSituationRoom] = useState(false);
  const [showSwapFlare, setShowSwapFlare] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [sortOrder, setSortOrder] = useState<'urgency' | 'time' | 'score'>('score');

  const engine = clusters[activeClusterIdx].engine;

  // Form State
  const [formUrg, setFormUrg] = useState<Urgency>(3);
  const [formLocation, setFormLocation] = useState('');
  const [formIssue, setFormIssue] = useState('');

  const addLog = (msg: string, type: 'info' | 'warn' | 'success' = 'info') => {
    setLogs(prev => [{msg, type}, ...prev].slice(0, 8));
  };

  const updateState = useCallback(() => {
    setClusters(prev => {
      const newClusters = [...prev];
      newClusters.forEach(c => {
         // Refresh scores for UI
         c.engine.slots.forEach(s => {
           if (s.node) s.node.governanceScore = WinningStrategy.calculate(s.node);
         });
      });
      return newClusters;
    });
    
    // Global Pool logic
    const allWaiting: ProcessNode[] = [];
    clusters.forEach(c => allWaiting.push(...c.engine.waitingPool.nodes));
    
    const sorted = allWaiting.map(n => ({ ...n, governanceScore: WinningStrategy.calculate(n) }))
      .sort((a, b) => {
        if (sortOrder === 'urgency') return b.urgency - a.urgency;
        if (sortOrder === 'time') return a.timestamp - b.timestamp;
        return (b.governanceScore || 0) - (a.governanceScore || 0);
      });

    setWaitingPool(sorted);
    
    setNow(Date.now());
  }, [clusters]);

  // AI Brief Generation Handler
  const processWithAI = async (node: ProcessNode) => {
    if (!node.aiBrief) {
      const brief = await AIDispatcher.generateBrief(node);
      node.aiBrief = brief;
      updateState();
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      clusters.forEach(cluster => {
        cluster.engine.slots.forEach((s, i) => {
          if (s.node) {
            if (Math.random() > 0.1) cluster.engine.heartbeat(i);
            if (!s.node.aiBrief) processWithAI(s.node);
          }
        });
        cluster.engine.checkLeases();
        cluster.engine.waitingPool.sortPool();
      });

      // Gossip Propagation
      if (Math.random() > 0.7) {
        setIsGossipSyncing(true);
        GossipManager.propagate();
        setTimeout(() => setIsGossipSyncing(false), 1000);
      }

      setSpans(NexusTelemetry.getHistory());
      updateState();
    }, 1000);
    return () => clearInterval(interval);
  }, [updateState, clusters]);

  const createRequest = async (urgency?: Urgency, customData?: { location: string, issue: string, source?: 'web' | 'whatsapp' | 'telegram' }) => {
    const id = Math.random().toString(36).substring(7).toUpperCase();
    const locations = ['Sector 7', 'Downtown', 'Industrial Zone', 'Harbor', 'Residential North'];
    const issues = ['Structural Collapse', 'Medical Emergency', 'Fire Outbreak', 'Power Failure', 'Chemical Leak', 'Flood Warning', 'Traffic Collision'];
    
    const finalUrg = urgency || formUrg;
    
    const newNode: ProcessNode = {
      id,
      location: customData?.location || formLocation || locations[Math.floor(Math.random() * locations.length)],
      issue: customData?.issue || formIssue || issues[Math.floor(Math.random() * issues.length)],
      urgency: finalUrg,
      timestamp: Date.now(),
      source: customData?.source || 'web',
      evidence: (customData?.source === 'whatsapp' || customData?.source === 'telegram' || customData?.source === 'instagram') && Math.random() > 0.5 ? {
        type: 'vision',
        url: 'https://images.unsplash.com/photo-1544027993-37dbfe43562a',
        isVerified: true
      } : (evidenceType ? {
        type: evidenceType,
        url: evidenceType === 'vision' ? 'https://images.unsplash.com/photo-1544027993-37dbfe43562a' : '',
        isVerified: true
      } : undefined)
    };
    
    setEvidenceType(null);
    
    const targetCluster = clusters[activeClusterIdx];
    const result = targetCluster.processLocal(newNode);
    
    if (result.action === 'CONNECT') {
      addLog(`[${targetCluster.id}] Connected ${id} (Urg: ${finalUrg})`, 'success');
      processWithAI(newNode);
    } else if (result.action === 'SWAP') {
      addLog(`[${targetCluster.id}] PREDICTIVE SWAP: ${id} bumped weakest node`, 'warn');
      setShowSwapFlare(true);
      setTimeout(() => setShowSwapFlare(false), 500);
      processWithAI(newNode);
    } else {
       addLog(`[${targetCluster.id}] ${id} queued in Local Edge`, 'info');
    }
    
    if (!urgency) {
      setFormIssue('');
    }
    
    updateState();
  };

  const toggleClusterLink = (idx: number) => {
    const isOnline = clusters[idx].toggleConnectivity();
    addLog(`NETWORK: Cluster ${clusters[idx].id} is now ${isOnline ? 'ONLINE' : 'OFFLINE (AUTONOMOUS)'}`, isOnline ? 'success' : 'warn');
    updateState();
  };

  const release = (idx: number) => {
    if (engine.slots[idx].node) {
      const id = engine.slots[idx].node?.id;
      engine.releaseSlot(idx);
      addLog(`Resource 0${idx + 1} completed Task ${id}`, 'success');
      updateState();
    }
  };

  const simulateCrash = (idx: number) => {
    if (engine.slots[idx].node) {
      engine.slots[idx].leaseExpiry = Date.now() - 1000;
      addLog(`CHAOS: Resource 0${idx+1} CRASHED intentionally`, 'warn');
      updateState();
    }
  };

  const getEffectiveScore = (node: ProcessNode) => {
    if (!node.waitingSince) return node.urgency.toFixed(2);
    const ticks = (now - node.waitingSince) / 1000;
    return (node.urgency + engine.waitingPool.agingRate * ticks).toFixed(2);
  };

  return (
    <div className="app-container">
      <AnimatePresence>
        {showSwapFlare && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="swap-flare" />
        )}
      </AnimatePresence>

      <header>
        <div className="logo" onClick={() => window.location.reload()}>
          <ShieldAlert className="pulse" size={32} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
             <span style={{ fontSize: '1.2rem', letterSpacing: '0.05em' }}>CRCN AI-PRO</span>
             <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>Semantic Resilience Plane</span>
          </div>
        </div>
        <div className="controls">
          <div style={{ display: 'flex', gap: '8px', marginRight: '16px', paddingRight: '16px', borderRight: '1px solid var(--border-color)' }}>
             <button onClick={() => createRequest(3)} style={{ background: 'rgba(255,59,48,0.1)', color: 'var(--primary-critical)', border: '1px solid rgba(255,59,48,0.2)' }}>+ Critical</button>
             <button onClick={() => createRequest(2)} style={{ background: 'rgba(255,149,0,0.1)', color: 'var(--secondary-high)', border: '1px solid rgba(255,149,0,0.2)' }}>+ High</button>
             <button onClick={() => createRequest(1)} style={{ background: 'rgba(52,199,89,0.1)', color: 'var(--tertiary-medium)', border: '1px solid rgba(52,199,89,0.2)' }}>+ Medium</button>
          </div>
          <div className="strategy-badge" style={{ background: isGossipSyncing ? 'rgba(52, 199, 89, 0.2)' : undefined }}>
            {isGossipSyncing ? <RefreshCw className="spin" size={12} /> : <Zap size={12} fill="#6366f1" />}
            {isGossipSyncing ? 'GOSSIP SYNC ACTIVE' : 'FEDERATED EDGE ARCHITECTURE'}
          </div>
          <button className="secondary" onClick={() => setIsSituationRoom(!isSituationRoom)}>
            {isSituationRoom ? <Layers size={16} /> : <LayoutDashboard size={16} />} 
            {isSituationRoom ? 'Sector View' : 'Situation Room'}
          </button>
          <button className="secondary" onClick={() => window.location.reload()}><RefreshCw size={16} /> Force Reset</button>
        </div>
      </header>

      <main className="dashboard-grid">
        <div className="main-stage">
          <div className="card-title"><BrainCircuit size={16} /> Semantic Intelligence Coordinator</div>
          
          <div className="check-node-container" style={{ marginBottom: isSituationRoom ? '1rem' : '4rem' }}>
            {!isSituationRoom && (
              <svg className="connection-svg">
                 <line x1="50%" y1="50%" x2="16.6%" y2="90%" className="connection-line" />
                 <line x1="50%" y1="50%" x2="50%" y2="90%" className="connection-line" />
                 <line x1="50%" y1="50%" x2="83.3%" y2="90%" className="connection-line" />
                 
                 {[0, 1, 2].map(i => (
                   <motion.circle 
                      key={i}
                      r="4" 
                      className="connection-particle"
                      animate={{ 
                        cx: ["50%", i === 0 ? "16.6%" : i === 1 ? "50%" : "83.3%"],
                        cy: ["50%", "90%"],
                        opacity: [0, 1, 0]
                      }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }}
                   />
                 ))}
              </svg>
            )}

            <motion.div className="check-node-outer" animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }} style={{ width: isSituationRoom ? '80px' : '120px', height: isSituationRoom ? '80px' : '120px' }}>
              <div className="check-node-inner" style={{ background: 'radial-gradient(circle, #1a1a2e 0%, #050508 100%)', width: isSituationRoom ? '70px' : '100px', height: isSituationRoom ? '70px' : '100px' }}>
                <Bot size={isSituationRoom ? 24 : 32} color="#6366f1" />
              </div>
            </motion.div>
          </div>

          {isSituationRoom ? (
            <div className="situation-room-canvas">
               <svg className="neural-graph-svg">
                  {/* Drawing Lines between Waiting incidents and Nexus */}
                  {waitingPool.map((node, i) => {
                     const total = waitingPool.length;
                     const angle = (i / total) * Math.PI - Math.PI/2;
                     const x = (50 + Math.cos(angle) * 35) + "%";
                     const y = (80 + Math.sin(angle) * 15) + "%";
                     return (
                        <motion.line 
                           key={node.id}
                           x1="50%" y1="10%" 
                           x2={x} y2={y} 
                           stroke="rgba(99,102,241,0.2)" 
                           strokeWidth="1"
                        />
                     );
                  })}

                  {/* Drawing Lines between Active Nodes and Resources */}
                  {clusters.map((cluster, cIdx) => 
                    cluster.engine.slots.map((slot, sIdx) => {
                       if (!slot.node) return null;
                       const vitality = Math.max(0, (slot.leaseExpiry - now) / 10000);
                       const xTarget = (cIdx * 33 + 16.5) + "%";
                       const yTarget = "70%";
                       return (
                          <motion.line 
                             key={slot.node.id}
                             x1="50%" y1="10%"
                             x2={xTarget} y2={yTarget}
                             stroke={slot.node.urgency === 3 ? "rgba(255,59,48,0.4)" : "#6366f1"}
                             strokeWidth={1 + vitality * 3}
                             strokeDasharray="5,5"
                             animate={{ strokeDashoffset: [0, -20] }}
                             transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                          />
                       );
                    })
                  )}
               </svg>

               <div className="graph-nodes-overlay">
                  {waitingPool.map((node, i) => {
                     const angle = (i / (waitingPool.length || 1)) * Math.PI - Math.PI/2;
                     const x = (50 + Math.cos(angle) * 35) + "%";
                     const y = (80 + Math.sin(angle) * 15) + "%";
                     return (
                        <motion.div 
                           key={node.id} 
                           className={`graph-node mini ${node.urgency === 3 ? 'critical' : 'high'}`} 
                           style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)' }}
                        >
                           #{node.id}
                        </motion.div>
                     );
                  })}

                  <div className="active-clusters-layer">
                     {clusters.map((cluster, cIdx) => (
                        <div key={cluster.id} className="graph-cluster" style={{ left: (cIdx * 33 + 16.5) + "%" }}>
                           <div className="cluster-title">{cluster.id}</div>
                           <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                              {cluster.engine.slots.map((slot, sIdx) => (
                                 <motion.div 
                                    key={sIdx} 
                                    className={`graph-node large ${slot.node ? (slot.node.urgency === 3 ? 'critical' : 'high') : 'idle'}`}
                                 >
                                    {slot.node ? (
                                      <>
                                        <div className="node-id">#{slot.node.id}</div>
                                        <div className="node-label">{slot.node.issue.substring(0, 8)}...</div>
                                      </>
                                    ) : 'IDLE'}
                                 </motion.div>
                              ))}
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          ) : (
            <>
              <div className="clusters-grid">
                {clusters.map((cluster, cIdx) => (
                  <div key={cluster.id} className={`cluster-card ${activeClusterIdx === cIdx ? 'active' : ''} ${!cluster.isOnline ? 'offline' : ''}`} onClick={() => setActiveClusterIdx(cIdx)}>
                    <div className="cluster-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Layers size={14} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 800 }}>{cluster.id}</span>
                      </div>
                      <div className={`status-dot ${cluster.isOnline ? 'online' : 'offline'}`} onClick={(e) => { e.stopPropagation(); toggleClusterLink(cIdx); }} />
                    </div>

                    <div className="slots-mini-container">
                      {cluster.engine.slots.map((slot, i) => {
                        const node = slot.node;
                        return (
                          <div key={i} className={`slot-mini ${node ? 'occupied' : ''}`}>
                             {node && <div className={`node-dot ${node.urgency === 3 ? 'critical' : 'high'}`} />}
                          </div>
                        );
                      })}
                    </div>
                    
                    {!cluster.isOnline && <div className="autonomous-tag">AUTONOMOUS MODE</div>}
                  </div>
                ))}
              </div>

              <div className="main-stage">
                <div className="card-title">
                   <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <span><Bot size={16} /> {clusters[activeClusterIdx].id} - Control Plane</span>
                      <span style={{ color: clusters[activeClusterIdx].isOnline ? 'var(--tertiary-medium)' : 'var(--primary-critical)' }}>
                        {clusters[activeClusterIdx].isOnline ? 'LINKED TO NEXUS' : 'LOCAL CACHE ONLY'}
                      </span>
                   </div>
                </div>
                
                <div className="slots-container">
                  {clusters[activeClusterIdx].engine.slots.map((slot, i) => {
                    const node = slot.node;
                    return (
                      <div key={i} className={`slot ${node ? 'occupied' : ''}`} style={{ border: node ? '1px solid rgba(99, 102, 241, 0.3)' : '1px dashed var(--border-color)' }}>
                        <div className="slot-header">
                           <div className="slot-label"><Wrench size={12} /> {slot.resource?.id}</div>
                           <div className={`resource-tag ${slot.resource?.type.toLowerCase()}`}>{slot.resource?.type}</div>
                        </div>
                        <AnimatePresence mode="wait">
                          {node ? (
                            <motion.div key={node.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`node ${node.urgency === 3 ? 'critical' : node.urgency === 2 ? 'high' : 'medium'}`} style={{ width: '100%', margin: 0 }}>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span className="node-id">#{node.id}</span>
                                {node.source === 'whatsapp' && <MessageSquare size={12} color="#25D366" />}
                                {node.source === 'telegram' && <SendHorizontal size={12} color="#0088cc" />}
                                {node.source === 'instagram' && <Instagram size={12} color="#E1306C" />}
                             </div>
                             <div style={{ display: 'flex', gap: '8px' }}>
                                    {node.evidence && (
                                       <div className="evidence-badge">
                                          {node.evidence.type === 'vision' ? <ImageIcon size={10} /> : <Mic size={10} />}
                                          EV-VERIFIED
                                       </div>
                                    )}
                                    <div className="governance-chip"><Activity size={10} /> {node.governanceScore}</div>
                                 </div>
                              
                              {node.evidence?.type === 'vision' && (
                                 <div className="evidence-preview">
                                    <img src={`https://picsum.photos/seed/${node.id}/300/100`} alt="Verification" />
                                    <div className="vision-overlay">
                                       <CheckCircle2 size={12} /> AI VERIFIED: HEAT SIG DETECTED
                                    </div>
                                 </div>
                              )}

                              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', marginTop: '4px' }}>{node.issue}</div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {node.location}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={10} /> {node.waitingSince ? Math.floor((now - node.waitingSince)/1000) : 0}s wait</div>
                              </div>

                              {node.aiBrief && (
                                <div className="rag-intel-brief">
                                   <div className="intel-header">
                                      <BookOpen size={10} /> 
                                      DISPATCH INTELLIGENCE BRIEF
                                      {node.aiBrief.historicalContext && (
                                        <span className="historical-badge">REF: {node.aiBrief.historicalContext.id}</span>
                                      )}
                                   </div>
                                   
                                   <div className="tactical-advice">
                                     {node.aiBrief.historicalContext ? (
                                       <>
                                         <strong>Advisory:</strong> {node.aiBrief.historicalContext.tacticalAdvice}
                                       </>
                                     ) : (
                                       "Searching historical knowledge base..."
                                     )}
                                   </div>

                                   <div className="intel-footer">
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                         {node.aiBrief.recommendedEquipment.map((eq: string, j: number) => (
                                            <span key={j} className="equipment-chip mini"><Wrench size={8} /> {eq}</span>
                                         ))}
                                      </div>
                                      <div className="eta-badge shadow-glow">
                                         <Timer size={10} /> {node.aiBrief.predictedDuration}m
                                      </div>
                                   </div>
                                </div>
                              )}
                            </motion.div>
                          ) : (
                            <div style={{ color: 'rgba(255,255,255,0.02)', fontWeight: 900 }}>IDLE</div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <aside className="sidebar">
          <div className="card" style={{ background: 'linear-gradient(135deg, rgba(13, 13, 20, 0.9) 0%, rgba(30, 30, 50, 0.9) 100%)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
            <div className="card-title" style={{ color: '#6366f1' }}><Plus size={16} /> New Intel Ingest</div>
            <div className="form-group">
              <label>Urgency</label>
              <div className="urgency-selector">
                <div onClick={() => setFormUrg(3)} className={`urgency-option critical ${formUrg === 3 ? 'active' : ''}`}>CRITICAL</div>
                <div onClick={() => setFormUrg(2)} className={`urgency-option high ${formUrg === 2 ? 'active' : ''}`}>HIGH</div>
                <div onClick={() => setFormUrg(1)} className={`urgency-option medium ${formUrg === 1 ? 'active' : ''}`}>MEDIUM</div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <div className={`evidence-button ${evidenceType === 'vision' ? 'active' : ''}`} onClick={() => setEvidenceType(evidenceType === 'vision' ? null : 'vision')}>
                   <Camera size={14} /> <span>Vision</span>
                </div>
                <div className={`evidence-button ${evidenceType === 'voice' ? 'active' : ''}`} onClick={() => setEvidenceType(evidenceType === 'voice' ? null : 'voice')}>
                   <Mic size={14} /> <span>Voice</span>
                </div>
              </div>
            </div>
            <div className="form-group"><label>Location</label><input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} /></div>
            <div className="form-group"><label>Description</label><textarea rows={2} value={formIssue} onChange={(e) => setFormIssue(e.target.value)} /></div>
            <button style={{ width: '100%', background: '#6366f1' }} onClick={() => createRequest()}><Send size={16} style={{ marginRight: '8px' }} /> Analyze & Route</button>
          </div>

          <div className="card" style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            <div className="card-title" style={{ color: '#fff' }}><Smartphone size={16} /> Omni-Channel Gateways</div>
            <div className="gateway-grid">
               <div className="gateway-item active" onClick={() => createRequest(3, { location: 'Downtown', issue: 'Fire reported via App', source: 'whatsapp' })}>
                  <MessageSquare size={18} color="#25D366" />
                  <div className="gateway-info">
                     <strong>WHATSAPP</strong>
                     <span>ACTIVE STREAM</span>
                  </div>
               </div>
               <div className="gateway-item active" onClick={() => createRequest(2, { location: 'Commercial District', issue: 'Smoke detected in store', source: 'instagram' })}>
                  <Instagram size={18} color="#E1306C" />
                  <div className="gateway-info">
                     <strong>INSTAGRAM</strong>
                     <span>PHOTO FEED</span>
                  </div>
               </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
               <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span><Clock size={16} /> Priority Aging Pool</span>
                  <div className="sort-controls">
                     <Filter size={10} style={{ marginRight: '4px', opacity: 0.5 }} />
                     <button className={`sort-btn ${sortOrder === 'score' ? 'active' : ''}`} onClick={() => setSortOrder('score')}>Score</button>
                     <button className={`sort-btn ${sortOrder === 'urgency' ? 'active' : ''}`} onClick={() => setSortOrder('urgency')}>Urg</button>
                     <button className={`sort-btn ${sortOrder === 'time' ? 'active' : ''}`} onClick={() => setSortOrder('time')}>Time</button>
                  </div>
               </div>
            </div>
            <div className="waiting-pool-list" style={{ minHeight: '150px' }}>
              <AnimatePresence>
                {waitingPool.map((node) => (
                  <motion.div key={node.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`node mini ${node.urgency === 3 ? 'critical' : node.urgency === 2 ? 'high' : 'medium'}`}>
                    <div className="node-header">
                       <strong>#{node.id}</strong>
                       <span className="governance-chip mini">{node.governanceScore}</span>
                    </div>
                    <div style={{ fontWeight: 600 }}>{node.issue}</div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="card-title"><Activity size={14} /> Audit Trail</div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
               {logs.map((log, i) => (
                 <div key={i} style={{ fontSize: '0.65rem', padding: '0.4rem', borderLeft: `2px solid ${log.type === 'warn' ? '#ff9500' : log.type === 'success' ? '#34c759' : 'rgba(255,255,255,0.1)'}`, background: 'rgba(255,255,255,0.01)', marginBottom: '4px' }}>
                   {log.msg}
                 </div>
               ))}
            </div>
          </div>
        </aside>
      </main>

      <footer className="temporal-explorer">
        <div className="explorer-header">
           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LayoutDashboard size={14} />
              <span>TEMPORAL TRACE EXPLORER (v1.4.2-STABLE)</span>
           </div>
           <div className="explorer-stats">
              RECORDING {spans.length} ACTIVE SPANS
           </div>
        </div>
        
        <div className="trace-timeline">
           {spans.map(span => {
             const isSelected = selectedTraceId === span.nodeId;
             return (
               <motion.div 
                 key={span.id}
                 className={`span-block ${span.type.toLowerCase()} ${isSelected ? 'selected' : ''}`}
                 onClick={() => setSelectedTraceId(isSelected ? null : span.nodeId)}
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
               >
                  <div className="span-marker" />
                  <div className="span-details">
                     <div className="span-type-line">
                        <span className="type-label">{span.type}</span>
                        <span className="timestamp">+{Math.floor((now - span.timestamp)/1000)}s</span>
                     </div>
                     <div className="span-node">#{span.nodeId}</div>
                  </div>
               </motion.div>
             );
           })}
        </div>
        
        <AnimatePresence>
          {selectedTraceId && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="trace-inspector">
               <div className="inspector-grid">
                  <div className="inspector-column">
                     <label>Trace Identity</label>
                     <div className="value">RID-{selectedTraceId}</div>
                  </div>
                  <div className="inspector-column">
                     <label>Root Cluster</label>
                     <div className="value">{spans.find(s => s.nodeId === selectedTraceId)?.sectorId}</div>
                  </div>
                  <div className="inspector-column">
                     <label>Active Spans</label>
                     <div className="value">{spans.filter(s => s.nodeId === selectedTraceId).length}</div>
                  </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </div>
  );
};

export default App;
