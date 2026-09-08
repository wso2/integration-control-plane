-- Migration: tunneled-operation table (Oracle 19c+)
--
-- One generic table the control plane uses to answer read requests without holding one open
-- and to queue the mutations that change something: tunneled_operation. It knows nothing of
-- workflows - `kind` says what a row is about, `cacheable` whether it is a re-servable read or
-- a one-shot mutation, and `data` carries the rest.
--
-- The `cache_`-era contract still holds: this is DERIVED state. The table may be dropped and
-- recreated on any upgrade and nothing needs migrating - losing a row costs one refetch, or
-- one caller being told their operation was never confirmed. That is also why this script
-- only creates it.
--    (ORA-00955 = object name already used; ignored for idempotency)

DECLARE
    e_object_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_object_exists, -955);
BEGIN
    EXECUTE IMMEDIATE '
        CREATE TABLE tunneled_operation (
    op_id VARCHAR2(100 CHAR) NOT NULL,
    kind VARCHAR2(64 CHAR) NOT NULL,
    cacheable NUMBER(1) NOT NULL CHECK (cacheable IN (0, 1)),
    owner VARCHAR2(200 CHAR) NOT NULL,
    target VARCHAR2(36 CHAR),
    token VARCHAR2(36 CHAR),
    status VARCHAR2(16 CHAR) NOT NULL,
    issued_at NUMBER(19) NOT NULL,
    expires_at NUMBER(19) NOT NULL,
    claimed_at NUMBER(19),
    delivered_at NUMBER(19),
    completed_at NUMBER(19),
    data CLOB,
    result CLOB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (op_id)
)';
EXCEPTION
    WHEN e_object_exists THEN NULL;
END;
/

DECLARE
    e_object_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_object_exists, -955);
BEGIN
    EXECUTE IMMEDIATE '
        CREATE INDEX idx_tunop_read_claim ON tunneled_operation (owner, token, claimed_at)';
EXCEPTION
    WHEN e_object_exists THEN NULL;
END;
/
DECLARE
    e_object_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_object_exists, -955);
BEGIN
    EXECUTE IMMEDIATE '
        CREATE INDEX idx_tunop_mutation_claim ON tunneled_operation (target, status, issued_at)';
EXCEPTION
    WHEN e_object_exists THEN NULL;
END;
/
DECLARE
    e_object_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_object_exists, -955);
BEGIN
    EXECUTE IMMEDIATE '
        CREATE INDEX idx_tunop_expiry ON tunneled_operation (expires_at)';
EXCEPTION
    WHEN e_object_exists THEN NULL;
END;
/
DECLARE
    e_object_exists EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_object_exists, -955);
BEGIN
    EXECUTE IMMEDIATE '
        CREATE INDEX idx_tunop_cleanup ON tunneled_operation (status, completed_at)';
EXCEPTION
    WHEN e_object_exists THEN NULL;
END;
/
