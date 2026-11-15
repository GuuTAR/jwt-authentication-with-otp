# jwt-authentication-with-otp

Project for simulating an authentication workflow with OTP. A Vue + PrimeVue web client and a NestJS + MongoDB API, both using Firebase Authentication.

| Folder | Stack | Details |
| --- | --- | --- |
| [`web/`](web) | Vue 3, Vite, PrimeVue, Pinia | [web/README.md](web/README.md) |
| [`backend/`](backend) | NestJS, Mongoose, Firebase Admin | [backend/README.md](backend/README.md) |

## Requirements

- Node.js 22.18+ or 24.12+
- Yarn 1.22 (Classic)
- Docker with Compose v2.24+ (to run the full stack)
- A Firebase project with Authentication enabled

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
| `VITE_*` | Web build values, same as `web/.env` below. Baked into the image at build time |

### Web (`web/.env`)

Vite inlines `VITE_*` variables into the public JS bundle, so never put secrets here.

| Variable | Description |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL of the backend API, as reached from the browser, e.g. `http://localhost:8000` |
| `VITE_FIREBASE_API_KEY` | Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain, e.g. `<project-id>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |
| `VITE_PRIMEUI_LICENSE` | PrimeUI license key |

Find the Firebase values in the Firebase console under **Project settings → General → Your apps → SDK setup and configuration**.

### Backend (`backend/.env`)

| Variable | Description |
| --- | --- |
| `PORT` | API port. Default: `8000` |
| `MONGODB_URI` | MongoDB connection string. Default: `mongodb://localhost:27017` |
| `MONGODB_DB_NAME` | Database name. Default: `testdb` |
| `FIREBASE_PROJECT_ID` | Firebase project used to verify ID tokens (required) |
| `FIREBASE_API_KEY` | Web API key, used by `POST /api/v1/auth/signin` (required) |
| `FIREBASE_CLIENT_EMAIL` | Service account's client email. Falls back to Application Default Credentials |
| `FIREBASE_PRIVATE_KEY` | Service account's private key. Wrap it in double quotes and keep the `\n` line breaks |

Generate a service account key in the Firebase console under **Project settings → Service accounts → Generate new private key**.

## Compile and run the project

### Docker Compose

Runs MongoDB, the API and the web app together. Requires the root `.env` and `backend/.env`.

```bash
$ docker compose up -d --build

# web:     http://localhost:5173
# api:     http://localhost:8000
# swagger: http://localhost:8000/api-docs

$ docker compose logs -f backend
$ docker compose down        # add -v to also delete the MongoDB volume
```

Compose overrides `MONGODB_URI` so the API reaches the `mongo` service. MongoDB is pinned to `mongo:9.0` because current `mongo:8` images refuse to start on Linux kernel 6.19 and newer.

### Local development

```bash
# MongoDB only
$ docker compose up -d mongo

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
