/** Keep requests short enough for the deployed gateway; only submission carries the API key. */
export async function routeJob<T>(url: string, init: RequestInit, timeoutMs = 420_000,
  request: typeof fetch = fetch, wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 1500))): Promise<T> {
  const read = async (path: string, options: RequestInit) => {
    const response = await request(path, { ...options, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(response.status === 504
        ? 'The website gateway timed out. Please try again.'
        : 'The server returned an unexpected response. Check your login and try again.');
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Route request failed. Please try again.');
    return data;
  };
  const submitted = await read(url, init);
  if (typeof submitted.jobId !== 'string' || !/^[a-f0-9-]{36}$/.test(submitted.jobId))
    throw new Error('The server did not return a route request ID.');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await read(`/api/route-planner/jobs/${submitted.jobId}`, { method: 'GET' });
    if (job.status === 'completed') return job.result as T;
    if (job.status === 'failed') throw new Error(job.detail || 'Route request failed. Please try again.');
    if (job.status !== 'running') throw new Error('The route request returned an unknown status.');
    await wait();
  }
  throw new Error('Route planning is taking too long. Please try again shortly.');
}
