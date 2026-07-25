/**
 * node:sqlite prints an ExperimentalWarning on import. It is expected, it is
 * not actionable for anyone running these scripts, and it buries the output
 * that matters (what was published, what was skipped and why).
 *
 * The filter is deliberately narrow — matched on both the warning type and the
 * message — so every other warning, including future ones from node:sqlite,
 * still reaches the console. Imported before node:sqlite so it is installed
 * first; ES module imports run in declaration order.
 */
const original = process.emitWarning;

process.emitWarning = function emitWarning(warning, ...rest) {
  const message = typeof warning === 'string' ? warning : warning?.message ?? '';
  const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type ?? warning?.name;
  if (type === 'ExperimentalWarning' && /\bSQLite\b/i.test(message)) return undefined;
  return original.call(process, warning, ...rest);
};
