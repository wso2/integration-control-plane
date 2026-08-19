/*
 *  Copyright (c) 2021, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 *  WSO2 Inc. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package org.wso2.ei.dashboard.core.commons.utils;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;

import java.util.Base64;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * Utilities to handle access tokens.
 */
public class TokenUtils {

    private static final Base64.Decoder decoder = Base64.getUrlDecoder();

    public static JsonElement getParsedToken(String token) {

        String[] parts = token.split("\\.");
        String payloadJson = new String(decoder.decode(parts[1]));
        return JsonParser.parseString(payloadJson);
    }

    /**
     * Checks whether the admin-group claim matches any of the configured allowed admin groups.
     * The claim may be provided as either a JSON array or a single JSON primitive (e.g. ADFS
     * sends a string when only one role is configured).
     */
    public static boolean isUserInAllowedAdminGroup(JsonElement claimElement, String allowedAdminGroups) {

        return isUserInAllowedGroup(claimElement, allowedAdminGroups);
    }

    /**
     * Checks whether a group claim contains an exact match for one of the configured groups.
     * Configured groups may be a JSON array (as generated for sso.admin_groups) or a
     * comma/semicolon-separated value (as accepted by console_access.allowed_roles).
     */
    public static boolean isUserInAllowedGroup(JsonElement claimElement, String allowedGroups) {

        if (claimElement == null) {
            return false;
        }
        Set<String> configuredGroups = parseConfiguredGroups(allowedGroups);
        if (configuredGroups.isEmpty()) {
            return false;
        }
        if (claimElement.isJsonArray()) {
            for (JsonElement group : claimElement.getAsJsonArray()) {
                if (group.isJsonPrimitive() && configuredGroups.contains(group.getAsString())) {
                    return true;
                }
            }
            return false;
        }
        if (claimElement.isJsonPrimitive()) {
            return configuredGroups.contains(claimElement.getAsString());
        }
        return false;
    }

    public static boolean hasConfiguredGroups(String allowedGroups) {

        return !parseConfiguredGroups(allowedGroups).isEmpty();
    }

    private static Set<String> parseConfiguredGroups(String allowedGroups) {

        if (allowedGroups == null || allowedGroups.trim().isEmpty()) {
            return Collections.emptySet();
        }
        String value = allowedGroups.trim();
        Set<String> groups = new HashSet<>();
        if (value.startsWith("[") && value.endsWith("]")) {
            try {
                JsonElement parsed = JsonParser.parseString(value);
                if (parsed.isJsonArray()) {
                    for (JsonElement group : parsed.getAsJsonArray()) {
                        if (group.isJsonPrimitive()) {
                            addIfNotEmpty(groups, group.getAsString());
                        }
                    }
                    return groups;
                }
            } catch (RuntimeException ignored) {
                // Fall through and parse the value as a delimited string.
            }
        }
        for (String group : value.split("[,;]")) {
            addIfNotEmpty(groups, group);
        }
        return groups;
    }

    private static void addIfNotEmpty(Set<String> groups, String group) {

        if (group != null && !group.trim().isEmpty()) {
            groups.add(group.trim());
        }
    }
}
