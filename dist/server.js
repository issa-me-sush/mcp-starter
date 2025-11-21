"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const PORT = parseInt(process.env.PORT || '3333', 10);
// Create MCP server and register tools
const server = new mcp_js_1.McpServer({ name: 'basic-mcp-server', version: '0.2.0' }, { capabilities: {} });
server.tool('echo', 'Echo back a message', { message: zod_1.z.string() }, async ({ message }) => {
    console.log(`[TOOL CALL] echo: "${message}"`);
    const result = { content: [{ type: 'text', text: message }] };
    console.log(`[TOOL RESULT] echo: "${message}"`);
    return result;
});
server.tool('arcane_math_fusion', 'Compute result = a^2 + 3*b - floor(sqrt(|a-b|))', { a: zod_1.z.number().describe('First number'), b: zod_1.z.number().describe('Second number') }, async ({ a, b }) => {
    console.log(`[TOOL CALL] arcane_math_fusion: a=${a}, b=${b}`);
    const result = a * a + 3 * b - Math.floor(Math.sqrt(Math.abs(a - b)));
    console.log(`[TOOL RESULT] arcane_math_fusion: ${result} (computed: ${a}^2 + 3*${b} - floor(sqrt(|${a}-${b}|)))`);
    return {
        content: [
            { type: 'text', text: `arcane_math_fusion(a=${a}, b=${b}) = ${result}` },
        ],
        value: result,
    };
});
// Express app with official SSE transport endpoints
const app = (0, express_1.default)();
app.use(express_1.default.json());
const sseTransports = {};
app.get('/sse', async (req, res) => {
    try {
        const transport = new sse_js_1.SSEServerTransport('/messages', res);
        console.log(`[SSE] New connection established, sessionId: ${transport.sessionId}`);
        sseTransports[transport.sessionId] = transport;
        transport.onclose = () => {
            console.log(`[SSE] Connection closed, sessionId: ${transport.sessionId}`);
            delete sseTransports[transport.sessionId];
        };
        await server.connect(transport);
    }
    catch (err) {
        console.error('[SSE] Failed to establish connection:', err);
        if (!res.headersSent)
            res.status(500).send('Failed to establish SSE');
    }
});
app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId) {
        res.status(400).send('Missing sessionId');
        return;
    }
    const transport = sseTransports[sessionId];
    if (!transport) {
        res.status(404).send('Session not found');
        return;
    }
    console.log(`[MESSAGE] Received from sessionId: ${sessionId}, method: ${req.body?.method || 'unknown'}`);
    await transport.handlePostMessage(req, res, req.body);
});
app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => {
    console.log(`MCP SDK SSE server listening on http://localhost:${PORT}`);
    console.log(`- SSE: GET /sse, POST /messages`);
});
