import fs from 'fs';
import path from 'path';

const METRICS_DIR = path.join(process.cwd(), 'data', 'orchestrator');
const METRICS_FILE = path.join(METRICS_DIR, 'metrics.json');

type InferenceEvent = {
    timestamp: string;
    narrativeGoal?: string;
    bestAction?: string | null;
    confidence?: number;
    suggestionNeeded?: boolean;
};

type DispatchEvent = {
    timestamp: string;
    valid: boolean;
    latencyMs: number;
    validationErrors: number | undefined;
};

const MAX_RECENT = 200;

const metrics = {
    totalDispatches: 0,
    validDispatches: 0,
    invalidDispatches: 0,
    dispatchLatencies: [] as number[],
    recentDispatches: [] as DispatchEvent[],
    totalInferences: 0,
    suggestionNeeded: 0,
    recentInferences: [] as InferenceEvent[]
};

function ensureDir() {
    try {
        fs.mkdirSync(METRICS_DIR, { recursive: true });
    } catch (e) { }
}

function persist() {
    try {
        ensureDir();
        fs.writeFileSync(METRICS_FILE, JSON.stringify({ metrics, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
    } catch (e) {
        // best-effort
        // eslint-disable-next-line no-console
        console.error('Failed to persist metrics', e instanceof Error ? e.message : e);
    }
}

export function recordDispatch(valid: boolean, latencyMs: number, validationErrors?: number) {
    metrics.totalDispatches += 1;
    if (valid) metrics.validDispatches += 1;
    else metrics.invalidDispatches += 1;
    metrics.dispatchLatencies.push(latencyMs);
    if (metrics.dispatchLatencies.length > MAX_RECENT) metrics.dispatchLatencies.shift();
    const ev: DispatchEvent = { timestamp: new Date().toISOString(), valid, latencyMs, validationErrors };
    metrics.recentDispatches.push(ev);
    if (metrics.recentDispatches.length > MAX_RECENT) metrics.recentDispatches.shift();
    persist();
}

export function recordInference(narrativeGoal: string, bestAction: string | null, confidence: number, suggestionNeeded: boolean) {
    metrics.totalInferences += 1;
    if (suggestionNeeded) metrics.suggestionNeeded += 1;
    const ev: InferenceEvent = { timestamp: new Date().toISOString(), narrativeGoal, bestAction, confidence, suggestionNeeded };
    metrics.recentInferences.push(ev);
    if (metrics.recentInferences.length > MAX_RECENT) metrics.recentInferences.shift();
    persist();
}

export function getMetricsSnapshot() {
    return { metrics, updatedAt: new Date().toISOString() };
}

export function readPersisted() {
    try {
        if (!fs.existsSync(METRICS_FILE)) return getMetricsSnapshot();
        const raw = fs.readFileSync(METRICS_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return getMetricsSnapshot();
    }
}

export default { recordDispatch, recordInference, getMetricsSnapshot, readPersisted };
