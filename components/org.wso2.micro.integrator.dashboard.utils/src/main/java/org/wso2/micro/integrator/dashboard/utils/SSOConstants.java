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

package org.wso2.micro.integrator.dashboard.utils;

/**
 * Constants for SSO configs used in dashboard core.
 */
public class SSOConstants {

    public static final String CONFIG_BEAN_NAME = "org.wso2.micro.integrator.dashboard.sso.config";
    public static final String TOML_SSO_ENABLE = "sso.enable";
    public static final String TOML_SSO_ADMIN_GROUP_ATTRIBUTE = "sso.admin_group_attribute";
    public static final String TOML_SSO_ADMIN_GROUPS = "sso.admin_groups";
    public static final String TOML_SSO_JWT_ISSUER = "sso.jwt_issuer";
    public static final String TOML_SSO_JWKS_ENDPOINT = "sso.jwks_endpoint";
    public static final String TOML_SSO_CLIENT_ID = "sso.client_id";
    public static final String TOML_SSO_CLIENT_SECRET = "sso.client_secret";
    public static final String TOML_SSO_JWKS_ALGORITHM = "sso.jwks_algorithm";
    public static final String DEFAULT_SSO_ADMIN_GROUP_ATTRIBUTE = "groups";

}
