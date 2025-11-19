import { createAdapter } from '../packages/ai-client/dist/index.js';

(async () => {
    const adapter = createAdapter('mock');
    const res = await adapter.generate('Inspect the clearing and look for threats');
    console.log(JSON.stringify(res, null, 2));
})();
