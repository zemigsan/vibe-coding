# Spec Interpreter Prototype

Generate JavaScript from a natural-language prompt, run it in a sandboxed Web Worker, and validate behavior with a lightweight test harness.

## Setup

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```bash
LLM_API_URL="https://your-llm-endpoint"
LLM_API_KEY="your-api-key"
LLM_MODEL="your-model-id"
```

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Notes

- The browser executes generated code inside a Web Worker.
- Tests run against a `solution` function with `test()` + `assert()` helpers.
- The API route is provider-agnostic but expects an OpenAI-compatible payload shape.
