"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { localStorageAdapter, type PersistedState } from "./persistence";

type TestResult = {
  name: string;
  pass: boolean;
  error?: string;
  expected?: string;
  actual?: string;
};

type RunResponse =
  | { ok: true; results: TestResult[]; logs: string[] }
  | { ok: false; error: string; logs: string[] };

type TestCaseDraft = {
  id: string;
  args: string;
  expected: string;
};

type ParsedCase = {
  name: string;
  args: unknown[];
  expected: unknown;
};

const defaultPrompt = `Write a JavaScript function named solution(n) that returns the square root of n.
Constraints:
- Assume n is a non-negative number.
- Use built-in Math where appropriate.
- Do not use "export" statements.
Return only the function definition.`;

const defaultCode = `function solution(n) {
  return Math.sqrt(n);
}`;

const defaultCases: TestCaseDraft[] = [
  { id: "case-1", args: "9", expected: "3" },
  { id: "case-2", args: "0", expected: "0" },
  {
    id: "case-3",
    args: "2",
    expected: "1.41421356237",
  },
];

const parseValue = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
};

const formatValue = (value?: string) => value ?? "";

const getNextCaseId = (items: TestCaseDraft[]) => {
  let maxId = 0;
  for (const item of items) {
    const match = /case-(\d+)/.exec(item.id);
    if (match) {
      const value = Number.parseInt(match[1] ?? "0", 10);
      if (!Number.isNaN(value)) {
        maxId = Math.max(maxId, value);
      }
    }
  }
  return maxId + 1;
};

export default function Home() {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [code, setCode] = useState(defaultCode);
  const [cases, setCases] = useState<TestCaseDraft[]>(defaultCases);
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [results, setResults] = useState<TestResult[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const workerRef = useRef<Worker | null>(null);
  const nextId = useRef(4);
  const [isHydrated, setIsHydrated] = useState(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/runner.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<RunResponse>) => {
      if (event.data.ok) {
        setStatus("idle");
        setResults(event.data.results);
        setLogs(event.data.logs);
        setError(null);
        return;
      }
      setStatus("error");
      setResults([]);
      setLogs(event.data.logs);
      setError(event.data.error);
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    const saved = localStorageAdapter.load();
    if (saved) {
      if (typeof saved.prompt === "string") setPrompt(saved.prompt);
      if (typeof saved.code === "string") setCode(saved.code);
      if (Array.isArray(saved.cases)) {
        setCases(saved.cases);
        nextId.current = Math.max(nextId.current, getNextCaseId(saved.cases));
      }
      if (typeof saved.apiKey === "string") setApiKey(saved.apiKey);
    }
    setIsHydrated(true);
    const unsubscribe = localStorageAdapter.subscribe?.((next) => {
      if (typeof next.prompt === "string") setPrompt(next.prompt);
      if (typeof next.code === "string") setCode(next.code);
      if (Array.isArray(next.cases)) {
        setCases(next.cases);
        nextId.current = Math.max(nextId.current, getNextCaseId(next.cases));
      }
      if (typeof next.apiKey === "string") setApiKey(next.apiKey);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
    }
    persistTimer.current = setTimeout(() => {
      const payload: PersistedState = {
        version: 1,
        prompt,
        code,
        cases,
        apiKey,
      };
      localStorageAdapter.save(payload);
    }, 250);
    return () => {
      if (persistTimer.current) {
        clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }
    };
  }, [prompt, code, cases, apiKey, isHydrated]);

  const passCount = useMemo(
    () => results.filter((result) => result.pass).length,
    [results]
  );

  const handleGenerate = async () => {
    setStatus("running");
    setError(null);
    setResults([]);
    setLogs([]);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-LLM-Key": apiKey } : {}),
        },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to generate code.");
      }
      setCode(data.code ?? "");
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error.");
    }
  };

  const handleRun = () => {
    if (!workerRef.current) return;
    const parsedCases: ParsedCase[] = [];
    for (const [index, draft] of cases.entries()) {
      const argsValue = parseValue(draft.args);
      const expectedValue = parseValue(draft.expected);
      const args = Array.isArray(argsValue)
        ? argsValue
        : [argsValue].filter((value) => value !== undefined);
      const labelBase = draft.args.trim() ? `(${draft.args})` : "";

      parsedCases.push({
        name: `Case ${index + 1} ${labelBase}`.trim(),
        args,
        expected: expectedValue,
      });
    }

    setStatus("running");
    setError(null);
    setResults([]);
    setLogs([]);
    workerRef.current.postMessage({ code, cases: parsedCases });
  };

  const updateCase = (id: string, patch: Partial<TestCaseDraft>) => {
    setCases((prev) =>
      prev.map((testCase) =>
        testCase.id === id ? { ...testCase, ...patch } : testCase
      )
    );
  };

  const addCase = () => {
    const id = `case-${nextId.current++}`;
    setCases((prev) => [...prev, { id, args: "", expected: "" }]);
  };

  const removeCase = (id: string) => {
    setCases((prev) => prev.filter((testCase) => testCase.id !== id));
  };

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">Prompt → Code → Tests</p>
          <h1>Spec Interpreter Prototype</h1>
          <p className="subtitle">
            Generate JS from text, execute in a sandboxed worker, and verify
            behavior with a simple test harness.
          </p>
        </div>
        <div className="actions">
          <button onClick={handleGenerate} disabled={status === "running"}>
            Generate
          </button>
          <button onClick={handleRun} disabled={status === "running"}>
            Run Tests
          </button>
        </div>
      </header>

      <section className="panel api-panel">
        <div className="panel-header">
          <h2>LLM API Key (Optional)</h2>
        </div>
        <input
          className="api-input"
          type="password"
          placeholder="sk-..."
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <p className="muted">
          Stored locally in this browser. If empty, the server will use
          `LLM_API_KEY`.
        </p>
      </section>

      <main className="grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Prompt</h2>
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Generated Code</h2>
          </div>
          <textarea
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Test Cases</h2>
            <button className="secondary" type="button" onClick={addCase}>
              Add
            </button>
          </div>
          <div className="case-list">
            {cases.map((testCase) => (
              <div className="case-row" key={testCase.id}>
                <input
                  className="case-args"
                  placeholder="Args (e.g. 9 or [2, 3])"
                  value={formatValue(testCase.args)}
                  onChange={(event) =>
                    updateCase(testCase.id, { args: event.target.value })
                  }
                />
                <input
                  className="case-expected"
                  placeholder="Expected (e.g. 3)"
                  value={formatValue(testCase.expected)}
                  onChange={(event) =>
                    updateCase(testCase.id, { expected: event.target.value })
                  }
                />
                <button
                  className="ghost"
                  type="button"
                  onClick={() => removeCase(testCase.id)}
                >
                  Remove
                </button>
              </div>
            ))}
            <p className="muted">
              Args and expected values accept JSON (e.g. `3`, `&quot;ok&quot;`,
              `[1, 2]`).
              For multiple arguments, use a JSON array. If parsing fails, the
              raw text is treated as a string.
            </p>
          </div>
        </section>
      </main>

      <aside className="results">
        <div className="panel-header">
          <h2>Results</h2>
          {results.length > 0 && (
            <span>
              {passCount}/{results.length} passing
            </span>
          )}
        </div>
        {status === "running" && <p className="muted">Running…</p>}
        {error && <p className="error">{error}</p>}
        {results.length === 0 && status !== "running" && !error && (
          <p className="muted">No results yet.</p>
        )}
        <ul className="results-list">
          {results.map((result) => (
            <li key={result.name} data-pass={result.pass}>
              <span>{result.name}</span>
              <span>{result.pass ? "pass" : "fail"}</span>
              {!result.pass && result.error && (
                <span className="muted">{result.error}</span>
              )}
              {!result.pass && result.expected && (
                <span className="muted">expected: {result.expected}</span>
              )}
              {!result.pass && result.actual && (
                <span className="muted">actual: {result.actual}</span>
              )}
            </li>
          ))}
        </ul>
        {logs.length > 0 && (
          <div className="logs">
            <p className="muted">Console output</p>
            <pre>{logs.join("\n")}</pre>
          </div>
        )}
      </aside>
    </div>
  );
}
