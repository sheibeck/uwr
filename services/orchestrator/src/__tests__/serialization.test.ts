import { describe, it, expect } from 'vitest';
import { safeSerialize, timestampToIso } from '../utils/serialize.js';

describe('serialization utilities', () => {
    it('converts BigInt to number when safe and to string when not', () => {
        const small = { v: BigInt(42) };
        const outSmall = safeSerialize(small) as any;
        expect(typeof outSmall.v).toBe('number');
        expect(outSmall.v).toBe(42);

        const huge = { v: BigInt(Number.MAX_SAFE_INTEGER) * BigInt(10) };
        const outHuge = safeSerialize(huge) as any;
        expect(typeof outHuge.v).toBe('string');
        expect(outHuge.v).toBe(String(huge.v));
    });

    it('converts spacetime timestamp shapes to ISO strings', () => {
        // micros for 2025-01-01T00:00:00.000Z
        const ms = Date.UTC(2025, 0, 1);
        const micros = BigInt(ms) * BigInt(1000);
        const tsShape = { createdAt: { __timestamp_micros_since_unix_epoch__: micros } };
        const out = safeSerialize(tsShape) as any;
        expect(typeof out.createdAt).toBe('string');
        expect(new Date(out.createdAt).toISOString()).toBe(new Date(ms).toISOString());
    });

    it('timestampToIso handles numeric string micros', () => {
        const ms = Date.UTC(2025, 0, 2);
        const microsStr = String(ms * 1000);
        const iso = timestampToIso(microsStr);
        expect(iso).toBe(new Date(ms).toISOString());
    });
});
