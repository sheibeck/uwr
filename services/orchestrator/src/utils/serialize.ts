// Utilities to safely serialize objects that may contain BigInt or Spacetime timestamp shapes.
export function timestampToIso(micros: any): string | null {
    try {
        if (micros === null || micros === undefined) return null;
        if (typeof micros === 'bigint') {
            const msBig = micros / BigInt(1000);
            const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
            const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
            if (msBig <= maxSafe && msBig >= minSafe) return new Date(Number(msBig)).toISOString();
            return msBig.toString();
        }
        if (typeof micros === 'number') {
            const ms = Math.floor(micros / 1000);
            return new Date(ms).toISOString();
        }
        if (typeof micros === 'string' && /^\d+$/.test(micros)) {
            const n = Number(micros);
            if (!Number.isNaN(n)) return new Date(Math.floor(n / 1000)).toISOString();
        }
    } catch { }
    return null;
}

export function valueReplacer(_key: string, value: any) {
    if (value && typeof value === 'object' && '__timestamp_micros_since_unix_epoch__' in value) {
        const iso = timestampToIso((value as any).__timestamp_micros_since_unix_epoch__);
        return iso ?? value;
    }

    if (typeof value === 'bigint') {
        const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
        const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
        if (value <= maxSafe && value >= minSafe) return Number(value);
        return value.toString();
    }
    return value;
}

export function safeSerialize<T>(obj: T): T {
    try {
        return JSON.parse(JSON.stringify(obj, valueReplacer));
    } catch (e) {
        const seen = new WeakSet();
        const transform = (v: any): any => {
            if (v === null || v === undefined) return v;
            if (typeof v === 'bigint') return v.toString();
            if (v && typeof v === 'object' && '__timestamp_micros_since_unix_epoch__' in v) {
                const iso = timestampToIso((v as any).__timestamp_micros_since_unix_epoch__);
                return iso ?? v;
            }
            if (typeof v !== 'object') return v;
            if (seen.has(v)) return undefined;
            seen.add(v);
            if (Array.isArray(v)) return v.map(transform);
            const out: any = {};
            for (const k of Object.keys(v)) {
                out[k] = transform(v[k]);
            }
            return out;
        };
        return transform(obj) as T;
    }
}

export default safeSerialize;
