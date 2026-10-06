/**
 * Wraps an async fetcher so that only the most recently *started* call may
 * deliver its result.
 *
 * Network responses can arrive out of order. Without this guard, a slow
 * request started before the last write landed can resolve after a newer one
 * and overwrite fresh data with a stale snapshot. Here, every call takes a
 * ticket; when a call finishes it only delivers its result if no newer call
 * has started since.
 *
 * Errors from the fetcher propagate to the caller of that particular call.
 */
export function latestOnly<T>(
  fetcher: () => Promise<T>,
  onResult: (value: T) => void,
): () => Promise<void> {
  let latest = 0;
  return async () => {
    const ticket = ++latest;
    const value = await fetcher();
    if (ticket === latest) onResult(value);
  };
}
