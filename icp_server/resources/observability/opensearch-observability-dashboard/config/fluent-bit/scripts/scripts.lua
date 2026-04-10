-- Enhanced Lua Scripts for Fluent Bit - Ballerina Focus
-- scripts/scripts.lua

function process_bal_logs(tag, timestamp, record)
    record["product"] = "ballerina integrator"

    -- Extract app name from path: /var/log/bi/myapp/app.log → "myapp"
    if record["log_file_path"] then
        record["app_name"] = string.match(record["log_file_path"], "/var/log/[^/]+/([^/]+)/") or "unknown"
    else
        record["app_name"] = "unknown"
    end

    -- Extract app_module from module (first segment before /)
    if record["module"] then
        record["app_module"] = string.match(record["module"], "^([^/]+)")
    end

    -- Construct display name: "deployment - module"
    local deployment = record["app_name"]
    local moduleName = record["src.module"] or record["module"]
    if moduleName then
        record["app"] = deployment .. " - " .. moduleName
    else
        record["app"] = deployment
    end
    record["deployment"] = deployment

    return 1, timestamp, record
end

function extract_bal_metrics_data(tag, timestamp, record)
    -- Only process if this is a metrics log
    if record["logger"] ~= "metrics" then
        return 1, timestamp, record
    end

    local transport = record["protocol"] or "Unknown"
    local integration = record["src.object.name"] or "Unknown"
    
    if record["src.main"] == "true" then
        integration = "main"
    end
    
    local sublevel = record["entrypoint.function.name"] or ""
    local method = record["http.method"] or ""
    local response_time = record["response_time_seconds"] or 0
    local status = "successful"
    
    if record["http.status_code_group"] == "4xx" or record["http.status_code_group"] == "5xx" then
        status = "failed"
    end

    -- Convert to milliseconds and round
    response_time = response_time * 1000
    response_time = math.floor(response_time + 0.5)

    record["response_time"] = response_time
    record["status"] = status
    record["protocol"] = transport
    record["integration"] = integration
    record["sublevel"] = sublevel
    record["method"] = method
    record["url"] = record["http.url"] or ""
    record["status_code_group"] = record["http.status_code_group"] or ""

    return 1, timestamp, record
end

function enrich_mi_logs(tag, timestamp, record)
    -- Add common fields for all MI logs
    record["product"] = "Micro Integrator"
    record["service_type"] = "MI"

    -- Extract icp.runtimeId from [icp.runtimeId=...] at the very end of message, then remove it
    if record["message"] then
        -- Pattern matches [icp.runtimeId=value] at the end of the message (even after stack traces)
        local runtimeId = string.match(record["message"], '%[icp%.runtimeId=([^%]]+)%]%s*$')
        if runtimeId then
            record["icp_runtimeId"] = runtimeId
            -- Remove icp.runtimeId suffix from the message
            record["message"] = string.gsub(record["message"], '%s*%[icp%.runtimeId=[^%]]+%]%s*$', '')
        else
            record["icp_runtimeId"] = ""
        end
    else
        record["icp_runtimeId"] = ""
    end

    return 1, timestamp, record
end

-- Dual hash function for generating document IDs with ~62 bits of entropy
-- This helps prevent duplicates when Fluent Bit restarts without offset state
-- Uses two independent 31-bit hashes to minimize collision probability
function simple_hash(str)
    -- First hash with multiplier 31 and prime modulus 2147483647 (2^31 - 1)
    local hash1 = 0
    for i = 1, #str do
        hash1 = (hash1 * 31 + string.byte(str, i)) % 2147483647
    end
    
    -- Second hash with multiplier 37 and different seed
    local hash2 = 5381  -- DJB2 initial seed
    for i = 1, #str do
        hash2 = (hash2 * 37 + string.byte(str, i)) % 2147483647
    end
    
    -- Concatenate both hashes with fixed-width zero-padded hex format (8 digits each)
    -- This prevents ambiguous split points and synthetic collisions
    return string.format("%08x%08x", hash1, hash2)
end

-- Parse SYNAPSE_ANALYTICS_DATA from MI carbon log message into structured fields
function parse_mi_analytics(tag, timestamp, record)
    local message = record["message"] or ""
    local json_str = string.match(message, "^SYNAPSE_ANALYTICS_DATA%s+(.+)$")
    if not json_str then
        return 1, timestamp, record
    end

    record["@timestamp"] = string.match(json_str, '"@timestamp"%s*:%s*"([^"]+)"')

    record["serverInfo"] = {
        hostname = string.match(json_str, '"hostname"%s*:%s*"([^"]+)"') or "",
        serverName = string.match(json_str, '"serverName"%s*:%s*"([^"]+)"') or "",
        id = string.match(json_str, '"id"%s*:%s*"([^"]+)"') or ""
    }

    local payload = {}
    payload["entityType"] = string.match(json_str, '"entityType"%s*:%s*"([^"]+)"') or ""
    local latency = string.match(json_str, '"latency"%s*:%s*(%d+)')
    if latency then payload["latency"] = tonumber(latency) end
    payload["failure"] = string.match(json_str, '"failure"%s*:%s*(%a+)') == "true"
    payload["faultResponse"] = string.match(json_str, '"faultResponse"%s*:%s*(%a+)') == "true"

    local api = string.match(json_str, '"api"%s*:%s*"([^"]+)"')
    if api then
        payload["apiDetails"] = {
            api = api,
            apiContext = string.match(json_str, '"apiContext"%s*:%s*"([^"]+)"') or "",
            method = string.match(json_str, '"method"%s*:%s*"([^"]+)"') or "",
            transport = string.match(json_str, '"transport"%s*:%s*"([^"]+)"') or "",
            subRequestPath = string.match(json_str, '"subRequestPath"%s*:%s*"([^"]+)"') or ""
        }
    end

    record["payload"] = payload
    record["service_type"] = "MI"
    record["product"] = "Micro Integrator"
    record["message"] = nil

    return 1, timestamp, record
end

-- Generate a document ID from metrics-specific fields for deduplication in OpenSearch
function generate_mi_metrics_document_id(tag, timestamp, record)
    local timestamp_str
    if type(timestamp) == "table" then
        timestamp_str = string.format("%d.%09d",
            timestamp.sec or timestamp[1] or 0,
            timestamp.nsec or timestamp[2] or 0)
    else
        timestamp_str = tostring(timestamp)
    end

    -- Use the MI metrics timestamp if available (milliseconds epoch in JSON)
    local metrics_ts = tostring(record["timestamp"] or "")

    -- Pull identifying fields from the structured JSON
    local entity_type = ""
    local entity_name = ""
    local server_id   = ""

    if record["payload"] and type(record["payload"]) == "table" then
        entity_type = tostring(record["payload"]["entityType"] or "")
        entity_name = tostring(
            record["payload"]["entityName"] or
            record["payload"]["apiName"]    or
            record["payload"]["proxyName"]  or
            record["payload"]["sequenceName"] or
            record["payload"]["endpointName"] or
            record["payload"]["inboundEndpointName"] or "")
    end

    if record["serverInfo"] and type(record["serverInfo"]) == "table" then
        server_id = tostring(record["serverInfo"]["id"] or "")
    end

    local runtime_id = tostring(record["icp_runtimeId"] or "")

    local delimiter = string.char(31)  -- U+001F unit separator
    local composite = timestamp_str .. delimiter .. metrics_ts .. delimiter ..
                      entity_type .. delimiter .. entity_name .. delimiter .. server_id ..
                      delimiter .. runtime_id
    record["doc_id"] = simple_hash(composite)

    return 1, timestamp, record
end

function generate_document_id(tag, timestamp, record)
    -- Generate a consistent document ID based on key fields
    -- This ensures that duplicate log entries overwrite instead of creating new documents
    
    -- Use high-precision timestamp from record if available, otherwise build from timestamp table
    local timestamp_str
    if record["time"] then
        -- Use the parsed high-precision time field (includes milliseconds/nanoseconds)
        timestamp_str = tostring(record["time"])
    elseif type(timestamp) == "table" then
        -- Timestamp is a table with sec and nsec components - preserve full precision
        timestamp_str = string.format("%d.%09d", timestamp.sec or timestamp[1] or 0, timestamp.nsec or timestamp[2] or 0)
    else
        -- Fallback to string conversion (loses precision but shouldn't happen)
        timestamp_str = tostring(timestamp)
    end
    
    local message = record["message"] or ""
    local level = record["level"] or ""
    local runtime_id = record["icp_runtimeId"] or ""
    local log_file_path = record["log_file_path"] or ""
    
    -- Create composite string for hashing using unit separator (U+001F) as delimiter
    -- This control character cannot appear in normal log text, preventing ambiguous keys
    local delimiter = string.char(31)  -- U+001F unit separator
    local composite = timestamp_str .. delimiter .. message .. delimiter .. level .. delimiter .. runtime_id .. delimiter .. log_file_path
    
    -- Generate hash-based ID
    local doc_id = simple_hash(composite)
    record["doc_id"] = doc_id
    
    return 1, timestamp, record
end
