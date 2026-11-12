export interface Point { x: number; y: number }
export interface Frame { time: number; sourceFrame: number; ball: Point; players: Record<string, Point> }
export type Context = "press" | "transition" | "attack";
export interface Player {
  id: string; displayName: string; team: "HOME" | "AWAY";
  dataKind: "OBSERVED" | "ASSUMED"; role?: string; age?: number;
  traits?: { pace: number; positioning: number; defending: number; passing: number; stamina: number };
  acceleration?: number; reaction?: number; stepOut?: number;
}
export interface ScenarioSummary {
  id: string; title: string; description: string; context: Context; period?: 1 | 2;
  targetPlayerId: string; candidatePlayerIds: string[]; startTime: number;
  startClock: string; durationSec: number; frameCount: number; anchor: Point;
  initialVelocity: Point; ballLead?: number;
  action: { startFrame: number; endFrame: number; team: "HOME" | "AWAY"; phases: string[] };
}
export type Scenario = Omit<ScenarioSummary, "frameCount"> & { frames: Frame[] };
export interface MatchSummary {
  id: string; name: string; dataKind: string; pitch: { length: number; width: number };
  scenarioCount: number; candidateCount: number;
  source: { name: string; url: string; revision: string };
}
export interface MatchDetail extends MatchSummary {
  fps: number; matchEndSeconds: number; homeAttacksRightFirstHalf: boolean;
  lineup: { home: string[]; away: string[] }; players: Player[];
  moments: ScenarioSummary[]; provenance: Provenance;
}
export interface Provenance {
  tracking: { kind: "OBSERVED"; name: string; url: string; revision: string };
  events: { kind: "OBSERVED"; source: string };
  candidates: { kind: "ASSUMED"; description: string };
  alternative: { kind: "SIMULATED"; description: string };
  analytics: { kind: "DERIVED"; methodologyVersion: string };
  epv: { kind: "MODEL"; source: string; revision: string; license: string; localNotice: string };
  limitations: string[];
}
export interface Metric {
  id: string; label: string; unit: string; baseline: number; alternative: number;
  delta: number; better: "higher" | "lower"; explanation: string;
}
export interface Fit { score: number; title: string; components: { cover: number; access: number; value: number } }
export interface ScoutingResult {
  baseline: Fit; alternative: Fit; scoreDelta: number; decision: string;
  context: Context; scope: string; ageUsedInScore: false;
}
export interface Analysis {
  metrics: Metric[];
  recommendation: { title: string; score: number; fitLabel: string; decision: string; reasoning: string[]; caveat: string };
  assumptions: string[]; scouting: ScoutingResult; qualityLabel: string;
  confidence: { level: "low"; observed: string[]; modeled: string[]; unknown: string[] };
}
export interface ComparisonInput { matchId: string; momentId: string; candidateId: string }
export interface Comparison extends ComparisonInput {
  schemaVersion: "1.0"; provenance: Provenance; analysis: Analysis;
  simulation: { baselineFrames: Frame[]; alternativeFrames: Frame[]; outgoingPlayerId: string;
    incomingPlayerId: string; tacticalPoints: Point[]; assumptions: string[]; seed: 42 };
}
export interface Momentum {
  matchId: string; points: { minute: number; value: number }[]; methodology: string;
  provenance: Provenance["events"]; eventsUsed: number; coverage: string;
}
export interface Scouting {
  matchId: string; candidate: Player;
  scenarios: (ScoutingResult & { momentId: string; title: string })[];
  groups: { context: Context; scenarioCount: number; weights: { momentId: string; weight: number }[];
    baselineScore: number; alternativeScore: number; scoreDelta: number }[];
  overallScore: null; confidence: "low"; explanation: string; provenance: Provenance;
}
export interface Methodology {
  version: string; metrics: Record<string, string>;
  score: { positioning: string; ballAccess: string; value: string; thresholds: Record<string, number>;
    inconclusiveDifferencePoints: number; limitation: string };
  momentum: string; aggregation: string;
}
export interface RequestOptions { signal?: AbortSignal }
export interface GhostXIClient {
  getDatasetStatus(options?: RequestOptions): Promise<DatasetRegistry>;
  getReplayMatches(options?: RequestOptions): Promise<ReplayMatch[]>;
  getReplayMatch(id: string, options?: RequestOptions): Promise<ReplayMatch & {players: VerifiedReplayPlayer[]; historicalSubstitutions: unknown[]; eventAlignment: {verified: boolean; method: string}}>;
  getReplayTracking(id: string, query?: {momentId?: string; period?: number; fromSec?: number; toSec?: number; offset?: number; limit?: number}, options?: RequestOptions): Promise<TrackingPage>;
  getMatches(options?: RequestOptions): Promise<MatchSummary[]>;
  getLineup(matchId: string, options?: RequestOptions): Promise<SubstitutionLineup>;
  getRecommendedMoments(matchId: string, query: { playerId: string; limit?: number; position?: string }, options?: RequestOptions): Promise<RecommendedMoment[]>;
  getReplacementCandidates(query: { matchId: string; replacePlayerId: string }, options?: RequestOptions): Promise<ReplacementCandidate[]>;
  getRecommendationConfig(options?: RequestOptions): Promise<RecommendationConfig>;
  listSavedScenarios(query?: { matchId?: string; candidateId?: string }, options?: RequestOptions): Promise<SavedSimulationScenario[]>;
  getSavedScenario(id: string, options?: RequestOptions): Promise<SavedSimulationScenario>;
  createSavedScenario(input: Omit<SimulationScenario, "id"> | Omit<MultiGhostScenario, "id">, options?: RequestOptions): Promise<SavedSimulationScenario>;
  updateSavedScenario(id: string, patch: Partial<Omit<SimulationScenario, "id">> | Partial<Omit<MultiGhostScenario, "id">>, options?: RequestOptions): Promise<SavedSimulationScenario>;
  deleteSavedScenario(id: string, options?: RequestOptions): Promise<{ deleted: boolean }>;
  duplicateSavedScenario(id: string, options?: RequestOptions): Promise<SavedSimulationScenario>;
  simulateSavedScenario(id: string, options?: RequestOptions): Promise<VerifiedSimulationResult>;
  getSavedScenarioFindings(id: string, options?: RequestOptions): Promise<ScenarioFindings>;
  getCandidateAssessment(query: { candidateId: string; matchId?: string }, options?: RequestOptions): Promise<CandidateAssessment>;
  getMatch(matchId: string, options?: RequestOptions): Promise<MatchDetail>;
  getScenario(matchId: string, momentId: string, options?: RequestOptions): Promise<Scenario>;
  getCandidates(matchId: string, momentId?: string, options?: RequestOptions): Promise<Player[]>;
  getMomentum(matchId: string, options?: RequestOptions): Promise<Momentum>;
  compare(input: ComparisonInput, options?: RequestOptions): Promise<Comparison>;
  getScouting(matchId: string, candidateId: string, options?: RequestOptions): Promise<Scouting>;
  getMethodology(options?: RequestOptions): Promise<Methodology>;
  getDatasets(options?: RequestOptions): Promise<DatasetCatalog>;
  getBehaviorStatus(options?: RequestOptions): Promise<BehaviorStatus>;
  getBehaviorProfiles(options?: RequestOptions): Promise<BehaviorModel>;
  getBehaviorProfile(playerId: string | number, options?: RequestOptions): Promise<BehaviorProfile>;
  getBehaviorScenarios(options?: RequestOptions): Promise<BehaviorScenario[]>;
  runBehaviorSimulation(input: ComparisonInput & { seed?: number }, options?: RequestOptions): Promise<BehaviorSimulation>;
  getEventMatches(options?: RequestOptions): Promise<EventMatchSummary[]>;
  getEventMatch(matchId: string | number, options?: RequestOptions): Promise<EventMatch>;
  getEventPlayers(matchId: string | number, options?: RequestOptions): Promise<EventPlayer[]>;
  getEventMomentum(matchId: string | number, options?: RequestOptions): Promise<EventMomentum>;
  getEvents(matchId: string | number, query?: EventQuery, options?: RequestOptions): Promise<Page<MatchEvent> & { matchId: string; source: DatasetSource }>;
  getMarketPlayers(query?: MarketQuery, options?: RequestOptions): Promise<Page<MarketProfile> & { referenceDate: string; source: DatasetSource }>;
  getMarketPlayer(playerId: string | number, asOf?: string, options?: RequestOptions): Promise<MarketProfile & { valuations: Valuation[]; source: DatasetSource }>;
}
export interface DatasetSource {
  id: string; name: string; url: string; ready: boolean; limitations: string[];
  revision?: string | null; attribution?: string; logoPath?: string; mediaPack?: string; licenseUrl?: string;
  license?: string; mirror?: string; kaggleVersion?: number | null;
  declaredCoverageEnd?: string | null; latestValuationDate?: string | null;
  playerCount?: number; matchCount?: number; curatedPlayerLinkCount?: number;
}
export interface DatasetCatalog {
  preparedAt: string | null; statsbomb: DatasetSource; transfermarkt: DatasetSource;
  files: { file: string; url: string; sha256: string; bytes: number }[];
}
export interface Page<T> { total: number; limit: number; offset: number; items: T[] }
export interface EventQuery { type?: string; teamId?: number; playerId?: number; limit?: number; offset?: number }
export interface MarketQuery {
  search?: string; country?: string; position?: string; minAge?: number; maxAge?: number;
  asOf?: string; limit?: number; offset?: number;
}
export interface Valuation { date: string; valueEur: number }
export interface MarketProfile {
  id: string; providerId: string; name: string; dateOfBirth: string | null; country: string | null;
  position: string | null; subPosition: string | null; foot: string | null; heightCm: number | null;
  clubSnapshot: { id: string | null; name: string | null }; url: string;
  referenceDate: string; ageAtReferenceDate: number | null;
  marketValue: { asOf: string; date: string | null; valueEur: number | null; status: string };
  dataKind: string; simulationEligible: false;
}
export interface EventMatchSummary {
  id: string; providerId: number; name: string; date: string; competition: string | null;
  season: string | null; gender: string; stadium: string | null;
  home: { id: number; name: string; score: number }; away: { id: number; name: string; score: number };
  pitch: { length: number; width: number }; coordinateSystem: string;
  capabilities: { eventAnalytics: true; trackingReplay: false; ghostComparison: false };
  eventCount: number; playerCount: number; source: DatasetSource;
}
export interface KeyMoment {
  eventId: string; period: number; minute: number; second: number; elapsedSeconds: number;
  type: string; teamName: string; playerName: string | null; xg: number | null; outcome: string | null; importance: number;
}
export interface EventMatch extends EventMatchSummary { keyMoments: KeyMoment[]; statsMethod: string }
export interface MatchEvent {
  id: string; index: number; type: string; period: number; clock: string; minute: number; second: number;
  elapsedSeconds: number; phase: "match" | "shootout"; teamId: number; teamName: string;
  playerId: number | null; playerName: string | null; location: Point | null;
  underPressure: boolean; counterpress: boolean; positionName: string | null; bodyPart: string | null;
  possession: number | null; possessionChanged: boolean;
  pass: { endLocation: Point | null; recipientId: number | null; completed: boolean; outcome: string; shotAssist: boolean; goalAssist: boolean; cross: boolean } | null;
  carry: { endLocation: Point | null } | null;
  shot: { xg: number | null; outcome: string | null; isPenalty: boolean; endLocation: Point | null } | null;
  substitution: { replacementId: number; replacementName: string } | null; card: string | null;
}
export interface EventPlayer {
  id: string; providerId: number; name: string; fullName: string; country: string | null;
  teamId: number; teamName: string; jerseyNumber: number | null; starter: boolean; positions: string[]; minutesPlayed: number | null;
  stats: Record<string, number | null>; per90: Record<string, number | null>; sample: string; dataKind: string;
  marketLink: { status: "curated"; method: string; statsbombId: number; transfermarktId: string; source: string; profile: MarketProfile }
    | { status: "unlinked"; profile: null };
  source: DatasetSource;
}
export interface EventMomentum {
  matchId: string; points: { period: number; periodMinute: number; elapsedSeconds: number; homeXG: number; awayXG: number; difference: number; value: number }[];
  cumulativeXG: { eventId: string; period: number; minute: number; second: number; elapsedSeconds: number; homeXG: number; awayXG: number }[];
  totals: { homeXG: number; awayXG: number }; missingShotXG: number; method: string; source: DatasetSource;
}
export interface ActionMix { pass: number; carry: number; shoot: number }
export interface BehaviorSample {
  matchCount: number; minutes: number | null; knownMinutes: number; unknownMinutesMatchCount: number;
  actionEvents: number; counts: ActionMix; appearances: { matchId: number; date: string; minutes: number | null }[];
}
export interface BehaviorValidation {
  matchId: number; date: string; events: number; eventTypeLogLoss: number | null;
  cohortEventTypeLogLoss: number | null; interpretation: string;
}
export interface HabitRate { value: number; observed: number | null; samples: number; smoothingStrength: number }
export interface BehaviorProfile {
  id: string; statsbombId: number; transfermarktId: string; name: string; role: string; cutoffDate: string;
  sample: BehaviorSample;
  habits: { actionMix: ActionMix;
    contexts: Record<string, { probabilities: ActionMix; counts: ActionMix; sampleSize: number; personalizationStrength: number; cohortPrior: ActionMix }>;
    carryInward: HabitRate; carryForward: HabitRate; forwardPassing: HabitRate;
    passCompletion: HabitRate; wideActivity: HabitRate; observedFootCounts: { left: number; right: number } };
  physical: { provenance: "ASSUMED_SHARED_ROLE_PRIOR"; maxSpeed: number; acceleration: number;
    reactionSeconds: number; ballSpeed: number; description: string };
  confidence: { level: string; description: string }; validation: BehaviorValidation; assumptions: string[];
}
export interface BehaviorModel {
  schemaVersion: "1.0"; cutoffDate: string; holdoutMatchId: number; revision: string; historyMatchCount: number;
  cohort: { role: string; actionEvents: number; excludedPlayerIds: number[] };
  profiles: BehaviorProfile[]; methodology: Record<string, number | string>;
  fittingMilliseconds: number; downloadAndPreparationSeconds: number;
  sourceFiles: { url: string; sha256: string }[];
  historicalPlayerStats?: { matchId: number; date: string; teamId: number; playerId: string; positions: string[];
    minutes: number | null; stats: Record<string, number | null> }[];
}
/** Shared substitution contract: all frame coordinates below are 0–100, not metres. */
export interface RecommendedMoment {
  id: string; matchId: string; timeSec: number; title: string; description: string;
  momentumDelta: number; relevanceScore: number; relevanceReasons: string[];
  position: string; dataStatus: "observed" | "estimated" | "simulated"; dataCoverage: number;
}
export interface ReplacementCandidate {
  id: string; name: string; position: string; secondaryPositions: string[];
  source: "bench" | "scouting"; attributes: Record<string, number | null>;
  positionFit: number | null; dataCoverage: number;
  provenance: Record<string, unknown>; teamId: string; team?: string; dateOfBirth: string | null;
  ageAtHistoricalMatch: number | null; historicalActions: unknown[]; missingAttributes: string[]; limitations: string[];
}
export interface SimulationScenario {
  id: string; sportId: string; matchId: string; momentId: string;
  originalPlayerId: string; candidatePlayerId: string; seed: number;
}
export interface MultiGhostScenario {
  id: string; sportId: "football"; matchId: string; momentId: string; seed: number;
  replacements: {originalPlayerId: string; candidatePlayerId: string}[];
}
export type SavedSimulationScenario = SimulationScenario | MultiGhostScenario;
export interface TrackingFrame {
  sourceFrame: number; period: number; periodTimeSec: number; matchTimeSec?: number | null; videoTimeSec?: number | null;
  dataStatus: "OBSERVED" | "ESTIMATED"; ball: Point | null; players: Record<string, Point | null>; quality: Record<string, unknown>;
}
export interface TrackingCoverage {
  playable: boolean; frameCount: number; status: string; missingBall: number; missingPlayerValues: number;
  segments: {period: number; firstIndex: number; lastIndex: number; startSec: number; endSec: number; playerIds: string[]}[];
  gaps: {period: number; fromSec: number; toSec: number}[]; bosniaBlocked: boolean;
}
export interface VerifiedReplayPlayer {
  id: string; providerId: string; name: string; position: string | null; secondaryPositions: string[];
  teamId: string; source: string; isStarter: boolean | null; dateOfBirth: string | null;
}
export interface ReplayMatch {
  id: string; provider: string; providerId: string; name: string; date: string | null;
  teams: {id: string; providerId: string; name: string}[]; score: unknown | null;
  pitch: {length: number; width: number}; fps: number; playable: true;
  trackingStatus: string[]; coverage: TrackingCoverage; source: {name: string; url: string; [key: string]: unknown}; limitations: string[];
}
export interface TrackingPage {
  matchId: string; coordinateSystem: string; timeBasis: string; total: number; offset: number; limit: number;
  frames: TrackingFrame[]; coverage: TrackingCoverage; noInterpolation: true;
}
export interface DatasetRegistry {
  verifiedDataOnly: true; providers: {provider: string; matchIdentifier: string | null; playable: boolean;
    accessibility: string; validationStatus: string; [key: string]: unknown}[];
  importErrors: {file: string; reason: string}[]; policy: string;
}
export interface GhostBranch {
  id: string; replacements: MultiGhostScenario["replacements"]; dataStatus: "SIMULATED"; frames: SimulationFrame[];
  originalMetrics: Record<string, number | null>; alternativeMetrics: Record<string, number | null>; metrics: SimulationResult["metrics"];
  coupling: {separationEffort: number; method: string};
}
export interface VerifiedSimulationResult extends SimulationResult {
  originalDataStatus: "OBSERVED" | "ESTIMATED"; originalLineup: string[]; branches: GhostBranch[];
  findings: ScenarioFindings["findings"]; evidence: Record<string, unknown>;
}
export interface SimulationFrame { timeSec: number; ball: Point; players: Record<string, Point> }
export interface SimulationResult {
  scenarioId: string; status: "completed" | "failed"; originalFrames: SimulationFrame[];
  alternativeFrames: SimulationFrame[];
  metrics: { originalValue: number | null; alternativeValue: number | null; delta: number | null };
  explanations: string[]; limitations: string[]; dataCoverage: number;
}
export interface SubstitutionLineup {
  matchId: string; sportId: string;
  players: { id: string; name: string; position: string; secondaryPositions: string[];
    teamId: string | number; source: string; dataStatus: string; providerId?: number; isStarter: boolean; isBench: boolean }[];
  source: { name: string; url: string; revision?: string };
}
export interface RecommendationConfig {
  sportId: string; weights: Record<string, number>; windowSeconds: number; maxWindowOverlap: number;
  roles: Record<string, { aliases: string[]; tags: Record<string, number>; adjacent: Record<string, number> }>;
  modeledPhysical: Record<string, number>; coverage: Record<string, number>;
}
export interface ScenarioFindings {
  scenarioId: string; dataStatus: string; source: SubstitutionLineup["source"];
  modeledDefaults: Record<string, number>; limitations: string[];
  evidence?: Record<string, unknown>;
  historicalEvidence?: { historicalActionContribution: number | null; teamPlayingStyleFit: number | null;
    passingCompletionRate: number | null; progressivePassesPer90: number | null; minutes: number; matchIds: number[]; method: string };
  findings: { scenarioId: string; branchId?: string; metricId: string; unit: string; originalValue: number;
    alternativeValue: number; delta: number; interpretation: string; limitation: string; suggestedInvestigation: string }[];
}
export interface CandidateAssessment {
  candidateId: string; overallScore: number | null; limitation: string;
  groups: { role: string; scenarioCount: number; scenarioIds: string[]; teamFitScore: number;
    category: string; recruitmentPriority: string; confidence: string;
    components: { positionalSuitability: number | null; historicalActionContribution: number | null;
      teamPlayingStyleFit: number | null; simulatedContribution: number; dataCoverage: number };
    strengths: string[]; weaknesses: string[]; methodology: string }[];
}
export interface BehaviorStatus {
  ready: boolean; modelType: string; profileCount: number; historyMatchCount: number;
  fittingMilliseconds: number | null; downloadAndPreparationSeconds: number | null;
}
export interface BehaviorScenario {
  id: string; matchId: string; momentId: string; title: string; durationSec: number;
  candidateIds: string[]; description: string; reference: string; source: MatchSummary["source"];
}
export interface BehaviorFrame { time: number; dataKind: "SIMULATED"; ball: Point; players: Record<string, Point>; ballOwnerId: string | null }
export interface BehaviorDecision {
  time: number; action: string; target?: Point; context?: string; underPressure?: boolean;
  source: string; reason: string; prior?: ActionMix;
  options: { action: string; score?: number; habit?: number }[];
}
export interface BehaviorSimulation {
  schemaVersion: "1.0"; mode: "behavior-experiment"; matchId: string; momentId: string; candidateId: string;
  seed: number; fps: number; durationSec: number; outgoingPlayerId: string; incomingPlayerId: string;
  referenceFrames: Frame[]; alternativeFrames: BehaviorFrame[]; referenceAvailableUntilSec: number;
  recordedStartFrame: number; branchStartTimeSec: number; recordedContextFrames: Frame[];
  decisions: BehaviorDecision[];
  events: { time: number; type: string; playerId?: string; receiverId?: string; modeledLaneRisk?: number; interpretation?: string }[];
  terminal: { time: number; type: string; interpretation: string } | null;
  analysis: { metrics: Record<string, number>; decisionCounts: Record<string, number>; reasoning: string[]; confidence: string };
  profileEvidence: { id: string; sample: BehaviorSample; cutoffDate: string; validation: BehaviorValidation };
  assumptions: string[];
}
export class GhostXIApiError extends Error { code: string; status: number; constructor(message: string, code: string, status: number) }
export function createGhostXIClient(options?: { baseUrl?: string; fetchImpl?: typeof fetch }): GhostXIClient;
