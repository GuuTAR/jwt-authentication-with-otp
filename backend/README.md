# jwt-authentication-backend

NestJS API with two-factor (password + OTP) JWT authentication, MongoDB and Redis.

## Project setup

```bash
$ yarn
```

## Environment

Copy `.env.template` to `.env` and fill in the values. Real environment variables take precedence over `.env`.

| Variable | Required | Description |
| --- | --- | --- |
| `JWT_SECRET` | yes | HMAC secret for signing access tokens, at least 32 characters. Generate one with `openssl rand -base64 48` |
| `OTP_SECRET` | yes | HMAC key for OTP codes and hashed Redis keys, at least 32 characters and different from `JWT_SECRET` |
| `JWT_EXPIRES_IN` | no | Access token lifetime, in seconds. Default: `900` |
| `REFRESH_TOKEN_EXPIRES_IN` | no | Refresh token and session lifetime, in seconds. Default: `604800` (7 days) |
| `REDIS_URL` | no | Redis connection string. Default: `redis://localhost:6379` |
| `MONGODB_URI` | no | MongoDB connection string. Default: `mongodb://localhost:27017` |
| `MONGODB_DB_NAME` | no | Database name. Default: `testdb` (overrides any database in `MONGODB_URI`) |
| `PORT` | no | API port. Default: `8000` |

## Authentication

Login is two-factor: **Password → OTP → JWT**. No token is issued until both factors pass.

```text
POST /auth/login       { username, password }   → { auth_id, challenge_id, ref, phone_hint, ... }  (OTP sent)
POST /auth/verify-2fa  { auth_id, code }        → { access_token, refresh_token, user, ... }
```

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/register` | — | Register with `username`, `password` and `phone_number` (E.164) |
| `POST` | `/api/v1/auth/login` | — | Check username/password and send an OTP (factor 1) |
| `POST` | `/api/v1/auth/verify-2fa` | — | Check the OTP and issue the access and refresh tokens (factor 2) |
| `POST` | `/api/v1/auth/refresh` | — | Exchange a refresh token for new tokens; the old refresh token stops working |
| `POST` | `/api/v1/auth/logout` | Bearer | Revoke the current session |
| `GET` | `/api/v1/auth/me` | Bearer | Get the current user |
| `POST` | `/api/v1/otp/request` | Bearer | Send a code to verify the user's phone number |
| `POST` | `/api/v1/otp/verify` | Bearer | Verify that code; a `pending` user becomes `active` |
| `POST` | `/api/v1/otp/resend` | — | Send a new code for a live challenge (login or phone verification) |

Send the access token as `Authorization: Bearer <access_token>`. Swagger UI is available at `/api-docs`.

### Security rules

- A wrong password never sends an OTP. Every password failure returns `Invalid username or password`, and every OTP failure returns `Invalid or expired code`.
- The OTP is bound to the user, the purpose and the pending login. It expires after 5 minutes and works once.
- 5 wrong codes lock the challenge. Resending sends a new code but keeps the expiry and the attempt count.
- Codes can be sent to a phone number at most once every 60 seconds, and at most 5 times an hour. One IP can request at most 20 codes an hour. New codes and resends both count.
- Each code comes with a 4-character reference (`ref`, e.g. `K7QP`) that appears in the SMS and in the API response, so the user can match them. A resend gets a new ref. The ref is not a secret and is not checked on verify.
- 10 failed passwords from one IP block login from it for 15 minutes.
- The pending login expires after 5 minutes and works once.
- Codes are stored only as HMACs, refresh tokens only as SHA-256 hashes, and IPs and phone numbers in Redis keys only as HMACs.
- Password and OTP outcomes, OTP sends and session changes are written to `audit_logs`.

### OTP storage

```text
Auth Service → OTP Service
                ├─ generate the code (CSPRNG, crypto.randomInt)
                ├─ HMAC-SHA256(OTP_SECRET, challengeId:code)
                ├─ Redis:   otp:{challengeId} = <hmac>        (TTL 300s)
                ├─ MongoDB: otp_challenges metadata
                └─ Mock SMS provider → console
```

Redis holds only the HMAC, so a Redis leak does not reveal any code. The metadata (`_id` UUID v4, `user_id`, `purpose`, `status`, `ref`, `failed_attempts`, `expires_at`) is in MongoDB:

```json
{
  "_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "user_id": "665f1c2e8b3e4a0012345678",
  "purpose": "sign_in",
  "status": "pending",
  "ref": "K7QP",
  "expires_at": "2026-11-15T22:35:00Z"
}
```

### Redis keys

| Key | Value | TTL |
| --- | --- | --- |
| `auth:pending:{authId}` | Pending login between password and OTP | 300s |
| `otp:{challengeId}` | OTP HMAC | 300s |
| `otp:attempt:{challengeId}` | Failed OTP attempts | 300s |
| `otp:cooldown:{phoneHash}` | Resend cooldown | 60s |
| `rate:otp:phone:{phoneHash}` | Codes sent to this phone number (limit 5) | 3600s |
| `rate:otp:ip:{ipHash}` | Codes requested from this IP (limit 20) | 3600s |
| `rate:login:ip:{ipHash}` | Failed password attempts per IP (limit 10) | 900s |

### Mock SMS provider

There is no real SMS provider yet. `MockSmsProvider` prints each message to the console (`docker compose logs backend`):

```text
[MockSmsProvider] SMS to +66*****5678: Your login code is 123456 (Ref: K7QP). Valid for 5 minutes. Do not share this code.
```

To send real SMS, implement `OtpSender` (`src/otp/otp-sender.ts`) and bind it to `OTP_SENDER` in `OtpModule`.

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
