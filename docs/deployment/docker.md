# Docker Deployment

## Development

```dockerfile
# docker-compose.dev.yml
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: policrm
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://postgres:dev@db/policrm
    depends_on:
      - db
    volumes:
      - .:/app

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    depends_on:
      - backend

volumes:
  pgdata:
```

## Production

### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y \
    firefox-esr \
    && rm -rf /var/lib/apt/lists/*

# Install geckodriver
RUN wget -q https://github.com/mozilla/geckodriver/releases/download/v0.33.0/geckodriver-v0.33.0-linux64.tar.gz \
    && tar -xzf geckodriver-*.tar.gz -C /usr/local/bin \
    && rm geckodriver-*.tar.gz

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY . .

# Build frontend
WORKDIR /app/frontend
RUN npm ci && npm run build

WORKDIR /app

EXPOSE 8000

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Environment Variables

```bash
DATABASE_URL=postgresql://user:pass@host/policrm
FIREBASE_PROJECT_ID=your-project
LOG_LEVEL=WARNING
WORKERS=4
```

### Health Check

```bash
curl http://localhost:8000/health
```

## Reverse Proxy (nginx)

```nginx
server {
    listen 80;
    server_name crm.yourparty.org.au;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## SSL with Certbot

```bash
certbot --nginx -d crm.yourparty.org.au
```
