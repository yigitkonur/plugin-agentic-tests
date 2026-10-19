# Fixture Shop API requirements

The contract is `openapi.json`. In short:

1. `POST /api/login` returns a bearer token for valid credentials, 401 `invalid_credentials` otherwise, 400 `validation_error` with `field` for missing fields.
2. `GET /api/orders` needs a valid token: no token or a bad token is 401 `unauthorized`, an expired token is 401 `token_expired`. The demo user starts with three orders (ids 1001, 1002, 1003).
3. `limit` must be 1 to 50 and `offset` at least 0; otherwise 400 `validation_error` naming the field.
4. `POST /api/orders` is idempotent per `Idempotency-Key`: the same key and body returns the original order (200, `Idempotent-Replayed: true`) and creates nothing new; the same key with a different body is 409.
5. Error bodies are `{"error": {"code", "message", "field"?}}` and never contain stack traces.
6. Browsers on `http://127.0.0.1:3000` and `http://localhost:3000` may call the API (CORS); other origins get no `Access-Control-Allow-Origin`.
