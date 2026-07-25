# w2mcp hosting gateway image.
# Runs the gateway, which spawns each generated MCP server as an isolated subprocess.
FROM node:22-slim

WORKDIR /app

# Install deps (tsx runs the .ts gateway + generated servers at runtime, so it is a
# runtime dependency — not a devDependency — or a production install would drop it).
# --include=dev is belt-and-suspenders in case NODE_ENV=production is set by the platform.
COPY package.json package-lock.json* ./
RUN npm ci --include=dev || npm install

# App + generated servers (registry.json points at these). Keep generated servers in the image.
COPY . .

ENV PORT=8080
EXPOSE 8080

# W2MCP_MASTER_KEY and DATABASE_URL are provided as secrets at runtime, never baked in.
CMD ["npx", "tsx", "src/gateway-cli.ts"]
