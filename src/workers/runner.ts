/// <reference lib="webworker" />

type TestResult = {
  name: string;
  pass: boolean;
  error?: string;
  expected?: string;
  actual?: string;
};

type WorkerResponse =
  | { ok: true; results: TestResult[]; logs: string[] }
  | { ok: false; error: string; logs: string[] };

type WorkerRequest = {
  code: string;
  cases: Array<{
    name: string;
    args: unknown[];
    expected: unknown;
  }>;
};

const captureConsole = () => {
  const logs: string[] = [];
  const serialize = (value: unknown) => {
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const logger = (...args: unknown[]) => {
    logs.push(args.map(serialize).join(" "));
  };

  return {
    logs,
    console: {
      log: logger,
      info: logger,
      warn: logger,
      error: logger,
    },
  };
};

const runUserCode = (code: string, sandboxConsole: Console) => {
  const moduleShim = { exports: {} as unknown };
  const exportsShim = moduleShim.exports;
  const wrapper = new Function(
    "module",
    "exports",
    "console",
    `${code}\n\nreturn typeof solution !== "undefined" ? solution : module.exports;`
  );
  return wrapper(moduleShim, exportsShim, sandboxConsole);
};

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key]
    )
  );
};

const serializeValue = (value: unknown) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const runTests = (solution: unknown, cases: WorkerRequest["cases"]) => {
  if (typeof solution !== "function") {
    throw new Error("solution must be a function.");
  }

  const results: TestResult[] = [];
  for (const testCase of cases) {
    try {
      const actual = (solution as (...args: unknown[]) => unknown)(
        ...testCase.args
      );
      if (deepEqual(actual, testCase.expected)) {
        results.push({ name: testCase.name, pass: true });
      } else {
        results.push({
          name: testCase.name,
          pass: false,
          error: "Output mismatch.",
          expected: serializeValue(testCase.expected),
          actual: serializeValue(actual),
        });
      }
    } catch (error) {
      results.push({
        name: testCase.name,
        pass: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { code, cases } = event.data;
  const { logs, console } = captureConsole();

  try {
    const solution = runUserCode(code, console);
    const results = runTests(solution, cases ?? []);
    const response: WorkerResponse = { ok: true, results, logs };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      logs,
    };
    self.postMessage(response);
  }
};
