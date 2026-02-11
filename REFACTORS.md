• Here’s a focused refactor/optimization audit based on the current code structure (size + patterns). I’m not proposing
  a big-bang rewrite — these are incremental, low-risk wins.
  High-impact targets

  - Split spacetimedb/src/index.ts (161 KB) into focused modules, but do it incrementally to avoid the import/export
    breakage we hit earlier. Start by extracting:
      - schema/* (table definitions only)
      - seed/* (ensure* + seed data)
      - helpers/* (group/permission/ability utilities)
