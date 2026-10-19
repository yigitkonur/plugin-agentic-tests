# Fixture Shop MCP server requirements

1. The server exposes exactly the tools in `mcp-surface.json` with those required and optional parameters.
2. `list_orders` returns the fixture user's orders from the shop API as JSON text; the demo user starts with orders 1001, 1002 and 1003.
3. `create_order` creates an order through the shop API; the new order then appears in the API's `GET /api/orders`.
4. Invalid arguments (unknown item, `qty` outside 1 to 99, `limit` outside 1 to 50) return a tool result with `isError: true` and a message naming the field; they never create anything.
5. `shop_status` reports the API base URL it uses and whether the API answers.
