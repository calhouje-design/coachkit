export const SERIAL_TEST_TIMEOUT_MS = 10000;
export const SERIAL_TASK_TIMEOUT_MS = 9750;

export function link(readTail, writeTail, task, cleanup, timeoutMs = SERIAL_TASK_TIMEOUT_MS) {
  const previous = readTail();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  writeTail(gate);
  return previous.then(() => {
    let timer;
    let settled = false;
    const done = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`serial test timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      Promise.resolve()
        .then(task)
        .then((value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        }, (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        });
    });
    return done.finally(() => {
      clearTimeout(timer);
      try {
        cleanup?.();
      } finally {
        release();
      }
    });
  });
}

export function defineSerial(testFn, {
  timeoutMs = SERIAL_TEST_TIMEOUT_MS,
  taskTimeoutMs = SERIAL_TASK_TIMEOUT_MS,
  cleanup,
} = {}) {
  let tail = Promise.resolve();
  return (name, fn) => {
    testFn(name, { timeout: timeoutMs }, () => link(
      () => tail,
      (next) => { tail = next; },
      fn,
      cleanup,
      taskTimeoutMs,
    ));
  };
}
