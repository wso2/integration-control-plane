/** @jest-environment node */

/*
 * Copyright (c) 2026, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import HTTPClient from './HTTPClient';
import AuthManager from '../auth/AuthManager';
import {Constants} from './Constants';

jest.mock('@asgardeo/auth-react', () => ({
    AsgardeoSPAClient: {getInstance: jest.fn()},
}));

describe('HTTPClient SSO authorization errors', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('redirects to Unauthorized for a login admission failure', async () => {
        const redirect = jest.spyOn(AuthManager, 'redirectToUnauthorized').mockImplementation(() => {});
        const error = {
            response: {
                status: 403,
                data: {code: Constants.LOGIN_FORBIDDEN_ERROR},
            },
        };

        await expect(HTTPClient.handleSsoError(error)).rejects.toBe(error);
        expect(redirect).toHaveBeenCalledTimes(1);
    });

    test('does not redirect for a resource-level forbidden response', async () => {
        const redirect = jest.spyOn(AuthManager, 'redirectToUnauthorized').mockImplementation(() => {});
        const error = {
            response: {
                status: 403,
                data: {message: 'Forbidden'},
            },
        };

        await expect(HTTPClient.handleSsoError(error)).rejects.toBe(error);
        expect(redirect).not.toHaveBeenCalled();
    });
});
