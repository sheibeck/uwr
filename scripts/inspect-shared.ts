(async () => {
    const m = await import('@shared');
    console.log('keys', Object.keys(m));
})();
