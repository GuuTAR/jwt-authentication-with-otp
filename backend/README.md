# jwt-authentication-backend

NestJS API with username/password JWT authentication and MongoDB.

## Project setup

```bash
$ yarn
```

## Environment

Copy `.env.template` to `.env` and fill in the values. Real environment variables take precedence over `.env`.

| Variable | Required | Description |
| --- | --- | --- |
| `JWT_SECRET` | yes | HMAC secret for signing access tokens, at least 32 characters. Generate one with `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | no | Access token and session lifetime, in seconds. Default: `3600` |
| `MONGODB_URI` | no | MongoDB connection string. Default: `mongodb://localhost:27017` |
| `MONGODB_DB_NAME` | no | Database name. Default: `testdb` (overrides any database in `MONGODB_URI`) |
| `PORT` | no | API port. Default: `8000` |

## Authentication

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/register` | — | Register with `username`, `password` and optional `phone_number` |
| `POST` | `/api/v1/auth/login` | — | Log in with username and password; returns `access_token` |
| `POST` | `/api/v1/auth/logout` | Bearer | Revoke the current session |
| `GET` | `/api/v1/auth/me` | Bearer | Get the current user |

Send the token as `Authorization: Bearer <access_token>`. Each login creates a session in `auth_sessions`, and the token carries its ID (`sid`). Requests are accepted only while that session is not revoked or expired, so logout takes effect immediately. Passwords are stored as scrypt hashes.

Swagger UI is available at `/api-docs`.

## Compile and run the project

```bash
# development
$ yarn start

# watch mode
$ yarn start:dev

# production mode
$ yarn start:prod
```

## Run tests

```bash
# unit tests
$ yarn test

# e2e tests
$ yarn test:e2e

# test coverage
$ yarn test:cov
```

## License

[MIT](LICENSE)
