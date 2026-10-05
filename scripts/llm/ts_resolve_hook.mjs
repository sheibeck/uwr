// Node module-customization hook: lets plain `node` load the server's extensionless relative
// imports inside spacetimedb/src (the bundler resolves them; Node does not). Only a relative
// specifier that fails to resolve is retried with a .ts extension. Registered by
// call_log_report.mjs when it runs as a CLI; vitest resolves these imports itself.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    const hasExt = /\.[a-z]+$/i.test(specifier);
    if (relative && !hasExt && err && err.code === 'ERR_MODULE_NOT_FOUND') {
      return nextResolve(specifier + '.ts', context);
    }
    throw err;
  }
}
