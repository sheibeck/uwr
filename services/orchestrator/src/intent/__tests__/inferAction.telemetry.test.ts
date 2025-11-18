import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import inferAction from '../inferAction.js';

describe('inferAction telemetry', () => {
    it('writes a telemetry line for low-confidence inferences', () => {
        const TELE_DIR = path.join(process.cwd(), 'data', 'orchestrator', 'telemetry');
        const TELE_FILE = path.join(TELE_DIR, 'inference.jsonl');

        // ensure telemetry dir exists
        if (!fs.existsSync(TELE_DIR)) fs.mkdirSync(TELE_DIR, { recursive: true });

        // read existing lines
        let beforeLines: string[] = [];
        if (fs.existsSync(TELE_FILE)) {
            beforeLines = fs.readFileSync(TELE_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
        }

        // ensure telemetry file exists (touch) so we can read it after
        if (!fs.existsSync(TELE_FILE)) fs.writeFileSync(TELE_FILE, '', 'utf8');

        // craft a low-confidence prompt (nonsense but valid string)
        const prompt = 'blorf zibble flarn ambiguous input that yields low signal';
        const r = inferAction(prompt);

        // Expect r.confidence to be less than threshold used in code (0.6) or equal 0
        expect(r.confidence).toBeLessThan(0.6);

        // ensure telemetry file now has one extra line
        const afterLines = fs.readFileSync(TELE_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
        expect(afterLines.length).toBeGreaterThanOrEqual(beforeLines.length + 1);

        // the last line should parse as JSON and contain the prompt
        expect(afterLines.length).toBeGreaterThan(0);
        const last = afterLines[afterLines.length - 1] || '';
        let parsed: any;
        expect(() => { parsed = JSON.parse(last); }).not.toThrow();
        expect(parsed.narrativeGoal).toBe(prompt);

        // cleanup: remove the appended lines to avoid polluting developer telemetry
        const keep = afterLines.slice(0, beforeLines.length);
        fs.writeFileSync(TELE_FILE, keep.join('\n') + (keep.length ? '\n' : ''), 'utf8');
    });
});
