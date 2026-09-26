async function settlesWithin(promise: Promise<void>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function stopWithEscalation(options: {
  exited: Promise<void>;
  signal(signal: "SIGTERM" | "SIGKILL"): void;
  termWaitMs: number;
  killWaitMs: number;
}): Promise<boolean> {
  options.signal("SIGTERM");
  const termWasEnough = await settlesWithin(options.exited, options.termWaitMs);
  if (termWasEnough) return true;

  options.signal("SIGKILL");
  return settlesWithin(options.exited, options.killWaitMs);
}
