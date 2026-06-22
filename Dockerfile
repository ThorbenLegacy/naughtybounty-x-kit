# NaughtyBounty X-Kit — Dashboard + optional PNG-Build für Railway
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python-is-python3 \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libxshmfence1 fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt \
    && playwright install chromium

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG BUILD_ASSETS=1
RUN if [ "$BUILD_ASSETS" = "1" ]; then npm run build:all; else npm run build && npm run week:build && npm run metadata:build; fi

ENV NODE_ENV=production
ENV HOST=0.0.0.0

EXPOSE 8765

CMD ["npm", "start"]
