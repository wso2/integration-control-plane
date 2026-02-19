-- Enhanced Lua Scripts for Fluent Bit - Ballerina Focus
-- scripts/scripts.lua

function extract_app_from_path(tag, timestamp, record)
    if record["log_file_path"] then
        local path = record["log_file_path"]
        -- Extract application name from path like /var/log/ballerina/ballerina-app/app.log
        local app_name = string.match(path, "/var/log/[^/]+/([^/]+)/")
        if app_name then
            record["app_name"] = app_name
        else
            record["app_name"] = "unknown"
        end
        
        -- Extract service type from path
        local service_type = string.match(path, "/var/log/([^/]+)/")
        if service_type then
            record["service_type"] = service_type
        end
    end
    return 1, timestamp, record
end

function construct_bal_app_name(tag, timestamp, record)
    local deployment = record["app_name"] or "unknown"
    
    local moduleName = record["module"]
    if record["src.module"] then
        moduleName = record["src.module"]
    end

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

function enrich_bal_logs(tag, timestamp, record)
    -- Add common fields for all Ballerina logs
    record["product"] = "ballerina integrator"
    
    -- Extract module info if available
    if record["module"] then
        local module_parts = {}
        for part in string.gmatch(record["module"], "[^/]+") do
            table.insert(module_parts, part)
        end
        if #module_parts > 0 then
            record["app_module"] = module_parts[1]
        end
    end
    
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
    
    -- Concatenate both hashes in hex format for wider ID space (~62 bits)
    return string.format("%x%x", hash1, hash2)
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
    
    -- Create composite string for hashing
    local composite = timestamp_str .. "|" .. message .. "|" .. level .. "|" .. runtime_id .. "|" .. log_file_path
    
    -- Generate hash-based ID
    local doc_id = simple_hash(composite)
    record["doc_id"] = doc_id
    
    return 1, timestamp, record
end
