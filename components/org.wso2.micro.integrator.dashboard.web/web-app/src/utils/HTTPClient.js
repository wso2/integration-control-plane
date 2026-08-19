/*
 * Copyright (c) 2021, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * WSO2 Inc. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */

import axios from 'axios';
import { AsgardeoSPAClient } from "@asgardeo/auth-react";
import AuthManager from '../auth/AuthManager';
import { Constants } from './Constants';

export default class HTTPClient {

    static httpCall(method, path, params, body) {

        const url = AuthManager.getBasePath().concat(path)

        const requestConfig = {
            method: method,
            url: url,
            params: params,
            data: body
        };

        if (AuthManager.getUser().sso) {
            return AsgardeoSPAClient.getInstance().httpRequest(requestConfig)
                .catch(error => HTTPClient.handleSsoError(error));
        } else {
            return axios.request(requestConfig)
        }
    }

    /**
     * Handle errors thrown by SSO (Asgardeo) API requests.
     *
     * SSO requests are made through the Asgardeo http client and therefore do
     * not pass through the axios response interceptor, so we decide here what a
     * failure means. We react based on the HTTP response (when there is one):
     *
     *  - 503: the server could not validate the token against the identity
     *    provider (e.g. the JWKS endpoint is unreachable or its certificate is
     *    not trusted). The session may well be valid, so we surface a notice
     *    instead of logging the user out (re-authenticating would not help).
     *  - 403 LOGIN_FORBIDDEN: the user authenticated successfully but is not
     *    permitted to enter ICP. Clear the local session and show the access-denied page.
     *  - Other 403 responses: the user may enter ICP but cannot access this
     *    particular resource. Leave these to the caller to display.
     *  - 401, or an error with no HTTP response: the session could not be
     *    authenticated. On a 401 the Asgardeo SDK transparently attempts a
     *    silent token refresh before rejecting; when that refresh also fails
     *    (e.g. the refresh token has expired) it rejects with an exception that
     *    carries no `response`. Either way the session cannot be recovered, so
     *    send the user to the login page. This is the only case where we log
     *    the user out.
     *
     * @param {Object} error Error thrown by the Asgardeo http client
     * @returns {Promise} A rejected promise so callers can still handle the error
     */
    static handleSsoError(error) {
        const response = error?.response;
        const status = response?.status;
        if (status === 503) {
            HTTPClient.notifyIdpUnavailable();
            return Promise.reject(error);
        }
        if (status === 403) {
            if (response?.data?.code === Constants.LOGIN_FORBIDDEN_ERROR) {
                AuthManager.redirectToUnauthorized();
            }
            return Promise.reject(error);
        }
        if (status === 401 || !response) {
            AuthManager.redirectToLogin(Constants.SESSION_EXPIRED);
        }
        return Promise.reject(error);
    }

    /**
     * Notify the application that the identity provider could not be reached to
     * validate the session, so a single banner can be shown instead of each
     * page failing silently.
     */
    static notifyIdpUnavailable() {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent(Constants.IDP_UNAVAILABLE_EVENT));
        }
    }

    static get(path, params = {}) {
        return this.httpCall("GET", path, params, null)
    }

    static post(path, body) {
        return this.httpCall("POST", path, null, body)
    }

    static patch(path, body) {
        return this.httpCall("PATCH", path, null, body)
    }

    static delete(path) {
        return this.httpCall("DELETE", path, null, null)
    }

    static getConfiguration(params) {
        return this.get("/configuration", params)
    }

    static getResource(resourcePath = "") {
        const path = `/${Constants.PREFIX_GROUPS}/${resourcePath}`
        return this.get(path)
    }

    static getSuperUser() {
        return this.get("/configs/super-admin")
    }

    static isJdbcUserStoreConfigured() {
        return this.get("/configs/is-jdbc-userstore")
    }

    static getGroups() {
        return this.getResource()
    }

    static getNodes(groupId, lowerLimit, upperLimit) {
        const resourcePath = `${groupId}/${Constants.PREFIX_NODES}?lowerLimit=${lowerLimit}&upperLimit=${upperLimit}`;
        return this.getResource(resourcePath)
    }

    static getAllNodes(groupId) {
        const resourcePath = `${groupId}/all-nodes`;
        return this.getResource(resourcePath)
    }

    static getAllMINodes(groupId) {
        const resourcePath = `${groupId}/nodes/mi`;
        return this.getResource(resourcePath)
    }

    static deleteUser(groupId, userId) {
        var resourcePath = `/${Constants.PREFIX_GROUPS}/${groupId}/${Constants.PREFIX_USERS}/`
        const parts = userId.split("/")
        if (parts.length === 1) {
            resourcePath = resourcePath.concat(parts[0]);
        } else {
            resourcePath = resourcePath.concat(parts[1]).concat("?domain=").concat(parts[0]);
        }
        return this.delete(resourcePath)
    }

    static addUser(groupId, payload) {
        const path = `/${Constants.PREFIX_GROUPS}/${groupId}/${Constants.PREFIX_USERS}`
        return this.post(path, payload)
    }

    static updateUserPassword(groupId, payload) {
        const path = `/${Constants.PREFIX_GROUPS}/${groupId}/${Constants.PREFIX_USER_PASSWORD}`
        return this.patch(path, payload)
    }

    static getAllRoles(groupId) {
        const resourcePath = `${groupId}/${Constants.PREFIX_ALLROLES}`
        return this.getResource(resourcePath)
    }

    static addRole(groupId, payload) {
        const path = `/${Constants.PREFIX_GROUPS}/${groupId}/${Constants.PREFIX_ROLES}`
        return this.post(path, payload)
    }

    static updateUserRoles(groupId, payload) {
        const path = `/${Constants.PREFIX_GROUPS}/${groupId}/${Constants.PREFIX_ROLES}`
        return this.patch(path, payload)
    }

    static deleteRole(groupId, roleName) {
        var resourcePath = `/${Constants.PREFIX_GROUPS}/${groupId}/${Constants.PREFIX_ROLES}/`;
        const parts = roleName.split("/");
        if (parts.length === 1) {
            resourcePath = resourcePath.concat(parts[0])
        } else {
            resourcePath = resourcePath.concat(parts[1]).concat("?domain=").concat(parts[0]);
        }
        return this.delete(resourcePath)
    }

    static getLogConfigs(groupId, nodeId = "") {
        var resourcePath = `${groupId}/${Constants.PREFIX_LOG_CONFIGS}`
        if (nodeId !== "") {
            resourcePath = `${resourcePath}/${Constants.PREFIX_NODES}/${nodeId}`
        }
        return this.getResource(resourcePath)
    }

    static addLogConfig(groupId, payload) {
        const path = `/${Constants.PREFIX_GROUPS}/${groupId}/${Constants.PREFIX_LOG_CONFIGS}`
        return this.post(path, payload)
    }

    static updateAllLogConfig(groupId, payload) {
        const path = `/${Constants.PREFIX_GROUPS}/${groupId}/${Constants.PREFIX_LOG_CONFIGS}`
        return this.patch(path, payload)
    }

    static updateLogConfig(groupId, nodeId, payload) {
        const path = `/${Constants.PREFIX_GROUPS}/${groupId}/${Constants.PREFIX_LOG_CONFIGS}/${Constants.PREFIX_NODES}/${nodeId}`
        return this.patch(path, payload)
    }

    static getLogFiles(groupId, nodeList) {
        const resourcePath = `${groupId}/logs?nodes=${this.getNodeListAsQueryParams(nodeList)}`
        return this.getResource(resourcePath)
    }

    static getLocalEntryValue(groupId, nodeId, name) {
        const resourcePath = `${groupId}/${Constants.PREFIX_NODES}/${nodeId}/local-entries/${name}/value`
        return this.getResource(resourcePath)
    }

    static getRegistryProperty(groupId, registryPath) {
        const resourcePath = `${groupId}/registry-resources/properties?path=${registryPath}`
        return this.getResource(resourcePath)
    }

    static getPaginatedUsersAndRoles(searchKey, lowerLimit, upperLimit, resourceType, order, orderBy, groupId, isUpdate) {
        const resourcePath = `${groupId}/${resourceType}?searchKey=${searchKey}&lowerLimit=${lowerLimit}&upperLimit=${upperLimit}&order=${order}&orderBy=${orderBy}&isUpdate=${isUpdate}`;
        return this.getResource(resourcePath)
    }

    static getPaginatedResults(searchKey, lowerLimit, upperLimit, resourceType, order, orderBy, groupId, nodeList, isUpdate) {
        var resourcePath = `${groupId}/${resourceType}?`;

        if (resourceType == Constants.PREFIX_LOG_CONFIGS && nodeList == 'All') {
            resourcePath = `${resourcePath}nodes=all&searchKey=${searchKey}&lowerLimit=${lowerLimit}&upperLimit=${upperLimit}&order=${order}&orderBy=${orderBy}&isUpdate=${isUpdate}`;
        } else if (resourceType == Constants.PREFIX_LOG_CONFIGS) {//one specific node is selected
            resourcePath = `${resourcePath}nodes=${this.getNodeListAsQueryParams([nodeList])}&searchKey=${searchKey}&lowerLimit=${lowerLimit}&upperLimit=${upperLimit}&order=${order}&orderBy=${orderBy}&isUpdate=${isUpdate}`;
        } else {
            resourcePath = `${resourcePath}nodes=${this.getNodeListAsQueryParams(nodeList)}&searchKey=${searchKey}&lowerLimit=${lowerLimit}&upperLimit=${upperLimit}&order=${order}&orderBy=${orderBy}&isUpdate=${isUpdate}`;
        }

        if (resourceType === Constants.PREFIX_LOGS || resourceType === Constants.PREFIX_LOG_CONFIGS) {
            return this.getResource(resourcePath);
        }

        return new Promise((resolve, reject) => {
            this.getResource(resourcePath).then(response => {
                response.data.resourceList.map(data =>
                    data.nodes.map(node => node.details = JSON.parse(node.details))
                )
                resolve(response)
            }).catch(error => {
                reject(error)
            })
        });

    }

    static getPaginatedRegistryArtifacts(searchKey, lowerLimit, upperLimit, order, orderBy, groupId, path) {
        const resourcePath = `${groupId}/registry-resources?path=${path}&searchKey=${searchKey}&lowerLimit=${lowerLimit}&upperLimit=${upperLimit}&order=${order}&orderBy=${orderBy}`;
        return this.getResource(resourcePath)
    }

    static getCappArtifacts(groupId, nodeId, artifactName) {
        const resourcePath = `${groupId}/${Constants.PREFIX_NODES}/${nodeId}/capps/${artifactName}/artifacts`
        return this.getResource(resourcePath)
    }

    static getDataServiceFaultDetails(groupId, nodeId, serviceName) {
        const resourcePath = `${groupId}/${Constants.PREFIX_NODES}/${nodeId}/data-services/${encodeURIComponent(serviceName)}/faultDetails`
        return this.getResource(resourcePath)
    }

    static updateArtifact(groupId, pageId, payload) {
        const path = `/${Constants.PREFIX_GROUPS}/${groupId}/${pageId}`
        return this.patch(path, payload)
    }

    static getNodeListAsQueryParams(nodeList) {
        var nodeListQueryParams = ""
        nodeList.filter(node => {
            nodeListQueryParams = nodeListQueryParams.concat(node, '&nodes=')
        })
        return nodeListQueryParams.slice(0, -7);
    }
}
