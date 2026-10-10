// A static build needs the backend awake so its generated menus are current.
const url = (process.env.SERVER_API_URL ?? process.env.PUBLIC_API_URL)?.trim().replace(/\/+$/, '');
if (!url) process.exit(0);

const deadline = Date.now() + 5 * 60_000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${url}/api/meta`, { signal: AbortSignal.timeout(20_000) });
    if (response.ok) {
      console.log(`[wait-for-backend] ${url} is ready`);
      process.exit(0);
    }
  } catch { /* The service may still be waking up. */ }
  console.log(`[wait-for-backend] waiting for ${url} ...`);
  await new Promise(resolve => setTimeout(resolve, 10_000));
}

console.error(`[wait-for-backend] ${url} did not answer in 5 minutes; aborting the build`);
process.exitCode = 1;
