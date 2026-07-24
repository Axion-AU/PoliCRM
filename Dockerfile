# ============================================================
# Stage 1: Frontend builder (React / Vite)
# ============================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# Output is in src/api/static/dist/ (per vite.config.ts)

# ============================================================
# Stage 2: Production image (Python FastAPI + static frontend)
# ============================================================
FROM python:3.11-slim AS production

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DISPLAY=:99

# Install system deps: Firefox ESR + GeckoDriver for Selenium AEC checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    gnupg \
    firefox-esr \
    ca-certificates \
    libxtst6 \
    libgtk-3-0 \
    libdbus-glib-1-2 \
    libdbus-1-3 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Install GeckoDriver (latest release)
RUN GECKODRIVER_VERSION=$(curl -s https://api.github.com/repos/mozilla/geckodriver/releases/latest | grep 'tag_name' | cut -d\" -f4) && \
    wget -q "https://github.com/mozilla/geckodriver/releases/download/$GECKODRIVER_VERSION/geckodriver-$GECKODRIVER_VERSION-linux64.tar.gz" && \
    tar -xzf "geckodriver-$GECKODRIVER_VERSION-linux64.tar.gz" -C /usr/local/bin && \
    rm "geckodriver-$GECKODRIVER_VERSION-linux64.tar.gz" && \
    chmod +x /usr/local/bin/geckodriver

WORKDIR /app

# Install Python dependencies (layer cached independently)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY src/ ./src/

# Copy built frontend artifacts from stage 1
COPY --from=frontend-builder /build/frontend/src/api/static/dist ./src/api/static/dist

# Copy alembic migrations
COPY alembic.ini .
COPY src/api/alembic/ ./src/api/alembic/

# Copy static data files
COPY src/api/data/ ./src/api/data/
COPY src/api/templates/ ./src/api/templates/
COPY src/api/static/css/ ./src/api/static/css/
COPY src/api/static/js/ ./src/api/static/js/
COPY src/api/static/geojson/ ./src/api/static/geojson/

# Copy GeoJSON directory
COPY src/GeoJSON/ ./src/GeoJSON/

# Expose FastAPI port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run with uvicorn (not the shell script, which assumes a dev environment)
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
