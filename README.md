# jwt-authentication-with-otp

Project for simulating an authentication workflow with OTP. A Vue + PrimeVue web client and a NestJS API with two-factor (password + OTP) JWT authentication, backed by MongoDB and Redis.

| Folder | Stack | Details |
| --- | --- | --- |
| [`web/`](web) | Vue 3, Vite, PrimeVue, Pinia | [web/README.md](web/README.md) |
| [`backend/`](backend) | NestJS, Mongoose, Redis, JWT | [backend/README.md](backend/README.md) |

## Requirements

- Node.js 22.18+ or 24.12+
- Yarn 1.22 (Classic)
- Docker with Compose v2.24+ (to run the full stack)

## Project setup

```bash
$ cd web && yarn
$ cd backend && yarn
```

## Environment

Each part has its own `.env.template`. Copy it to `.env` next to it and fill in the values. `.env` files are gitignored.

```bash
$ cp .env.template .env
$ cp web/.env.template web/.env
$ cp backend/.env.template backend/.env
```

### Docker Compose (root `.env`)

| Variable | Description |
| --- | --- |
| `WEB_PORT` | Host port for the web app. Default: `5173` |
| `BACKEND_PORT` | Host port for the API. Default: `8000` |
| `MONGO_PORT` | Host port for MongoDB. Default: `27017` |
| `REDIS_PORT` | Host port for Redis. Default: `6379` |
| `VITE_*` | Web build values, same as `web/.env` below. Baked into the image at build time |

### Web (`web/.env`)

Vite inlines `VITE_*` variables into the public JS bundle, so never put secrets here.

| Variable | Description |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL of the backend API, as reached from the browser, e.g. `http://localhost:8000` |
| `VITE_PRIMEUI_LICENSE` | PrimeUI license key |

### Backend (`backend/.env`)

| Variable | Description |
| --- | --- |
| `PORT` | API port. Default: `8000` |
| `MONGODB_URI` | MongoDB connection string. Default: `mongodb://localhost:27017` |
| `MONGODB_DB_NAME` | Database name. Default: `testdb` |
| `REDIS_URL` | Redis connection string. Default: `redis://localhost:6379` |
| `JWT_SECRET` | Secret for signing access tokens, at least 32 characters (required). Generate one with `openssl rand -base64 48` |
| `OTP_SECRET` | HMAC key for OTP codes, at least 32 characters and different from `JWT_SECRET` (required) |
| `JWT_EXPIRES_IN` | Access token lifetime, in seconds. Default: `900` |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token and session lifetime, in seconds. Default: `604800` |

See [backend/README.md](backend/README.md#authentication) for the 2FA login flow and endpoints.

## Compile and run the project

### Docker Compose

Runs MongoDB, Redis, the API and the web app together. Requires the root `.env` and `backend/.env`.

```bash
$ docker compose up -d --build

# web:     http://localhost:5173
# api:     http://localhost:8000
# swagger: http://localhost:8000/api-docs

$ docker compose logs -f backend
$ docker compose down        # add -v to also delete the MongoDB volume
```

Compose overrides `MONGODB_URI` and `REDIS_URL` so the API reaches the `mongo` and `redis` services. In development, the mock SMS provider prints OTP messages in `docker compose logs backend`. MongoDB is pinned to `mongo:9.0` because current `mongo:8` images refuse to start on Linux kernel 6.19 and newer.

### Local development

```bash
# MongoDB and Redis only
$ docker compose up -d mongo redis

# backend (http://localhost:8000)
$ cd backend && yarn start:dev

# web (http://localhost:5173)
$ cd web && yarn dev
```

## Lint, type check and test

```bash
# web
$ cd web
$ yarn lint
$ yarn type-check
$ yarn test:unit

# backend
$ cd backend
$ yarn lint
$ yarn typecheck
$ yarn test
$ yarn test:e2e
```

Pull requests to `main` and `dev` run the same checks in GitHub Actions: [Web PR Validation](.github/workflows/web-pr-validation.yml) and [Backend PR Validation](.github/workflows/backend-pr-validation.yml), each only when its folder changes.

## License

[MIT](LICENSE)
