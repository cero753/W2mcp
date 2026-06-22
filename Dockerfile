# anymcp hosting gateway image.
# Runs the gateway, which spawns each generated MCP server as an isolated subprocess.
FROM node:22-slim

WORKDIR /app

# Install deps (tsx is needed at runtime to run the .ts gateway + generated servers).
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# App + generated servers (registry.json points at these). Keep generated servers in the image.
COPY . .

ENV PORT=8080
EXPOSE 8080

# ANYMCP_MASTER_KEY and DATABASE_URL are provided as secrets at runtime, never baked in.
CMD ["npx", "tsx", "src/gateway-cli.ts"]
