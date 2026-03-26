# Connecting an LDAP User Store to ICP v2

This guide explains how to configure ICP v2 to authenticate users against an external LDAP directory. The LDAP adapter supports standard LDAP servers (OpenLDAP, 389 Directory Server, etc.) and Active Directory.

---

## Prerequisites

- The LDAP server is reachable from the host running ICP.
- A service account (bind DN + password) exists with read access to user and group entries, **or** your LDAP server allows anonymous bind.
- You know the base DN under which users are stored (e.g. `ou=Users,dc=wso2,dc=org`).

---

## Configuration

All LDAP settings live in `Config.toml` (or environment-variable overrides). Only `ldapUserStoreEnabled = true` is strictly required to activate the adapter; everything else has a default.

### 1. Activate the adapter

```toml
# Tell ICP that LDAP is the active user store (affects the /auth/capabilities response)
ldapUserStoreEnabled = true
```

### 2. LDAP server connection

```toml
ldapHostName = "ldap.example.com"   # default: localhost
ldapPort     = 10389                # default: 10389; use 636 for LDAPS

# Service-account credentials used to search the directory.
# Omit (leave empty) for anonymous bind.
ldapConnectionName     = "uid=admin,ou=system"   # default
ldapConnectionPassword = "secret"                # default — change in production
```

### 3. User search

| Setting | Default | Description |
|---|---|---|
| `ldapUserSearchBase` | `ou=Users,dc=wso2,dc=org` | Base DN for user searches |
| `ldapUserNameAttribute` | `uid` | Attribute that holds the login username |
| `ldapUserSearchFilter` | `(&(objectClass=person)(uid=?))` | Filter to locate a user; `?` is replaced with the username |
| `ldapUserDNPattern` | _(empty)_ | Optional shortcut — construct the DN directly without a search (see below) |
| `ldapDisplayNameAttribute` | _(empty)_ | Attribute used as the display name in ICP; leave empty to use the username |

**`ldapUserDNPattern`** avoids a search round-trip by constructing the DN from the username directly. Use `{0}` as the placeholder:

```toml
ldapUserDNPattern = "uid={0},ou=Users,dc=wso2,dc=org"
```

If the pattern is set, `ldapUserSearchFilter` and the admin bind are not used for authentication (though they are still used for group lookup if `ldapMemberOfAttribute` is not set).

### 4. Group / role lookup

ICP reads groups to determine whether a user should be granted super-admin. Two strategies are supported.

#### Strategy A — `memberOf` (Active Directory and some standard LDAP servers)

The user entry contains a `memberOf` attribute that lists the DNs of every group the user belongs to. This is the most efficient strategy.

```toml
ldapMemberOfAttribute = "memberOf"
```

When this is set, the group-search settings below are ignored.

#### Strategy B — Group membership search (standard LDAP)

ICP searches the group subtree for entries whose membership attribute contains the user's DN.

```toml
ldapGroupSearchBase    = "ou=Groups,dc=wso2,dc=org"   # default
ldapGroupNameAttribute = "cn"                          # default
ldapGroupSearchFilter  = "(objectClass=groupOfNames)"  # default
ldapMembershipAttribute = "member"                     # default; or "uniqueMember"
```

For **posixGroup** schemas where membership is stored as plain usernames rather than full DNs, set:

```toml
ldapMembershipAttribute = "memberUid"
```

Set `ldapReadGroups = false` to skip group lookup entirely (no user will receive super-admin via LDAP roles).

### 5. Admin role mapping

List the LDAP group names (the value of `ldapGroupNameAttribute`, not the full DN) whose members should become ICP super-admins on first login:

```toml
ldapAdminRoles = ["icp-admins", "administrators"]
```

The comparison is **case-sensitive**. A user is placed in the ICP *Super Admins* group the **first time they log in** with a matching role. Subsequent role changes in LDAP are not reflected automatically.

### 6. TLS (LDAPS)

For production deployments, enable TLS:

```toml
ldapSslEnabled = true

# Path to a JKS truststore containing the LDAP server's CA certificate.
# If omitted, certificate verification is disabled (not recommended for production).
ldapTrustStorePath     = "../conf/security/ldap-truststore.jks"
ldapTrustStorePassword = "truststore-password"
```

To import a CA certificate into the truststore:

```bash
keytool -importcert -alias ldap-ca \
  -file /path/to/ldap-ca.crt \
  -keystore ../conf/security/ldap-truststore.jks \
  -storepass truststore-password
```

---

## Schema-specific examples

### OpenLDAP (inetOrgPerson + groupOfNames)

```toml
ldapUserStoreEnabled   = true

ldapHostName           = "ldap.example.com"
ldapPort               = 389
ldapConnectionName     = "cn=admin,dc=example,dc=com"
ldapConnectionPassword = "admin-password"

ldapUserSearchBase     = "ou=people,dc=example,dc=com"
ldapUserNameAttribute  = "uid"
ldapUserSearchFilter   = "(&(objectClass=inetOrgPerson)(uid=?))"
ldapDisplayNameAttribute = "cn"

ldapGroupSearchBase    = "ou=groups,dc=example,dc=com"
ldapGroupNameAttribute = "cn"
ldapGroupSearchFilter  = "(objectClass=groupOfNames)"
ldapMembershipAttribute = "member"

ldapAdminRoles = ["icp-admins"]
```

### OpenLDAP (posixAccount + posixGroup)

```toml
ldapUserSearchBase     = "ou=people,dc=example,dc=com"
ldapUserNameAttribute  = "uid"
ldapUserSearchFilter   = "(&(objectClass=posixAccount)(uid=?))"
ldapDisplayNameAttribute = "cn"

ldapGroupSearchBase    = "ou=groups,dc=example,dc=com"
ldapGroupNameAttribute = "cn"
ldapGroupSearchFilter  = "(objectClass=posixGroup)"
ldapMembershipAttribute = "memberUid"

ldapAdminRoles = ["icp-admins"]
```

### Active Directory

```toml
ldapHostName           = "dc01.corp.example.com"
ldapPort               = 389
ldapConnectionName     = "CN=svc-icp,OU=Service Accounts,DC=corp,DC=example,DC=com"
ldapConnectionPassword = "service-account-password"

ldapUserSearchBase     = "OU=Users,DC=corp,DC=example,DC=com"
ldapUserNameAttribute  = "sAMAccountName"
ldapUserSearchFilter   = "(&(objectClass=user)(sAMAccountName=?))"
ldapDisplayNameAttribute = "displayName"

# AD populates memberOf on the user entry — no separate group search needed
ldapMemberOfAttribute  = "memberOf"
ldapGroupNameAttribute = "cn"

ldapAdminRoles = ["ICP Admins"]
```

For AD over LDAPS (port 636):

```toml
ldapPort        = 636
ldapSslEnabled  = true
ldapTrustStorePath     = "../conf/security/ad-truststore.jks"
ldapTrustStorePassword = "truststore-password"
```

---

## Secrets

Passwords can be encrypted using the WSO2 cipher tool and referenced via the secrets map:

```toml
ldapConnectionPassword = "$secret{ldapConnectionPassword}"
ldapTrustStorePassword = "$secret{ldapTrustStorePassword}"

[secrets]
ldapConnectionPassword = "<encrypted-value>"
ldapTrustStorePassword = "<encrypted-value>"
```

---

## How it works

On login the adapter:
1. Resolves the user's LDAP Distinguished Name (DN) — either directly from a pattern or via a directory search.
2. Authenticates the user by attempting an LDAP bind with their DN and password.
3. Reads the user's group memberships from the directory.
4. If any group matches a configured admin role, the user is granted ICP super-admin **on first login** (by adding them to the built-in *Super Admins* group).
5. Returns a stable, deterministic user ID (UUID v5 derived from the username and search base) so the same LDAP user always maps to the same ICP user record.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login returns 401 with no error in logs | User not found in directory | Check `ldapUserSearchBase` and `ldapUserSearchFilter`; verify the username attribute matches the login name |
| Login returns 500 "Authentication service unavailable" | Cannot reach LDAP server | Check `ldapHostName`, `ldapPort`, firewall rules |
| Users can log in but are never super-admin | Group names don't match | `ldapAdminRoles` values must match the `ldapGroupNameAttribute` value exactly (case-sensitive) |
| TLS handshake failure | CA certificate not trusted | Import the LDAP server's CA cert into the truststore |
| Users get super-admin on first login but lose it after re-deploy | Normal behaviour | Super-admin is set once at first login; subsequent changes must be managed via ICP's user management UI |
| Display name shows as username | `ldapDisplayNameAttribute` missing on entry | Verify the attribute name or set `ldapDisplayNameAttribute = ""` to always use the username |

