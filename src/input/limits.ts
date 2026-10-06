// Input length limit mirrored from the server.
//
// Mirrors PLAYER_INPUT_MAX_CHARS in spacetimedb/src/data/llm_layers.ts. It is never imported from
// there: that module pulls server code into the client bundle. A parity test in
// Composer.test.ts reads the server source text and fails if the two values drift apart.
export const INPUT_MAX_CHARS = 1000;
