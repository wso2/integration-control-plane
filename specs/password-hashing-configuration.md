# Password Hashing Configuration

## Overview

The ICP default authentication backend stores user passwords as hashes in the `user_credentials`
table of the credentials database. The hashing algorithm is controlled by the
`passwordHashingAlgorithm` configurable in the auth backend's `Config.toml`.

**Default**: `bcrypt` (work factor 12). The DB init scripts pre-populate the admin user with a
bcrypt hash, so no manual steps are required when running with the default configuration.

If you need to use a different algorithm — for example, to match the algorithm used by a v1
JDBCUserStoreManager user store you are migrating from — follow the one-time migration steps
below **before** starting the service for the first time against that credentials database.

---

## Supported Algorithms

| `passwordHashingAlgorithm` value | Algorithm | Separate salt stored? | Notes |
|---|---|---|---|
| `bcrypt` *(default)* | BCrypt (work factor 12) | No (embedded in hash) | Recommended for new deployments |
| `argon2` | Argon2id | No (embedded in hash) | Recommended modern alternative |
| `pbkdf2` | PBKDF2-SHA256 (10000 iterations) | No (embedded in hash) | |
| `sha-256` or `sha256` | SHA-256 + Base64 | Yes | v1 compatible |
| `sha-512` or `sha512` | SHA-512 + Base64 | Yes | v1 compatible |
| `sha-384` or `sha384` | SHA-384 + Base64 | Yes | v1 compatible |
| `sha-1` or `sha1` or `sha` (`sha` resolves to SHA-1, not SHA-256) | SHA-1 + Base64 | Yes | v1 compatible — not recommended for new deployments |
| `md5` | MD5 + Base64 | Yes | v1 compatible — not recommended for new deployments |
| `plain_text` or `plaintext` | No hashing | No | **Do not use in production** |

For the MessageDigest algorithms (SHA-\*, MD5), the hash is computed as
`Base64(digest(password + salt))` where the salt is stored in the `password_salt` column.
This matches the behaviour of the v1 `JDBCUserStoreManager` exactly.

---

## Step 1 — Update Config.toml

In the auth backend's `Config.toml` (or the relevant environment config file), set:

```toml
passwordHashingAlgorithm = "sha-256"   # or any supported value from the table above
```

---

## Step 2 — Recompute the Admin Password Hash

Because the DB init scripts store the admin password as a bcrypt hash, you must replace it with
a hash produced by the new algorithm before the service starts. The commands below produce the
correct hash for the **default admin password** (`admin`) — substitute your actual password if
you have changed it.

> **Note**: After the service starts successfully for the first time, the admin can log in and
> change their password through the normal UI flow. The stored hash will be re-created with the
> correct algorithm automatically.

### bcrypt (default — no action required)

The init scripts already contain a bcrypt hash. No migration needed.

---

### argon2

```bash
# Requires: pip install argon2-cffi
python3 -c "
from argon2 import PasswordHasher
ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
print(ph.hash('admin'))
"
```

Example output (yours will differ — Argon2 embeds a random salt):
```text
$argon2id$v=19$m=65536,t=3,p=4$...
```

SQL (no separate salt):
```sql
UPDATE user_credentials
SET password_hash = '<argon2id hash from above>',
    password_salt = NULL,
    updated_at    = CURRENT_TIMESTAMP
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000';
```

---

### pbkdf2

> **Format compatibility warning**: The service uses the `ballerina/crypto` library whose
> `verifyPbkdf2` function expects the Modular Crypt Format (MCF) string:
> ```text
> $pbkdf2-sha256$i=<iterations>$<salt>$<hash>
> ```
> passlib emits a slightly different MCF — it omits the `i=` prefix on the iteration field:
> ```text
> $pbkdf2-sha256$<iterations>$<salt>$<hash>
> ```
> These two strings are **not interchangeable**. Use one of the options below to produce a
> compatible hash.
>
> **OWASP 2023 iteration-count guidance**: OWASP recommends **≥ 600,000 iterations** for
> PBKDF2-HMAC-SHA256 in new deployments. The service internally calls
> `crypto:hashPbkdf2(password)` with the library default of **10,000 iterations** and there
> is currently no `Config.toml` setting to override this.
>
> - **New deployments**: 10,000 iterations is below the current recommendation. Consider
>   using `bcrypt` (default) or `argon2` instead.
> - **v1 migration only**: 10,000 is acceptable when re-seeding the admin hash to match an
>   existing v1 credential database that was already using PBKDF2 with 10,000 iterations.

#### Option A — Ballerina native (recommended)

Generate the hash with a small Ballerina script so the MCF format is guaranteed to be
compatible:

```bash
# bal run does not accept stdin; write a temporary file and run it.
cat > /tmp/pbkdf2_hash.bal <<'EOF'
import ballerina/crypto;
import ballerina/io;

public function main() returns error? {
    string hash = check crypto:hashPbkdf2("admin");
    io:println(hash);
}
EOF
bal run /tmp/pbkdf2_hash.bal
rm /tmp/pbkdf2_hash.bal
```

The output will be a string in the exact format `verifyPbkdf2` expects.

#### Option B — Pure Python (no third-party libraries)

```bash
python3 - <<'EOF'
import hashlib, base64, os

PASSWORD  = "admin"
ROUNDS    = 10000   # match the service default; see OWASP note above
SALT_LEN  = 16

raw_salt = os.urandom(SALT_LEN)
dk = hashlib.pbkdf2_hmac("sha256", PASSWORD.encode("utf-8"), raw_salt, ROUNDS)

# Verified via source: the Ballerina crypto library uses Bouncy Castle's
# org.bouncycastle.util.encoders.Base64 (standard RFC 4648, alphabet A-Za-z0-9+/=)
# and the verifier regex requires that exact alphabet. Python's base64.b64encode()
# produces identical output.
salt_b64 = base64.b64encode(raw_salt).decode()
hash_b64  = base64.b64encode(dk).decode()

print(f"$pbkdf2-sha256$i={ROUNDS}${salt_b64}${hash_b64}")
EOF
```

> **Note — do not use passlib to generate PBKDF2 hashes for this service.** Passlib
> encodes salt and checksum with its own "adapted base64" variant (substitutes `.` for `+`
> and omits `=` padding). The Ballerina verifier regex only accepts `[A-Za-z0-9+/=]+`, so
> a passlib-produced MCF string will fail format validation even if the `i=` iteration
> prefix is patched in.

---

SQL (no separate salt):
```sql
UPDATE user_credentials
SET password_hash = '<hash string from whichever option above>',
    password_salt = NULL,
    updated_at    = CURRENT_TIMESTAMP
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000';
```

---

### sha-256 / sha-512 / sha-384 / sha-1 / md5

For these algorithms a random salt is generated and stored alongside the hash. The hash is
computed as `Base64(digest(password + salt))`.

**Important**: The salt value can be any string. A UUID4 is used internally by the service for
new passwords — use one for consistency.

```bash
# Replace ALGORITHM with: sha256, sha512, sha384, sha1, or md5
ALGORITHM="sha256"
PASSWORD="admin"
SALT=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
HASH=$(python3 -c "
import hashlib, base64, sys
algo, pw, salt = sys.argv[1], sys.argv[2], sys.argv[3]
digest = hashlib.new(algo, (pw + salt).encode('utf-8')).digest()
print(base64.b64encode(digest).decode())
" "$ALGORITHM" "$PASSWORD" "$SALT")

echo "salt: $SALT"
echo "hash: $HASH"
```

Then use both values in the SQL:
```sql
UPDATE user_credentials
SET password_hash = '<HASH value from above>',
    password_salt = '<SALT value from above>',
    updated_at    = CURRENT_TIMESTAMP
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000';
```

---

### plain_text (not recommended for production)

```sql
-- Stores the password as-is. Only use this in non-production environments.
UPDATE user_credentials
SET password_hash = 'admin',
    password_salt = NULL,
    updated_at    = CURRENT_TIMESTAMP
WHERE user_id = '550e8400-e29b-41d4-a716-446655440000';
```

---

## Applying the SQL Update

Connect to the credentials database (separate from the main ICP database) and run the UPDATE
statement for your chosen algorithm. Example connection commands:

```bash
# H2 (default development database)
# Connect via the H2 console or an H2-compatible JDBC client to:
# JDBC URL: jdbc:h2:./database/credentials_db
# User: icp_user  /  Password: icp_password

# PostgreSQL
psql -h localhost -U icp_user -d credentials_db

# MySQL
mysql -h localhost -u icp_user -p credentials_db

# MSSQL
sqlcmd -S localhost -U icp_user -P icp_password -d credentials_db
```

---

## Non-Admin User Migration

The SQL `UPDATE` statements in the sections above target only the pre-seeded admin user by UUID.
If your deployment already has non-admin users, their stored hashes must also be handled before
you start the service with a new `passwordHashingAlgorithm`.

### Recommended path — force password reset

For modern algorithms (bcrypt, argon2, pbkdf2) the plaintext password is not recoverable from
the stored hash, so bulk re-hashing is not possible. The cleanest approach is to require all
users to reset their passwords:

1. Start the service with the new algorithm configured.
2. Invalidate existing sessions (e.g. flush refresh tokens from the DB).
3. On next login each user will be prompted to reset their password. The new hash is written
   with the configured algorithm automatically.

To force an immediate reset you can expire all non-admin passwords in bulk:

```sql
-- Mark all non-admin passwords as requiring reset by setting a sentinel value.
-- Adjust the WHERE clause if your admin UUID differs.
UPDATE user_credentials
SET    password_hash = 'RESET_REQUIRED',
       password_salt = NULL,
       updated_at    = CURRENT_TIMESTAMP
WHERE  user_id != '550e8400-e29b-41d4-a716-446655440000';
```

With `password_hash` set to a value that will never verify, any login attempt fails and the
user is directed through the password-reset flow, which writes the correct hash on completion.

---

## Migrating from a v1 JDBCUserStoreManager User Store

Please check the [README.md](../icp_server/resources/db/migration-scripts/README.md) in migration scripts for the guide on how to migrate an existing JDBC user store from ICP v1.

---

## Important Notes

- **One-time operation**: This migration only applies to the pre-seeded admin user. All new users
  created after the service starts will automatically use the configured algorithm.
- **All-or-nothing**: Every user in the credentials DB must have their password stored with the
  same algorithm. After switching, handle existing non-admin users via the password-reset or
  bulk-copy paths described in [Non-Admin User Migration](#non-admin-user-migration) above.
- **Algorithm cannot be changed after go-live** without re-hashing all stored passwords.
  Choose the algorithm before the first production deployment.
- **Recommended choice**: For new deployments with no v1 migration requirement, stay with the
  default `bcrypt`. Switch to `argon2` if you require stronger memory-hard hashing.
- **Avoid SHA-1 and MD5** for new deployments; they are supported only for v1 migration
  compatibility.
