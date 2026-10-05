// A stand-in OpenAI-compatible model on 127.0.0.1: records each request Hermes sends, answers with a fixed text.
// So CI sees the exact prompt Hermes builds, with no model key. Run: node .github/mock-model.mjs <port> <log.jsonl>
import fs from "node:fs";
import http from "node:http";
const [port, logFile] = process.argv.slice(2);
const answer = "mock model: I only record the prompt.";
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    fs.appendFileSync(logFile, JSON.stringify({ method: req.method, url: req.url, body }) + "\n");
    if (req.url.endsWith("/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ object: "list", data: [{ id: "mock-model", object: "model", owned_by: "mock", context_length: 128000 }] }));
    }
    let json = {};
    try { json = JSON.parse(body); } catch {}
    const base = { id: "chatcmpl-mock", created: Math.floor(Date.now() / 1000), model: "mock-model" };
    if (json.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: answer }, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } })}\n\n`);
      return res.end("data: [DONE]\n\n");
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ...base, object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } }));
  });
}).listen(Number(port), "127.0.0.1");
